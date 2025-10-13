# Voice Agents Implementation

This repository includes a voice agent system built with OpenAI's Realtime API. As of the latest rationalization, the app uses a single Hexagon persona with the frontend owning runtime instruction updates via `session.update`. The worker focuses on transport, session lifecycle, and external-data ingestion/broadcast.

## 🚀 Features

### Persona
- **Hexagon Assistant**: Friendly AI companion with hexagonal personality (current and only persona)

### Advanced Capabilities
- Real-time speech-to-speech communication
- Agent switching during conversations
- Specialized tools and function calling
- Personality-driven responses
- Conversation state management

## 🏗️ Architecture

### Speech-to-Speech (Realtime) Architecture
The system uses OpenAI's multimodal speech-to-speech architecture with the `gpt-realtime` model, which:
- Processes audio inputs and outputs directly
- Handles speech in real-time
- Understands emotion and intent
- Filters out noise automatically
- Provides low-latency interactions

### Components Structure (simplified)
```
src/
├── hooks/
│   ├── voiceAgentInitializer.ts   # Single source for instructions; creates Realtime session
│   ├── useVoiceInteraction.ts     # Voice interaction logic
│   ├── voiceConnectionService.ts  # SSE/WebRTC bridge
│   └── voiceControlService.ts     # Recording & commands
├── lib/
│   ├── externalContext.ts         # External-data injection helpers
│   └── voiceSessionUtils.ts       # Realtime helpers (includes updateSessionInstructions)
└── worker-voice/                  # Cloudflare Worker backend
    ├── voice-session.ts           # Durable Object
    ├── voice-session-core.ts      # SSE & lifecycle
    ├── voice-session-external-data.ts # External-data endpoints and broadcast
    ├── voice-session-handlers.ts  # HTTP routes (no instruction ownership)
    ├── openai-connection.ts       # Session creation
    └── agent-manager.ts           # Hexagon-only agent announcements
```

## 🛠️ Setup Instructions

### 1. Install Dependencies
```bash
npm install @openai/agents --legacy-peer-deps
```

### 2. Configure OpenAI API Key
Set your OpenAI API key in Cloudflare Workers:
```bash
wrangler secret put OPENAI_API_KEY
```

### 3. Deploy the Worker
```bash
npm run deploy
```

### 4. Run Locally
```bash
npm run dev
```

## 📱 Usage

### Basic Voice Interaction
1. Navigate to the Voice Agents demo page
2. Select your preferred agent
3. Click the microphone button to start recording
4. Speak naturally and wait for the response
5. Use the agent selector to switch between agents

### Agent Switching
The worker now runs in Hexagon-only mode. Any switch requests are coerced to `hexagon` and broadcast for UI/state consistency; instruction updates are owned by the frontend.

### Voice Commands
- **Interrupt**: Stop the current response
- **Clear**: Clear conversation history
- **Text Input**: Type messages for text-based interaction

## 🔧 Configuration

### Customizing Instructions
Edit `src/hooks/voiceAgentInitializer.ts` to modify:
- Base instructions and tone
- Language policy combination
- How external-data is emphasized at startup
At runtime, use `updateSessionInstructions(session, newText)` from `src/lib/voiceSessionUtils.ts`.

### Adding New Personas (optional)
If you need multiple personas again, reintroduce a persona registry and call `updateSessionInstructions` from the frontend when switching. Keep the worker as a transport/external-data relay for consistency.

### Tool Integration
Agents can use specialized tools:
- **Transfer Agent**: Switch to specialized agents
- **Supervisor Approval**: Request higher-level authorization
- **Language Assessment**: Evaluate language proficiency

## 🌐 Deployment

### Cloudflare Workers
The system is designed for Cloudflare Workers with:
- WebSocket support for real-time communication
- Durable Objects for session management
- Automatic scaling and global distribution

### Environment Variables
Required environment variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `VOICE_SESSION`: Durable Object namespace

## 📊 Performance

### Latency Optimization
- WebRTC transport for browser-based applications
- WebSocket transport for server-side execution
- Optimized audio processing (100ms chunks)
- Efficient turn detection and response handling

### Scalability
- Durable Objects for isolated sessions
- Automatic connection management
- Graceful degradation on errors
- Resource cleanup and optimization

## 🔍 Troubleshooting

### Common Issues

#### Connection Problems
- Check OpenAI API key configuration
- Verify Cloudflare Worker deployment
- Ensure WebSocket support is enabled

#### Audio Issues
- Check microphone permissions
- Verify audio format compatibility (webm_opus)
- Ensure proper audio context initialization

#### Agent Switching
- Verify agent configurations
- Check tool definitions
- Ensure proper session updates

### Debug Information
The system provides detailed logging for:
- WebSocket connections
- OpenAI API responses
- Agent switching events
- Error conditions

## 🚧 Development

### Adding New Features
1. **New Agent Types**: Extend the agent configuration system
2. **Additional Tools**: Implement new function tools
3. **UI Enhancements**: Modify React components
4. **Backend Logic**: Update the Cloudflare Worker

### Testing
- Test agent personalities and responses
- Verify tool functionality
- Check audio quality and latency
- Validate agent switching behavior

## 📚 Resources

### Documentation
- [OpenAI Voice Agents Guide](https://docs.openai.com/guides/voice-agents)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

### Examples
- [Realtime API Agents Demo](https://github.com/openai/openai-realtime-agents)
- [Voice Agent Metaprompter](https://chatgpt.com/g/g-678865c9fb5c81918fa28699735dd08e-voice-agent-metaprompt-gpt)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests and documentation
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the documentation
3. Open an issue on GitHub
4. Contact the development team

---

**Note**: This implementation requires an OpenAI API key with access to the Realtime API. Ensure you have the appropriate subscription and rate limits configured.
