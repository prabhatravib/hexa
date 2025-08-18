import { useEffect, useRef, useState, useCallback } from 'react';
import { useVoiceAgentService } from './voiceAgentService';
import { useVoiceConnectionService } from './voiceConnectionService';
import { useVoiceControlService } from './voiceControlService';
import { useVoiceAnimation } from './useVoiceAnimation';
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
    audioContextRef,
    handleSpeechIntensity,
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
    stopSpeaking,
    setInitializationState,
  } = useVoiceAnimation();



  

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
      setInitializationState('connecting');
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
      setInitializationState('error');
      onError?.('Failed to initialize voice service');
    }
  }, [connectToVoice, setVoiceState, onError, setInitializationState]);
  
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
      setInitializationState('initializing');
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
