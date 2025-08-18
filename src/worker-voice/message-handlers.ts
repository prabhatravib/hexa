/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class MessageHandlers {
  private openaiConnection: any;
  private broadcastToClients: (message: any) => void;
  private isAgentResponding: boolean = false;

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
      console.log('🔧 Audio data received, sending session info to frontend for WebRTC connection...');
      
      // Instead of trying to process audio in the worker, send session info to frontend
      // The frontend will handle the WebRTC connection directly
      const sessionInfo = this.openaiConnection.getSessionInfo();
      
      this.broadcastToClients({
        type: 'session_info',
        sessionId: sessionInfo.sessionId,
        clientSecret: sessionInfo.clientSecret,
        apiKey: sessionInfo.apiKey,
        audioData: audioData // Pass the audio data to frontend
      });
      
      console.log('✅ Session info sent to frontend for WebRTC connection');
    } catch (error) {
      console.error('❌ Failed to process audio:', error);
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
    
    try {
      // Send text message to OpenAI via HTTP
      await this.openaiConnection.sendMessage({
        type: 'text',
        text: text
      });
    } catch (error) {
      console.error('❌ Failed to send text message:', error);
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Failed to send text message. Please try again.' }
      });
    }
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
        // Send interrupt command to frontend for WebRTC handling
        this.broadcastToClients({
          type: 'control',
          command: 'interrupt'
        });
        break;
        
      case 'clear':
        // Send clear command to frontend for WebRTC handling
        this.broadcastToClients({
          type: 'control',
          command: 'clear'
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
          // Send agent_start on first text delta to trigger mouth animation
          if (!this.isAgentResponding) {
            this.isAgentResponding = true;
            this.broadcastToClients({
              type: 'agent_start'
            });
          }
          
          this.broadcastToClients({
            type: 'response_text_delta',
            text: message.delta
          });
          break;
          
        case 'response.audio.delta':
          // Send agent_start on first audio delta to trigger mouth animation
          if (!this.isAgentResponding) {
            this.isAgentResponding = true;
            this.broadcastToClients({
              type: 'agent_start'
            });
          }
          
          this.broadcastToClients({
            type: 'audio_delta',
            audio: message.delta
          });
          break;
          
        case 'response.audio.done':
          // Send agent_end when audio is done to stop mouth animation
          if (this.isAgentResponding) {
            this.isAgentResponding = false;
            this.broadcastToClients({
              type: 'agent_end'
            });
          }
          
          this.broadcastToClients({
            type: 'audio_done'
          });
          break;
          
        case 'error':
          console.error('OpenAI error:', message.error);
          // Reset agent state on error
          if (this.isAgentResponding) {
            this.isAgentResponding = false;
            this.broadcastToClients({
              type: 'agent_end'
            });
          }
          
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
