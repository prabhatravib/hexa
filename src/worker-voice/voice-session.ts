/// <reference types="@cloudflare/workers-types" />

import { MessageHandlers } from './message-handlers';
import { AgentManager } from './agent-manager';
import { OpenAIConnection } from './openai-connection';

export interface Env {
  OPENAI_API_KEY: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class VoiceSession {
  private openaiConnection: OpenAIConnection;
  private messageHandlers: MessageHandlers;
  private agentManager: AgentManager;
  private clients: Set<any> = new Set();
  private sessionId: string;

  constructor(private state: DurableObjectState, env: Env) {
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

    console.log('🔧 VoiceSession initialized, OpenAI connection will be established when needed');
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
          send: (data: any) => {
            try {
              const message = `data: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            } catch (error) {
              console.error('Failed to send SSE message:', error);
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
          this.clients.delete(client);
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
              apiKey: sessionInfo.apiKey
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
                apiKey: sessionInfo.apiKey
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
    this.clients.forEach(client => {
      try {
        client.send(message);
      } catch (error) {
        console.error('Failed to send to client:', error);
        this.clients.delete(client);
      }
    });
    console.log('✅ Sent to SSE client');
  }
}
