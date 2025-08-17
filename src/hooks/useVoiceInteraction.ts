import { useEffect, useRef, useState, useCallback } from 'react';
import { useAnimationStore } from '@/store/animationStore';
import { useVoiceAgentService } from './voiceAgentService';
import { useVoiceConnectionService } from './voiceConnectionService';
import { useVoiceControlService } from './voiceControlService';

interface UseVoiceInteractionOptions {
  wakeWord?: string;
  autoStart?: boolean;
  onTranscription?: (text: string) => void;
  onResponse?: (text: string) => void;
  onError?: (error: string) => void;
}

export const useVoiceInteraction = (options: UseVoiceInteractionOptions = {}) => {
  const {
    wakeWord = 'hey hexagon',
    autoStart = false,
    onTranscription,
    onResponse,
    onError
  } = options;

  const {
    setVoiceState,
    setVoiceActive,
    setSpeaking,
    setSpeechIntensity,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking
  } = useAnimationStore();

  const { initializeOpenAIAgent, initializeOpenAIAgentFromWorker } = useVoiceAgentService({
    setVoiceState,
    onError
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const openaiAgentRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
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
    setResponse
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
    setSpeechIntensity,
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
    clearTranscript: () => setTranscript(''),
    clearResponse: () => setResponse('')
  };
};
