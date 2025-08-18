import { useEffect, useRef, useState, useCallback } from 'react';
import { useAnimationStore } from '@/store/animationStore';
import { useVoiceAgentService } from './voiceAgentService';
import { useVoiceConnectionService } from './voiceConnectionService';
import { useVoiceControlService } from './voiceControlService';
import { getSupportedLanguageCodes, DEFAULT_LANGUAGE } from '@/lib/languageConfig';

interface UseVoiceInteractionOptions {
  wakeWord?: string;
  autoStart?: boolean;
  onTranscription?: (text: string) => void;
  onResponse?: (text: string) => void;
  onError?: (error: string) => void;
  defaultLanguage?: string;
  supportedLanguages?: string[];
}

export const useVoiceInteraction = (options: UseVoiceInteractionOptions = {}) => {
  const {
    wakeWord = 'hey hexagon',
    autoStart = false,
    onTranscription,
    onResponse,
    onError,
    defaultLanguage = DEFAULT_LANGUAGE,
    supportedLanguages = getSupportedLanguageCodes()
  } = options;

  const {
    setVoiceState,
    setVoiceActive,
    setSpeaking,
    setSpeechIntensity,
    setMouthTarget,
    resetMouth,
    voiceState,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking
  } = useAnimationStore();

  // Shared AudioContext for all analysis and playback; resumed on user gesture
  const audioContextRef = useRef<AudioContext | null>(null);

  // Speech intensity smoothing and mouth target management
  const emaAccumulatorRef = useRef(0); // EMA accumulator for speech intensity
  const lastUpdateTimeRef = useRef(0); // Last store update time for throttling
  const lastTargetRef = useRef(0); // Last target value for change-based throttling
  const lastAnalyzerWriteRef = useRef(0); // Last time real analyser updated the mouth
  const fallbackFlapRafRef = useRef<number | null>(null); // RAF id for synthetic flap
  
  // Performance instrumentation
  const performanceRef = useRef({
    writeCount: 0,
    lastWriteTime: Date.now(),
    maxDelta: 0,
    lastTarget: 0
  });
  
  // Speech intensity processing with EMA smoothing and perceptual shaping
  const processSpeechIntensity = useCallback((rawIntensity: number) => {
    const alpha = 0.3; // EMA smoothing factor
    const clampedIntensity = Math.max(0, Math.min(1, rawIntensity));
    
    // Apply EMA smoothing: new = α * current + (1-α) * previous
    emaAccumulatorRef.current = alpha * clampedIntensity + (1 - alpha) * emaAccumulatorRef.current;
    
    // Apply perceptual shaping curve: x^0.65 to widen midrange openness
    const shapedIntensity = Math.pow(emaAccumulatorRef.current, 0.65);
    
    return shapedIntensity;
  }, []);

  // Throttled mouth target update (max 30 Hz or when change > 0.02)
  const updateMouthTarget = useCallback((target: number) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    const targetChange = Math.abs(target - lastTargetRef.current);
    
    // Update if 33ms have passed (30 Hz) OR if change is significant (>0.02)
    if (timeSinceLastUpdate >= 33 || targetChange > 0.02) {
      setMouthTarget(target);
      lastUpdateTimeRef.current = now;
      lastTargetRef.current = target;
      
      // Performance instrumentation
      performanceRef.current.writeCount++;
      performanceRef.current.lastWriteTime = now;
      
      // Track max delta between target and current
      const delta = Math.abs(target - performanceRef.current.lastTarget);
      if (delta > performanceRef.current.maxDelta) {
        performanceRef.current.maxDelta = delta;
      }
      performanceRef.current.lastTarget = target;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🎯 Mouth target updated: ${target.toFixed(3)} (${timeSinceLastUpdate}ms since last update)`);
        
        // Log performance stats every 10 writes
        if (performanceRef.current.writeCount % 10 === 0) {
          const timeSinceStart = now - performanceRef.current.lastWriteTime;
          const writesPerSecond = (performanceRef.current.writeCount / timeSinceStart) * 1000;
          console.log(`📊 Performance: ${writesPerSecond.toFixed(1)} writes/sec, Max delta: ${performanceRef.current.maxDelta.toFixed(3)}`);
        }
      }
    }
  }, [setMouthTarget]);

  const stopFallbackFlap = useCallback(() => {
    if (fallbackFlapRafRef.current) {
      console.log('🎯 Stopping fallback flap animation');
      cancelAnimationFrame(fallbackFlapRafRef.current);
      fallbackFlapRafRef.current = null;
    } else {
      console.log('🎯 Fallback flap not running, nothing to stop');
    }
  }, []);

  // Fallback: If we are in 'speaking' but no analyser updates are coming, drive a synthetic flap
  const startFallbackFlap = useCallback(() => {
    if (fallbackFlapRafRef.current !== null) {
      console.log('🎯 Fallback flap already running, skipping');
      return;
    }
    console.log('🎯 Starting fallback flap animation');
    
    // Add a safety timeout to stop flapping after 30 seconds
    const safetyTimeout = setTimeout(() => {
      console.log('🎯 Safety timeout reached, stopping fallback flap');
      stopFallbackFlap();
      useAnimationStore.getState().stopSpeaking();
    }, 30000); // 30 seconds maximum
    
    const loop = () => {
      const currentState = useAnimationStore.getState().voiceState;
      if (currentState !== 'speaking') {
        console.log('🎯 Voice state no longer speaking, stopping fallback flap');
        clearTimeout(safetyTimeout);
        if (fallbackFlapRafRef.current) cancelAnimationFrame(fallbackFlapRafRef.current);
        fallbackFlapRafRef.current = null;
        return;
      }
      
      const sinceAnalyzer = Date.now() - lastAnalyzerWriteRef.current;
      if (sinceAnalyzer > 150) {
        const t = performance.now() / 1000;
        const base = 0.35;
        const amp = 0.25;
        const value = base + Math.max(0, Math.sin(t * 6.0)) * amp;
        console.log(`🎯 Fallback flap setting mouth target: ${value.toFixed(3)}`);
        setMouthTarget(value);
      }
      fallbackFlapRafRef.current = requestAnimationFrame(loop);
    };
    fallbackFlapRafRef.current = requestAnimationFrame(loop);
  }, [setMouthTarget, stopFallbackFlap]);

  // Handle voice state changes for mouth target management
  useEffect(() => {
    console.log(`🎤 Voice state changed to: ${voiceState}`);
    
    if (voiceState === 'speaking') {
      console.log('🎤 Starting speaking mode - initializing fallback flap');
      // When speaking starts, ensure EMA accumulator is ready
      if (emaAccumulatorRef.current === 0) {
        emaAccumulatorRef.current = 0.1; // Small initial value to avoid jump
      }
      // Begin fallback flapping in case analyser isn't feeding us
      startFallbackFlap();
    } else {
      console.log('🎤 Stopping speaking mode - cleaning up');
      // When not speaking, reset mouth and clear EMA state
      resetMouth();
      emaAccumulatorRef.current = 0;
      lastTargetRef.current = 0;
      stopFallbackFlap();
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Voice state changed, resetting mouth and EMA state');
      }
    }
  }, [voiceState, resetMouth, startFallbackFlap, stopFallbackFlap]);

  // Enhanced speech intensity handler with mouth target updates
  const handleSpeechIntensity = useCallback((rawIntensity: number) => {
    console.log(`🎤 handleSpeechIntensity called with: ${rawIntensity.toFixed(3)}`);
    
    // Mark that we received a real analyser update
    lastAnalyzerWriteRef.current = Date.now();
    // Update legacy speech intensity for backward compatibility
    setSpeechIntensity(rawIntensity);
    
    // Process mouth targets for all intensity levels (including zero)
    // The WebRTC session will call this during audio playback
    const processedIntensity = processSpeechIntensity(rawIntensity);
    updateMouthTarget(processedIntensity);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎤 handleSpeechIntensity: raw=${rawIntensity.toFixed(3)}, processed=${processedIntensity.toFixed(3)}`);
    }
  }, [setSpeechIntensity, processSpeechIntensity, updateMouthTarget]);

  

  const { initializeOpenAIAgent, initializeOpenAIAgentFromWorker } = useVoiceAgentService({
    setVoiceState,
    onError,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity: handleSpeechIntensity, // pass the existing processor
    audioContextRef // provide shared AudioContext so analyser runs
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [currentLanguage, setCurrentLanguage] = useState(defaultLanguage);
  
  const wsRef = useRef<WebSocket | null>(null);
  const openaiAgentRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  const { connect: connectToVoice } = useVoiceConnectionService({
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
    setSpeechIntensity: handleSpeechIntensity
  });

  const {
    startRecording: startRecordingControl,
    stopRecording: stopRecordingControl,
    playAudioQueue,
    sendText: sendTextControl,
    switchAgent: switchAgentControl,
    interrupt: interruptControl
  } = useVoiceControlService({
    setVoiceState,
    onError,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity: handleSpeechIntensity, // Use enhanced handler
    openaiAgentRef,
    audioContextRef,
    audioQueueRef,
    isPlayingRef
  });
  
  // Connect using SSE for receiving messages
  const connect = useCallback(async () => {
    try {
      const eventSource = await connectToVoice();
      if (eventSource) {
        setIsConnected(true);
        setVoiceState('idle');
        // Store reference for cleanup
        wsRef.current = eventSource as any; // Reuse wsRef for cleanup
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      setVoiceState('error');
      onError?.('Failed to initialize voice service');
    }
  }, [connectToVoice, setVoiceState, onError]);
  
  // Start recording
  const startRecording = useCallback(async () => {
    try {
      // Resume AudioContext on first user gesture to unlock audio processing
      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      }
      
      await startRecordingControl();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setVoiceState('error');
    }
  }, [startRecordingControl, setVoiceState]);
   
  // Stop recording
  const stopRecording = useCallback(async () => {
    try {
      await stopRecordingControl();
      setIsRecording(false);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [stopRecordingControl]);
   
  // Send text message via HTTP POST
  const sendText = useCallback(async (text: string) => {
    try {
      const success = await sendTextControl(text);
      if (success) {
        setTranscript(text);
      }
    } catch (error) {
      console.error('Failed to send text:', error);
      onError?.('Failed to send message');
    }
  }, [sendTextControl, onError]);
   
  // Switch agent
  const switchAgent = useCallback(async (agentId: string) => {
    try {
      await switchAgentControl(agentId);
    } catch (error) {
      console.error('Failed to switch agent:', error);
      onError?.('Failed to switch agent');
    }
  }, [switchAgentControl, onError]);
 
  // Interrupt current response
  const interrupt = useCallback(async () => {
    try {
      await interruptControl();
    } catch (error) {
      console.error('Failed to interrupt:', error);
      onError?.('Failed to interrupt response');
    }
  }, [interruptControl, onError]);
   
  // Clean up
  useEffect(() => {
    if (autoStart) {
      connect();
    }
    
    return () => {
      if (wsRef.current) {
        // Handle both WebSocket and EventSource cleanup
        if ('close' in wsRef.current) {
          wsRef.current.close();
        } else if ('close' in wsRef.current) {
          (wsRef.current as EventSource).close();
        }
      }
      if (openaiAgentRef.current) {
        // Close the RealtimeSession
        openaiAgentRef.current.close();
      }
      stopRecording();
    };
  }, []);
   
  return {
    isConnected,
    isRecording,
    transcript,
    response,
    currentLanguage,
    supportedLanguages,
    connect,
    disconnect: () => {
      if (wsRef.current) {
        // Handle both WebSocket and EventSource cleanup
        if ('close' in wsRef.current) {
          wsRef.current.close();
        } else if ('close' in wsRef.current) {
          (wsRef.current as EventSource).close();
        }
      }
      if (openaiAgentRef.current) {
        // Close the RealtimeSession
        openaiAgentRef.current.close();
      }
    },
    startRecording,
    stopRecording,
    sendText,
    switchAgent,
    interrupt,
    switchLanguage: (language: string) => {
      if (supportedLanguages.includes(language)) {
        setCurrentLanguage(language);
        // Send language change instruction to the AI
        sendText(`Please switch to ${language === 'en' ? 'English' : language} for our conversation.`);
      }
    },
    clearTranscript: () => setTranscript(''),
    clearResponse: () => setResponse('')
  };
};
