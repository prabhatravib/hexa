type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
import { useAnimationStore } from '@/store/animationStore';
import { isVoiceDisabledNow, silenceAudioEverywhere } from '@/lib/voiceDisableGuard';

interface SessionEventHandlersOptions {
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  audioEl: HTMLAudioElement;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
  setSpeechIntensity?: (intensity: number) => void;
}

export const setupSessionEventHandlers = (
  session: any,
  options: SessionEventHandlersOptions
) => {
  const { setVoiceState, startSpeaking, stopSpeaking, audioEl, audioContextRef, setSpeechIntensity } = options;

  // Helper: extract a human-readable transcript from various content shapes
  const extractTranscript = (content: any): string | null => {
    if (!content) return null;
    // If the content is already a string
    if (typeof content === 'string') return content.trim() || null;
    
    // Arrays of parts: try each until we find text
    if (Array.isArray(content)) {
      for (const part of content) {
        const t = extractTranscript(part);
        if (t) return t;
      }
      return null;
    }

    // Objects with known shapes
    if (typeof content === 'object') {
      // Newer SDKs may provide { type: 'input_text', text }
      if (typeof content.text === 'string') return content.text.trim() || null;
      // Transcribed audio often appears as { type: 'input_audio', transcript }
      if (typeof content.transcript === 'string') return content.transcript.trim() || null;
      // Some events nest content again
      if (content.content) return extractTranscript(content.content);
    }

    return null;
  };
  
  // Create a debug wrapper for setVoiceState that logs changes
  const debugSetVoiceState = (state: VoiceState) => {
    console.log(`🎤 Voice state changing from ${(window as any).__currentVoiceState} to ${state}`);
    setVoiceState(state);
  };
  
  // Track if we're currently speaking to avoid duplicate calls
  let isCurrentlySpeaking = false;

  const forceStopSpeaking = (reason: string) => {
    // Check if voice is disabled before stopping speaking
    try {
      const disabled = useAnimationStore.getState().isVoiceDisabled;
      if (disabled) {
        console.log(`🔇 Voice disabled: ignoring ${reason} - not stopping speaking state`);
        return;
      }
    } catch (error) {
      console.error('Failed to check voice disabled state:', error);
    }
    
    console.log(`🔇 ${reason} - leaving speaking state`);
    isCurrentlySpeaking = false;
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    (window as any).__currentVoiceState = 'idle';
  };

  // Smart audio end detection - ignore early events, wait for real audio end
  const delayedStopSpeaking = (reason: string) => {
    // Check if voice is disabled before processing audio end events
    try {
      const disabled = useAnimationStore.getState().isVoiceDisabled;
      if (disabled) {
        console.log(`🔇 Voice disabled: ignoring ${reason} - not processing audio end event`);
        return;
      }
    } catch (error) {
      console.error('Failed to check voice disabled state:', error);
    }
    
    console.log(`⏳ ${reason} received - checking if this is a real audio end or just an early event`);

    // If no audio element, stop immediately
    if (!audioEl) {
      console.log(`✅ No audio element, stopping immediately`);
      forceStopSpeaking(reason);
      return;
    }

    // Check multiple conditions for audio still playing
    const audioStillPlaying = !audioEl.paused && 
                             audioEl.currentTime > 0 && 
                             audioEl.readyState >= 2 && // HAVE_CURRENT_DATA or better
                             audioEl.srcObject !== null;

    if (!audioStillPlaying) {
      console.log(`✅ Audio not playing, stopping immediately`);
      forceStopSpeaking(reason);
      return;
    }

    // Audio is still playing - this is an early event, wait for real end
    console.log(`⚠️ ${reason} fired but audio still playing - this is an early event, waiting for real audio end`);
    console.log(`Audio state: paused=${audioEl.paused}, currentTime=${audioEl.currentTime}, readyState=${audioEl.readyState}`);

    let checkCount = 0;
    const maxChecks = 300; // 30 seconds maximum (100ms * 300)

    // Monitor audio state until it actually stops
    const checkAudioState = setInterval(() => {
      checkCount++;
      
      // More robust check for audio playing
      const stillPlaying = !audioEl.paused && 
                          audioEl.currentTime > 0 && 
                          audioEl.readyState >= 2 &&
                          audioEl.srcObject !== null;
      
      // Also check if audio time is advancing
      const previousTime = audioEl.currentTime;
      
      setTimeout(() => {
        const timeAdvanced = audioEl.currentTime > previousTime;
        
        if (!stillPlaying || !timeAdvanced || checkCount >= maxChecks) {
          console.log(`✅ Audio actually finished playing (stillPlaying=${stillPlaying}, timeAdvanced=${timeAdvanced}, checks=${checkCount}), now stopping mouth animation`);
          clearInterval(checkAudioState);
          forceStopSpeaking(reason);
        }
      }, 50); // Check if time advanced after 50ms
      
    }, 100); // Check every 100ms for fast response
  };

  // Prefer high-level lifecycle events from the session when available
  session.on('agent_start' as any, () => {
    if (isVoiceDisabledNow()) {
      console.log('🔇 Voice disabled: ignoring agent_start and silencing audio');
      try { (audioEl as any).muted = true; if (!audioEl.paused) audioEl.pause(); } catch {}
      (window as any).__currentVoiceState = 'idle';
      setVoiceState('idle');
      return;
    }
    console.log('📢 agent_start - entering speaking state');
    if (!isCurrentlySpeaking) {
      isCurrentlySpeaking = true;
      if (startSpeaking) {
        startSpeaking();
      } else {
        setVoiceState('speaking');
      }
    }
  });

  // Listen for the real audio end event - output_audio_buffer.stopped
  session.on('transport_event' as any, (events: any) => {
    // Handle both array and single object cases
    const eventArray = Array.isArray(events) ? events : [events];
    
    eventArray.forEach((event: any) => {
      if (event.type === 'output_audio_buffer.stopped') {
        if (isVoiceDisabledNow()) {
          console.log('🔇 Voice disabled: ignoring output_audio_buffer.stopped event');
          return;
        }
        
        console.log('🎵 output_audio_buffer.stopped - real audio finished, stopping mouth animation');
        forceStopSpeaking('output_audio_buffer.stopped');
      }
    });
  });

  // Ignore audio_stopped events completely - they're unreliable
  session.on('audio_stopped' as any, () => {
    console.log('⏸️ audio_stopped received (completely ignored) - will wait for output_audio_buffer.stopped');
    // Do nothing - let output_audio_buffer.stopped handle stopping
  });

  session.on('agent_end' as any, (...args: any[]) => {
    console.log('📢 agent_end - waiting for output_audio_buffer.stopped before stopping');
    console.log('🔍 agent_end args:', args);
    
    // Extract response text from agent_end event
    if (args.length > 2 && args[2]) {
      const responseText = args[2];
      console.log('✅ Extracted response text from agent_end:', responseText);
      
      // Send the response text to the voice connection service
      if (typeof window !== 'undefined' && (window as any).__hexaSetResponse) {
        (window as any).__hexaSetResponse(responseText);
      }
    }

    // Also try to get the user's input from session history
    try {
      const history = session.history || [];
      console.log('📚 Full session history on response:', history);
      if (history.length >= 2) {
        // Get the second-to-last message (should be user input)
        const userMessage = history[history.length - 2];
        console.log('📚 Second-to-last message (user):', userMessage);
        if (userMessage && userMessage.role === 'user') {
          const text = extractTranscript(userMessage.content);
          console.log('📚 User text extracted:', text ?? userMessage.content);
          if (text) {
            console.log('✅ Found user input in history:', text);
            if (typeof window !== 'undefined' && (window as any).__hexaSetTranscript) {
              (window as any).__hexaSetTranscript(text);
            }
          }
        }
      }
    } catch (error) {
      console.log('❌ Error getting user input from history:', error);
    }
  });

  // Debug: Log transcription-related events only
  session.on('*' as any, (eventName: string, data: any) => {
    if (eventName.includes('transcription') || eventName.includes('conversation')) {
      console.log(`🔍 Session event: ${eventName}`, data);
    }
  });

  // Handle transcription events - simplified approach
  session.on('conversation.item.input_audio_transcription.completed' as any, (event: any) => {
    console.log('📝 User transcription completed:', event);
    
    const transcript = event?.transcript || event?.text || event?.content;
    if (transcript && typeof transcript === 'string' && transcript.trim()) {
      console.log('✅ Found user transcript:', transcript);
      // Use global function for now
      if (typeof window !== 'undefined' && (window as any).__hexaSetTranscript) {
        (window as any).__hexaSetTranscript(transcript);
      }
    }
  });

  // Handle transcript events
  session.on('input_audio_buffer.speech_started' as any, () => {
    console.log('🎤 Speech started - user is speaking');
  });

  session.on('input_audio_buffer.speech_stopped' as any, () => {
    console.log('🎤 Speech stopped - user finished speaking');
    
    // Try to get transcript from the session
    try {
      const history = session.history || [];
      console.log('📚 Full session history on speech stopped:', history);
      if (history.length > 0) {
        // Look for the most recent user message
        for (let i = history.length - 1; i >= 0; i--) {
          const item = history[i];
          console.log(`📚 History item ${i}:`, item);
          if (item && item.role === 'user') {
            const text = extractTranscript(item.content);
            console.log('📚 User text extracted:', text ?? item.content);
            if (text) {
              console.log('✅ Found user transcript:', text);
              if (typeof window !== 'undefined' && (window as any).__hexaSetTranscript) {
                (window as any).__hexaSetTranscript(text);
              }
              break;
            }
          }
        }
      }
    } catch (error) {
      console.log('❌ Error getting transcript:', error);
    }
  });

  // Try to capture transcript from various possible events
  const transcriptEvents = [
    'conversation.item.input_audio_transcription', 
    'input_audio_buffer.transcription', 
    'transcription',
    'conversation.item.input_audio_transcription.done',
    'input_audio_buffer.speech_stopped',
    'conversation.item.input_audio_transcription.completed'
  ];
  
  transcriptEvents.forEach(eventName => {
    session.on(eventName as any, (data: any) => {
      console.log(`📝 Transcript event ${eventName}:`, data);
      console.log(`📝 Event data type:`, typeof data);
      console.log(`📝 Event data keys:`, data && typeof data === 'object' ? Object.keys(data) : 'not an object');
      
      if (data && typeof data === 'string' && data.trim()) {
        console.log('✅ Found transcript:', data);
        if (typeof window !== 'undefined' && (window as any).__hexaSetTranscript) {
          (window as any).__hexaSetTranscript(data);
        }
      } else if (data && data.text && typeof data.text === 'string' && data.text.trim()) {
        console.log('✅ Found transcript in data.text:', data.text);
        if (typeof window !== 'undefined' && (window as any).__hexaSetTranscript) {
          (window as any).__hexaSetTranscript(data.text);
        }
      } else if (data && data.transcript && typeof data.transcript === 'string' && data.transcript.trim()) {
        console.log('✅ Found transcript in data.transcript:', data.transcript);
        if (typeof window !== 'undefined' && (window as any).__hexaSetTranscript) {
          (window as any).__hexaSetTranscript(data.transcript);
        }
      }
    });
  });

  
  // Set up various event handlers for mouth animation
  // Try multiple event names as the SDK might use different ones
  const possibleAudioEvents = ['audio', 'response.audio.delta', 'response.audio', 'conversation.item.audio'];
  possibleAudioEvents.forEach(eventName => {
    session.on(eventName as any, (audioData: any) => {
      if (isVoiceDisabledNow()) {
        console.log(`🔇 Voice disabled: ignoring ${eventName} and pausing audio`);
        try { (audioEl as any).muted = true; if (!audioEl.paused) audioEl.pause(); } catch {}
        (window as any).__currentVoiceState = 'idle';
        setVoiceState('idle');
        return;
      }
      console.log(`🎵 Event ${eventName} fired - starting mouth animation`);
      if (!isCurrentlySpeaking) {
        isCurrentlySpeaking = true;
        if (startSpeaking) {
          startSpeaking();
        } else {
          setVoiceState('speaking');
        }
      }
    });
  });
  
  // Handle audio completion events - ignore premature done events
  const possibleDoneEvents = ['audio_done', 'response.audio.done', 'response.done', 'conversation.item.done'];
  possibleDoneEvents.forEach(eventName => {
    session.on(eventName as any, () => {
      console.log(`⛔ Ignoring premature event ${eventName}; waiting for output_audio_buffer.stopped or audio element end`);
      // Do not change voice state here; rely on output_audio_buffer.stopped and audio element events
    });
  });
  
  // Also listen for response events that might indicate speaking
  session.on('response.created' as any, () => {
    console.log('📢 Response created - AI is preparing to speak');
    debugSetVoiceState('thinking');
  });
  

  
  session.on('response.output_item.added' as any, (item: any) => {
    console.log('📢 Output item added:', item);
    if (item?.type === 'audio' || item?.content_type?.includes('audio')) {
      console.log('🎵 Audio output item detected - starting mouth animation');
      if (!isCurrentlySpeaking) {
        isCurrentlySpeaking = true;
        if (startSpeaking) {
          startSpeaking();
        } else {
          setVoiceState('speaking');
        }
      }
    }
  });

  session.on('conversation.item.created' as any, (item: any) => {
    if (item?.role === 'user' && Array.isArray(item?.content) && item.content.some((part: any) => part?.type === 'input_text')) {
      console.log('dY"? User text item created, preparing for voice response');
      if (!isCurrentlySpeaking) {
        debugSetVoiceState('thinking');
      }
    }
  });

  session.on('response.content' as any, (content: any) => {
    console.log('dY"? Response content received:', content);
    if (content?.type === 'text' && !isCurrentlySpeaking) {
      console.log('dY"? Text response without audio yet - awaiting audio stream');
    }
  });
  session.on('error' as any, (error: any) => {
    console.error('❌ OpenAI session error:', error);
    debugSetVoiceState('error');
    // Note: onError is not available in this context, so we just set the state
  });
};

