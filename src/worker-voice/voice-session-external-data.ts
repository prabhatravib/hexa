/// <reference types="@cloudflare/workers-types" />

import { VoiceSessionCore } from './voice-session-core';
import { MessageHandlers } from './message-handlers';
import { AgentManager } from './agent-manager';

export interface ExternalData {
  image?: string;
  text?: string;
  prompt?: string;
  type?: string;
}

export interface SessionData {
  sessionId: string;
  mode?: 'default' | 'narrator';
  systemPromptOverride?: string;
  isOverride?: boolean;
  awaitingContext?: boolean;
  timestamp?: number;
}

export class VoiceSessionExternalData {
  private currentExternalData: ExternalData | null = null;
  private externalContext: string = "";
  private baseInstructions: string = "";
  private live: {
    session: any;
    openaiSessionId: string;
  } | null = null;

  constructor(
    private core: VoiceSessionCore,
    private state: DurableObjectState,
    private messageHandlers: MessageHandlers,
    private agentManager: AgentManager
  ) {}

  // Get the current OpenAI session ID from the live session
  private getCurrentOpenAISessionId(): string {
    if (this.live?.openaiSessionId) {
      return this.live.openaiSessionId;
    }
    // Fallback to core session ID if no live session
    return this.core.getSessionId();
  }

  private async storeSessionMeta(sessionId: string, meta: SessionData): Promise<void> {
    try {
      const key = `session_meta_${sessionId}`;
      await this.state.storage.put(key, meta);
      console.log('[Narrator Mode] Stored session meta:', { key, ...meta });
    } catch (err) {
      console.error('❌ Failed to store session meta:', err);
    }
  }

  private async getSessionMeta(sessionId: string): Promise<SessionData | null> {
    try {
      const key = `session_meta_${sessionId}`;
      const data = await this.state.storage.get(key) as SessionData | null;
      return data || null;
    } catch (err) {
      console.error('❌ Failed to get session meta:', err);
      return null;
    }
  }

  private async applyNarratorOverrideIfPossible(sessionId: string, context?: string): Promise<void> {
    try {
      const openai = (this.messageHandlers as any).openaiConnection;
      if (!openai || !openai.isConnected()) {
        console.log('[Narrator Mode] OpenAI session not connected yet; will apply on connect.');
        return;
      }

      let instructions = (context || '').trim();
      if (!instructions) {
        const meta = await this.getSessionMeta(sessionId);
        instructions = (meta?.systemPromptOverride || '').trim();
      }
      if (!instructions) {
        console.log('[Narrator Mode] No narrator context available to apply.');
        return;
      }

      console.log(`[Narrator Mode] Using narrator system prompt for session: ${sessionId}`);
      await openai.sendMessage({
        type: 'session.update',
        session: { instructions }
      });
      this.core.broadcastToClients({
        type: 'narrator_prompt_applied',
        sessionId,
        message: 'Narrator instructions applied to session'
      });
    } catch (err) {
      console.error('❌ Failed to apply narrator override:', err);
    }
  }

  async setNarratorAwaitingContext(sessionId: string): Promise<void> {
    const meta: SessionData = {
      sessionId,
      mode: 'narrator',
      awaitingContext: true,
      isOverride: false,
      timestamp: Date.now()
    };
    await this.storeSessionMeta(sessionId, meta);
    console.log(`[Narrator Mode] Initialized narrator session awaiting context: ${sessionId}`);
  }

