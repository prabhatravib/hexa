import { useEffect, useRef, useState, useCallback } from 'react';
import { useVoiceAgentService } from './voiceAgentService';
import { useVoiceConnectionService } from './voiceConnectionService';
import { useVoiceControlService } from './voiceControlService';
import { safeSessionSend, isRealtimeReady } from '@/lib/voiceSessionUtils';
import { getBaseInstructions } from '@/lib/externalContext';
import { useVoiceAnimation } from './useVoiceAnimation';
import { extractTranscript } from './voiceSessionShared';
import { getSupportedLanguageCodes, DEFAULT_LANGUAGE } from '@/lib/languageConfig';
import { useExternalDataStore } from '@/store/externalDataStore';
import { useAnimationStore } from '@/store/animationStore';

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

const collectUserItemIds = (history: any): Set<string> => {
  const ids = new Set<string>();
  if (!Array.isArray(history)) return ids;
  history.forEach(item => {
    if (item?.role !== 'user') return;
    const id = item?.itemId ?? item?.id;
    if (id) ids.add(id);
  });
  return ids;
};

const collectAssistantSnapshot = (history: any): Map<string, string | null> => {
  const snapshot = new Map<string, string | null>();
  if (!Array.isArray(history)) return snapshot;
  history.forEach(item => {
    if (item?.role !== 'assistant') return;
    const id = item?.itemId ?? item?.id;
    if (!id) return;
    const text = extractTranscript(item?.content);
    const normalized = typeof text === 'string' ? text.trim() : null;
    snapshot.set(String(id), normalized && normalized.length > 0 ? normalized : null);
  });
  return snapshot;
};

