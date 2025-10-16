/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
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
    console.log('🔧 Using voice model:', this.env.OPENAI_VOICE_MODEL || 'gpt-realtime (fallback)');
    const apiKey = this.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('❌ No OpenAI API key found');
      this.onError({
        message: 'OpenAI API key not configured. Please check Cloudflare dashboard secrets.',
        details: 'Missing OPENAI_API_KEY secret in Cloudflare dashboard',
      });
      return false;
    }

    if (!this.env.OPENAI_VOICE_MODEL) {
      console.warn(
        '⚠️ No OPENAI_VOICE_MODEL environment variable set, using fallback: gpt-realtime'
      );
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
        clientSecretLength: this.clientSecret?.length || 0,
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
        details: error,
      });
      return false;
    }
  }

  private async createSession(apiKey: string): Promise<any> {
    console.log('🔧 Creating OpenAI Realtime session...');

    // Use the standard Realtime API endpoint with optimal configuration
    const requestBody = {
      model: this.env.OPENAI_VOICE_MODEL || 'gpt-realtime', // Read from environment variable with fallback
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      // Enable server-side transcription of input audio
      // Correct structure: provide a model, no boolean flags like `enabled`
      input_audio_transcription: {
        model: 'gpt-4o-mini-transcribe',
        // language can be optionally provided, e.g., 'en'
        // language: 'en'
      },
      turn_detection: {
        type: 'server_vad',
        // Ensure the model automatically creates a response after speech ends
        create_response: true,
        threshold: 0.3, // Lower threshold for more sensitive detection
        prefix_padding_ms: 500, // Capture more audio before speech
        silence_duration_ms: 1000, // Wait longer before considering speech ended
      },
    };

    console.log('🔧 Creating session with standard Realtime API...');
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 200) {
      const sessionData = (await response.json()) as any;
      console.log('✅ Session created successfully:', sessionData);

      // Image support is handled directly via conversation.item.create events
      // No session-level configuration needed

      return sessionData;
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to create session:', response.status, errorText);
      throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
    }
  }

  // Image support is handled directly via conversation.item.create events
  // No session-level configuration needed

  // Send message to OpenAI via Realtime API (for various message types)
  async sendMessage(message: any): Promise<void> {
    if (!this.sessionId) {
      console.error('❌ No session available');
      return;
    }

    try {
      console.log('📤 Sending message to OpenAI via Realtime API:', message.type);

      // Handle session.update messages
      if (message.type === 'session.update') {
        const response = await fetch(
          `https://api.openai.com/v1/realtime/sessions/${this.sessionId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message.session),
          }
        );

        if (response.ok) {
          console.log('✅ Session updated successfully');
        } else {
          const errorText = await response.text();
          console.error('❌ Failed to update session:', response.status, errorText);
        }
        return;
      }

      // Handle conversation.item.create messages
      if (message.type === 'conversation.item.create') {
        console.log('🔧 Processing conversation.item.create:', JSON.stringify(message, null, 2));

        const response = await fetch(
          `https://api.openai.com/v1/realtime/sessions/${this.sessionId}/conversation/items`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          }
        );

        if (response.ok) {
          console.log('✅ Conversation item created successfully');
        } else {
          const errorText = await response.text();
          console.error('❌ Failed to create conversation item:', response.status, errorText);
          console.error('❌ Request body was:', JSON.stringify(message, null, 2));

          // Try to parse error details
          try {
            const errorData = JSON.parse(errorText);
            console.error('❌ Parsed error:', errorData);
          } catch (e) {
            console.error('❌ Raw error text:', errorText);
          }
        }
        return;
      }

      // For text messages, use the Realtime API conversation items
      if (message.type === 'text') {
        // Create conversation item with the user's text message
        const conversationItem = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: message.text,
              },
            ],
          },
        };

        // Send the conversation item to Realtime API
        const response = await fetch(
          `https://api.openai.com/v1/realtime/sessions/${this.sessionId}/conversation/items`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(conversationItem),
          }
        );

        if (response.ok) {
          console.log('✅ Text message sent to Realtime session');
        } else {
          const errorText = await response.text();
          console.error(
            '❌ Failed to send text message to Realtime session:',
            response.status,
            errorText
          );
        }
      }
    } catch (error) {
      console.error('❌ Failed to send message to OpenAI:', error);
      this.onError({
        message: 'Failed to send message to OpenAI',
        details: error,
      });
    }
  }

  // Store external data for injection via WebRTC events
  private externalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null = null;

  // Set external data to be injected when WebRTC connection is established
  setExternalData(externalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  }): void {
    this.externalData = externalData;
    console.log('📝 External data set for WebRTC injection:', externalData);
  }

  // Get external data for WebRTC injection
  getExternalData(): {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null {
    return this.externalData;
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
      clientSecret: this.clientSecret,
    };
  }

  // Get session info for frontend WebRTC connection
  getSessionInfo(): { sessionId: string | null; clientSecret: string | null; apiKey: string } {
    return {
      sessionId: this.sessionId,
      clientSecret: this.clientSecret,
      apiKey: this.env.OPENAI_API_KEY,
    };
  }
}
