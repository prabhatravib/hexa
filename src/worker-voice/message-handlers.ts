/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class MessageHandlers {
  public openaiConnection: any;  // Changed from private to public
  private broadcastToClients: (message: any) => void;
  private isAgentResponding: boolean = false;
  private currentExternalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null = null;
  private core: any; // Reference to VoiceSessionCore
  
  // Email flow state
  private emailFlowActive: boolean = false;
  private emailFlowStep: 'initial' | 'waiting_message' | 'waiting_contact' | 'sending' = 'initial';
  private emailMessageContent: string = '';
  private emailContactInfo: string = '';

  constructor(openaiConnection: any, broadcastToClients: (message: any) => void) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }

  setCore(core: any): void {
    this.core = core;
  }

  setOpenAIConnection(openaiConnection: any): void {
    this.openaiConnection = openaiConnection;
  }

  private async sendCollectedEmail(): Promise<void> {
    try {
      console.log('📧 Sending collected email...', {
        message: this.emailMessageContent,
        contact: this.emailContactInfo
      });

      const result = await this.core.sendEmailToCreator(
        this.emailMessageContent,
        this.emailContactInfo || 'Anonymous',
        'voice-command'
      );

      if (result.success) {
        console.log('✅ Email sent successfully');
        this.broadcastToClients({
          type: 'email_sent',
          message: 'Your message has been sent to creator developer prabhat!',
          success: true
        });
      } else {
        console.error('❌ Email sending failed:', result.error);
        this.broadcastToClients({
          type: 'email_error',
          message: 'Sorry, I had trouble sending your message. Please try again.',
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('❌ Email sending exception:', error);
      this.broadcastToClients({
        type: 'email_error',
        message: 'Sorry, I had trouble sending your message. Please try again.',
        success: false
      });
    } finally {
      // Reset email flow state
      this.emailFlowActive = false;
      this.emailFlowStep = 'initial';
      this.emailMessageContent = '';
      this.emailContactInfo = '';
    }
  }

  // Method to update external data context
  updateExternalData(externalData: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null): void {
    this.currentExternalData = externalData;
    console.log('📝 Updated external data context in MessageHandlers:', externalData);
  }

  // Method to clear external data context
  clearExternalData(): void {
    this.currentExternalData = null;
    console.log('🗑️ Cleared external data context in MessageHandlers');
  }

  // Method to get current external data context
  getExternalData(): {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null {
    return this.currentExternalData;
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
      
      // NEW: Set external data for WebRTC injection if available
      if (this.currentExternalData) {
        console.log('🔧 Setting external data for WebRTC injection:', this.currentExternalData);
        this.openaiConnection.setExternalData(this.currentExternalData);
      }
      
      // Instead of trying to process audio in the worker, send session info to frontend
      // The frontend will handle the WebRTC connection directly
      const sessionInfo = this.openaiConnection.getSessionInfo();
      
      this.broadcastToClients({
        type: 'session_info',
        sessionId: sessionInfo.sessionId,
        clientSecret: sessionInfo.clientSecret,
        // Keep clientSecret for WebRTC connection, remove apiKey only
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
    console.log('📝 Processing text input:', text);
    console.log('📝 Current external data context:', this.currentExternalData);
    
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
      // Set external data for WebRTC injection if available
      if (this.currentExternalData) {
        console.log('🔧 Setting external data for WebRTC text message:', this.currentExternalData);
        this.openaiConnection.setExternalData(this.currentExternalData);
      }
      
      // Enhance text input with external data context if available
      let enhancedText = text;
      if (this.currentExternalData) {
        if (this.currentExternalData.text) {
          enhancedText = `Context: ${this.currentExternalData.text}\n\nUser question: ${text}`;
        }
        if (this.currentExternalData.prompt) {
          enhancedText = `Context: ${this.currentExternalData.prompt}\n\nUser question: ${text}`;
        }
        console.log('🔧 Enhanced text with external data context:', enhancedText);
      }
      
      // Send text message to OpenAI via HTTP with external data context
      await this.openaiConnection.sendMessage({
        type: 'text',
        text: enhancedText,
        externalData: this.currentExternalData
      });
    } catch (error) {
      console.error('❌ Failed to send text message:', error);
      this.broadcastToClients({
        type: 'error',
        error: { message: 'Failed to send text message. Please try again.' }
      });
    }
  }

  async handleExternalData(externalData: {
    image?: string;        // Optional image data
    text?: string;         // Optional text input
    prompt?: string;       // Optional context/prompt
    type?: string;         // Type of external data
  }, sessionId: string): Promise<void> {
    console.log('📥 Processing external data:', externalData);
    
    // Store the external data for voice context
    this.currentExternalData = externalData;
    console.log('📝 External data stored in MessageHandlers for voice context');
    console.log('📝 External data will now be available for all voice/text interactions');
    
    // Broadcast to clients that external data was received
    this.broadcastToClients({
      type: 'external_data_processed',
      data: externalData,
      sessionId: sessionId,
      message: 'External data received and available for voice discussions'
    });
    
    // If there's text content, we could potentially use it for voice context
    if (externalData.text) {
      this.broadcastToClients({
        type: 'external_text_available',
        text: externalData.text,
        sessionId: sessionId
      });
    }
    
    // If there's an image, notify clients
    if (externalData.image) {
      this.broadcastToClients({
        type: 'external_image_available',
        image: externalData.image,
        dataType: externalData.type || 'image',
        sessionId: sessionId
      });
    }
    
    console.log('✅ External data processed and broadcasted to clients');
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
        
        // Also clear external data context
        this.currentExternalData = null;
        console.log('🗑️ Cleared external data context on clear command');
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
      
      // Debug: Log all message types to see what's happening
      console.log('🔍 Worker processing message type:', message.type);
      if (message.type && message.type.includes('transcription')) {
        console.log('📝 Transcription-related message:', message);
      }
      
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
          console.log('📝 Transcription completed in worker:', message.transcript);
          
          // Check if user is asking to send an email
          const transcript = (message.transcript || '').toLowerCase();
          
          if (!this.emailFlowActive && 
              ((transcript.includes('send') && transcript.includes('email')) ||
              (transcript.includes('send') && transcript.includes('message') && 
               (transcript.includes('creator') || transcript.includes('developer') || transcript.includes('prabhat'))) ||
              (transcript.includes('contact') && 
               (transcript.includes('creator') || transcript.includes('developer') || transcript.includes('prabhat'))))) {
            
            console.log('📧 Email intent detected in user speech');
            this.emailFlowActive = true;
            this.emailFlowStep = 'waiting_message';
            this.emailMessageContent = '';
            this.emailContactInfo = '';
            
            this.broadcastToClients({
              type: 'email_flow_started',
              message: 'Email flow initiated'
            });
          } else if (this.emailFlowActive) {
            // We're in email flow, collect the message
            if (this.emailFlowStep === 'waiting_message') {
              // This is the message they want to send
              this.emailMessageContent = message.transcript;
              this.emailFlowStep = 'waiting_contact';
              console.log('📧 Email message collected:', this.emailMessageContent);
            } else if (this.emailFlowStep === 'waiting_contact') {
              // Check if they're providing contact info or declining
              if (transcript.includes('no') || transcript.includes('skip') || transcript.includes('anonymous')) {
                this.emailContactInfo = '';
                console.log('📧 User declined to provide contact info');
              } else {
                this.emailContactInfo = message.transcript;
                console.log('📧 Email contact info collected:', this.emailContactInfo);
              }
              
              // Now send the email
              this.emailFlowStep = 'sending';
              this.sendCollectedEmail();
            }
          }
          
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
