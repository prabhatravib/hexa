/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
}

export class OpenAIConnection {
  private env: Env;
  private onMessage: (data: string) => void;
  private onError: (error: any) => void;
  private onOpen: () => void;
  private onClose: () => void;
  private sessionId: string | null = null;
  private clientSecret: string | null = null;
  private openaiWs: WebSocket | null = null;

  constructor(
    env: Env, 
    onMessage: (data: string) => void,
    onError: (error: any) => void,
    onOpen: () => void,
    onClose: () => void
  ) {
    this.env = env;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onOpen = onOpen;
    this.onClose = onClose;
  }

  async connect(): Promise<boolean> {
    console.log('🔧 OpenAI connect() called');
    const apiKey = this.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ No OpenAI API key found');
      this.onError({
        message: 'OpenAI API key not configured. Please check Cloudflare dashboard secrets.',
        details: 'Missing OPENAI_API_KEY secret in Cloudflare dashboard'
      });
      return false;
    }
    
    try {
      console.log('🔧 Creating OpenAI Realtime session...');
      
      // Create session first
      const sessionData = await this.createSession(apiKey);
      if (!sessionData) return false;
      
      this.sessionId = sessionData.id;
      this.clientSecret = sessionData.client_secret?.value;
      
      console.log('✅ Session created successfully:', {
        id: this.sessionId,
        hasClientSecret: !!this.clientSecret,
        clientSecretLength: this.clientSecret?.length || 0
      });
      
      // Now establish the actual WebSocket connection to OpenAI
      console.log('🔧 Establishing WebSocket connection...');
      await this.establishWebSocketConnection();
      
      console.log('✅ OpenAI connection complete');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to create OpenAI session:', error);
      this.onError({
        message: 'Failed to create voice session',
        details: error
      });
      return false;
    }
  }

  private async createSession(apiKey: string): Promise<any> {
    const requestBody = {
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      input_audio_format: 'webm', // Changed from pcm16 to webm for better compatibility
      output_audio_format: 'webm', // Changed from pcm16 to webm for better compatibility
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200
      }
    };
    
    console.log('🔧 Creating session with request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (response.status !== 200) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
    }
    
    const sessionData = await response.json();
    console.log('✅ Session created successfully:', sessionData);
    return sessionData;
  }

  private async establishWebSocketConnection(): Promise<void> {
    if (!this.sessionId || !this.clientSecret) {
      throw new Error('Session not created yet');
    }

    try {
      console.log('🔧 Establishing WebSocket connection to OpenAI...');
      
      const wsUrl = `wss://api.openai.com/v1/realtime/sessions/${this.sessionId}/stream?client_secret=${this.clientSecret}`;
      console.log('🔗 WebSocket URL:', wsUrl);
      
      // Create WebSocket with proper error handling
      this.openaiWs = new WebSocket(wsUrl);
      console.log('🔧 WebSocket created, waiting for connection...');
      
      // Return a promise that resolves when connected or rejects on error
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000); // 10 second timeout
        
        this.openaiWs!.addEventListener('open', () => {
          console.log('✅ OpenAI WebSocket connected successfully');
          clearTimeout(timeout);
          
          // Send session configuration
          this.openaiWs?.send(JSON.stringify({
            type: 'session.update',
            session: {
              instructions: 'You are a helpful AI assistant.'
            }
          }));
          
          // Notify that we're connected
          this.onOpen();
          resolve();
        });
        
        this.openaiWs!.addEventListener('error', (error) => {
          console.error('❌ OpenAI WebSocket error:', error);
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed'));
        });
        
        this.openaiWs!.addEventListener('close', (event) => {
          console.log('🔌 OpenAI WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });
          clearTimeout(timeout);
          this.onClose();
        });
        
        this.openaiWs!.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data as string);
            console.log('OpenAI message received:', data);
            
            // Forward OpenAI messages to the frontend
            this.onMessage(JSON.stringify({
              type: 'openai_message',
              data: data
            }));
          } catch (error) {
            console.error('Failed to parse OpenAI message:', error);
          }
        });
      });
      
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      throw error;
    }
  }

  // Send message to OpenAI WebSocket
  send(message: any): void {
    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      try {
        console.log('📤 Sending to OpenAI:', message.type);
        this.openaiWs.send(JSON.stringify(message));
      } catch (error) {
        console.error('❌ Failed to send to OpenAI:', error);
        this.onError({
          message: 'Failed to send message to OpenAI',
          details: error
        });
      }
    } else {
      console.warn('⚠️ OpenAI WebSocket not ready for sending');
      this.onError({
        message: 'OpenAI connection not ready',
        details: 'WebSocket state: ' + (this.openaiWs?.readyState || 'null')
      });
    }
  }

  isConnected(): boolean {
    // We're connected if we have a session and WebSocket is open
    return !!(this.sessionId && this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN);
  }

  disconnect(): void {
    this.sessionId = null;
    this.clientSecret = null;
    if (this.openaiWs) {
      this.openaiWs.close();
      this.openaiWs = null;
    }
    this.onClose();
  }

  getConnectionDetails(): { sessionId: string | null; clientSecret: string | null } {
    return {
      sessionId: this.sessionId,
      clientSecret: this.clientSecret
    };
  }
}
