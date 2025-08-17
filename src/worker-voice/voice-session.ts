/// <reference types="@cloudflare/workers-types" />

import { OpenAIConnection } from './openai-connection';
import { MessageHandlers } from './message-handlers';
import { AgentManager } from './agent-manager';

export interface Env {
  VOICE_SESSION: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  ASSETS: Fetcher;
}

export class VoiceSession implements DurableObject {
  private sessions: Map<string, WebSocket> = new Map();
  private sseControllers: Set<ReadableStreamDefaultController> = new Set();
  private openaiConnection: OpenAIConnection;
  private messageHandlers: MessageHandlers;
  private agentManager: AgentManager;

  constructor(private state: DurableObjectState, env: Env) {
    // Initialize OpenAI connection first
    this.openaiConnection = new OpenAIConnection(
      env,
      (data: string) => this.handleOpenAIConnectionMessage(data),
      (error: any) => this.broadcastToClients({ type: 'error', error }),
      () => this.onOpenAIConnected(),
      () => this.onOpenAIDisconnected()
    );

    // Initialize message handlers with the OpenAI connection
    this.messageHandlers = new MessageHandlers(
      this.openaiConnection,
      (message: any) => this.broadcastToClients(message)
    );

    // Initialize agent manager with the OpenAI connection
    this.agentManager = new AgentManager(
      this.openaiConnection,
      (message: any) => this.broadcastToClients(message)
    );

    // Don't connect immediately - let it happen when needed
    console.log('🔧 VoiceSession initialized, OpenAI connection will be established when needed');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/voice/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      await this.handleWebSocket(server, request);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      } as any);
    }
    
    // NEW: SSE endpoint for real-time communication
    if (url.pathname === '/voice/sse') {
      return this.handleSSE(request);
    }
    
    // NEW: HTTP POST endpoint for sending messages
    if (url.pathname === '/voice/message' && request.method === 'POST') {
      return this.handleHTTPMessage(request);
    }
    
    // NEW: Test endpoint for connection verification
    if (url.pathname === '/voice/test' && request.method === 'GET') {
      return this.handleTestConnection();
    }
    
    // Handle CORS preflight
    if (url.pathname === '/voice/message' && request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(ws: WebSocket, request: Request): Promise<void> {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, ws);
    
    try {
      (ws as any).accept();
      ws.send(JSON.stringify({ type: 'ready', sessionId }));
      
      // Connect to OpenAI
      console.log('🔧 Attempting to connect to OpenAI via WebSocket...');
      await this.openaiConnection.connect();
      console.log('✅ OpenAI connection established via WebSocket');
    } catch (error) {
      console.error('❌ Error during WebSocket setup:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: {
          message: 'Failed to initialize voice session',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
      return;
    }
    
    ws.addEventListener('message', async (event) => {
      const data = JSON.parse(event.data as string);
      
      switch (data.type) {
        case 'audio':
          await this.messageHandlers.handleAudioInput(data.audio, sessionId);
          break;
          
        case 'text':
          await this.messageHandlers.handleTextInput(data.text, sessionId);
          break;
          
        case 'control':
          await this.messageHandlers.handleControl(data.command, sessionId);
          break;
          
        case 'switch_agent':
          await this.agentManager.switchAgent(data.agentId);
          break;
          
        case 'connection_ready':
          // Frontend has successfully connected to OpenAI
          console.log('✅ Frontend OpenAI connection confirmed, configuring session...');
          this.onOpenAIConnected();
          break;
      }
    });
    
    ws.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      if (this.sessions.size === 0) {
        this.openaiConnection.disconnect();
      }
    });
  }

  private onOpenAIConnected(): void {
    console.log('OpenAI connected, configuring session...');
    
    // Now that we have a connection, update the references
    this.messageHandlers.setOpenAIConnection(this.openaiConnection);
    this.agentManager.setOpenAIConnection(this.openaiConnection);
    
    // Configure the session with agent instructions
    const agentInstructions = this.agentManager.getAgentInstructions();
    
    this.openaiConnection.send({
      type: 'session.update',
      session: {
        instructions: agentInstructions
      }
    });
    
    // Send ready message to all clients (both WebSocket and SSE)
    const readyMessage = { 
      type: 'ready', 
      sessionId: 'sse-session',
      message: 'OpenAI connection established and ready for voice interaction'
    };
    this.broadcastToClients(readyMessage);
  }

  private handleOpenAIConnectionMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Handle internal coordination messages
      switch (message.type) {
        case 'connection_details':
          // This is sent to the frontend, not processed here
          this.broadcastToClients(message);
          break;
          
        case 'forward_to_openai':
          // This is for the frontend to handle
          this.broadcastToClients(message);
          break;
          
        default:
          // Handle actual OpenAI messages
          this.messageHandlers.handleOpenAIMessage(data);
      }
    } catch (error) {
      console.error('Failed to parse OpenAI connection message:', error);
    }
  }

  private onOpenAIDisconnected(): void {
    console.log('OpenAI disconnected');
  }

  // NEW: Handle Server-Sent Events for real-time communication
  private handleSSE(request: Request): Response {
    console.log('🔧 SSE connection request received');
    const stream = new ReadableStream({
      start: async (controller) => {
        console.log('✅ SSE stream started, sending connected message');
        // Send initial connection message
        const data = `data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
        
        // Store controller for broadcasting
        this.sseControllers.add(controller);
        console.log(`📊 SSE controllers count: ${this.sseControllers.size}`);
        
        // Connect to OpenAI if not already connected
        if (!this.openaiConnection.isConnected()) {
          console.log('🔧 Connecting to OpenAI via SSE client...');
          try {
            await this.openaiConnection.connect();
          } catch (error) {
            console.error('❌ Failed to connect to OpenAI:', error);
            // Send error to SSE client
            const errorData = `data: ${JSON.stringify({ 
              type: 'error', 
              error: { message: 'Failed to connect to OpenAI', details: error } 
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorData));
          }
        }
        
        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          console.log('🔌 SSE client disconnected');
          this.sseControllers.delete(controller);
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
  }

  // NEW: Handle HTTP POST messages from frontend
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

  // NEW: Test endpoint for connection verification
  private async handleTestConnection(): Promise<Response> {
    try {
      return new Response(JSON.stringify({ message: 'Voice service is running and ready for connections.' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    } catch (error) {
      console.error('❌ Failed to handle test connection:', error);
      return new Response(JSON.stringify({ message: 'Voice service is not ready.' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
  }

  private broadcastToClients(message: any): void {
    const data = JSON.stringify(message);
    console.log(`📤 Broadcasting message to clients:`, {
      type: message.type,
      webSocketClients: this.sessions.size,
      sseClients: this.sseControllers.size
    });
    
    // Send to WebSocket clients
    this.sessions.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
          console.log('✅ Sent to WebSocket client');
        } catch (error) {
          console.error('❌ Failed to send message to WebSocket client:', error);
        }
      }
    });
    
    // Send to SSE clients
    this.sseControllers.forEach(controller => {
      try {
        const sseData = `data: ${data}\n\n`;
        controller.enqueue(new TextEncoder().encode(sseData));
        console.log('✅ Sent to SSE client');
      } catch (error) {
        console.error('❌ Failed to send message to SSE client:', error);
        // Remove broken controller
        this.sseControllers.delete(controller);
      }
    });
  }

  // Durable Object lifecycle methods
  async alarm(): Promise<void> {}
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {}
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {}
  async webSocketError(ws: WebSocket, error: Error): Promise<void> {}
}
