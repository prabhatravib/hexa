/// <reference types="@cloudflare/workers-types" />

// Cloudflare Worker type definitions
declare global {
  interface WebSocket {
    accept(): void;
  }
}

export interface Env {
  VOICE_SESSION: DurableObjectNamespace;
  OPENAI_REALTIME_MODEL: string;
  ASSETS: Fetcher;
}

// Durable Object for managing WebSocket connections and OpenAI Realtime API
export class VoiceSession {
  private sessions: Map<string, WebSocket> = new Map();
  private openaiWs: WebSocket | null = null;
  private audioBuffer: ArrayBuffer[] = [];
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/voice/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      
      // Create WebSocket pair for Cloudflare Workers
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
  
  async handleWebSocket(ws: WebSocket, request: Request) {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, ws);
    
    // Accept the WebSocket connection
    (ws as any).accept();
    
    // Connect to OpenAI Realtime API
    await this.connectToOpenAI();
    
    ws.addEventListener('message', async (event) => {
      const data = JSON.parse(event.data as string);
      
      switch (data.type) {
        case 'audio':
          await this.handleAudioInput(data.audio, sessionId);
          break;
          
        case 'text':
          await this.handleTextInput(data.text, sessionId);
          break;
          
        case 'control':
          await this.handleControl(data.command, sessionId);
          break;
      }
    });
    
    ws.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      if (this.sessions.size === 0 && this.openaiWs) {
        this.openaiWs.close();
        this.openaiWs = null;
      }
    });
    
    // Send initial ready message
    ws.send(JSON.stringify({ type: 'ready', sessionId }));
  }
  
  async connectToOpenAI() {
    if (this.openaiWs) return;
    
    const apiKey = this.env.OPENAI_REALTIME_MODEL as string;
    
    // Connect to OpenAI Realtime API
    this.openaiWs = new WebSocket('wss://api.openai.com/v1/realtime');
    
    this.openaiWs.addEventListener('open', () => {
      // Configure the session
      this.openaiWs?.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: 'You are a friendly hexagon character. Be concise, helpful, and cheerful. Keep responses brief and conversational.',
          voice: 'alloy',
          input_audio_format: 'webm_opus',
          output_audio_format: 'webm_opus',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200
          }
        }
      }));
    });
    
    this.openaiWs.addEventListener('message', (event) => {
      this.handleOpenAIMessage(event.data);
    });
    
    this.openaiWs.addEventListener('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      this.broadcastToClients({
        type: 'error',
        message: 'Connection error with voice service'
      });
    });
  }
  
  async handleAudioInput(audioData: string, sessionId: string) {
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) {
      await this.connectToOpenAI();
    }
    
    // Send audio to OpenAI
    this.openaiWs?.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: audioData
    }));
  }
  
  async handleTextInput(text: string, sessionId: string) {
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) {
      await this.connectToOpenAI();
    }
    
    // Send text message to OpenAI
    this.openaiWs?.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'text',
          text: text
        }]
      }
    }));
    
    // Trigger response
    this.openaiWs?.send(JSON.stringify({
      type: 'response.create'
    }));
  }
  
  async handleControl(command: string, sessionId: string) {
    switch (command) {
      case 'interrupt':
        this.openaiWs?.send(JSON.stringify({
          type: 'response.cancel'
        }));
        break;
        
      case 'clear':
        this.openaiWs?.send(JSON.stringify({
          type: 'input_audio_buffer.clear'
        }));
        break;
    }
  }
  
  handleOpenAIMessage(data: string) {
    const message = JSON.parse(data);
    
    switch (message.type) {
      case 'session.created':
        this.broadcastToClients({
          type: 'session_created',
          session: message.session
        });
        break;
        
      case 'input_audio_buffer.speech_started':
        this.broadcastToClients({
          type: 'speech_started'
        });
        break;
        
      case 'input_audio_buffer.speech_stopped':
        this.broadcastToClients({
          type: 'speech_stopped'
        });
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        this.broadcastToClients({
          type: 'transcription',
          text: message.transcript
        });
        break;
        
      case 'response.audio_transcript.delta':
        this.broadcastToClients({
          type: 'response_text_delta',
          text: message.delta
        });
        break;
        
      case 'response.audio.delta':
        this.broadcastToClients({
          type: 'audio_delta',
          audio: message.delta
        });
        break;
        
      case 'response.audio.done':
        this.broadcastToClients({
          type: 'audio_done'
        });
        break;
        
      case 'error':
        console.error('OpenAI error:', message.error);
        this.broadcastToClients({
          type: 'error',
          error: message.error
        });
        break;
    }
  }
  
  broadcastToClients(message: any) {
    const data = JSON.stringify(message);
    this.sessions.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

// Main worker
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (url.pathname.startsWith('/voice/ws')) {
      const durableObjectId = env.VOICE_SESSION.idFromName('global');
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      return durableObject.fetch(request);
    }
    
    // Serve static assets
    try {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) {
        return asset;
      }
    } catch (e) {
      // Asset not found
    }
    
    // SPA fallback
    try {
      const indexUrl = new URL('/index.html', request.url);
      const indexRequest = new Request(indexUrl.toString());
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      return new Response(indexResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=0, must-revalidate'
        }
      });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  }
};
