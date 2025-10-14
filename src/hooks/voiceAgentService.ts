import { useCallback } from 'react';
import { initializeOpenAIAgentOnce } from './voiceAgentInitializer';
import { VoiceState } from '@/store/animationStore';



interface VoiceAgentServiceOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

export const useVoiceAgentService = ({ setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef }: VoiceAgentServiceOptions) => {
  // Initialize OpenAI Agent with WebRTC
  const initializeOpenAIAgentFromService = useCallback(async (sessionData: any) => {
    return initializeOpenAIAgentOnce(sessionData, {
      setVoiceState,
      onError,
      startSpeaking,
      stopSpeaking,
      setSpeechIntensity,
      audioContextRef,
    });
  }, [setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef]);

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
  }, [setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity]);

  return {
    initializeOpenAIAgent: initializeOpenAIAgentFromService,
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
