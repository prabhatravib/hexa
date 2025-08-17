/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
}

export class OpenAIConnection {
  private openaiWs: WebSocket | null = null;
  private env: Env;
  private onMessage: (data: string) => void;
  private onError: (error: any) => void;
  private onOpen: () => void;
  private onClose: () => void;

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
    if (this.openaiWs) return true;
    
    const apiKey = this.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      this.onError({
        message: 'OpenAI API key not configured. Please check Cloudflare dashboard secrets.',
        details: 'Missing OPENAI_API_KEY secret in Cloudflare dashboard'
      });
      return false;
    }
    
    try {
      // Create session first
      const sessionData = await this.createSession(apiKey);
      if (!sessionData) return false;
      
      // Wait for session to stabilize
      console.log('🔧 Waiting 2 seconds for session to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
             // Try different WebSocket URLs
       const urls = [
         `wss://api.openai.com/v1/realtime/sessions/${sessionData.id}/stream?client_secret=${sessionData.client_secret.value}`,
         `wss://api.openai.com/v1/realtime/sessions/${sessionData.id}/stream`,
         `wss://api.openai.com/v1/realtime/sessions/${sessionData.id}`
       ];
       
       console.log('🔧 WebSocket URL options:', urls);
       
       // Try each URL until one works
       for (let i = 0; i < urls.length; i++) {
         const success = await this.tryConnect(urls[i], i + 1);
         if (success) return true;
       }
       
       // If all WebSocket methods fail, try HTTP streaming as fallback
       console.log('🔧 All WebSocket methods failed, trying HTTP streaming fallback...');
       const httpSuccess = await this.tryHttpStreaming(sessionData.id, apiKey);
       if (httpSuccess) return true;
       
       this.onError({
         message: 'All connection methods failed',
         details: { urls_tried: urls.length, http_fallback_tried: true }
       });
       return false;
      
    } catch (error) {
      console.error('Failed to connect to OpenAI:', error);
      this.onError({
        message: 'Failed to connect to voice service',
        details: error
      });
      return false;
    }
  }

  private async createSession(apiKey: string): Promise<any> {
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
    
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
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
    console.log('Session created:', sessionData);
    return sessionData;
  }

  private async tryConnect(wsUrl: string, methodNumber: number): Promise<boolean> {
    try {
      console.log(`🔧 Attempting Method ${methodNumber}: ${wsUrl}`);
      
      // Test if we can reach the WebSocket endpoint first
      try {
        const testUrl = wsUrl.replace('wss://', 'https://').replace('/stream', '');
        console.log(`🔧 Testing endpoint reachability: ${testUrl}`);
        
        const testResponse = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
          }
        });
        console.log(`🔧 Endpoint test response: ${testResponse.status}`);
      } catch (testError) {
        console.log(`🔧 Endpoint test failed:`, testError);
      }
      
      this.openaiWs = new WebSocket(wsUrl);
      console.log('WebSocket created successfully');
      console.log('WebSocket readyState:', this.openaiWs.readyState);
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (this.openaiWs && this.openaiWs.readyState !== WebSocket.OPEN) {
            console.log(`🔧 Method ${methodNumber} failed - timeout (readyState: ${this.openaiWs?.readyState})`);
            this.openaiWs?.close();
            this.openaiWs = null;
            resolve(false);
          }
        }, 5000);
        
        if (this.openaiWs) {
          this.openaiWs.addEventListener('open', () => {
            clearTimeout(timeout);
            console.log(`✅ Method ${methodNumber} WebSocket connected successfully`);
            this.setupEventListeners();
            this.onOpen();
            resolve(true);
          });
          
          this.openaiWs.addEventListener('error', (error) => {
            clearTimeout(timeout);
            console.log(`❌ Method ${methodNumber} failed - WebSocket error:`, error);
            console.log(`❌ Error type:`, typeof error);
            console.log(`❌ Error constructor:`, error.constructor?.name);
            resolve(false);
          });
          
          this.openaiWs.addEventListener('close', (event) => {
            clearTimeout(timeout);
            console.log(`❌ Method ${methodNumber} failed - WebSocket closed:`, event.code, event.reason);
            resolve(false);
          });
        }
      });
      
    } catch (error) {
      console.error(`❌ Method ${methodNumber} failed:`, error);
      return false;
    }
  }

  private setupEventListeners(): void {
    if (!this.openaiWs) return;
    
    this.openaiWs.addEventListener('message', (event) => {
      this.onMessage(event.data);
    });
    
    this.openaiWs.addEventListener('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      this.onError({
        message: 'Connection error with voice service',
        details: { error: String(error) }
      });
    });
    
    this.openaiWs.addEventListener('close', () => {
      console.log('OpenAI WebSocket closed');
      this.openaiWs = null;
      this.onClose();
    });
  }

  send(message: any): void {
    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify(message));
    }
  }

  isConnected(): boolean {
    return this.openaiWs?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    if (this.openaiWs) {
      this.openaiWs.close();
      this.openaiWs = null;
    }
  }
}
