import { getLanguageInstructions } from '@/lib/languageConfig';
import { setupSessionEventHandlers } from './voiceSessionEvents';
import { initializeWebRTCConnection } from './voiceWebRTCConnection';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceAgentInitializerOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

export const initializeOpenAIAgent = async (
  sessionData: any,
  options: VoiceAgentInitializerOptions
) => {
  const { setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef } = options;
  
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

    // Create a dedicated audio element for the Realtime session and expose it globally for debugging
    const audioEl = new Audio();
    audioEl.autoplay = true;
    (window as any).__hexaAudioEl = audioEl;
    (window as any).__currentVoiceState = 'idle';
    
    // Add global debug function
    (window as any).__hexaDebug = () => {
      console.log('🔍 Hexa Debug Info:');
      console.log('Audio Element:', audioEl);
      console.log('Audio srcObject:', audioEl.srcObject);
      console.log('Audio readyState:', audioEl.readyState);
      console.log('Audio paused:', audioEl.paused);
      console.log('Voice State:', (window as any).__currentVoiceState);
      console.log('Session:', session);
    };

    // Add global reset function for manual recovery
    (window as any).__hexaReset = async () => {
      console.log('🔄 Manual reset triggered from console');
      try {
        const response = await fetch('/voice/reset', { method: 'POST' });
        if (response.ok) {
          console.log('✅ Session reset successful');
          // Reload the page to get a fresh start
          window.location.reload();
        } else {
          console.error('❌ Failed to reset session');
        }
      } catch (error) {
        console.error('❌ Reset request failed:', error);
      }
    };

    // Monitor audio element state
    audioEl.addEventListener('loadeddata', () => {
      console.log('🎵 Audio element loaded data');
      console.log('Audio element state:', {
        srcObject: audioEl.srcObject,
        readyState: audioEl.readyState,
        paused: audioEl.paused,
        duration: audioEl.duration
      });
    });
    
    // Monitor all audio element events for debugging
    ['loadstart', 'durationchange', 'loadedmetadata', 'canplay', 'canplaythrough', 'play', 'playing', 'pause', 'ended', 'error'].forEach(eventName => {
      audioEl.addEventListener(eventName, (e) => {
        console.log(`🎵 Audio event: ${eventName}`, {
          srcObject: audioEl.srcObject,
          readyState: audioEl.readyState,
          paused: audioEl.paused,
          currentTime: audioEl.currentTime,
          duration: audioEl.duration
        });
      });
    });
    
    // Create session and connect
    const session = new RealtimeSession(agent);
    
    // Debug: Log all session events to understand what's available
    const originalEmit = (session as any).emit;
    if (originalEmit) {
      (session as any).emit = function(event: string, ...args: any[]) {
        console.log(`🔍 Session event: ${event}`, args);
        return originalEmit.call(this, event, ...args);
      };
    }
    
    // Set up session event handlers
    setupSessionEventHandlers(session, {
      setVoiceState,
      startSpeaking,
      stopSpeaking,
      audioEl,
      audioContextRef,
      setSpeechIntensity
    });
    
    // Initialize WebRTC connection and handle streams
    const connectionResult = await initializeWebRTCConnection(session, sessionData, {
      audioEl,
      setVoiceState,
      startSpeaking,
      stopSpeaking,
      setSpeechIntensity,
      audioContextRef
    });
    
    if (connectionResult) {
      console.log('✅ OpenAI Agent initialized and connected with WebRTC');
      setVoiceState('idle');
      return session;
    } else {
      throw new Error('Failed to establish WebRTC connection');
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI Agent:', error);
    
    // Check if it's a WebRTC connection error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('setRemoteDescription') || errorMessage.includes('SessionDescription')) {
      console.log('🔧 WebRTC connection error detected. You can:');
      console.log('1. Call __hexaReset() in console to reset the session');
      console.log('2. Reload the page');
      console.log('3. Wait a few minutes and try again');
      
      // Expose the error for manual recovery
      (window as any).__hexaLastError = error;
    }
    
    setVoiceState('error');
    onError?.('Failed to initialize OpenAI Agent');
    return null;
  }
};
