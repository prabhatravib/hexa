import { useCallback, useRef, useState } from 'react';
import { useAnimationStore, VoiceState } from '../store/animationStore';
import { injectExternalContext } from '@/lib/externalContext';
import { useExternalDataStore } from '@/store/externalDataStore';

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
  
  const { setInitializationState, setInitializationProgress } = useAnimationStore();
  
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
          
          switch (data.type) {
            case 'connected':
              console.log('SSE connection established');
              setInitializationProgress(40);
              break;
              
            case 'ready':
              console.log('Voice session ready:', data.sessionId);
              setInitializationProgress(60);
              break;
              
            case 'session_info':
              console.log('Session info received, updating OpenAI Agent...');
              console.log('🔍 Received session_info with sessionId:', data.sessionId);
              setInitializationProgress(80);
              setSessionInfo(data);
              
              // Store session ID for external data synchronization
              if (data.sessionId) {
                localStorage.setItem('voiceSessionId', data.sessionId);
                console.log('📝 Stored voice session ID for external data sync:', data.sessionId);
                console.log('🔍 localStorage now contains:', localStorage.getItem('voiceSessionId'));
              }
              // Update the agent with new session info if needed
              if (openaiAgentRef.current) {
                console.log('✅ OpenAI Agent already initialized, session info updated');
                // Pass external data to existing agent if available
                if (externalData) {
                  console.log('🔧 Passing external data to existing agent:', externalData);
                  // The agent should have access to external data through the worker
                }
                setInitializationProgress(100);
                setInitializationState('ready');
              } else {
                // Initialize with real session info
                const session = await initializeOpenAIAgent(data);
                if (session) {
                  openaiAgentRef.current = session;
                  // Pass external data to new agent if available
                  if (externalData) {
                    console.log('🔧 Passing external data to new agent:', externalData);
                    // The agent should have access to external data through the worker
                  }
                  setInitializationProgress(100);
                  setInitializationState('ready');
                  console.log('✅ OpenAI Agent initialized successfully');
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
              // Force immediate stop
              setSpeechIntensity?.(0);
              stopSyntheticFlap();
              
              // Use a small delay to ensure audio element has finished
              setTimeout(() => {
                stopSpeaking?.();
                setVoiceState('idle');
                
                // Double-check and force stop if still speaking
                const currentVoiceState = (window as any).__currentVoiceState;
                if (currentVoiceState === 'speaking') {
                  console.log('⚠️ Force stopping speaking state after audio_done');
                  useAnimationStore.getState().stopSpeaking();
                }
              }, 100);
              break;
              
            case 'error':
              console.error('Voice error received:', data);
              console.error('Error details:', data.error);
              setVoiceState('error');
              setInitializationState('error');
              onError?.(data.error?.message || data.error || 'Unknown error');
              break;
              
            case 'worker_restarting':
              console.log('🔄 Worker is restarting:', data.message);
              setVoiceState('retrying');
              setInitializationState('connecting');
              setInitializationProgress(20);
              // Don't show error - this is expected behavior
              break;
              
            case 'worker_restarted':
              console.log('✅ Worker restart complete:', data.message);
              setInitializationProgress(50);
              // Reinitialize the connection with the new session
              setTimeout(() => {
                initializeOpenAIAgentFromWorker();
              }, 1000);
              break;
              
            case 'external_data_received':
              console.log('🔍 Received external_data_received event:', data);
              // Skip if this is duplicate data
              if (isDuplicateData(data.data)) {
                console.log('⏭️ Skipping duplicate external data');
                break;
              }
              // Store external data for voice agent context (legacy)
              setExternalData(data.data);
              // Store in Zustand store for reliable access
              useExternalDataStore.getState().setExternalData({
                ...data.data,
                source: 'api'
              });
              // Inject text content directly into active session
              if (data.data?.text) {
                console.log('🔧 Attempting to inject external context:', data.data.text);
                await injectExternalContext(data.data.text);
              }
              break;
              
            case 'external_data_processed':
              // Skip if this is duplicate data
              if (isDuplicateData(data.data)) {
                break;
              }
              // Store external data for voice agent context (legacy)
              setExternalData(data.data);
              // Store in Zustand store for reliable access
              useExternalDataStore.getState().setExternalData({
                ...data.data,
                source: 'api'
              });
              // Inject text content directly into active session
              if (data.data?.text) {
                await injectExternalContext(data.data.text);
              }
              break;
              
            case 'external_text_available':
              // Skip if this is duplicate text data
              if (isDuplicateData({ text: data.text })) {
                break;
              }
              // Update external data with text content (legacy)
              setExternalData(prev => prev ? { ...prev, text: data.text } : { text: data.text });
              // Store in Zustand store for reliable access
              useExternalDataStore.getState().setExternalData({
                text: data.text,
                source: 'api'
              });
              // Inject text content directly into active session
              if (data.text) {
                await injectExternalContext(data.text);
              }
              break;
              
            case 'external_image_available':
              console.log('🖼️ External image available for voice context:', data.dataType);
              // Update external data with image content
              setExternalData(prev => prev ? { ...prev, image: data.image, type: data.dataType } : { image: data.image, type: data.dataType });
              break;
              
            default:
              console.log('Unknown message type:', data.type, data);
          }
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
