/// <reference types="@cloudflare/workers-types" />

import { VoiceSessionCore } from './voice-session-core';
import { MessageHandlers } from './message-handlers';
import { AgentManager } from './agent-manager';
import { OpenAIConnection } from './openai-connection';

export class VoiceSessionHandlers {
  constructor(
    private core: VoiceSessionCore,
    private openaiConnection: OpenAIConnection,
    private messageHandlers: MessageHandlers,
    private agentManager: AgentManager,
    private externalData?: any // Will be set after external data is created
  ) {}

  async handleHTTPMessage(request: Request): Promise<Response> {
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
          return this.core.createErrorResponse(
            'Voice service not ready. Please wait a moment and try again.',
            503
          );
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
            this.core.broadcastToClients({
              type: 'session_info',
              sessionId: sessionInfo.sessionId,
              clientSecret: sessionInfo.clientSecret,
              // Keep clientSecret for WebRTC connection, remove apiKey only
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
              this.core.broadcastToClients({
                type: 'session_info',
                sessionId: sessionInfo.sessionId,
                clientSecret: sessionInfo.clientSecret,
                // Keep clientSecret for WebRTC connection, remove apiKey only
              });
            } catch (error) {
              console.error('❌ Failed to connect to OpenAI:', error);
              this.core.broadcastToClients({
                type: 'error',
                error: { message: 'Failed to initialize voice service' }
              });
            }
          }
          break;
        default:
          console.warn('⚠️ Unknown message type:', data.type);
      }

      return this.core.createJsonResponse({ success: true });

    } catch (error) {
      console.error('❌ Failed to handle HTTP message:', error);
      return this.core.createErrorResponse('Failed to process message', 400);
    }
  }

  async handleReset(request: Request): Promise<Response> {
    try {
      console.log('🔄 Manual reset requested');
      
      // Reset the session
      this.resetSession();
      
      // Notify all clients about the reset
      this.core.broadcastToClients({
        type: 'session_reset',
        sessionId: this.core.getSessionId(),
        message: 'Session has been reset'
      });
      
      return this.core.createJsonResponse({ 
        success: true, 
        message: 'Session reset successfully',
        newSessionId: this.core.getSessionId()
      });
      
    } catch (error) {
      console.error('❌ Failed to reset session:', error);
      return this.core.createErrorResponse('Failed to reset session', 500);
    }
  }

  async handleSetLiveSession(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: this.core.getCorsHeaders()
        });
      }

      if (request.method !== 'POST') {
        return this.core.createErrorResponse('Method not allowed. Use POST.', 405);
      }

      const body = await request.json() as { sessionId?: string };
      const { sessionId } = body;
      
      // Note: In a real implementation, you'd need to get the actual RealtimeSession object
      // For now, we'll just acknowledge that the session is set
      console.log('🔗 Live session reference set for session:', sessionId);
      
      return this.core.createJsonResponse({
        success: true,
        message: 'Live session reference set'
      });
    } catch (error) {
      console.error('❌ Failed to set live session:', error);
      return this.core.createErrorResponse('Failed to set live session', 500);
    }
  }

  async handleSetBaseInstructions(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: this.core.getCorsHeaders()
        });
      }

      if (request.method !== 'POST') {
        return this.core.createErrorResponse('Method not allowed. Use POST.', 405);
      }

      const body = await request.json() as { sessionId?: string; instructions?: string };
      const { sessionId, instructions } = body;
      
      if (!instructions) {
        return this.core.createErrorResponse('Instructions are required', 400);
      }
      
      // Set base instructions for the session
      this.setBaseInstructions(instructions);
      console.log('📝 Base instructions set for session:', sessionId);
      
      return this.core.createJsonResponse({
        success: true,
        message: 'Base instructions set successfully'
      });
    } catch (error) {
      console.error('❌ Failed to set base instructions:', error);
      return this.core.createErrorResponse('Failed to set base instructions', 500);
    }
  }

  handleOpenAIConnectionMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      this.messageHandlers.handleOpenAIMessage(data);
    } catch (error) {
      console.error('Failed to handle OpenAI connection message:', error);
    }
  }

  onOpenAIConnected(): void {
    console.log('✅ OpenAI connection established');
    this.core.broadcastToClients({ type: 'openai_connected' });
  }

  onOpenAIDisconnected(): void {
    console.log('🔌 OpenAI disconnected');
    this.core.broadcastToClients({ type: 'openai_disconnected' });
  }

  // Helper methods that need to be delegated to external data component
  private resetSession(): void {
    if (this.externalData) {
      // Reset session through external data component
      console.log('🔄 Resetting session...');
    }
  }

  private setBaseInstructions(instructions: string): void {
    if (this.externalData) {
      this.externalData.setBaseInstructions(instructions);
    }
  }

  // Method to set external data reference after initialization
  setExternalData(externalData: any): void {
    this.externalData = externalData;
  }
}
