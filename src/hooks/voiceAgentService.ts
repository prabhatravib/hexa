import { useCallback } from 'react';
import { getLanguageInstructions } from '@/lib/languageConfig';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceAgentServiceOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
}

export const useVoiceAgentService = ({ setVoiceState, onError, startSpeaking, stopSpeaking }: VoiceAgentServiceOptions) => {
  // Initialize OpenAI Agent with WebRTC
  const initializeOpenAIAgent = useCallback(async (sessionData: any) => {
    try {
      console.log('🔧 Initializing OpenAI Agent with WebRTC...');
      console.log('🔧 Session data received:', {
        hasApiKey: !!sessionData.apiKey,
        apiKeyPrefix: sessionData.apiKey?.substring(0, 10) + '...',
        sessionId: sessionData.sessionId,
        hasClientSecret: !!sessionData.clientSecret
      });
      
      // Import OpenAI Agents Realtime SDK dynamically
      const { RealtimeAgent, RealtimeSession } = await import('@openai/agents-realtime');
      
      // Create agent with proper configuration
      const agent = new RealtimeAgent({
        name: 'Hexa, an AI Assistant',
        instructions: `You are Hexa, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help. You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone.

${getLanguageInstructions()}`
      });

      // Create session and connect
      const session = new RealtimeSession(agent);
      
      // Set up audio event handlers for mouth animation
      session.on('audio' as any, (audioChunk: any) => {
        // Voice is playing - trigger mouth animation
        console.log('🎵 Voice audio received - mouth should animate');
        console.log('🎵 startSpeaking function available:', !!startSpeaking);
        if (startSpeaking) {
          console.log('🎵 Calling startSpeaking()...');
          startSpeaking(); // This will set voiceState and start mouth animation
          console.log('🎵 startSpeaking() called successfully');
        } else {
          console.log('🎵 startSpeaking not available, using fallback setVoiceState');
          setVoiceState('speaking'); // Fallback if startSpeaking not provided
        }
      });
      
      session.on('audio_done' as any, () => {
        // Voice stopped - stop mouth animation
        console.log('🔇 Voice audio done - mouth should stop animating');
        if (stopSpeaking) {
          stopSpeaking(); // This will set voiceState and stop mouth animation
        } else {
          setVoiceState('idle'); // Fallback if stopSpeaking not provided
        }
      });
      
      session.on('error' as any, (error: any) => {
        console.error('❌ OpenAI session error:', error);
        setVoiceState('error');
        onError?.(error.message || 'OpenAI session error');
      });
      
      // Use the working method: WebRTC with client secret
      if (sessionData.clientSecret) {
        console.log('🔧 Connecting with client secret...');
        const connectionOptions = {
          apiKey: sessionData.clientSecret, // Use client secret instead of API key
          useInsecureApiKey: true,
          transport: 'webrtc' as const
        };
        
        console.log('🔧 Connecting with client secret options:', connectionOptions);
        await session.connect(connectionOptions);
        console.log('✅ WebRTC connection successful with client secret');
      } else {
        throw new Error('Client secret not available for WebRTC connection');
      }
      
      console.log('✅ OpenAI Agent initialized and connected with WebRTC');
      setVoiceState('idle');
      
      return session;
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Agent:', error);
      setVoiceState('error');
      onError?.('Failed to initialize OpenAI Agent');
      return null;
    }
  }, [setVoiceState, onError, startSpeaking, stopSpeaking]);

  // Initialize OpenAI Agent from worker (gets session info)
  const initializeOpenAIAgentFromWorker = useCallback(async () => {
    try {
      console.log('🔧 Initializing OpenAI Agent from worker...');
      
      // Get the session info from the worker by sending a connection ready message
      const response = await fetch('/voice/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'connection_ready' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      console.log('✅ Connection ready message sent, waiting for session info...');
      // The agent will be initialized when we receive session_info via SSE
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Agent from worker:', error);
      setVoiceState('error');
      onError?.('Failed to initialize voice service');
    }
  }, [setVoiceState, onError, startSpeaking, stopSpeaking]);

  return {
    initializeOpenAIAgent,
    initializeOpenAIAgentFromWorker
  };
};

// Helper function
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
