export class MessageHandlers {
  private openaiConnection: any;
  private broadcastToClients: (message: any) => void;

  constructor(openaiConnection: any, broadcastToClients: (message: any) => void) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }

  setOpenAIConnection(openaiConnection: any): void {
    this.openaiConnection = openaiConnection;
  }

  async handleAudioInput(audioData: string, sessionId: string): Promise<void> {
    // Check if OpenAI connection is available
    if (!this.openaiConnection) {
      console.error('❌ OpenAI connection not available');
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Voice service not ready. Please wait a moment and try again.' }
      });
      return;
    }

    // Check if connected, if not try to connect
    if (!this.openaiConnection.isConnected()) {
      console.log('🔧 OpenAI not connected, attempting to connect...');
      try {
        await this.openaiConnection.connect();
      } catch (error) {
        console.error('❌ Failed to connect to OpenAI:', error);
        this.broadcastToClients({
          type: 'error',
          error: { message: 'Failed to connect to voice service. Please try again.' }
        });
        return;
      }
    }
    
    try {
      console.log('🔧 Sending audio data to OpenAI...');
      this.openaiConnection.send({
        type: 'input_audio_buffer.append',
        audio: audioData
      });
      console.log('✅ Audio data sent successfully');
    } catch (error) {
      console.error('❌ Failed to send audio to OpenAI:', error);
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Failed to process audio. Please try again.' }
      });
    }
  }

  async handleTextInput(text: string, sessionId: string): Promise<void> {
    // Check if OpenAI connection is available
    if (!this.openaiConnection) {
      console.error('❌ OpenAI connection not available');
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Voice service not ready. Please wait a moment and try again.' }
      });
      return;
    }

    // Check if connected, if not try to connect
    if (!this.openaiConnection.isConnected()) {
      console.log('🔧 OpenAI not connected, attempting to connect...');
      try {
        await this.openaiConnection.connect();
      } catch (error) {
        console.error('❌ Failed to connect to OpenAI:', error);
        this.broadcastToClients({
          type: 'error',
          error: { message: 'Failed to connect to voice service. Please try again.' }
        });
        return;
      }
    }
    
    // Send text message to OpenAI
    this.openaiConnection.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'text',
          text: text
        }]
      }
    });
    
    // Trigger response
    this.openaiConnection.send({
      type: 'response.create'
    });
  }

  async handleControl(command: string, sessionId: string): Promise<void> {
    // Check if OpenAI connection is available
    if (!this.openaiConnection) {
      console.error('❌ OpenAI connection not available');
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Voice service not ready. Please wait a moment and try again.' }
      });
      return;
    }

    switch (command) {
      case 'interrupt':
        this.openaiConnection.send({
          type: 'response.cancel'
        });
        break;
        
      case 'clear':
        this.openaiConnection.send({
          type: 'input_audio_buffer.clear'
        });
        break;
        
      case 'get_agents':
        this.broadcastToClients({
          type: 'available_agents',
          agents: ['hexagon', 'customer-support', 'language-tutor']
        });
        break;
    }
  }

  handleOpenAIMessage(data: string): void {
    try {
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
            error: {
              message: message.error?.message || message.error || 'Unknown OpenAI error',
              details: message.error
            }
          });
          break;
          
        default:
          console.log('Unknown OpenAI message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse OpenAI message:', error);
    }
  }
}