  async injectExternalFact(text: string): Promise<void> {
    if (!this.live?.session) {
      console.log('ℹ️ No live Realtime session available for injection');
      return;
    }

    try {
      const fact = `Authoritative external context:
${text}
Use this over prior knowledge. "Infflow" with two f's is the user's company, not the ADHD app.`;

      await this.live.session.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: fact }]
        }
      });

      // Optional: also refresh top-level instructions
      await this.live.session.send({
        type: "session.update",
        session: {
          instructions: "Follow any message containing 'Authoritative external context' as ground truth."
        }
      });

      console.log('✅ External fact injected into live Realtime session');
    } catch (error) {
      console.error('❌ Failed to inject external fact into live session:', error);
    }
  }



  // Create facts block from external data
  private makeFactsBlock(externalData: any): string {
    const facts: string[] = [];
    
    if (externalData.text) {
      // Convert text into bullet points
      const textLines = externalData.text.split('\n').filter((line: string) => line.trim());
      textLines.forEach((line: string) => {
        facts.push(`- ${line.trim()}`);
      });
    }
    
    if (externalData.prompt && externalData.prompt !== externalData.text) {
      facts.push(`- ${externalData.prompt}`);
    }
    
    return facts.join('\n');
  }

  private buildInstructions(): string {
    const agentProfile = this.agentManager.getAgentInstructions();
    const externalCtx = this.externalContext.trim();
    
    const parts = [agentProfile];
    if (externalCtx) {
      parts.push(`Authoritative external context:\n${externalCtx}\nAlways use it.`);
    }
    
    return parts.filter(Boolean).join("\n\n");
  }

  private buildShortSystemNote(externalData: any): string {
    const fact = (externalData?.text || "").trim();
    if (!fact) return "";
    return `System note: ${fact}`;
  }

  // Inject as a system message into the live conversation
  async injectSystemNote(externalData: any): Promise<void> {
    if (!this.live?.session) {
      console.log('ℹ️ No live Realtime session available for system note');
      return;
    }
    const note = this.buildShortSystemNote(externalData);
    if (!note) return;

    // 1) append a short system message to the conversation
    await this.live.session.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: note }]
      }
    });

    // 2) let the model read the new item immediately
    await this.live.session.send({ type: "response.create" });
  }

  private async formatCurrentExternalData(): Promise<string | null> {
    try {
      if (!this.currentExternalData || !this.currentExternalData.text) {
        return null;
      }

      const data = this.currentExternalData;
      
      if (data.type === "mermaid") {
        return `External context (Mermaid diagram available):\n\`\`\`mermaid\n${data.text}\n\`\`\``;
      } else {
        return `External context:\n${data.text}`;
      }
    } catch (error) {
      console.error('❌ Failed to get external data:', error);
      return null;
    }
  }

  // Store external data with session ID
  private async storeExternalData(sessionId: string, data: {
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
    timestamp: string;
  }): Promise<void> {
    try {
      const storageKey = `external_data_${sessionId}`;
      await this.state.storage.put(storageKey, data);
      console.log('💾 Stored external data for session:', sessionId);
    } catch (error) {
      console.error('❌ Failed to store external data:', error);
    }
  }

  // Get external data by session ID
  private async getExternalDataBySessionId(sessionId: string): Promise<{
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
    timestamp: string;
  } | null> {
    try {
      const storageKey = `external_data_${sessionId}`;
      const data = await this.state.storage.get(storageKey) as {
        image?: string;
        text?: string;
        prompt?: string;
        type?: string;
        timestamp: string;
      } | null;
      return data || null;
    } catch (error) {
      console.error('❌ Failed to get external data:', error);
      return null;
    }
  }

  // Handle external data file endpoint (like infflow.md)
  async handleExternalDataFile(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: this.core.getCorsHeaders()
        });
      }

      if (request.method !== 'GET') {
        return this.core.createErrorResponse('Method not allowed. Use GET.', 405);
      }

      // Get external data from storage
      const externalData = await this.state.storage.get('external_data_file') as string;
      
      if (!externalData) {
        // Return empty content if no external data
        return new Response('# External Data\n\nNo external data available.\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/markdown',
            ...this.core.getCorsHeaders()
          }
        });
      }

      return new Response(externalData, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown',
          ...this.core.getCorsHeaders()
        }
      });

    } catch (error) {
      console.error('❌ Failed to serve external data file:', error);
      return new Response('# External Data\n\nError loading external data.\n', {
        status: 500,
        headers: {
          'Content-Type': 'text/markdown',
          ...this.core.getCorsHeaders()
        }
      });
    }
  }

  // Handle external data status endpoint
  async handleExternalDataStatus(request: Request): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: this.core.getCorsHeaders()
        });
      }

      if (request.method !== 'GET') {
        return this.core.createErrorResponse('Method not allowed. Use GET.', 405);
      }

      // Extract iframe session ID from URL parameters
      const url = new URL(request.url);
      const iframeSessionId = url.searchParams.get('sessionId');
      
      // Use iframe session ID if available, otherwise fall back to OpenAI session ID
      const targetSessionId = iframeSessionId || this.getCurrentOpenAISessionId();
      console.log('🆔 Status request using session ID:', targetSessionId, iframeSessionId ? '(from iframe)' : '(from OpenAI)');

      // Get external data and narrator meta for the current session
      const [externalData, sessionMeta] = await Promise.all([
        this.getExternalDataBySessionId(targetSessionId),
        this.getSessionMeta(targetSessionId)
      ]);
      const hasExternalData = externalData !== null;
      const dataType = externalData?.type || null;
      const timestamp = externalData?.timestamp || null;
      const hasNarratorContext = !!(sessionMeta?.mode === 'narrator' && sessionMeta?.systemPromptOverride);

      // Debug: List all storage keys to see what's available
      const allKeys = await this.state.storage.list();
      console.log('🔍 All storage keys:', Array.from(allKeys.keys()));
      console.log('🔍 Looking for keys:', `external_data_${targetSessionId}`, `session_meta_${targetSessionId}`);
      console.log('🔍 Found external data:', externalData);
      console.log('🔍 Found session meta:', sessionMeta);

      return this.core.createJsonResponse({
        hasExternalData,
        dataType,
        timestamp,
        sessionId: targetSessionId,
        externalData: externalData,  // Include the actual data
        hasNarratorContext,
        sessionMeta
      });

    } catch (error) {
      console.error('❌ Failed to handle external data status:', error);
      return this.core.createErrorResponse('Failed to get external data status', 500);
    }
  }

  // Handle external data endpoint
  async handleExternalData(request: Request): Promise<Response> {
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

      const body = await request.json() as { 
        text?: string; 
        image?: string; 
        prompt?: string; 
        type?: string;
        mermaidCode?: string;
        diagramImage?: string;
        sessionId?: string;
        context?: string; // narrator mode context
      };

      // Handle different input formats from external websites
      const text = (body.text || body.mermaidCode || '').trim();
      const image = body.image || body.diagramImage || '';
      const prompt = body.prompt || '';
      const type = body.type || '';
      const context = (body.context || '').trim();
      const sessionId = body.sessionId || this.core.getSessionId();

      if (!text && !image) {
        return this.core.createErrorResponse('no_text_or_image', 400);
      }

      console.log('📥 Received external data:', { 
        text: text.substring(0, 100), 
        hasImage: !!image, 
        prompt, 
        type,
        hasNarratorContext: !!context,
        sessionId 
      });

      // Narrator mode: store and apply system prompt override
      if (type === 'narrator' && context) {
        const meta: SessionData = {
          sessionId,
          mode: 'narrator',
          systemPromptOverride: context,
          isOverride: true,
          awaitingContext: false,
          timestamp: Date.now()
        };
        await this.storeSessionMeta(sessionId, meta);

        console.log(`[Narrator Mode] Context stored for session: ${sessionId}`);
        await this.applyNarratorOverrideIfPossible(sessionId, context);

        this.core.broadcastToClients({
          type: 'narrator_mode_activated',
          sessionId,
          message: 'Narrator context stored and applied'
        });

        return this.core.createJsonResponse({
          success: true,
          mode: 'narrator',
          sessionId
        });
      }

      // 🚫 CHECK: Block external data if session is in narrator mode
      const sessionMeta = await this.getSessionMeta(sessionId);
      if (sessionMeta && sessionMeta.mode === 'narrator') {
        console.log('🚫 Blocked external data: Session is in narrator mode');
        return this.core.createJsonResponse({
          success: false,
          blocked: true,
          reason: 'narrator_mode_active',
          message: 'External data not accepted while in narrator mode',
          sessionId
        }, 403); // 403 Forbidden
      }

      // Store the external data (only if NOT in narrator mode)
      const externalData = {
        text,
        image,
        prompt,
        type,
        timestamp: new Date().toISOString()
      };

      await this.storeExternalData(sessionId, externalData);
      console.log('💾 Stored external data for session:', sessionId);

      // Update message handlers with the external data
      this.messageHandlers.updateExternalData(externalData);
      console.log('📝 Updated message handlers with external data');

      // IMPORTANT: Broadcast to frontend for injection via WebRTC
      // The frontend will use transport.sendEvent() which actually works
      this.core.broadcastToClients({
        type: 'external_data_received',
        data: externalData,
        sessionId: sessionId,
        message: 'External data received - injecting into voice session'
      });
      console.log('📡 Broadcasted external data to frontend for WebRTC injection');

      return this.core.createJsonResponse({ 
        success: true,
        message: 'External data received and broadcasted for injection',
        sessionId: sessionId
      });

    } catch (error) {
      console.error('❌ Failed to handle external data:', error);
      return this.core.createErrorResponse('Failed to process external data', 500);
    }
  }

  // Getter for external data
  getCurrentExternalData(): ExternalData | null {
    return this.currentExternalData;
  }

  // Set the live Realtime session when WebRTC connects
  async setLiveSession(realtimeSession: any): Promise<void> {
    this.live = {
      session: realtimeSession,
      openaiSessionId: realtimeSession.id || realtimeSession.session?.id || 'unknown'
    };
    console.log('🔗 Live Realtime session set for external data injection');
    
    // Auto-injection now handled by frontend via broadcast
  }

  // Public method to trigger auto-injection when session is ready
  // This is now handled by broadcasting to frontend instead of direct injection
  async triggerAutoInjectionIfReady(): Promise<void> {
    try {
      const sid = this.core.getSessionId();
      const meta = await this.getSessionMeta(sid);

      if (meta?.mode === 'narrator' && meta.isOverride && meta.systemPromptOverride) {
        console.log(`[Narrator Mode] Auto-applying narrator instructions on session open: ${sid}`);
        await this.applyNarratorOverrideIfPossible(sid, meta.systemPromptOverride);
      } else if (meta?.mode === 'narrator' && meta.awaitingContext) {
        console.log(`[Narrator Mode] Narrator mode active, awaiting context for session: ${sid}`);
      } else {
        console.log('🔄 Auto-injection now handled by frontend via broadcast');
      }
    } catch (err) {
      console.error('❌ Failed during narrator auto-apply:', err);
    }
  }



  // Set base instructions for the session
  setBaseInstructions(instructions: string): void {
    this.baseInstructions = instructions;
    console.log('📝 Base instructions set for session');
  }

  // Clear the live session when WebRTC disconnects
  clearLiveSession(): void {
    this.live = null;
    console.log('🔗 Live Realtime session cleared');
  }
}
