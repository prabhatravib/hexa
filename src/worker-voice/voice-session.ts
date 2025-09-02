/// <reference types="@cloudflare/workers-types" />

import { MessageHandlers } from './message-handlers';
import { AgentManager } from './agent-manager';
import { OpenAIConnection } from './openai-connection';

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class VoiceSession {
  private sessionId: string;
  private clients: Set<any> = new Set();
  private openaiConnection: OpenAIConnection;
  private messageHandlers: MessageHandlers;
  private agentManager: AgentManager;
  private isActive: boolean = true;
  private autoRestartInterval: number | null = null;
  private currentExternalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null = null;
  private externalContext: string = "";
  private live: {
    session: any;
    openaiSessionId: string;
  } | null = null;

  constructor(private state: DurableObjectState, private env: Env) {
    this.sessionId = crypto.randomUUID();
    
    this.openaiConnection = new OpenAIConnection(
      env,
      (data: string) => this.handleOpenAIConnectionMessage(data),
      (error: any) => this.broadcastToClients({ type: 'error', error }),
      () => this.onOpenAIConnected(),
      () => this.onOpenAIDisconnected()
    );

    this.messageHandlers = new MessageHandlers(
      this.openaiConnection,
      (message: any) => this.broadcastToClients(message)
    );

    this.agentManager = new AgentManager(
      this.openaiConnection,
      (message: any) => this.broadcastToClients(message)
    );

    // Auto-restart worker every 30 minutes to prevent stale connections
    this.startAutoRestart();

    // Add cleanup on worker restart
    this.state.blockConcurrencyWhile(async () => {
      await this.cleanupStaleSessions();
    });

    console.log('🔧 VoiceSession initialized, OpenAI connection will be established when needed');
  }

  private startAutoRestart(): void {
    // Restart every 30 minutes (30 * 60 * 1000 ms)
    this.autoRestartInterval = setInterval(() => {
      console.log('🔄 Auto-restarting worker after 30 minutes to prevent stale connections...');
      this.performAutoRestart();
    }, 30 * 60 * 1000) as unknown as number;
  }

  private async performAutoRestart(): Promise<void> {
    try {
      // Notify all clients about the restart
      this.broadcastToClients({
        type: 'worker_restarting',
        message: 'Worker is restarting to maintain optimal performance',
        sessionId: this.sessionId
      });

      // Clean up existing connections using the dedicated restart cleanup
      await this.cleanupForRestart();
      
      // Reset session ID
      this.sessionId = crypto.randomUUID();
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Restart the auto-restart interval
      this.startAutoRestart();
      
      // Notify clients that restart is complete
      this.broadcastToClients({
        type: 'worker_restarted',
        message: 'Worker restart complete',
        newSessionId: this.sessionId
      });

      console.log('✅ Worker auto-restart completed successfully');
      
    } catch (error) {
      console.error('❌ Auto-restart failed:', error);
      // Even if restart fails, continue with new session
      this.startAutoRestart();
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/voice/sse':
        return this.handleSSE(request);
      case '/voice/message':
        return this.handleHTTPMessage(request);
      case '/voice/test':
        return new Response(JSON.stringify({ 
          status: 'ok', 
          message: 'Voice service is running',
          sessionId: this.sessionId,
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      case '/voice/reset':
        return this.handleReset(request);
      case '/api/external-data':
        return this.handleExternalData(request);
      case '/api/external-data/status':
        return this.handleExternalDataStatus(request);
      case '/api/set-live-session':
        return this.handleSetLiveSession(request);
      case '/external-data.md':
        return this.handleExternalDataFile(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleSSE(request: Request): Promise<Response> {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start: (controller) => {
        const client = {
          controller,
          encoder,
          closed: false,
          send: (data: any) => {
            if (client.closed) return;
            
            try {
              const message = `data: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            } catch (error) {
              console.error('Failed to send SSE message:', error);
              // Mark client as closed to avoid repeated errors
              client.closed = true;
              throw error; // Re-throw to trigger removal in broadcastToClients
            }
          }
        };
        
        this.clients.add(client);
        
        // Send initial connection message
        client.send({ type: 'connected', sessionId: this.sessionId });
        
        // Send ready message
        client.send({ type: 'ready', sessionId: this.sessionId });
        
        // Clean up when client disconnects
        request.signal.addEventListener('abort', () => {
          client.closed = true;
          this.clients.delete(client);
          console.log('🔌 Client disconnected, cleaning up...');
          
          // If no more clients, reset the session after a delay
          if (this.clients.size === 0) {
            setTimeout(() => {
              if (this.clients.size === 0) {
                this.resetSession();
              }
            }, 5000); // Wait 5 seconds before resetting
          }
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
  }

  private async handleHTTPMessage(request: Request): Promise<Response> {
    try {
      const data = await request.json() as any;
      console.log('📨 Received HTTP message:', data.type);

      // Ensure OpenAI connection is established before processing messages
      if (!this.openaiConnection.isConnected()) {
        console.log('🔧 OpenAI not connected, attempting to connect...');
        try {
          await this.openaiConnection.connect();
        } catch (error) {
          console.error('❌ Failed to connect to OpenAI:', error);
          return new Response(JSON.stringify({
            success: false,
            error: 'Voice service not ready. Please wait a moment and try again.'
          }), {
            status: 503, // Service Unavailable
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type'
            }
          });
        }
      }

      switch (data.type) {
        case 'audio':
          await this.messageHandlers.handleAudioInput(data.audio, 'http-client');
          break;
        case 'text':
          await this.messageHandlers.handleTextInput(data.text, 'http-client');
          break;
        case 'control':
          await this.messageHandlers.handleControl(data.command, 'http-client');
          break;
        case 'switch_agent':
          await this.agentManager.switchAgent(data.agentId);
          break;
        case 'connection_ready':
          console.log('✅ Frontend connection confirmed via HTTP');
          // Send session info to frontend for OpenAI Agent initialization
          if (this.openaiConnection.isConnected()) {
            const sessionInfo = this.openaiConnection.getSessionInfo();
            console.log('🔧 Sending session info to frontend:', {
              hasSessionId: !!sessionInfo.sessionId,
              hasClientSecret: !!sessionInfo.clientSecret,
              hasApiKey: !!sessionInfo.apiKey
            });
            this.broadcastToClients({
              type: 'session_info',
              sessionId: sessionInfo.sessionId,
              clientSecret: sessionInfo.clientSecret,
              // Keep clientSecret for WebRTC connection, remove apiKey only
            });
          } else {
            // If not connected, try to connect first
            try {
              await this.openaiConnection.connect();
              const sessionInfo = this.openaiConnection.getSessionInfo();
              console.log('🔧 Sending session info to frontend after connection:', {
                hasSessionId: !!sessionInfo.sessionId,
                hasClientSecret: !!sessionInfo.clientSecret,
                hasApiKey: !!sessionInfo.apiKey
              });
              this.broadcastToClients({
                type: 'session_info',
                sessionId: sessionInfo.sessionId,
                clientSecret: sessionInfo.clientSecret,
                // Keep clientSecret for WebRTC connection, remove apiKey only
              });
            } catch (error) {
              console.error('❌ Failed to connect to OpenAI:', error);
              this.broadcastToClients({
                type: 'error',
                error: { message: 'Failed to initialize voice service' }
              });
            }
          }
          break;
        default:
          console.warn('⚠️ Unknown message type:', data.type);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });

    } catch (error) {
      console.error('❌ Failed to handle HTTP message:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to process message'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
  }

  private async handleReset(request: Request): Promise<Response> {
    try {
      console.log('🔄 Manual reset requested');
      
      // Reset the session
      this.resetSession();
      
      // Notify all clients about the reset
      this.broadcastToClients({
        type: 'session_reset',
        sessionId: this.sessionId,
        message: 'Session has been reset'
      });
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Session reset successfully',
        newSessionId: this.sessionId
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to reset session:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to reset session'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
  }

  private handleOpenAIConnectionMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      this.messageHandlers.handleOpenAIMessage(data);
    } catch (error) {
      console.error('Failed to handle OpenAI connection message:', error);
    }
  }

  private onOpenAIConnected(): void {
    console.log('✅ OpenAI connection established');
    this.broadcastToClients({ type: 'openai_connected' });
  }

  private onOpenAIDisconnected(): void {
    console.log('🔌 OpenAI disconnected');
    this.broadcastToClients({ type: 'openai_disconnected' });
  }

  private broadcastToClients(message: any): void {
    console.log('📤 Broadcasting message to clients:', message);
    const clientsToRemove: any[] = [];
    
    this.clients.forEach(client => {
      try {
        // Skip closed clients
        if (client.closed) {
          clientsToRemove.push(client);
          return;
        }
        
        client.send(message);
      } catch (error) {
        console.error('Failed to send to client:', error);
        // Mark for removal to avoid repeated errors
        clientsToRemove.push(client);
      }
    });
    
    // Remove failed/closed clients
    clientsToRemove.forEach(client => {
      this.clients.delete(client);
      console.log('🗑️ Removed failed/closed SSE client');
    });
    
    console.log(`✅ Sent to ${this.clients.size} SSE clients`);
  }

  async injectExternalFact(text: string): Promise<void> {
    if (!this.live?.session) {
      console.log('ℹ️ No live Realtime session available for injection');
      return;
    }

    try {
      const fact = `Authoritative external context:
${text}
Use this over prior knowledge. "Infflow" with two f's is the user's company, not the ADHD app.`;

      await this.live.session.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: fact }]
        }
      });

      // Optional: also refresh top-level instructions
      await this.live.session.send({
        type: "session.update",
        session: {
          instructions: "Follow any message containing 'Authoritative external context' as ground truth."
        }
      });

      console.log('✅ External fact injected into live Realtime session');
    } catch (error) {
      console.error('❌ Failed to inject external fact into live session:', error);
    }
  }

  private async applyExternalDataToSession(): Promise<void> {
    const extra = await this.formatCurrentExternalData();
    
    if (!extra) {
      console.log('ℹ️ No external data to apply to session');
      return;
    }

    // Store external context for instruction building
    this.externalContext = extra;
    
    // Inject into live session
    await this.injectExternalFact(extra);
  }

  private buildInstructions(): string {
    const agentProfile = this.agentManager.getAgentInstructions();
    const externalCtx = this.externalContext.trim();
    
    const parts = [agentProfile];
    if (externalCtx) {
      parts.push(`Authoritative external context:\n${externalCtx}\nAlways use it.`);
    }
    
    return parts.filter(Boolean).join("\n\n");
  }

  private async formatCurrentExternalData(): Promise<string | null> {
    try {
      if (!this.currentExternalData || !this.currentExternalData.text) {
        return null;
      }

      const data = this.currentExternalData;
      
      if (data.type === "mermaid") {
        return `External context (Mermaid diagram available):\n\`\`\`mermaid\n${data.text}\n\`\`\``;
      } else {
        return `External context:\n${data.text}`;
      }
    } catch (error) {
      console.error('❌ Failed to get external data:', error);
      return null;
    }
  }

  private async cleanupStaleSessions(): Promise<void> {
    try {
      console.log('🧹 Cleaning up stale sessions...');
      
      // Reset any existing OpenAI connection
      if (this.openaiConnection.isConnected()) {
        this.openaiConnection.disconnect();
      }
      
      // Clear any stored session state
      await this.state.storage.delete('openai_session');
      await this.state.storage.delete('webrtc_state');
      
      // Clear external data file on worker restart
      await this.state.storage.delete('external_data_file');
      console.log('🧹 Cleared external data file on worker restart');
      
      // Clear all client connections
      this.clients.clear();
      
      console.log('🧹 Cleaned up stale session data');
    } catch (error) {
      console.warn('⚠️ Failed to cleanup stale sessions:', error);
    }
  }

  private resetSession(): void {
    if (!this.isActive) return;
    
    console.log('🔄 Resetting session due to inactivity...');
    
    // Disconnect OpenAI
    if (this.openaiConnection.isConnected()) {
      this.openaiConnection.disconnect();
    }
    
    // Clear storage
    this.state.storage.delete('openai_session');
    this.state.storage.delete('webrtc_state');
    
    // Reset session ID
    this.sessionId = crypto.randomUUID();
    
    console.log('✅ Session reset complete');
  }

  // Cleanup method for auto-restart
  private async cleanupForRestart(): Promise<void> {
    try {
      console.log('🧹 Cleaning up for worker restart...');
      
      // Stop the auto-restart interval
      if (this.autoRestartInterval !== null) {
        clearInterval(this.autoRestartInterval);
        this.autoRestartInterval = null;
      }
      
      // Clean up OpenAI connection
      if (this.openaiConnection.isConnected()) {
        this.openaiConnection.disconnect();
      }
      
      // Clear storage
      await this.state.storage.delete('openai_session');
      await this.state.storage.delete('webrtc_state');
      
      // Clear external data file on restart
      await this.state.storage.delete('external_data_file');
      console.log('🧹 Cleared external data file on restart');
      
      // Clear clients
      this.clients.clear();
      
      console.log('✅ Cleanup for restart completed');
    } catch (error) {
      console.error('❌ Cleanup for restart failed:', error);
    }
  }

  // Getter for external data
  getCurrentExternalData() {
    return this.currentExternalData;
  }

  // Set the live Realtime session when WebRTC connects
  setLiveSession(realtimeSession: any) {
    this.live = {
      session: realtimeSession,
      openaiSessionId: realtimeSession.id || realtimeSession.session?.id || 'unknown'
    };
    console.log('🔗 Live Realtime session set for external data injection');
  }

  // Clear the live session when WebRTC disconnects
  clearLiveSession() {
    this.live = null;
    console.log('🔗 Live Realtime session cleared');
  }

  private async handleSetLiveSession(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed. Use POST.'
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      const body = await request.json() as { sessionId?: string };
      const { sessionId } = body;
      
      // Note: In a real implementation, you'd need to get the actual RealtimeSession object
      // For now, we'll just acknowledge that the session is set
      console.log('🔗 Live session reference set for session:', sessionId);
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Live session reference set'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      console.error('❌ Failed to set live session:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to set live session'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  // Store external data with session ID
  private async storeExternalData(sessionId: string, data: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
    timestamp: string;
  }): Promise<void> {
    try {
      const storageKey = `external_data_${sessionId}`;
      await this.state.storage.put(storageKey, data);
      console.log('💾 Stored external data for session:', sessionId);
    } catch (error) {
      console.error('❌ Failed to store external data:', error);
    }
  }

  // Get external data by session ID
  private async getExternalDataBySessionId(sessionId: string): Promise<{
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
    timestamp: string;
  } | null> {
    try {
      const storageKey = `external_data_${sessionId}`;
      const data = await this.state.storage.get(storageKey) as {
        image?: string;
        text?: string;
        prompt?: string;
        type?: string;
        timestamp: string;
      } | null;
      return data || null;
    } catch (error) {
      console.error('❌ Failed to get external data:', error);
      return null;
    }
  }

  // Write external data to markdown file (like infflow.md)
  private async writeExternalDataFile(externalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  }): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const content = `# External Data

**Type:** ${externalData.type || 'Unknown'}
**Prompt:** ${externalData.prompt || 'No prompt provided'}
**Timestamp:** ${timestamp}

## Content:

${externalData.text || externalData.image || 'No content available'}

---

*This data was automatically generated and is available for voice discussions.*
*Last updated: ${timestamp}*
`;

      // Store the markdown content
      await this.state.storage.put('external_data_file', content);
      console.log('📄 External data written to external-data.md file');
    } catch (error) {
      console.error('❌ Failed to write external data file:', error);
    }
  }

  // Notify voice session of external data availability
  private async notifyVoiceSession(sessionId: string, eventType: string, data: any): Promise<void> {
    try {
      console.log('🔔 Notifying voice session:', sessionId, 'Event:', eventType);
      
      // If this is for the current session, add to voice context
      if (sessionId === this.sessionId) {
        await this.addToVoiceContext(sessionId, {
          type: 'external_data',
          content: data,
          available: true
        });
        
        console.log('🎯 External data added to voice context:', data);
      } else {
        // For other sessions, we could implement cross-session notification
        // For now, just log that we received data for a different session
        console.log('📝 External data received for different session:', sessionId);
      }
    } catch (error) {
      console.error('❌ Failed to notify voice session:', error);
    }
  }

  // Add external data to voice agent context
  private async addToVoiceContext(sessionId: string, contextData: {
    type: string;
    content: any;
    available: boolean;
  }): Promise<void> {
    try {
      // Store context data in storage
      const contextKey = `voice_context_${sessionId}`;
      const existingContext = (await this.state.storage.get(contextKey) as any[]) || [];
      existingContext.push(contextData);
      await this.state.storage.put(contextKey, existingContext);
      
      // Update message handlers with the new context
      this.messageHandlers.updateExternalData({
        text: contextData.content.mermaidCode,
        prompt: contextData.content.originalPrompt,
        type: contextData.content.diagramType
      });
      
      console.log('✅ Voice context updated with external data');
    } catch (error) {
      console.error('❌ Failed to add to voice context:', error);
    }
  }

  // Handle external data file endpoint (like infflow.md)
  private async handleExternalDataFile(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      if (request.method !== 'GET') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed. Use GET.'
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Get external data from storage
      const externalData = await this.state.storage.get('external_data_file') as string;
      
      if (!externalData) {
        // Return empty content if no external data
        return new Response('# External Data\n\nNo external data available.\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/markdown',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response(externalData, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      console.error('❌ Failed to serve external data file:', error);
      return new Response('# External Data\n\nError loading external data.\n', {
        status: 500,
        headers: {
          'Content-Type': 'text/markdown',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  // Handle external data status endpoint
  private async handleExternalDataStatus(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      if (request.method !== 'GET') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed. Use GET.'
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Always use the current voice session ID
      const targetSessionId = this.sessionId;
      console.log('🆔 Status request using current session ID:', targetSessionId);

      // Get external data for the current session
      const externalData = await this.getExternalDataBySessionId(targetSessionId);
      const hasExternalData = externalData !== null;
      const dataType = externalData?.type || null;
      const timestamp = externalData?.timestamp || null;

      return new Response(JSON.stringify({
        hasExternalData,
        dataType,
        timestamp,
        sessionId: targetSessionId,
        externalData: externalData  // Include the actual data
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      console.error('❌ Failed to handle external data status:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get external data status'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  // Handle external data endpoint
  private async handleExternalData(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed. Use POST.'
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      const externalData = await request.json() as {
        image?: string;
        text?: string;
        prompt?: string;
        type?: string;
        sessionId?: string;  // This is optional and can be ignored
      };

      console.log('📥 Received external data:', externalData);

      // ALWAYS use the current voice session ID, ignore what was sent
      const currentSessionId = this.sessionId;
      console.log('🆔 Using current voice session ID:', currentSessionId);

      // Write external data to markdown file (like infflow.md)
      await this.writeExternalDataFile({
        image: externalData.image,
        text: externalData.text,
        prompt: externalData.prompt,
        type: externalData.type
      });

      // Store the external data with the CURRENT session ID (for backward compatibility)
      await this.storeExternalData(currentSessionId, {
        image: externalData.image,
        text: externalData.text,
        prompt: externalData.prompt,
        type: externalData.type,
        timestamp: new Date().toISOString()
      });

      // Update current external data
      this.currentExternalData = {
        image: externalData.image,
        text: externalData.text,
        prompt: externalData.prompt,
        type: externalData.type
      };

      // Process the external data through message handlers
      await this.messageHandlers.handleExternalData(this.currentExternalData, currentSessionId);
      
      // Update the message handlers' external data context
      this.messageHandlers.updateExternalData(this.currentExternalData);

      // Broadcast to connected clients
      this.broadcastToClients({
        type: 'external_data_received',
        data: this.currentExternalData,
        sessionId: currentSessionId
      });

      // Trigger voice context update for the CURRENT session
      await this.notifyVoiceSession(currentSessionId, 'external_data_available', {
        mermaidCode: externalData.text,
        originalPrompt: externalData.prompt,
        diagramType: externalData.type,
        timestamp: new Date().toISOString()
      });

      // Apply external data to active Realtime session
      await this.applyExternalDataToSession();

      console.log('✅ External data processing complete for current session:', currentSessionId);

      return new Response(JSON.stringify({
        success: true,
        message: 'External data received and context updated',
        sessionId: currentSessionId  // Return the actual session ID used
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      console.error('❌ Failed to handle external data:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to process external data'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
}
