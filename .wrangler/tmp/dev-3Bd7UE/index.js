var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker-voice/message-handlers.ts
var MessageHandlers = class {
  static {
    __name(this, "MessageHandlers");
  }
  openaiConnection;
  broadcastToClients;
  isAgentResponding = false;
  constructor(openaiConnection, broadcastToClients) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }
  setOpenAIConnection(openaiConnection) {
    this.openaiConnection = openaiConnection;
  }
  async handleAudioInput(audioData, sessionId) {
    if (!this.openaiConnection) {
      console.error("\u274C OpenAI connection not available");
      this.broadcastToClients({
        type: "error",
        error: { message: "Voice service not ready. Please wait a moment and try again." }
      });
      return;
    }
    if (!this.openaiConnection.isConnected()) {
      console.log("\u{1F527} OpenAI not connected, attempting to connect...");
      try {
        await this.openaiConnection.connect();
      } catch (error) {
        console.error("\u274C Failed to connect to OpenAI:", error);
        this.broadcastToClients({
          type: "error",
          error: { message: "Failed to connect to voice service. Please try again." }
        });
        return;
      }
    }
    try {
      console.log("\u{1F527} Audio data received, sending session info to frontend for WebRTC connection...");
      const sessionInfo = this.openaiConnection.getSessionInfo();
      this.broadcastToClients({
        type: "session_info",
        sessionId: sessionInfo.sessionId,
        clientSecret: sessionInfo.clientSecret,
        apiKey: sessionInfo.apiKey,
        audioData
        // Pass the audio data to frontend
      });
      console.log("\u2705 Session info sent to frontend for WebRTC connection");
    } catch (error) {
      console.error("\u274C Failed to process audio:", error);
      this.broadcastToClients({
        type: "error",
        error: { message: "Failed to process audio. Please try again." }
      });
    }
  }
  async handleTextInput(text, sessionId) {
    if (!this.openaiConnection) {
      console.error("\u274C OpenAI connection not available");
      this.broadcastToClients({
        type: "error",
        error: { message: "Voice service not ready. Please wait a moment and try again." }
      });
      return;
    }
    if (!this.openaiConnection.isConnected()) {
      console.log("\u{1F527} OpenAI not connected, attempting to connect...");
      try {
        await this.openaiConnection.connect();
      } catch (error) {
        console.error("\u274C Failed to connect to OpenAI:", error);
        this.broadcastToClients({
          type: "error",
          error: { message: "Failed to connect to voice service. Please try again." }
        });
        return;
      }
    }
    try {
      await this.openaiConnection.sendMessage({
        type: "text",
        text
      });
    } catch (error) {
      console.error("\u274C Failed to send text message:", error);
      this.broadcastToClients({
        type: "error",
        error: { message: "Failed to send text message. Please try again." }
      });
    }
  }
  async handleControl(command, sessionId) {
    if (!this.openaiConnection) {
      console.error("\u274C OpenAI connection not available");
      this.broadcastToClients({
        type: "error",
        error: { message: "Voice service not ready. Please wait a moment and try again." }
      });
      return;
    }
    switch (command) {
      case "interrupt":
        this.broadcastToClients({
          type: "control",
          command: "interrupt"
        });
        break;
      case "clear":
        this.broadcastToClients({
          type: "control",
          command: "clear"
        });
        break;
      case "get_agents":
        this.broadcastToClients({
          type: "available_agents",
          agents: ["hexagon", "customer-support", "language-tutor"]
        });
        break;
    }
  }
  handleOpenAIMessage(data) {
    try {
      const message = JSON.parse(data);
      switch (message.type) {
        case "session.created":
          this.broadcastToClients({
            type: "session_created",
            session: message.session
          });
          break;
        case "input_audio_buffer.speech_started":
          this.broadcastToClients({
            type: "speech_started"
          });
          break;
        case "input_audio_buffer.speech_stopped":
          this.broadcastToClients({
            type: "speech_stopped"
          });
          break;
        case "conversation.item.input_audio_transcription.completed":
          this.broadcastToClients({
            type: "transcription",
            text: message.transcript
          });
          break;
        case "response.audio_transcript.delta":
          if (!this.isAgentResponding) {
            this.isAgentResponding = true;
            this.broadcastToClients({
              type: "agent_start"
            });
          }
          this.broadcastToClients({
            type: "response_text_delta",
            text: message.delta
          });
          break;
        case "response.audio.delta":
          if (!this.isAgentResponding) {
            this.isAgentResponding = true;
            this.broadcastToClients({
              type: "agent_start"
            });
          }
          this.broadcastToClients({
            type: "audio_delta",
            audio: message.delta
          });
          break;
        case "response.audio.done":
          if (this.isAgentResponding) {
            this.isAgentResponding = false;
            this.broadcastToClients({
              type: "agent_end"
            });
          }
          this.broadcastToClients({
            type: "audio_done"
          });
          break;
        case "error":
          console.error("OpenAI error:", message.error);
          if (this.isAgentResponding) {
            this.isAgentResponding = false;
            this.broadcastToClients({
              type: "agent_end"
            });
          }
          this.broadcastToClients({
            type: "error",
            error: {
              message: message.error?.message || message.error || "Unknown OpenAI error",
              details: message.error
            }
          });
          break;
        default:
          console.log("Unknown OpenAI message type:", message.type);
      }
    } catch (error) {
      console.error("Failed to parse OpenAI message:", error);
    }
  }
};

