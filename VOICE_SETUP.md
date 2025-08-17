# Voice Interaction System Setup Guide

This guide will help you set up the voice interaction system for your Hexa project using Cloudflare Workers and OpenAI's Realtime API.

## 🚀 Features Implemented

- **Real-time voice interaction** using OpenAI's Realtime API
- **WebSocket communication** between browser and Cloudflare Worker
- **Audio streaming** for low-latency responses
- **Speech intensity tracking** for mouth animation
- **Visual feedback** for all voice states (listening, thinking, speaking)
- **Interrupt handling** to stop responses
- **Error handling** with visual feedback
- **Transcript display** for user input
- **Response display** for AI responses

## 📋 Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **OpenAI API Key** with access to Realtime API
3. **Node.js** and npm/yarn installed

## 🔧 Setup Steps

### 1. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Navigate to API Keys section
3. Create a new API key
4. Ensure you have access to the Realtime API (beta feature)

### 2. Configure Cloudflare Worker

1. **Update `wrangler.jsonc`**:
   ```json
   {
     "name": "hexa-worker",
     "compatibility_date": "2025-08-16",
     "assets": {
       "directory": "./dist"
     },
     "main": "src/worker-voice.ts",
     "durable_objects": {
       "bindings": [
         {
           "name": "VOICE_SESSION",
           "class_name": "VoiceSession"
         }
       ]
     },
     "vars": {
       "OPENAI_REALTIME_MODEL": "YOUR_ACTUAL_API_KEY_HERE"
     }
   }
   ```

2. **Replace `YOUR_ACTUAL_API_KEY_HERE`** with your actual OpenAI API key

### 3. Deploy to Cloudflare

1. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

2. **Deploy the worker**:
   ```bash
   npm run deploy
   ```

   Or test without deploying:
   ```bash
   npm run build:worker
   ```

### 4. Update Environment Variables

After deployment, you can also set environment variables through the Cloudflare dashboard:

1. Go to [Cloudflare Workers](https://dash.cloudflare.com/)
2. Select your worker
3. Go to Settings > Variables
4. Add `OPENAI_REALTIME_MODEL` with your API key

## 🎮 Usage

### Voice Control Interface

The voice control appears as a floating button at the bottom center of the screen:

- **🟢 Green**: Listening for voice input
- **🟡 Yellow**: Processing/thinking
- **🔵 Blue**: Speaking/responding
- **🔴 Red**: Error state
- **⚫ Gray**: Idle state

### Controls

- **Click the button** to start/stop voice recording
- **Speak naturally** - the system will transcribe your speech
- **Wait for response** - the hexagon will speak back to you
- **Click again** to interrupt the current response

### Voice Commands

Try these example commands:
- "Hello, how are you?"
- "Tell me a joke"
- "What's the weather like?"
- "Help me with something"

## 🔧 Development

### Local Development

1. **Start the dev server**:
   ```bash
   npm run dev
   ```

2. **Test voice functionality** (requires deployed worker)

### Building

```bash
# Build for production
npm run build

# Build and test worker deployment
npm run build:worker

# Build and deploy
npm run deploy
```

## 🏗️ Architecture

```
Browser (React App)
    ↓ WebSocket
Cloudflare Worker
    ↓ OpenAI API
OpenAI Realtime Service
```

### Components

- **`VoiceControl.tsx`**: UI component for voice interaction
- **`useVoiceInteraction.ts`**: Hook managing voice state and WebSocket
- **`worker-voice.ts`**: Cloudflare Worker handling backend logic
- **`animationStore.ts`**: Zustand store for voice state management

## 🐛 Troubleshooting

### Common Issues

1. **"Cannot connect to voice service"**
   - Check if worker is deployed
   - Verify WebSocket endpoint is accessible
   - Check browser console for errors

2. **"OpenAI API error"**
   - Verify API key is correct
   - Check if you have Realtime API access
   - Ensure API key has sufficient credits

3. **Audio not working**
   - Check browser permissions for microphone
   - Ensure HTTPS is used (required for getUserMedia)
   - Try refreshing the page

4. **Build errors**
   - Run `npm install` to ensure dependencies
   - Check TypeScript compilation
   - Verify all imports are correct

### Debug Mode

Enable debug logging in the browser console by adding this to your code:

```typescript
// In useVoiceInteraction.ts
console.log('Voice interaction state:', { isConnected, isRecording, transcript });
```

## 🔒 Security Notes

- **Never commit API keys** to version control
- **Use environment variables** for sensitive data
- **Enable CORS** if needed for your domain
- **Monitor API usage** to prevent abuse

## 📱 Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 14.3+)
- **Mobile browsers**: Limited support for WebSocket

## 🚀 Next Steps

After setup, you can enhance the system with:

1. **Custom wake words**
2. **Voice command shortcuts**
3. **Multi-language support**
4. **Voice activity detection**
5. **Custom AI personalities**
6. **Integration with other services**

## 📞 Support

If you encounter issues:

1. Check the browser console for errors
2. Verify Cloudflare Worker logs
3. Test with a simple voice command
4. Ensure all dependencies are installed

---

**Note**: This system requires a deployed Cloudflare Worker to function. Local development will show the UI but voice functionality won't work until deployed.
