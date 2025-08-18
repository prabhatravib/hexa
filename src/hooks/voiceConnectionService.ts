import { useCallback, useRef } from 'react';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceConnectionServiceOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  onResponse?: (text: string) => void;
  initializeOpenAIAgentFromWorker: () => Promise<void>;
  initializeOpenAIAgent: (sessionData: any) => Promise<any>;
  openaiAgentRef: React.MutableRefObject<any>;
  setSessionInfo: (info: any) => void;
  setResponse: (text: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
}

export const useVoiceConnectionService = ({
  setVoiceState,
  onError,
  onResponse,
  initializeOpenAIAgentFromWorker,
  initializeOpenAIAgent,
  openaiAgentRef,
  setSessionInfo,
  setResponse,
  startSpeaking,
  stopSpeaking,
  setSpeechIntensity
}: VoiceConnectionServiceOptions) => {
  
  // Synthetic flapping loop to guarantee mouth motion when speaking events arrive
  const flapRafRef = useRef<number | null>(null);
  const startSyntheticFlap = () => {
    if (flapRafRef.current !== null) return;
    const loop = () => {
      // Simple on/off flap between 0.35 and ~0.60 openness
      const t = performance.now() / 1000;
      const value = 0.35 + Math.max(0, Math.sin(t * 6.0)) * 0.25;
      setSpeechIntensity?.(value);
      flapRafRef.current = requestAnimationFrame(loop);
    };
    flapRafRef.current = requestAnimationFrame(loop);
  };
  const stopSyntheticFlap = () => {
    if (flapRafRef.current !== null) {
      cancelAnimationFrame(flapRafRef.current);
      flapRafRef.current = null;
    }
  };

  // Connect using SSE for receiving messages
  const connect = useCallback(async () => {
    try {
      // Use SSE for receiving messages (real-time updates)
      const eventSource = new EventSource(`${window.location.origin}/voice/sse`);
      
      eventSource.onopen = () => {
        console.log('Voice SSE connected successfully');
        
        // Initialize OpenAI Agent immediately after SSE connection
        // We'll get the API key from the worker
        initializeOpenAIAgentFromWorker();
      };
      
      eventSource.onmessage = async (event) => {
        try {
          console.log('Raw SSE message received:', event.data);
          const data = JSON.parse(event.data);
          console.log('Parsed SSE message:', data);
          
          switch (data.type) {
            case 'connected':
              console.log('SSE connection established');
              break;
              
            case 'ready':
              console.log('Voice session ready:', data.sessionId);
              break;
              
            case 'session_info':
              console.log('Session info received, updating OpenAI Agent...');
              setSessionInfo(data);
              // Update the agent with new session info if needed
              if (openaiAgentRef.current) {
                console.log('✅ OpenAI Agent already initialized, session info updated');
              } else {
                // Initialize with real session info
                const session = await initializeOpenAIAgent(data);
                if (session) {
                  openaiAgentRef.current = session;
                }
              }
              break;
              
            case 'response_text':
              console.log('Text response received:', data.text);
              setResponse(data.text);
              onResponse?.(data.text);
              break;
              
            case 'agent_start':
            case 'audio_delta':
              console.log('Audio delta received - voice is playing');
              setVoiceState('speaking');
              startSpeaking?.();
              // Ensure visible mouth motion even if analyser isn’t available
              startSyntheticFlap();
              break;
              
            case 'audio_done':
            case 'agent_end':
              console.log('Audio done received - voice stopped');
              setSpeechIntensity?.(0);
              stopSpeaking?.();
              setVoiceState('idle');
              stopSyntheticFlap();
              break;
              
            case 'error':
              console.error('Voice error received:', data);
              console.error('Error details:', data.error);
              setVoiceState('error');
              onError?.(data.error?.message || data.error || 'Unknown error');
              break;
              
            default:
              console.log('Unknown message type:', data.type, data);
          }
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError, 'Raw data:', event.data);
          setVoiceState('error');
          onError?.('Failed to process voice message. Please try again.');
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setVoiceState('error');
        onError?.('Voice service connection failed. Please check your internet connection.');
      };
      
      return eventSource;
      
    } catch (error) {
      console.error('Failed to connect:', error);
      setVoiceState('error');
      onError?.('Failed to initialize voice service');
      return null;
    }
  }, [setVoiceState, onError, onResponse, initializeOpenAIAgentFromWorker, initializeOpenAIAgent, openaiAgentRef, setSessionInfo, setResponse, startSpeaking, stopSpeaking, setSpeechIntensity]);

  return {
    connect
  };
};
