# Voice Agents Implementation

This repository now includes a comprehensive voice agent system built with OpenAI's Realtime API and the OpenAI Agents SDK. The system supports multiple specialized agents with different personalities and capabilities.

## 🚀 Features

### Multi-Agent System
- **Hexagon Assistant**: Friendly AI companion with hexagonal personality
- **Customer Support Agent**: Professional customer service representative
- **Language Tutor**: Enthusiastic language learning partner

### Advanced Capabilities
- Real-time speech-to-speech communication
- Agent switching during conversations
- Specialized tools and function calling
- Personality-driven responses
- Conversation state management

## 🏗️ Architecture

### Speech-to-Speech (Realtime) Architecture
The system uses OpenAI's multimodal speech-to-speech architecture with the `gpt-4o-realtime-preview` model, which:
- Processes audio inputs and outputs directly
- Handles speech in real-time
- Understands emotion and intent
- Filters out noise automatically
- Provides low-latency interactions

### Components Structure
```
src/
├── agents/
│   ├── voiceAgentConfig.ts      # Agent configurations and personalities
│   └── voiceAgentManager.ts     # Agent management and tool integration
├── components/
│   ├── VoiceControl.tsx         # Main voice interaction component
│   ├── AgentSelector.tsx        # Agent switching interface
│   └── VoiceAgentDemo.tsx       # Interactive demo page
├── hooks/
│   └── useVoiceInteraction.ts   # Voice interaction logic
└── worker-voice.ts              # Cloudflare Worker backend
```

## 🎯 Agent Personalities

### Hexagon Assistant
- **Identity**: Friendly AI with hexagonal character
- **Tone**: Warm and conversational
- **Enthusiasm**: Medium
- **Formality**: Casual
- **Best for**: General assistance, creative tasks, entertainment

### Customer Support Agent
- **Identity**: Professional customer service representative
- **Tone**: Polite and authoritative
- **Enthusiasm**: Medium
- **Formality**: Semi-formal
- **Best for**: Order management, returns, billing issues

### Language Tutor
- **Identity**: Enthusiastic language learning partner
- **Tone**: Warm and educational
- **Enthusiasm**: High
- **Formality**: Semi-formal
- **Best for**: Language learning, pronunciation, grammar

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
- Click the agent icon in the top-right corner
- Select from available agents
- The conversation context is maintained during switches

### Voice Commands
- **Interrupt**: Stop the current response
- **Clear**: Clear conversation history
- **Text Input**: Type messages for text-based interaction

## 🔧 Configuration

### Customizing Agent Personalities
Edit `src/agents/voiceAgentConfig.ts` to modify:
- Personality traits
- Instructions and behaviors
- Conversation flows
- Tool capabilities

### Adding New Agents
1. Create a new agent configuration
2. Add it to the `VoiceAgentManager`
3. Include relevant tools and instructions
4. Update the UI components

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
