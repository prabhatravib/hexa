import { useAnimationStore } from '@/store/animationStore';
import { stopAudioAnalysis } from './voiceAudioAnalysis';
import { isVoiceDisabledNow } from '@/lib/voiceDisableGuard';
import type {
  DebugSetVoiceState,
  SessionEventHandlersOptions,
  VoiceSessionRuntimeState,
} from './voiceSessionShared';

interface VoiceSessionPlaybackContext extends SessionEventHandlersOptions {
  debugSetVoiceState: DebugSetVoiceState;
  runtimeState: VoiceSessionRuntimeState;
}

export const registerVoiceSessionPlaybackHandlers = (
  session: any,
  context: VoiceSessionPlaybackContext
) => {
  const {
    setVoiceState,
    startSpeaking,
    stopSpeaking,
    audioEl,
    debugSetVoiceState,
    runtimeState,
  } = context;

  const ensureAudioPlaying = () => {
    if (!audioEl) return;
    try {
      if (audioEl.muted) audioEl.muted = false;
      if (audioEl.volume === 0) audioEl.volume = 1;
      if (audioEl.paused) {
        const playResult = audioEl.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(err => {
            console.warn('Failed to resume audio playback:', err);
          });
        }
      }
    } catch (error) {
      console.warn('Failed to ensure audio playback:', error);
    }
  };

  const markSpeaking = () => {
    ensureAudioPlaying();
    if (!runtimeState.isCurrentlySpeaking) {
      runtimeState.isCurrentlySpeaking = true;
      if (startSpeaking) {
        startSpeaking();
      } else {
        setVoiceState('speaking');
      }
    }
  };


  const forceStopSpeaking = (reason: string) => {
    try {
      const disabled = useAnimationStore.getState().isVoiceDisabled;
      if (disabled) {
        console.log(`dY"ÃƒÂ¯Ã‚Â¿Ã‚Â½ Voice disabled: ignoring ${reason} - not stopping speaking state`);
        return;
      }
    } catch (error) {
      console.error('Failed to check voice disabled state:', error);
    }

    console.log(`dY"ÃƒÂ¯Ã‚Â¿Ã‚Â½ ${reason} - leaving speaking state`);
    runtimeState.isCurrentlySpeaking = false;
    
    // Reset mouth animation target to prevent stuck-open mouth
    try {
      useAnimationStore.getState().setMouthTarget(0);
    } catch (error) {
      console.error('Failed to reset mouth target:', error);
    }
    
    // Stop the audio analyzer
    stopAudioAnalysis();
    
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    (window as any).__currentVoiceState = 'idle';
  };

  const delayedStopSpeaking = (reason: string) => {
    try {
      const disabled = useAnimationStore.getState().isVoiceDisabled;
      if (disabled) {
        console.log(`dY"ÃƒÂ¯Ã‚Â¿Ã‚Â½ Voice disabled: ignoring ${reason} - not processing audio end event`);
        return;
      }
    } catch (error) {
      console.error('Failed to check voice disabled state:', error);
    }

    console.log(
      `ÃƒÂ¯Ã‚Â¿Ã‚Â½?3 ${reason} received - checking if this is a real audio end or just an early event`
    );

    if (!audioEl) {
      console.log('ÃƒÂ¯Ã‚Â¿Ã‚Â½o. No audio element, stopping immediately');
      forceStopSpeaking(reason);
      return;
    }

    const audioStillPlaying =
      !audioEl.paused &&
      audioEl.currentTime > 0 &&
      audioEl.readyState >= 2 &&
      audioEl.srcObject !== null;

    if (!audioStillPlaying) {
      console.log('ÃƒÂ¯Ã‚Â¿Ã‚Â½o. Audio not playing, stopping immediately');
      forceStopSpeaking(reason);
      return;
    }

    console.log(
      `ÃƒÂ¯Ã‚Â¿Ã‚Â½sÃƒÂ¯Ã‚Â¿Ã‚Â½ÃƒÂ¯Ã‚Â¿Ã‚Â½,? ${reason} fired but audio still playing - this is an early event, waiting for real audio end`
    );
    console.log(
      `Audio state: paused=${audioEl.paused}, currentTime=${audioEl.currentTime}, readyState=${audioEl.readyState}`
    );

    let checkCount = 0;
    const maxChecks = 300;

    const checkAudioState = setInterval(() => {
      checkCount++;

      const stillPlaying =
        !audioEl.paused &&
        audioEl.currentTime > 0 &&
        audioEl.readyState >= 2 &&
        audioEl.srcObject !== null;

      const previousTime = audioEl.currentTime;

      setTimeout(() => {
        const timeAdvanced = audioEl.currentTime > previousTime;

        if (!stillPlaying || !timeAdvanced || checkCount >= maxChecks) {
          console.log(
            `ÃƒÂ¯Ã‚Â¿Ã‚Â½o. Audio actually finished playing (stillPlaying=${stillPlaying}, timeAdvanced=${timeAdvanced}, checks=${checkCount}), now stopping mouth animation`
          );
          clearInterval(checkAudioState);
          forceStopSpeaking(reason);
        }
      }, 50);
    }, 100);
  };

  session.on('agent_start' as any, () => {
    if (isVoiceDisabledNow()) {
      console.log('dY"ÃƒÂ¯Ã‚Â¿Ã‚Â½ Voice disabled: ignoring agent_start and silencing audio');
      try {
        (audioEl as any).muted = true;
        if (!audioEl.paused) audioEl.pause();
      } catch {}
      (window as any).__currentVoiceState = 'idle';
      setVoiceState('idle');
      return;
    }
    console.log('dY"ÃƒÂ¯Ã‚Â¿Ã‚Â½ agent_start - entering speaking state');
    markSpeaking();
  });

  session.on('transport_event' as any, (events: any) => {
    const eventArray = Array.isArray(events) ? events : [events];

    eventArray.forEach((event: any) => {
      if (event.type === 'output_audio_buffer.stopped') {
        if (isVoiceDisabledNow()) {
          console.log('dY"ÃƒÂ¯Ã‚Â¿Ã‚Â½ Voice disabled: ignoring output_audio_buffer.stopped event');
          return;
        }

        console.log(
          'dYZÃƒÂ¯Ã‚Â¿Ã‚Â½ output_audio_buffer.stopped - real audio finished, stopping mouth animation'
        );
        forceStopSpeaking('output_audio_buffer.stopped');
      }
    });
  });

  session.on('audio_stopped' as any, () => {
    console.log(
      'ÃƒÂ¯Ã‚Â¿Ã‚Â½?,ÃƒÂ¯Ã‚Â¿Ã‚Â½,? audio_stopped received (completely ignored) - will wait for output_audio_buffer.stopped'
    );
  });

  const possibleAudioEvents = ['audio', 'response.audio.delta', 'response.audio', 'conversation.item.audio'];
  possibleAudioEvents.forEach(eventName => {
    session.on(eventName as any, (audioData: any) => {
      if (isVoiceDisabledNow()) {
        console.log(`dY"ÃƒÂ¯Ã‚Â¿Ã‚Â½ Voice disabled: ignoring ${eventName} and pausing audio`);
        try {
          (audioEl as any).muted = true;
          if (!audioEl.paused) audioEl.pause();
        } catch {}
        (window as any).__currentVoiceState = 'idle';
        setVoiceState('idle');
        return;
      }
      console.log(`dYZÃƒÂ¯Ã‚Â¿Ã‚Â½ Event ${eventName} fired - starting mouth animation`);
      markSpeaking();
    });
  });

  const possibleDoneEvents = [
    'audio_done',
    'response.audio.done',
    'response.done',
    'conversation.item.done',
  ];
  possibleDoneEvents.forEach(eventName => {
    session.on(eventName as any, () => {
      console.log(
        `ÃƒÂ¯Ã‚Â¿Ã‚Â½>" Ignoring premature event ${eventName}; waiting for output_audio_buffer.stopped or audio element end`
      );
    });
  });

  session.on('response.created' as any, () => {
    console.log('dY"? Response created - AI is preparing to speak');
    debugSetVoiceState('thinking');

    setTimeout(() => {
      const currentState = (window as any).__currentVoiceState;
      if (currentState === 'thinking') {
        console.warn('dY"? Still in thinking state after 3s, checking audio element...');
        const audioElement = (window as any).__hexaAudioEl;
        if (audioElement && !audioElement.paused && audioElement.currentTime > 0) {
          console.log('dY"? Audio appears to be playing; forcing speaking state');
          if (startSpeaking) {
            startSpeaking();
          } else {
            setVoiceState('speaking');
          }
        }
      }
    }, 3000);
  });

  session.on('response.output_item.added' as any, (item: any) => {
    console.log('dY"? Response output item added:', item);
    const isAudio =
      item?.content_type === 'audio' ||
      item?.modality === 'audio' ||
      item?.type === 'audio' ||
      (Array.isArray(item?.content) && item.content.some((part: any) => part?.type === 'audio'));

    if (!isAudio) {
      return;
    }

    if (isVoiceDisabledNow()) {
      console.log('dY"? Voice disabled: ignoring audio output item');
      return;
    }

    console.log('dY"? Audio output item detected - entering speaking state');
    markSpeaking();
  });

  session.on('response.audio_transcript.done' as any, (data: any) => {
    console.log('dY"? Audio transcript done:', data);
    if (data?.transcript && !isVoiceDisabledNow()) {
      markSpeaking();
    }
  });


  session.on('response.content' as any, (content: any) => {
    console.log('dY"? Response content received:', content);
    if (content?.type === 'text' && !runtimeState.isCurrentlySpeaking) {
      console.log('dY"? Text response without audio yet - awaiting audio stream');
    }
  });

  session.on('error' as any, (error: any) => {
    // Handle array case - OpenAI SDK sometimes sends errors as arrays
    const errorObj = Array.isArray(error) ? error[0] : error;
    
    // Extract error code from nested structure (handle double nesting)
    const errorCode = errorObj?.error?.error?.code || errorObj?.error?.code || errorObj?.code || '';
    const errorType = errorObj?.error?.type || errorObj?.type || '';
    const errorMessage = errorObj?.error?.message || errorObj?.message || 'No message provided';
    
    // List of non-critical error codes that should be ignored or downgraded to warnings
    const nonCriticalErrorCodes = [
      'response_cancel_not_active',  // Trying to cancel when there's no active response
      'response_cancel_failed',      // Similar cancellation issues
      'invalid_value',               // Invalid API command (e.g., response.cancel_all in newer SDK)
    ];
    
    // Check if this is a non-critical error
    if (nonCriticalErrorCodes.includes(errorCode)) {
      console.warn('⚠️ Non-critical OpenAI session notice:', {
        code: errorCode,
        type: errorType,
        message: errorMessage
      });
      // Don't set error state for non-critical errors
      return;
    }
    
    // For critical errors, log and set error state
    console.error('ÏżŇ?O OpenAI session error:', error);
    debugSetVoiceState('error');
  });
};
