export class MessageHandlers {
  private openaiConnection: any;
  private broadcastToClients: (message: any) => void;

  constructor(openaiConnection: any, broadcastToClients: (message: any) => void) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }

  async handleAudioInput(audioData: string, sessionId: string): Promise<void> {
    if (!this.openaiConnection.isConnected()) {
      await this.openaiConnection.connect();
    }
    
    this.openaiConnection.send({
      type: 'input_audio_buffer.append',
      audio: audioData
    });
  }

  async handleTextInput(text: string, sessionId: string): Promise<void> {
    if (!this.openaiConnection.isConnected()) {
      await this.openaiConnection.connect();
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
