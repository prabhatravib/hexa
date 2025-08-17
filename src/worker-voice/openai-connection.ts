/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class OpenAIConnection {
  private env: Env;
  private onMessage: (data: string) => void;
  private onError: (error: any) => void;
  private onOpen: () => void;
  private onClose: () => void;
  private sessionId: string | null = null;
  private clientSecret: string | null = null;

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
      
      // For Cloudflare Workers, we'll use HTTP streaming instead of WebSocket
      // The frontend will handle the WebRTC connection directly
      console.log('✅ OpenAI session ready for frontend WebRTC connection');
      this.onOpen();
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
    console.log('🔧 Creating OpenAI Realtime session...');
    
    // Use the standard Realtime API endpoint with optimal configuration
    const requestBody = {
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200
      }
    };
    
    console.log('🔧 Creating session with standard Realtime API...');
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (response.status === 200) {
      const sessionData = await response.json() as any;
      console.log('✅ Session created successfully:', sessionData);
      return sessionData;
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to create session:', response.status, errorText);
      throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
    }
  }

  // Send message to OpenAI via HTTP (for non-audio messages)
  async sendMessage(message: any): Promise<void> {
    if (!this.sessionId) {
      console.error('❌ No session available');
      return;
    }

    try {
      console.log('📤 Sending message to OpenAI via HTTP:', message.type);
      
      // For text messages, we can use the chat completions API
      if (message.type === 'text') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: message.text }],
            stream: false
          })
        });

        if (response.ok) {
          const result = await response.json() as any;
          this.onMessage(JSON.stringify({
            type: 'response_text',
            text: result.choices?.[0]?.message?.content || 'No response'
          }));
        }
      }
    } catch (error) {
      console.error('❌ Failed to send message to OpenAI:', error);
      this.onError({
        message: 'Failed to send message to OpenAI',
        details: error
      });
    }
  }

  isConnected(): boolean {
    // We're connected if we have a session
    return !!this.sessionId;
  }

  disconnect(): void {
    this.sessionId = null;
    this.clientSecret = null;
    this.onClose();
  }

  getConnectionDetails(): { sessionId: string | null; clientSecret: string | null } {
    return {
      sessionId: this.sessionId,
      clientSecret: this.clientSecret
    };
  }

  // Get session info for frontend WebRTC connection
  getSessionInfo(): { sessionId: string | null; clientSecret: string | null; apiKey: string } {
    return {
      sessionId: this.sessionId,
      clientSecret: this.clientSecret,
      apiKey: this.env.OPENAI_API_KEY
    };
  }
}
