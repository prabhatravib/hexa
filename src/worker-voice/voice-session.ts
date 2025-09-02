/// <reference types="@cloudflare/workers-types" />

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
  ASSETS: Fetcher;
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

    console.log('🔧 VoiceSession initialized with composition pattern');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
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

  setLiveSession(realtimeSession: any) {
    this.externalData.setLiveSession(realtimeSession);
  }

  setBaseInstructions(instructions: string) {
    this.externalData.setBaseInstructions(instructions);
  }

  clearLiveSession() {
    this.externalData.clearLiveSession();
  }
}