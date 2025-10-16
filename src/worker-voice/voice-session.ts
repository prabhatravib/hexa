/// <reference types="@cloudflare/workers-types" />

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import { MessageHandlers } from './message-handlers';
import { AgentManager } from './agent-manager';
import { OpenAIConnection } from './openai-connection';
import { VoiceSessionCore } from './voice-session-core';
import { VoiceSessionHandlers } from './voice-session-handlers';
import { VoiceSessionExternalData } from './voice-session-external-data';

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
  SEB: SendEmail;
}

export class VoiceSession {
  private core: VoiceSessionCore;
  private handlers: VoiceSessionHandlers;
  private externalData: VoiceSessionExternalData;
  private openaiConnection: OpenAIConnection;
  private messageHandlers: MessageHandlers;
  private agentManager: AgentManager;

  constructor(private state: DurableObjectState, private env: Env) {
    // Initialize core session management
    this.core = new VoiceSessionCore(state, env);
    
    // Initialize OpenAI connection
    this.openaiConnection = new OpenAIConnection(
      env,
      (data: string) => this.handlers.handleOpenAIConnectionMessage(data),
      (error: any) => this.core.broadcastToClients({ type: 'error', error }),
      () => this.handlers.onOpenAIConnected(),
      () => this.handlers.onOpenAIDisconnected()
    );

    // Initialize message handlers
    this.messageHandlers = new MessageHandlers(
      this.openaiConnection,
      (message: any) => this.core.broadcastToClients(message)
    );
    this.messageHandlers.setCore(this.core);

    // Initialize agent manager
    this.agentManager = new AgentManager(
      this.openaiConnection,
      (message: any) => this.core.broadcastToClients(message)
    );

    // Initialize external data management
    this.externalData = new VoiceSessionExternalData(
      this.core,
      state,
      this.messageHandlers,
      this.agentManager
    );

    // Initialize handlers
    this.handlers = new VoiceSessionHandlers(
      this.core,
      this.openaiConnection,
      this.messageHandlers,
      this.agentManager
    );

    // Wire up handlers with external data
    this.handlers.setExternalData(this.externalData);

    // Set handlers reference in core for smart reset functionality
    this.core.setHandlers(this.handlers);

    // Wire up email functionality
    this.core.sendEmailToCreator = this.sendEmailToCreator.bind(this);

    console.log('🔧 VoiceSession initialized with composition pattern');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const modeParam = url.searchParams.get('mode');
    const sessionParam = url.searchParams.get('sessionId');
    if (modeParam === 'narrator' && sessionParam) {
      await this.externalData.setNarratorAwaitingContext(sessionParam);
    }
    
    // Route to appropriate component based on endpoint
    switch (url.pathname) {
      case '/voice/sse':
        return this.core.fetch(request);
      case '/voice/message':
        return this.handlers.handleHTTPMessage(request);
      case '/voice/test':
        return this.core.fetch(request);
      case '/voice/reset':
        return this.handlers.handleReset(request);
      case '/api/external-data':
        return this.externalData.handleExternalData(request);
      case '/api/external-data/status':
        return this.externalData.handleExternalDataStatus(request);
      case '/api/set-live-session':
        return this.handlers.handleSetLiveSession(request);
      case '/api/set-base-instructions':
        return this.handlers.handleSetBaseInstructions(request);
      case '/api/trigger-auto-injection':
        await this.triggerAutoInjectionIfReady();
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      case '/api/send-email':
        return this.handleEmailToCreator(request);
      case '/external-data.md':
        return this.externalData.handleExternalDataFile(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  // Delegate methods to appropriate components
  getCurrentExternalData() {
    return this.externalData.getCurrentExternalData();
  }

  // Email functionality
  async sendEmailToCreator(userMessage: string, contactInfo?: string, sessionId?: string): Promise<{success: boolean, message?: string, error?: string}> {
    try {
      console.log('📧 Sending email to creator developer prabhat:', { userMessage, contactInfo, sessionId });
      
      const isEmail = contactInfo && contactInfo.includes('@');
      const contactLabel = isEmail ? 'Email' : 'Name';
      
      const emailData = {
        to: 'prabhatravib@gmail.com',
        from: 'noreply@infflow.com',
        subject: `Voice Agent Message from ${contactInfo || 'Anonymous User'}`,
        text: `
Voice Agent Message from Hexa

User Message: ${userMessage}

Session Details:
- Session ID: ${sessionId || 'Unknown'}
- ${contactLabel}: ${contactInfo || 'Not provided'}
- Timestamp: ${new Date().toISOString()}
- Source: Hexa Voice Agent

This message was sent via the voice agent interface.
        `,
        html: `
          <h3>Voice Agent Message from Hexa</h3>
          <p><strong>User Message:</strong> ${userMessage}</p>
          <hr>
          <p><strong>Session Details:</strong></p>
          <ul>
            <li>Session ID: ${sessionId || 'Unknown'}</li>
            <li>${contactLabel}: ${contactInfo || 'Not provided'}</li>
            <li>Timestamp: ${new Date().toISOString()}</li>
            <li>Source: Hexa Voice Agent</li>
          </ul>
          <p><em>This message was sent via the voice agent interface.</em></p>
        `
      };

      const msg = createMimeMessage();
      msg.setSender({ name: 'Hexa Voice Agent', addr: emailData.from });
      msg.setRecipient(emailData.to);
      msg.setSubject(emailData.subject);
      msg.addMessage({ contentType: 'text/plain', data: emailData.text });
      msg.addMessage({ contentType: 'text/html', data: emailData.html });

      const message = new EmailMessage(emailData.from, emailData.to, msg.asRaw());
      await this.env.SEB.send(message);

      console.log('✅ EmailRouting send ok');
      return { success: true, message: 'Email sent' };
    } catch (e: any) {
      console.error('❌ EmailRouting send failed', e);
      return { success: false, error: 'CF EmailRouting', message: e?.message || 'Failed to send' };
    }
  }

  async handleEmailToCreator(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { message: string; userEmail?: string; sessionId?: string };
      const { message, userEmail, sessionId } = body;
      
      if (!message || message.trim().length === 0) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Message cannot be empty' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const result = await this.sendEmailToCreator(message, userEmail, sessionId);
      
      return new Response(JSON.stringify(result), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    } catch (error) {
      console.error('❌ Email handler error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to process email request' 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async setLiveSession(realtimeSession: any) {
    await this.externalData.setLiveSession(realtimeSession);
  }

  setBaseInstructions(instructions: string) {
    this.externalData.setBaseInstructions(instructions);
  }

  clearLiveSession() {
    this.externalData.clearLiveSession();
  }

  async triggerAutoInjectionIfReady() {
    await this.externalData.triggerAutoInjectionIfReady();
  }
}