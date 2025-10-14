# agents.md

This repository defines AI agents used by the Hexa voice application. This document is the reference for behavior, wiring, and operations.

## System Overview

**Architecture**: Client → Cloudflare Worker → OpenAI Realtime API  
**Transport**: WebRTC for real-time voice communication, SSE for session management  
**Backend**: Cloudflare Workers with Durable Objects for session persistence  
**Frontend**: React with Zustand state management and custom voice hooks  

## Agents

### `hexa-voice`
**Purpose**: Conversational voice agent for real-time speech-to-speech interactions  
**Model**: `gpt-realtime` (configurable via `OPENAI_VOICE_MODEL` env var)  
**Voice**: `marin` (OpenAI's GA voice)  
**Interface**: WebRTC with fallback to WebSocket  
**Inputs**: Microphone audio (PCM16), optional text messages  
**Outputs**: Streamed audio responses, interim transcripts  
**Tools**: Email sending (`send_email`), agent transfer capabilities  
**Memory**: Session-based conversation history via Durable Objects  
**Safety**: Voice system can be globally disabled, PII filtering  
**Limits**: 1 concurrent session per Durable Object instance  

**Configuration**:
- **Required env vars**: `OPENAI_API_KEY`, `VOICE_SESSION` (Durable Object namespace)
- **Optional env vars**: `OPENAI_VOICE_MODEL` (defaults to `gpt-realtime`)
- **Audio format**: PCM16 input/output, WebM Opus for browser compatibility
- **Turn detection**: Server-side VAD with 0.3 threshold, 1000ms silence duration

**Instructions**: Dynamic instruction updates via `session.update` events. Base personality defined in `src/lib/agentInstructions.ts` with external context injection capabilities.

**Health checks**: Session state monitoring via WebRTC connection state, automatic recovery on SDP parse errors

## Operations

### Setup
```bash
# Install dependencies
npm install @openai/agents --legacy-peer-deps

# Configure OpenAI API key
wrangler secret put OPENAI_API_KEY

# Deploy worker
npm run deploy

# Run locally
npm run dev
```

### Environment Variables
- `OPENAI_API_KEY`: OpenAI API key with Realtime API access
- `OPENAI_VOICE_MODEL`: Voice model (default: `gpt-realtime`)
- `VOICE_SESSION`: Durable Object namespace binding
- `SEB`: SendEmail binding for email functionality

### Start/Stop Instructions
- **Start**: Navigate to app, click microphone button to initialize voice session
- **Stop**: Click microphone again or close browser tab
- **Worker restart**: `wrangler deploy` or `npm run deploy`

### Logs to Watch
- `SessionCreated`: New voice session established
- `WebRTC connection successful`: Transport layer ready
- `External context injected`: Dynamic instruction updates
- `SDP sanity check failed`: Connection recovery triggered
- `Voice system blocked globally`: System disabled state

### Health Checks
- WebRTC connection state: `connected` or `completed`
- Session state: `open` with active transport
- Audio context: Properly initialized with analyser
- External data: Successfully injected into session

## Testing and Debugging

### Example Requests
**Voice interaction**:
```javascript
// Start recording
startRecording();

// Send text message
sendText("Hello Hexa, can you help me understand React hooks?");

// Interrupt current response
interrupt();
```

**External data injection**:
```javascript
// Inject context into active session
injectExternalContext({ text: "User is asking about React development" });
```

### Common Issues and Solutions

**Connection Problems**:
- **SDP parse errors**: Usually indicates missing `client_secret` or wrong endpoint
- **WebRTC connection failed**: Check microphone permissions and audio context
- **Session creation failed**: Verify `OPENAI_API_KEY` is set correctly

**Audio Issues**:
- **No audio input**: Check microphone permissions in browser
- **No audio output**: Verify audio element setup and WebRTC transport
- **Poor audio quality**: Check audio format compatibility (PCM16)

**Agent Behavior**:
- **Wrong responses**: Check external data injection and instruction updates
- **Language issues**: Verify language configuration in `agentInstructions.ts`
- **Email sending**: Ensure `SEB` binding is configured in `wrangler.jsonc`

### Debug Tools
- Browser console: Detailed logging for all voice operations
- `window.activeSession`: Access to current Realtime session
- `window.__injectExternalContext`: Manual context injection
- `window.__voiceSystemBlocked`: Global voice disable flag

## Change Log

- **2025-01-14**: Implemented single-agent architecture (Hexa-only mode)
- **2025-01-14**: Added external data injection system with Zustand store
- **2025-01-14**: Integrated email sending functionality via Cloudflare Workers
- **2025-01-14**: Added automatic connection recovery for SDP errors
- **2025-01-14**: Implemented voice system disable guards and global blocking

## Ownership

**Maintainer**: Development team  
**Agent Configuration**: `src/lib/agentInstructions.ts`  
**Worker Backend**: `src/worker-voice/`  
**Frontend Integration**: `src/hooks/voice*`  
**External Data**: `src/lib/externalContext.ts` and `src/store/externalDataStore.ts`

---

**Note**: This implementation requires an OpenAI API key with access to the Realtime API. Ensure proper subscription and rate limits are configured.
