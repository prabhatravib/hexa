import { useCallback, useRef, useState, useEffect } from 'react';
import { useAnimationStore, VoiceState } from '../store/animationStore';
import { isVoiceDisabledNow, silenceAudioEverywhere } from '@/lib/voiceDisableGuard';
import { getSessionSend, isRealtimeReady } from '@/lib/voiceSessionUtils';
import { injectExternalContext } from '@/lib/externalContext';
import { useExternalDataStore } from '@/store/externalDataStore';

interface VoiceConnectionServiceOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  onResponse?: (text: string) => void;
  onTranscript?: (text: string) => void;
  initializeOpenAIAgentFromWorker: () => Promise<void>;
  initializeOpenAIAgent: (sessionData: any) => Promise<any>;
  openaiAgentRef: React.MutableRefObject<any>;
  setSessionInfo: (info: any) => void;
  setResponse: (text: string) => void;
  setTranscript: (text: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
}

export const useVoiceConnectionService = ({
  setVoiceState,
  onError,
  onResponse,
  onTranscript,
  initializeOpenAIAgentFromWorker,
  initializeOpenAIAgent,
  openaiAgentRef,
  setSessionInfo,
  setResponse,
  setTranscript,
  startSpeaking,
  stopSpeaking,
  setSpeechIntensity
}: VoiceConnectionServiceOptions) => {
  
  const { setInitializationState, setInitializationProgress } = useAnimationStore();
  
  // Set up global function to receive response text from session events
  useEffect(() => {
    (window as any).__hexaSetResponse = (text: any) => {
      console.log('🌐 Global response received:', text);
      
      // Only process string responses, ignore arrays or objects
      if (typeof text === 'string' && text.trim()) {
        setResponse(text);
        onResponse?.(text);
      } else {
        console.log('⚠️ Ignoring non-string response:', typeof text, text);
      }
    };

    (window as any).__hexaSetTranscript = (text: any) => {
      console.log('🌐 Global transcript received:', text);
      
      // Only process string responses, ignore arrays or objects
      if (typeof text === 'string' && text.trim()) {
        setTranscript(text);
        onTranscript?.(text);
      } else {
        console.log('⚠️ Ignoring non-string transcript:', typeof text, text);
      }
    };
    
    return () => {
      delete (window as any).__hexaSetResponse;
      delete (window as any).__hexaSetTranscript;
    };
  }, [setResponse, onResponse, setTranscript, onTranscript]);
  
  // Store external data for voice agent context
  const [externalData, setExternalData] = useState<{
    image?: string;
    text?: string;
    prompt?: string;
    type?: string;
  } | null>(null);
  
  // Track last processed data to prevent duplicates
  const lastProcessedDataRef = useRef<string | null>(null);
  
  // Helper function to check if data is duplicate
  const isDuplicateData = (data: any): boolean => {
    const dataString = JSON.stringify(data);
    if (lastProcessedDataRef.current === dataString) {
      return true;
    }
    lastProcessedDataRef.current = dataString;
    return false;
  };
  
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
      setInitializationState('connecting');
      setInitializationProgress(10);
      
      // Use SSE for receiving messages (real-time updates)
      const eventSource = new EventSource(`${window.location.origin}/voice/sse`);
      
      eventSource.onopen = () => {
        console.log('Voice SSE connected successfully');
        setInitializationProgress(30);
        
        // Initialize OpenAI Agent immediately after SSE connection
        // We'll get the API key from the worker
        initializeOpenAIAgentFromWorker();
      };
      
      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          // Helper: common end-of-speech handling
          const handleAgentEnd = (payload: any) => {
            console.log('Audio done received - voice stopped');
            console.log('🔍 Full agent_end data:', payload);
            console.log('🔍 Data type:', typeof payload);
            console.log('🔍 Data keys:', Object.keys(payload || {}));

            let responseText: any = null;
            if (Array.isArray(payload) && payload.length > 2) {
              responseText = payload[2];
              console.log('✅ Found text in array position 2:', responseText);
            } else if (payload && typeof payload === 'object') {
              responseText = payload.text || payload.message || payload.content || payload.response;
              console.log('✅ Found text in object property:', responseText);
            }

            if (responseText) {
              console.log('✅ Setting response text:', responseText);
              setResponse(responseText);
              onResponse?.(responseText);
            } else {
              console.log('❌ No response text found in agent_end event');
            }

            setSpeechIntensity?.(0);
            stopSyntheticFlap();

            try {
              const audioEl: HTMLAudioElement | undefined = (window as any).__hexaAudioEl;
              if (audioEl && isVoiceDisabledNow()) {
                audioEl.muted = true; if (!audioEl.paused) audioEl.pause();
              }
            } catch {}

            setTimeout(() => {
              stopSpeaking?.();
              setVoiceState('idle');
              const currentVoiceState = (window as any).__currentVoiceState;
              if (currentVoiceState === 'speaking') {
                console.log('⚠️ Force stopping speaking state after audio_done');
                useAnimationStore.getState().stopSpeaking();
              }
            }, 100);
          };

          const handlers: Record<string, (d: any) => Promise<void> | void> = {
            control: async (d) => {
              if (d.command === 'interrupt') {
                console.log('🛑 Interrupt command received from worker');
                try {
                  const s: any = (window as any).activeSession;
                  const send = getSessionSend(s);
                  if (send) {
                    send({ type: 'response.cancel' });
                    send({ type: 'response.cancel_all' });
                    send({ type: 'input_audio_buffer.clear' });
                    send({ type: 'output_audio_buffer.clear' });
                  }
                } catch {}
                try { silenceAudioEverywhere(); } catch {}
                setSpeechIntensity?.(0);
                stopSyntheticFlap();
                setVoiceState('idle');
              }
            },
            connected: () => {
              console.log('SSE connection established');
              setInitializationProgress(40);
            },
            ready: (d) => {
              console.log('Voice session ready:', d.sessionId);
              setInitializationProgress(60);
            },
            session_info: async (d) => {
              console.log('Session info received, updating OpenAI Agent...');
              console.log('🔍 Received session_info with sessionId:', d.sessionId);
              setInitializationProgress(80);
              setSessionInfo(d);
              if (d.sessionId) {
                localStorage.setItem('voiceSessionId', d.sessionId);
                console.log('📝 Stored voice session ID for external data sync:', d.sessionId);
                console.log('🔍 localStorage now contains:', localStorage.getItem('voiceSessionId'));
              }
              if (openaiAgentRef.current) {
                console.log('✅ OpenAI Agent already initialized, session info updated');
                if (externalData) {
                  console.log('🔧 Passing external data to existing agent:', externalData);
                }
                setInitializationProgress(100);
                setInitializationState('ready');
              } else {
                const session = await initializeOpenAIAgent(d);
                if (session) {
                  openaiAgentRef.current = session;
                  if (externalData) {
                    console.log('🔧 Passing external data to new agent:', externalData);
                  }
                  setInitializationProgress(100);
                  setInitializationState('ready');
                  console.log('✅ OpenAI Agent initialized successfully');
                }
              }
            },
            transcription: (d) => {
              if (isVoiceDisabledNow()) return console.log('🔇 Voice disabled: ignoring transcription');
              console.log('User transcription received:', d.text);
              setTranscript(d.text);
              onTranscript?.(d.text);
            },
            response_text: (d) => {
              if (isVoiceDisabledNow()) return console.log('🔇 Voice disabled: ignoring response_text');
              console.log('Text response received:', d.text);
              setResponse(d.text);
              onResponse?.(d.text);
            },
            agent_start: () => {
              if (isVoiceDisabledNow()) {
                console.log('🔇 Voice disabled: ignoring agent_start and silencing audio');
                silenceAudioEverywhere();
                setSpeechIntensity?.(0);
                stopSyntheticFlap();
                setVoiceState('idle');
                return;
              }
              console.log('Agent start received - voice is starting');
              setVoiceState('speaking');
              startSpeaking?.();
              startSyntheticFlap();
            },
            audio_delta: () => {
              if (isVoiceDisabledNow()) {
                console.log('🔇 Voice disabled: silencing incoming audio event');
                silenceAudioEverywhere();
                setSpeechIntensity?.(0);
                stopSyntheticFlap();
                setVoiceState('idle');
                return;
              }
              console.log('Audio delta received - voice is playing');
              setVoiceState('speaking');
              startSpeaking?.();
              startSyntheticFlap();
            },
            audio_done: (d) => handleAgentEnd(d),
            agent_end: (d) => handleAgentEnd(d),
            error: (d) => {
              console.error('Voice error received:', d);
              console.error('Error details:', d.error);
              setVoiceState('error');
              setInitializationState('error');
              onError?.(d.error?.message || d.error || 'Unknown error');
            },
            worker_restarting: (d) => {
              console.log('🔄 Worker is restarting:', d.message);
              setVoiceState('retrying');
              setInitializationState('connecting');
              setInitializationProgress(20);
            },
            worker_restarted: (d) => {
              console.log('✅ Worker restart complete:', d.message);
              setInitializationProgress(50);
              setTimeout(() => { initializeOpenAIAgentFromWorker(); }, 1000);
            },
            session_idle_reset: (d) => {
              console.log('🔄 Session idle reset detected:', d.message);
              setVoiceState('retrying');
              setInitializationState('connecting');
              setInitializationProgress(30);
              setTimeout(() => { initializeOpenAIAgentFromWorker(); }, 1000);
            },
            external_data_received: async (d) => {
              console.log('🔍 Received external_data_received event:', d);
              if (isDuplicateData(d.data)) return console.log('⏭️ Skipping duplicate external data');
              setExternalData(d.data);
              useExternalDataStore.getState().setExternalData({ ...d.data, source: 'api' });
              if (d.data?.text) {
                console.log('🔧 Attempting to inject external context:', d.data.text);
                const s: any = (window as any).activeSession;
                const ready = isRealtimeReady(s);
                if (ready) await injectExternalContext(d.data.text);
                else (window as any).__pendingExternalContext = d.data.text;
              }
            },
            external_data_processed: async (d) => {
              if (isDuplicateData(d.data)) return;
              setExternalData(d.data);
              useExternalDataStore.getState().setExternalData({ ...d.data, source: 'api' });
              if (d.data?.text) await injectExternalContext(d.data.text);
            },
            external_text_available: async (d) => {
              if (isDuplicateData({ text: d.text })) return;
              setExternalData((prev) => (prev ? { ...prev, text: d.text } : { text: d.text }));
              useExternalDataStore.getState().setExternalData({ text: d.text, source: 'api' });
              if (d.text) await injectExternalContext(d.text);
            },
            external_image_available: (d) => {
              console.log('🖼️ External image available for voice context:', d.dataType);
              setExternalData((prev) => (prev ? { ...prev, image: d.image, type: d.dataType } : { image: d.image, type: d.dataType }));
            },
            __default: (d) => {
              console.log('Unknown message type:', d.type, d);
            },
          };

          const handler = handlers[data.type] || handlers.__default;
          await Promise.resolve(handler(data));
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError, 'Raw data:', event.data);
          setVoiceState('error');
          setInitializationState('error');
          onError?.('Failed to process voice message. Please try again.');
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setVoiceState('error');
        setInitializationState('error');
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
    connect,
    externalData
  };
};
