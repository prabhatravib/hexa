import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useVoiceAgentService } from './voiceAgentService';
import { useVoiceConnectionService } from './voiceConnectionService';
import { useVoiceControlService } from './voiceControlService';
import { useVoiceAnimation } from './useVoiceAnimation';
import { getSupportedLanguageCodes, DEFAULT_LANGUAGE } from '@/lib/languageConfig';
import { useExternalDataStore } from '@/store/externalDataStore';
import { useAnimationStore } from '@/store/animationStore';
import { createSendTextHandler } from './voiceInteraction/sendTextHandler';

interface UseVoiceInteractionOptions {
  wakeWord?: string;
  autoStart?: boolean;
  onResponse?: (text: string) => void;
  onError?: (error: string) => void;
  defaultLanguage?: string;
  supportedLanguages?: string[];
}

export const useVoiceInteraction = (options: UseVoiceInteractionOptions = {}) => {
  const {
    wakeWord = 'hey hexagon',
    autoStart = false,
    onResponse,
    onError,
    defaultLanguage = DEFAULT_LANGUAGE,
    supportedLanguages = getSupportedLanguageCodes(),
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

  // Get voice disabled state from animation store
  const { isVoiceDisabled } = useAnimationStore();

  const { initializeOpenAIAgent, initializeOpenAIAgentFromWorker } = useVoiceAgentService({
    setVoiceState,
    onError,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity: handleSpeechIntensity, // pass the existing processor
    audioContextRef, // provide shared AudioContext so analyser runs
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [currentLanguage, setCurrentLanguage] = useState(defaultLanguage);

  // Define onTranscript callback after state declarations
  const onTranscript = useCallback((text: string) => {
    console.log('🎯 useVoiceInteraction: onTranscript called with:', text);
    setTranscript(text);
  }, []);

  // Debug response changes
  useEffect(() => {
    console.log('🎯 useVoiceInteraction: Response state changed:', response);
    if (response) {
      console.log('🎯 useVoiceInteraction: Response is not empty, length:', response.length);
    }
  }, [response]);

  // Debug transcript changes
  useEffect(() => {
    console.log('🎯 useVoiceInteraction: Transcript state changed:', transcript);
    if (transcript) {
      console.log('🎯 useVoiceInteraction: Transcript is not empty, length:', transcript.length);
    }
  }, [transcript]);

  const wsRef = useRef<WebSocket | null>(null);
  const openaiAgentRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const hasAutoConnectedRef = useRef(false);
  const lastRecordingStateRef = useRef(false);
  const resumeRecordingOnEnableRef = useRef(false);
  
  // Track current response ID to prevent cancelling active responses
  const currentResponseIdRef = useRef<string | null>(null);

  // External data management with guards
  const currentData = useExternalDataStore(s => s.currentData);
  const lastHashRef = useRef<string | null>(null);
  const lastSessionRef = useRef<string | null>(null);

  function isActiveSessionReady() {
    const s: any = (window as any).activeSession;
    if (!s) return false;
    const hasSend = !!(s.send || s.emit || s.transport?.sendEvent);
    const pc = s._pc?.connectionState;
    const rtcOk = !s._pc || pc === 'connected' || pc === 'completed';
    return hasSend && rtcOk;
  }

  const { connect: connectToVoice, externalData } = useVoiceConnectionService({
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
    setSpeechIntensity: handleSpeechIntensity,
  });

  const {
    startRecording: startRecordingControl,
    stopRecording: stopRecordingControl,
    playAudioQueue,
    sendText: sendTextControl,
    switchAgent: switchAgentControl,
    interrupt: interruptControl,
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
    isPlayingRef,
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
    // Block recording if voice is disabled
    if (isVoiceDisabled) {
      console.log('🔇 Voice recording blocked - voice is disabled');
      return;
    }

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
  }, [startRecordingControl, setVoiceState, isVoiceDisabled]);

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
  const sendText = useMemo(
    () =>
      createSendTextHandler({
        isVoiceDisabled,
        setVoiceState,
        sendTextControl,
        setTranscript,
        onError,
        currentResponseIdRef,
      }),
    [isVoiceDisabled, setVoiceState, sendTextControl, setTranscript, onError]
  );

  // Switch agent
  const switchAgent = useCallback(
    async (agentId: string) => {
      try {
        await switchAgentControl(agentId);
      } catch (error) {
        console.error('Failed to switch agent:', error);
        onError?.('Failed to switch agent');
      }
    },
    [switchAgentControl, onError]
  );

  // Interrupt current response
  const interrupt = useCallback(async () => {
    try {
      await interruptControl();
    } catch (error) {
      console.error('Failed to interrupt:', error);
      onError?.('Failed to interrupt response');
    }
  }, [interruptControl, onError]);

  // Guarded external data POST with deduplication and session management
  useEffect(() => {
    const sid = sessionInfo?.sessionId;
    if (!currentData || !sid || !isConnected || !isActiveSessionReady()) return;

    // reset dedupe when session changes
    if (sid !== lastSessionRef.current) {
      lastSessionRef.current = sid;
      lastHashRef.current = null;
    }

    const body = JSON.stringify({
      sessionId: sid,
      type: currentData.type || 'text',
      text: currentData.text,
      prompt: currentData.prompt,
    });

    crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)).then(buf => {
      const hash = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      if (hash === lastHashRef.current) return;

      lastHashRef.current = hash;
      fetch('/api/external-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {
        lastHashRef.current = null;
      });
    });
  }, [currentData, isConnected, sessionInfo]);

  // Track recording state to know whether we should resume after pause
  useEffect(() => {
    lastRecordingStateRef.current = isRecording;
  }, [isRecording]);

  // When voice is re-enabled, resume recording if we were recording before disabling
  useEffect(() => {
    if (isVoiceDisabled) {
      resumeRecordingOnEnableRef.current = lastRecordingStateRef.current;
      return;
    }

    if (resumeRecordingOnEnableRef.current) {
      resumeRecordingOnEnableRef.current = false;
      // Let audio buffers re-enable before restarting recording
      setTimeout(() => {
        startRecording();
      }, 50);
    }
  }, [isVoiceDisabled, startRecording]);

  // Auto-connect once when allowed
  useEffect(() => {
    if (!autoStart || hasAutoConnectedRef.current) return;
    if (isVoiceDisabled) return;

    hasAutoConnectedRef.current = true;
    setInitializationState('initializing');
    connect();
  }, [autoStart, isVoiceDisabled, connect, setInitializationState]);

  // Clean up on unmount
  useEffect(() => {
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
  }, [stopRecording]);

  return {
    isConnected,
    isRecording,
    transcript,
    response,
    currentLanguage,
    supportedLanguages,
    externalData,
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
        void sendText(
          `Please switch to ${language === 'en' ? 'English' : language} for our conversation.`
        );
      }
    },
    clearTranscript: () => setTranscript(''),
    clearResponse: () => setResponse(''),
  };
};
