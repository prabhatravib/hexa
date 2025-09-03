/// <reference types="@cloudflare/workers-types" />

import { VoiceSessionCore } from './voice-session-core';
import { MessageHandlers } from './message-handlers';
import { AgentManager } from './agent-manager';

export interface ExternalData {
  image?: string;
  text?: string;
  prompt?: string;
  type?: string;
}

export class VoiceSessionExternalData {
  private currentExternalData: ExternalData | null = null;
  private externalContext: string = "";
  private baseInstructions: string = "";
  private live: {
    session: any;
    openaiSessionId: string;
  } | null = null;

  constructor(
    private core: VoiceSessionCore,
    private state: DurableObjectState,
    private messageHandlers: MessageHandlers,
    private agentManager: AgentManager
  ) {}

  // Get the current OpenAI session ID from the live session
  private getCurrentOpenAISessionId(): string {
    if (this.live?.openaiSessionId) {
      return this.live.openaiSessionId;
    }
    // Fallback to core session ID if no live session
    return this.core.getSessionId();
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



  // Create facts block from external data
  private makeFactsBlock(externalData: any): string {
    const facts: string[] = [];
    
    if (externalData.text) {
      // Convert text into bullet points
      const textLines = externalData.text.split('\n').filter((line: string) => line.trim());
      textLines.forEach((line: string) => {
        facts.push(`- ${line.trim()}`);
      });
    }
    
    if (externalData.prompt && externalData.prompt !== externalData.text) {
      facts.push(`- ${externalData.prompt}`);
    }
    
    return facts.join('\n');
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

  private buildShortSystemNote(externalData: any): string {
    const fact = (externalData?.text || "").trim();
    if (!fact) return "";
    return `System note: ${fact}`;
  }

  // Inject as a system message into the live conversation
  async injectSystemNote(externalData: any): Promise<void> {
    if (!this.live?.session) {
      console.log('ℹ️ No live Realtime session available for system note');
      return;
    }
    const note = this.buildShortSystemNote(externalData);
    if (!note) return;

    // 1) append a short system message to the conversation
    await this.live.session.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: note }]
      }
    });

    // 2) let the model read the new item immediately
    await this.live.session.send({ type: "response.create" });
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

  // Handle external data file endpoint (like infflow.md)
  async handleExternalDataFile(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: this.core.getCorsHeaders()
        });
      }

      if (request.method !== 'GET') {
        return this.core.createErrorResponse('Method not allowed. Use GET.', 405);
      }

      // Get external data from storage
      const externalData = await this.state.storage.get('external_data_file') as string;
      
      if (!externalData) {
        // Return empty content if no external data
        return new Response('# External Data\n\nNo external data available.\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/markdown',
            ...this.core.getCorsHeaders()
          }
        });
      }

      return new Response(externalData, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown',
          ...this.core.getCorsHeaders()
        }
      });

    } catch (error) {
      console.error('❌ Failed to serve external data file:', error);
      return new Response('# External Data\n\nError loading external data.\n', {
        status: 500,
        headers: {
          'Content-Type': 'text/markdown',
          ...this.core.getCorsHeaders()
        }
      });
    }
  }

  // Handle external data status endpoint
  async handleExternalDataStatus(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: this.core.getCorsHeaders()
        });
      }

      if (request.method !== 'GET') {
        return this.core.createErrorResponse('Method not allowed. Use GET.', 405);
      }

      // Always use the current OpenAI session ID
      const targetSessionId = this.getCurrentOpenAISessionId();
      console.log('🆔 Status request using current session ID:', targetSessionId);

      // Get external data for the current session
      const externalData = await this.getExternalDataBySessionId(targetSessionId);
      const hasExternalData = externalData !== null;
      const dataType = externalData?.type || null;
      const timestamp = externalData?.timestamp || null;

      return this.core.createJsonResponse({
        hasExternalData,
        dataType,
        timestamp,
        sessionId: targetSessionId,
        externalData: externalData  // Include the actual data
      });

    } catch (error) {
      console.error('❌ Failed to handle external data status:', error);
      return this.core.createErrorResponse('Failed to get external data status', 500);
    }
  }

  // Handle external data endpoint
  async handleExternalData(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: this.core.getCorsHeaders()
        });
      }

      if (request.method !== 'POST') {
        return this.core.createErrorResponse('Method not allowed. Use POST.', 405);
      }

      const body = await request.json() as { 
        text?: string; 
        image?: string; 
        prompt?: string; 
        type?: string;
        mermaidCode?: string;
        diagramImage?: string;
      };

      // Handle different input formats from external websites
      const text = (body.text || body.mermaidCode || '').trim();
      const image = body.image || body.diagramImage || '';
      const prompt = body.prompt || '';
      const type = body.type || '';

      if (!text && !image) {
        return this.core.createErrorResponse('no_text_or_image', 400);
      }

      if (!this.isSessionReady()) {
        // Store external data for later injection with UUID key
        const storageKey = crypto.randomUUID();
        await this.storeExternalData(storageKey, {
          text,
          image,
          prompt,
          type,
          timestamp: new Date().toISOString()
        });
        
        console.log('💾 External data stored for later injection when session is ready');
        
        // Try to auto-inject if session becomes ready shortly after
        setTimeout(async () => {
          await this.tryAutoInjectStoredData();
        }, 1000);
        
        // Also try again after a longer delay
        setTimeout(async () => {
          await this.tryAutoInjectStoredData();
        }, 5000);
        
        return this.core.createJsonResponse({ 
          success: true, 
          message: "Data stored for later injection when session is ready",
          storageKey,
          stored: true
        });
      }

      console.log('📥 Received external data for live session injection:', { text: text.substring(0, 100), hasImage: !!image, prompt, type });

      // Prepare content array for injection
      const content: any[] = [];

      // Add text content if provided
      if (text) {
        content.push({ type: 'input_text', text });
      }

      // Add image content if provided
      if (image) {
        content.push({ type: 'input_image', image_url: image });
      }

      // Add prompt as additional text if provided and different from main text
      if (prompt && prompt !== text) {
        content.push({ type: 'input_text', text: `Prompt: ${prompt}` });
      }

      // Inject as system message using the worker's sendMessage method
      if (this.isSessionReady()) {
        const core = this.core as any;
        const connection = core.openaiConnection;
        
        // Send the system message
        await connection.sendMessage({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'system',
            content: content
          }
        });

        // Update session instructions with text content (if any)
        if (text) {
          const merged = [
            this.baseInstructions?.trim?.() || '',
            '',
            '### Live context',
            text
          ].join('\n').trim();

          await connection.sendMessage({
            type: 'session.update',
            session: { instructions: merged }
          });
        }
      }

      console.log('✅ External data injected into live OpenAI session');

      return this.core.createJsonResponse({ ok: true });

    } catch (error) {
      console.error('❌ Failed to handle external data:', error);
      return this.core.createErrorResponse('Failed to process external data', 500);
    }
  }

  // Getter for external data
  getCurrentExternalData(): ExternalData | null {
    return this.currentExternalData;
  }

  // Set the live Realtime session when WebRTC connects
  async setLiveSession(realtimeSession: any): Promise<void> {
    this.live = {
      session: realtimeSession,
      openaiSessionId: realtimeSession.id || realtimeSession.session?.id || 'unknown'
    };
    console.log('🔗 Live Realtime session set for external data injection');
    
    // Auto-inject any stored external data
    await this.injectStoredExternalData();
  }

  // Try to auto-inject stored data if session becomes ready
  private async tryAutoInjectStoredData(): Promise<void> {
    // Check if we have any stored data first
    const allKeys = await this.state.storage.list({ prefix: 'external_data_' });
    if (allKeys.size === 0) {
      console.log('ℹ️ No stored external data to inject');
      return;
    }

    if (this.isSessionReady()) {
      console.log('🔄 Session ready, attempting auto-injection');
      await this.injectStoredExternalData();
    } else {
      console.log('⏳ Session not ready yet, will retry later');
    }
  }

  // Check if the OpenAI connection is ready to send messages
  private isSessionReady(): boolean {
    const core = this.core as any;
    const connection = core.openaiConnection;
    
    // Simple check: if we have a connection and sessionId, we're ready
    return !!(connection && connection.sessionId);
  }

  // Public method to trigger auto-injection when session is ready
  async triggerAutoInjectionIfReady(): Promise<void> {
    await this.tryAutoInjectStoredData();
  }

  // Auto-inject stored external data when session becomes ready
  private async injectStoredExternalData(): Promise<void> {
    try {
      // Get all stored external data and find the latest one by timestamp
      const allKeys = await this.state.storage.list({ prefix: 'external_data_' });
      
      if (allKeys.size > 0) {
        // Find the latest data by timestamp
        let latestData: {
          image?: string;
          text?: string;
          prompt?: string;
          type?: string;
          timestamp: string;
        } | null = null;
        let latestTimestamp = '';
        
        for (const [key, data] of allKeys) {
          const typedData = data as {
            image?: string;
            text?: string;
            prompt?: string;
            type?: string;
            timestamp: string;
          };
          if (typedData.timestamp > latestTimestamp) {
            latestTimestamp = typedData.timestamp;
            latestData = typedData;
          }
        }
        
        if (latestData) {
          console.log('🔄 Auto-injecting latest stored external data');
          
          // Prepare content array for injection
          const content: any[] = [];
          
          // Add text content if provided
          if (latestData.text) {
            content.push({ type: 'input_text', text: latestData.text });
          }
          
          // Add image content if provided
          if (latestData.image) {
            content.push({ type: 'input_image', image_url: latestData.image });
          }
          
          // Add prompt as additional text if provided and different from main text
          if (latestData.prompt && latestData.prompt !== latestData.text) {
            content.push({ type: 'input_text', text: `Prompt: ${latestData.prompt}` });
          }
          
          // Inject as system message using the worker's sendMessage method
          if (this.isSessionReady()) {
            const core = this.core as any;
            const connection = core.openaiConnection;
            
            // Send the system message
            await connection.sendMessage({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'system',
                content: content
              }
            });
            
            // Update session instructions with text content (if any)
            if (latestData.text) {
              const merged = [
                this.baseInstructions?.trim?.() || '',
                '',
                '### Live context',
                latestData.text
              ].join('\n').trim();
              
              await connection.sendMessage({
                type: 'session.update',
                session: { instructions: merged }
              });
            }
          }
          
          console.log('✅ Latest stored external data auto-injected into live session');
        }
      }
    } catch (error) {
      console.error('❌ Failed to auto-inject stored external data:', error);
    }
  }

  // Set base instructions for the session
  setBaseInstructions(instructions: string): void {
    this.baseInstructions = instructions;
    console.log('📝 Base instructions set for session');
  }

  // Clear the live session when WebRTC disconnects
  clearLiveSession(): void {
    this.live = null;
    console.log('🔗 Live Realtime session cleared');
  }
}