const waitForConversationAck = useCallback(async (session: any, text: string, previousUserIds: Set<string>) => {
  if (!session?.on) return true;

  const normalize = (value: unknown) =>
    typeof value === 'string' ? value.trim() : undefined;

  const target = normalize(text);

  return await new Promise<boolean>(resolve => {
    let settled = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;

    const cleanup = (result: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      session.off?.('conversation.item.created', onCreated);
      session.off?.('error', onError);
      if (intervalId !== null) window.clearInterval(intervalId);
      resolve(result);
    };

    const onCreated = (item: any) => {
      try {
        if (item?.role !== 'user') return;
        const id = item?.itemId ?? item?.id;
        if (id && previousUserIds.has(id)) return;
        const content = Array.isArray(item?.content) ? item.content : [];
        const matches = target
          ? content.some((part: any) => normalize(part?.text ?? part?.transcript) === target)
          : true;
        if (!matches) return;
        if (id) previousUserIds.add(id);
      } catch {
        return;
      }
      cleanup(true);
    };

    const onError = () => {
      cleanup(false);
    };

    const pollHistory = () => {
      try {
        const history = Array.isArray(session?.history) ? session.history : [];
        for (const item of history) {
          if (item?.role !== 'user') continue;
          const id = item?.itemId ?? item?.id;
          if (id && !previousUserIds.has(id)) {
            previousUserIds.add(id);
            cleanup(true);
            return;
          }
          if (target) {
            const textMatch = normalize(extractTranscript(item?.content)) === target;
            if (textMatch && (!id || !previousUserIds.has(id))) {
              if (id) previousUserIds.add(id);
              cleanup(true);
              return;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to inspect session history for ack:', error);
      }
    };

    pollHistory();
    if (!settled) {
      intervalId = window.setInterval(pollHistory, 120);
    }

    timeoutId = window.setTimeout(() => {
      pollHistory();
      cleanup(false);
    }, 2000);

    session.on?.('conversation.item.created', onCreated);
    session.on?.('error', onError);
  });
}, [extractTranscript]);

const waitForAssistantResponse = useCallback(async (session: any, previousAssistantSnapshot: Map<string, string | null>) => {
  if (!session?.on) return false;

  console.log('🎵 waitForAssistantResponse: Starting to wait for assistant response');

  return await new Promise<boolean>(resolve => {
    let settled = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;
    const audioListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

    const normalize = (value: unknown) =>
      typeof value === 'string' ? value.trim() : undefined;

    const getAssistantId = (item: any): string | null => {
      const raw =
        item?.itemId ??
        item?.id ??
        item?.item_id ??
        item?.response_id ??
        null;
      return raw ? String(raw) : null;
    };

    const markAssistant = (item: any) => {
      if (!item || item.role !== 'assistant') return false;
      const id = getAssistantId(item);
      const text = normalize(extractTranscript(item?.content));

      if (id) {
        const previous = previousAssistantSnapshot.get(id);
        if (previous === undefined) {
          previousAssistantSnapshot.set(id, text ?? null);
          if (text) {
            cleanup(true);
            return true;
          }
          return false;
        }

        if (previous === null && text) {
          previousAssistantSnapshot.set(id, text);
          cleanup(true);
          return true;
        }

        if (previous !== null && text && previous !== text) {
          previousAssistantSnapshot.set(id, text);
          cleanup(true);
          return true;
        }

        return false;
      }

      if (text) {
        cleanup(true);
        return true;
      }

      return false;
    };

    const hasAudioPayload = (payload: any): boolean => {
      if (!payload) return false;
      if (typeof payload !== 'object') return false;

      // Check various audio indicators
      const type = payload?.type ?? payload?.content_type ?? payload?.modality;
      if (typeof type === 'string' && type.toLowerCase() === 'audio') {
        console.log('🎵 hasAudioPayload: Found audio type:', type);
        return true;
      }

      // Check for audio-related fields
      if (payload?.audio || payload?.audio_data || payload?.audio_url) {
        console.log('🎵 hasAudioPayload: Found audio field');
        return true;
      }

      // Check content arrays
      if (Array.isArray(payload?.content)) {
        const hasAudioContent = payload.content.some((part: any) => hasAudioPayload(part));
        if (hasAudioContent) {
          console.log('🎵 hasAudioPayload: Found audio in content array');
        }
        return hasAudioContent;
      }

      // Check if payload is an array
      if (Array.isArray(payload)) {
        const hasAudioInArray = payload.some(part => hasAudioPayload(part));
        if (hasAudioInArray) {
          console.log('🎵 hasAudioPayload: Found audio in array');
        }
        return hasAudioInArray;
      }

      return false;
    };

    const checkHistory = () => {
      try {
        const history = Array.isArray(session?.history) ? session.history : [];
        for (const item of history) {
          if (markAssistant(item)) {
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to inspect history for assistant response:', error);
      }
    };

    const cleanup = (result: boolean) => {
      if (settled) return;
      console.log(`🎵 waitForAssistantResponse: Cleanup called with result: ${result}`);
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
      session.off?.('history_added', onHistoryAdded);
      session.off?.('history_updated', onHistoryUpdated);
      session.off?.('response.output_item.added', onOutputItemAdded);
      session.off?.('response.completed', onResponseCompleted);
      audioListeners.forEach(({ event, handler }) => {
        session.off?.(event, handler);
      });
      resolve(result);
    };

    const onHistoryAdded = (item: any) => {
      try {
        markAssistant(item);
      } catch (error) {
        console.warn('Failed to inspect history_added item for assistant response:', error);
      }
    };

    const onHistoryUpdated = (history: any) => {
      try {
        if (!history) return;
        if (Array.isArray(history)) {
          for (const item of history) {
            if (markAssistant(item)) return;
          }
        } else {
          markAssistant(history);
        }
      } catch (error) {
        console.warn('Failed to inspect history_updated payload for assistant response:', error);
      }
    };

    const onOutputItemAdded = (item: any) => {
      try {
        const candidate = item?.item ?? item;
        console.log('🎵 waitForAssistantResponse: onOutputItemAdded called with:', candidate);
        
        if (markAssistant(candidate)) return;
        
        const hasAudio = hasAudioPayload(candidate);
        console.log('🎵 waitForAssistantResponse: hasAudioPayload result:', hasAudio);
        
        if (hasAudio) {
          console.log('🎵 waitForAssistantResponse: Audio detected, cleaning up');
          cleanup(true);
        }
      } catch (error) {
        console.warn('Failed to inspect response output item:', error);
      }
    };

    const onResponseCompleted = () => {
      checkHistory();
    };

    timeoutId = window.setTimeout(() => {
      checkHistory();
      cleanup(false);
    }, 4000);

    session.on?.('history_added', onHistoryAdded);
    session.on?.('history_updated', onHistoryUpdated);
    session.on?.('response.output_item.added', onOutputItemAdded);
    session.on?.('response.completed', onResponseCompleted);

    const attachAudioListener = (event: string) => {
      const handler = (...args: any[]) => {
        console.log(`🎵 waitForAssistantResponse: Audio event ${event} triggered with:`, args);
        
        if (event === 'agent_start') {
          console.log('🎵 waitForAssistantResponse: agent_start detected - waiting for actual content');
          return; // Don't cleanup yet - wait for actual content
        }
        
        if (event === 'agent_end') {
          console.log('🎵 waitForAssistantResponse: agent_end detected - checking for content');
          const hasResponse = args && args.length > 2 && args[2] && args[2].trim() !== '';
          if (hasResponse) {
            console.log('🎵 waitForAssistantResponse: Valid response found in agent_end');
            // Clear current response ID when response completes
            currentResponseIdRef.current = null;
            (window as any).__currentResponseId = null;
            cleanup(true);
          } else {
            console.log('🎵 waitForAssistantResponse: Empty response in agent_end - continuing to wait');
            // Don't cleanup - let it timeout and fall back to HTTP
            return;
          }
        }
        
        // For other audio events (response.audio.delta, etc.), cleanup immediately
        cleanup(true);
      };
      audioListeners.push({ event, handler });
      session.on?.(event as any, handler as any);
    };

    // Listen for response.created to track response ID
    session.on?.('response.created', (response: any) => {
      console.log('🎵 waitForAssistantResponse: Response created with ID:', response?.id);
      if (response?.id) {
        currentResponseIdRef.current = response.id;
        // Expose globally for interrupt function to access
        (window as any).__currentResponseId = response.id;
      }
    });

    // Listen for various audio-related events
    const audioEvents = [
      'response.audio.delta',
      'response.audio', 
      'response.audio.start',
      'response.audio_transcript.done',
      'audio',
      'remote_track',
      'agent_start',  // Wait for actual content, don't cleanup immediately
      'agent_end'     // Check for valid response content
    ];
    
    audioEvents.forEach(eventName => {
      attachAudioListener(eventName);
    });

    checkHistory();
    if (!settled) {
      intervalId = window.setInterval(checkHistory, 200);
    }
  });
}, [extractTranscript]);

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
  const sendText = useCallback(
    async (text: string) => {
      if (isVoiceDisabled) {
        console.log('dY"? Text sending blocked - voice is disabled');
        return false;
      }

      const session: any = (window as any).activeSession;
      if (session && isRealtimeReady(session)) {
        try {
          console.log('dY"? Sending text via Realtime session');

          // FIXED: Don't call stopSpeaking() before response.create to prevent interrupt race condition
          // The stopSpeaking() call was triggering interrupt commands that cancelled the new response
          // Only set voice state to thinking, let the response.create handle the transition
          setVoiceState('thinking');

          const previousUserIds = collectUserItemIds(session?.history);
          const previousAssistantSnapshot = collectAssistantSnapshot(session?.history);

          const queued = await safeSessionSend(session, {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text }],
            },
          });

          if (!queued) {
            throw new Error('Realtime conversation.item.create failed');
          }

          const acked = await waitForConversationAck(session, text, previousUserIds);
          console.log('dY"? Conversation item ack status:', acked);
          if (!acked) {
            console.warn('dY"? Conversation item create ack timed out, continuing anyway');
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          const triggered = await safeSessionSend(session, {
            type: 'response.create',
            response: {
              modalities: ['audio', 'text'],
              instructions:
                getBaseInstructions() ||
                'You are Hexa, the Hexagon assistant. Respond aloud to the user.',
              voice: 'marin',
              output_audio_format: 'pcm16',
            },
          });

          if (!triggered) {
            throw new Error('Realtime response.create failed');
          }

          const assistantResponded = await waitForAssistantResponse(session, previousAssistantSnapshot);
          if (!assistantResponded) {
            console.warn('dY"? Assistant response detection failed, falling back to HTTP');
            const fallbackSuccess = await sendTextControl(text);
            if (!fallbackSuccess) {
              throw new Error('HTTP fallback send failed');
            }
            setTranscript(text);
            setVoiceState('thinking');
            return true;
          }

          console.log('dY"? Text sent and voice response requested');
          setTranscript(text);
          return true;
        } catch (error) {
          console.warn('Realtime text send failed, falling back to HTTP:', error);
        }
      }

      try {
        console.log('dY"? Sending text via HTTP fallback');
        const success = await sendTextControl(text);
        if (success) {
          setTranscript(text);
          setVoiceState('thinking');
          return true;
        }
        return false;
      } catch (error) {
        console.error('Failed to send text:', error);
        onError?.('Failed to send message');
        return false;
      }
    },
    [
      sendTextControl,
      onError,
      isVoiceDisabled,
      setVoiceState,
      stopSpeaking,
      waitForConversationAck,
      waitForAssistantResponse,
    ]
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