// src/worker-voice/agent-manager.ts
var LANGUAGE_INSTRUCTIONS = `LANGUAGE POLICY:
- Your DEFAULT and PRIMARY language is ENGLISH
- Always start conversations in English
- Only switch to another language if the user explicitly requests it
- If asked to speak Spanish, French, German, or any other language, then switch to that language for the conversation
- When switching languages, acknowledge the language change and continue in the requested language
- If no language is specified, always use English

Remember: English first, other languages only when requested.`;
var AgentManager = class {
  static {
    __name(this, "AgentManager");
  }
  openaiConnection;
  broadcastToClients;
  currentAgent = "hexagon";
  constructor(openaiConnection, broadcastToClients) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }
  setOpenAIConnection(openaiConnection) {
    this.openaiConnection = openaiConnection;
  }
  async switchAgent(agentId) {
    console.log("\u{1F504} Switching to agent:", agentId);
    this.currentAgent = agentId;
    this.broadcastToClients({
      type: "agent_switched",
      agentId,
      instructions: this.getAgentInstructions()
    });
    console.log("\u2705 Agent switched successfully");
  }
  getCurrentAgent() {
    return this.currentAgent;
  }
  getAgentInstructions() {
    switch (this.currentAgent) {
      case "hexagon":
        return `You are Hexa, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help. You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone. ${LANGUAGE_INSTRUCTIONS}`;
      default:
        return `You are a helpful AI assistant. You can assist with various tasks, answer questions, and engage in natural conversation. ${LANGUAGE_INSTRUCTIONS}`;
    }
  }
  getAvailableAgents() {
    return ["hexagon", "customer-support", "language-tutor"];
  }
};

// src/worker-voice/openai-connection.ts
var OpenAIConnection = class {
  static {
    __name(this, "OpenAIConnection");
  }
  env;
  onMessage;
  onError;
  onOpen;
  onClose;
  sessionId = null;
  clientSecret = null;
  constructor(env, onMessage, onError, onOpen, onClose) {
    this.env = env;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onOpen = onOpen;
    this.onClose = onClose;
  }
  async connect() {
    console.log("\u{1F527} OpenAI connect() called");
    const apiKey = this.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("\u274C No OpenAI API key found");
      this.onError({
        message: "OpenAI API key not configured. Please check Cloudflare dashboard secrets.",
        details: "Missing OPENAI_API_KEY secret in Cloudflare dashboard"
      });
      return false;
    }
    try {
      console.log("\u{1F527} Creating OpenAI Realtime session...");
      const sessionData = await this.createSession(apiKey);
      if (!sessionData) return false;
      this.sessionId = sessionData.id;
      this.clientSecret = sessionData.client_secret?.value;
      console.log("\u2705 Session created successfully:", {
        id: this.sessionId,
        hasClientSecret: !!this.clientSecret,
        clientSecretLength: this.clientSecret?.length || 0
      });
      console.log("\u2705 OpenAI session ready for frontend WebRTC connection");
      this.onOpen();
      return true;
    } catch (error) {
      console.error("\u274C Failed to create OpenAI session:", error);
      this.onError({
        message: "Failed to create voice session",
        details: error
      });
      return false;
    }
  }
  async createSession(apiKey) {
    console.log("\u{1F527} Creating OpenAI Realtime session...");
    const requestBody = {
      model: "gpt-4o-realtime-preview",
      voice: "alloy",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200
      }
    };
    console.log("\u{1F527} Creating session with standard Realtime API...");
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    if (response.status === 200) {
      const sessionData = await response.json();
      console.log("\u2705 Session created successfully:", sessionData);
      return sessionData;
    } else {
      const errorText = await response.text();
      console.error("\u274C Failed to create session:", response.status, errorText);
      throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
    }
  }
  // Send message to OpenAI via HTTP (for non-audio messages)
  async sendMessage(message) {
    if (!this.sessionId) {
      console.error("\u274C No session available");
      return;
    }
    try {
      console.log("\u{1F4E4} Sending message to OpenAI via HTTP:", message.type);
      if (message.type === "text") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [{ role: "user", content: message.text }],
            stream: false
          })
        });
        if (response.ok) {
          const result = await response.json();
          this.onMessage(JSON.stringify({
            type: "response_text",
            text: result.choices?.[0]?.message?.content || "No response"
          }));
        }
      }
    } catch (error) {
      console.error("\u274C Failed to send message to OpenAI:", error);
      this.onError({
        message: "Failed to send message to OpenAI",
        details: error
      });
    }
  }
  isConnected() {
    return !!this.sessionId;
  }
  disconnect() {
    this.sessionId = null;
    this.clientSecret = null;
    this.onClose();
  }
  getConnectionDetails() {
    return {
      sessionId: this.sessionId,
      clientSecret: this.clientSecret
    };
  }
  // Get session info for frontend WebRTC connection
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      clientSecret: this.clientSecret,
      apiKey: this.env.OPENAI_API_KEY
    };
  }
};

