type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

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
  
  // Create a debug wrapper for setVoiceState that logs changes
  const debugSetVoiceState = (state: VoiceState) => {
    console.log(`🎤 Voice state changing from ${(window as any).__currentVoiceState} to ${state}`);
    setVoiceState(state);
  };
  
  // Track if we're currently speaking to avoid duplicate calls
  let isCurrentlySpeaking = false;

  const forceStopSpeaking = (reason: string) => {
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

  session.on('agent_end' as any, () => {
    console.log('📢 agent_end - waiting for output_audio_buffer.stopped before stopping');
    // Do nothing - let output_audio_buffer.stopped handle stopping
  });
  
  // Set up various event handlers for mouth animation
  // Try multiple event names as the SDK might use different ones
  const possibleAudioEvents = ['audio', 'response.audio.delta', 'response.audio', 'conversation.item.audio'];
  possibleAudioEvents.forEach(eventName => {
    session.on(eventName as any, (audioData: any) => {
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

  session.on('error' as any, (error: any) => {
    console.error('❌ OpenAI session error:', error);
    debugSetVoiceState('error');
    // Note: onError is not available in this context, so we just set the state
  });
};
