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
  private openaiConnection: OpenAIConnection;
  private messageHandlers: MessageHandlers;
  private agentManager: AgentManager;

  constructor(private state: DurableObjectState, env: Env) {
    // Initialize OpenAI connection with callbacks
    this.openaiConnection = new OpenAIConnection(
      env,
      (data: string) => this.messageHandlers.handleOpenAIMessage(data),
      (error: any) => this.broadcastToClients({ type: 'error', error }),
      () => this.onOpenAIConnected(),
      () => this.onOpenAIDisconnected()
    );

    // Initialize message handlers
    this.messageHandlers = new MessageHandlers(
      this.openaiConnection,
      (message: any) => this.broadcastToClients(message)
    );

    // Initialize agent manager
    this.agentManager = new AgentManager(
      this.openaiConnection,
      (message: any) => this.broadcastToClients(message)
    );
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
    
    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(ws: WebSocket, request: Request): Promise<void> {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, ws);
    
    try {
      (ws as any).accept();
      ws.send(JSON.stringify({ type: 'ready', sessionId }));
      
      // Connect to OpenAI
      await this.openaiConnection.connect();
    } catch (error) {
      console.error('Error during WebSocket setup:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: {
          message: 'Failed to initialize voice session',
          details: error
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
    
    // Configure the session with agent instructions
    const agentInstructions = this.agentManager.getAgentInstructions();
    
    this.openaiConnection.send({
      type: 'session.update',
      session: {
        instructions: agentInstructions
      }
    });
  }

  private onOpenAIDisconnected(): void {
    console.log('OpenAI disconnected');
  }

  private broadcastToClients(message: any): void {
    const data = JSON.stringify(message);
    this.sessions.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (error) {
          console.error('Failed to send message to client:', error);
        }
      }
    });
  }

  // Durable Object lifecycle methods
  async alarm(): Promise<void> {}
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {}
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {}
  async webSocketError(ws: WebSocket, error: Error): Promise<void> {}
}