// src/worker-voice/voice-session.ts
var VoiceSession = class {
  constructor(state, env) {
    this.state = state;
    this.sessionId = crypto.randomUUID();
    this.openaiConnection = new OpenAIConnection(
      env,
      (data) => this.handleOpenAIConnectionMessage(data),
      (error) => this.broadcastToClients({ type: "error", error }),
      () => this.onOpenAIConnected(),
      () => this.onOpenAIDisconnected()
    );
    this.messageHandlers = new MessageHandlers(
      this.openaiConnection,
      (message) => this.broadcastToClients(message)
    );
    this.agentManager = new AgentManager(
      this.openaiConnection,
      (message) => this.broadcastToClients(message)
    );
    this.state.blockConcurrencyWhile(async () => {
      await this.cleanupStaleSessions();
    });
    console.log("\u{1F527} VoiceSession initialized, OpenAI connection will be established when needed");
  }
  static {
    __name(this, "VoiceSession");
  }
  openaiConnection;
  messageHandlers;
  agentManager;
  clients = /* @__PURE__ */ new Set();
  sessionId;
  isActive = true;
  async fetch(request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/voice/sse":
        return this.handleSSE(request);
      case "/voice/message":
        return this.handleHTTPMessage(request);
      case "/voice/test":
        return new Response(JSON.stringify({
          status: "ok",
          message: "Voice service is running",
          sessionId: this.sessionId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), {
          headers: { "Content-Type": "application/json" }
        });
      case "/voice/reset":
        return this.handleReset(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }
  async handleSSE(request) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: /* @__PURE__ */ __name((controller) => {
        const client = {
          controller,
          encoder,
          send: /* @__PURE__ */ __name((data) => {
            try {
              const message = `data: ${JSON.stringify(data)}

`;
              controller.enqueue(encoder.encode(message));
            } catch (error) {
              console.error("Failed to send SSE message:", error);
            }
          }, "send")
        };
        this.clients.add(client);
        client.send({ type: "connected", sessionId: this.sessionId });
        client.send({ type: "ready", sessionId: this.sessionId });
        request.signal.addEventListener("abort", () => {
          this.clients.delete(client);
          console.log("\u{1F50C} Client disconnected, cleaning up...");
          if (this.clients.size === 0) {
            setTimeout(() => {
              if (this.clients.size === 0) {
                this.resetSession();
              }
            }, 5e3);
          }
        });
      }, "start")
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Cache-Control"
      }
    });
  }
  async handleHTTPMessage(request) {
    try {
      const data = await request.json();
      console.log("\u{1F4E8} Received HTTP message:", data.type);
      if (!this.openaiConnection.isConnected()) {
        console.log("\u{1F527} OpenAI not connected, attempting to connect...");
        try {
          await this.openaiConnection.connect();
        } catch (error) {
          console.error("\u274C Failed to connect to OpenAI:", error);
          return new Response(JSON.stringify({
            success: false,
            error: "Voice service not ready. Please wait a moment and try again."
          }), {
            status: 503,
            // Service Unavailable
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type"
            }
          });
        }
      }
      switch (data.type) {
        case "audio":
          await this.messageHandlers.handleAudioInput(data.audio, "http-client");
          break;
        case "text":
          await this.messageHandlers.handleTextInput(data.text, "http-client");
          break;
        case "control":
          await this.messageHandlers.handleControl(data.command, "http-client");
          break;
        case "switch_agent":
          await this.agentManager.switchAgent(data.agentId);
          break;
        case "connection_ready":
          console.log("\u2705 Frontend connection confirmed via HTTP");
          if (this.openaiConnection.isConnected()) {
            const sessionInfo = this.openaiConnection.getSessionInfo();
            console.log("\u{1F527} Sending session info to frontend:", {
              hasSessionId: !!sessionInfo.sessionId,
              hasClientSecret: !!sessionInfo.clientSecret,
              hasApiKey: !!sessionInfo.apiKey
            });
            this.broadcastToClients({
              type: "session_info",
              sessionId: sessionInfo.sessionId,
              clientSecret: sessionInfo.clientSecret,
              apiKey: sessionInfo.apiKey
            });
          } else {
            try {
              await this.openaiConnection.connect();
              const sessionInfo = this.openaiConnection.getSessionInfo();
              console.log("\u{1F527} Sending session info to frontend after connection:", {
                hasSessionId: !!sessionInfo.sessionId,
                hasClientSecret: !!sessionInfo.clientSecret,
                hasApiKey: !!sessionInfo.apiKey
              });
              this.broadcastToClients({
                type: "session_info",
                sessionId: sessionInfo.sessionId,
                clientSecret: sessionInfo.clientSecret,
                apiKey: sessionInfo.apiKey
              });
            } catch (error) {
              console.error("\u274C Failed to connect to OpenAI:", error);
              this.broadcastToClients({
                type: "error",
                error: { message: "Failed to initialize voice service" }
              });
            }
          }
          break;
        default:
          console.warn("\u26A0\uFE0F Unknown message type:", data.type);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    } catch (error) {
      console.error("\u274C Failed to handle HTTP message:", error);
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to process message"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
  }
  async handleReset(request) {
    try {
      console.log("\u{1F504} Manual reset requested");
      this.resetSession();
      this.broadcastToClients({
        type: "session_reset",
        sessionId: this.sessionId,
        message: "Session has been reset"
      });
      return new Response(JSON.stringify({
        success: true,
        message: "Session reset successfully",
        newSessionId: this.sessionId
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    } catch (error) {
      console.error("\u274C Failed to reset session:", error);
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to reset session"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
  }
  handleOpenAIConnectionMessage(data) {
    try {
      const message = JSON.parse(data);
      this.messageHandlers.handleOpenAIMessage(data);
    } catch (error) {
      console.error("Failed to handle OpenAI connection message:", error);
    }
  }
  onOpenAIConnected() {
    console.log("\u2705 OpenAI connection established");
    this.broadcastToClients({ type: "openai_connected" });
  }
  onOpenAIDisconnected() {
    console.log("\u{1F50C} OpenAI disconnected");
    this.broadcastToClients({ type: "openai_disconnected" });
  }
  broadcastToClients(message) {
    console.log("\u{1F4E4} Broadcasting message to clients:", message);
    this.clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        console.error("Failed to send to client:", error);
        this.clients.delete(client);
      }
    });
    console.log("\u2705 Sent to SSE client");
  }
  async cleanupStaleSessions() {
    try {
      if (this.openaiConnection.isConnected()) {
        this.openaiConnection.disconnect();
      }
      await this.state.storage.delete("openai_session");
      await this.state.storage.delete("webrtc_state");
      console.log("\u{1F9F9} Cleaned up stale session data");
    } catch (error) {
      console.warn("\u26A0\uFE0F Failed to cleanup stale sessions:", error);
    }
  }
  resetSession() {
    if (!this.isActive) return;
    console.log("\u{1F504} Resetting session due to inactivity...");
    if (this.openaiConnection.isConnected()) {
      this.openaiConnection.disconnect();
    }
    this.state.storage.delete("openai_session");
    this.state.storage.delete("webrtc_state");
    this.sessionId = crypto.randomUUID();
    console.log("\u2705 Session reset complete");
  }
};

// src/worker-voice/index.ts
var worker_voice_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/voice/ws")) {
      const durableObjectId = env.VOICE_SESSION.idFromName("global");
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      return durableObject.fetch(request);
    }
    if (url.pathname === "/voice/sse" || url.pathname === "/voice/message" || url.pathname === "/voice/test") {
      const durableObjectId = env.VOICE_SESSION.idFromName("global");
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      return durableObject.fetch(request);
    }
    try {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) {
        return asset;
      }
    } catch (e) {
    }
    try {
      const indexUrl = new URL("/index.html", request.url);
      const indexRequest = new Request(indexUrl.toString());
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      return new Response(indexResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=0, must-revalidate"
        }
      });
    } catch (e) {
      return new Response("Not Found", { status: 404 });
    }
  }
};

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-TmWQ1t/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_voice_default;

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-TmWQ1t/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  VoiceSession,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
