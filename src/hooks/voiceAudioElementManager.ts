import type { MutableRefObject } from 'react';
import { initializeAudioAnalysis, resetAudioAnalysis, stopAudioAnalysis } from './voiceAudioAnalysis';
import { useAnimationStore, VoiceState } from '@/store/animationStore';

/**
 * Validates that an audio element has a valid, active audio stream.
 * This prevents starting animation/analysis when no real audio is present.
 *
 * @param audioEl - The HTML audio element to validate
 * @returns true if the audio element has active audio tracks, false otherwise
 */
export const isAudioStreamValid = (audioEl: HTMLAudioElement): boolean => {
  // Check if srcObject exists
  if (!audioEl.srcObject) {
    console.log('🔍 Audio stream validation failed: No srcObject');
    return false;
  }

  // Check if srcObject is a MediaStream
  if (!(audioEl.srcObject instanceof MediaStream)) {
    console.log('🔍 Audio stream validation failed: srcObject is not a MediaStream');
    return false;
  }

  // Get audio tracks from the stream
  const audioTracks = audioEl.srcObject.getAudioTracks();
  if (audioTracks.length === 0) {
    console.log('🔍 Audio stream validation failed: No audio tracks in MediaStream');
    return false;
  }

  // Check if at least one track is enabled, live, and not muted
  const hasLiveTrack = audioTracks.some(track =>
    track.enabled &&
    track.readyState === 'live' &&
    track.muted === false
  );

  if (!hasLiveTrack) {
    console.log('🔍 Audio stream validation failed: No live, enabled, unmuted tracks');
    return false;
  }

  console.log('✅ Audio stream validation passed: Stream has active audio tracks');
  return true;
};

/**
 * Monitors MediaStream audio tracks for events that indicate audio has stopped.
 * When a track ends or is muted, triggers the provided callback to stop animation.
 *
 * @param stream - The MediaStream to monitor
 * @param onTrackStopped - Callback to invoke when any audio track stops/mutes
 * @returns Cleanup function to remove event listeners
 */
export const monitorAudioTracks = (
  stream: MediaStream,
  onTrackStopped: () => void
): (() => void) => {
  const audioTracks = stream.getAudioTracks();
  const cleanupFunctions: (() => void)[] = [];

  audioTracks.forEach((track, index) => {
    console.log(`🎧 Monitoring audio track ${index}: ${track.id} (state: ${track.readyState})`);

    // Handle track ended event
    const handleEnded = () => {
      console.log(`🔇 Audio track ${index} ended: ${track.id}`);
      onTrackStopped();
    };

    // Handle track mute event
    const handleMute = () => {
      console.log(`🔇 Audio track ${index} muted: ${track.id}`);
      onTrackStopped();
    };

    track.addEventListener('ended', handleEnded);
    track.addEventListener('mute', handleMute);

    // Store cleanup functions
    cleanupFunctions.push(() => {
      track.removeEventListener('ended', handleEnded);
      track.removeEventListener('mute', handleMute);
    });
  });

  // Return cleanup function that removes all listeners
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
  };
};

interface AudioElementHandlersOptions {
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: MutableRefObject<AudioContext | null>;
}

export const setupAudioElementHandlers = (
  audioEl: HTMLAudioElement,
  handlers: AudioElementHandlersOptions
) => {
  const {
    setVoiceState,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity,
    audioContextRef,
  } = handlers;

  // Track audio element state for mouth animation
  let audioPlaying = false;
  let analysisStarted = false;
  let audioDurationTimeout: NodeJS.Timeout | null = null;
  let lastForcedIdleAt = 0;
  let lastHandledEnergyTs = 0;
  let lastVoiceState: VoiceState = 'idle';
  let trackMonitorCleanup: (() => void) | null = null;
  let lastTransportStopAt = 0; // Track when transport stop events occur

  // Expose transport stop tracker globally for coordination with transport event handlers
  (window as any).__notifyTransportStop = () => {
    lastTransportStopAt = Date.now();
    console.log('📡 Transport stop notified to audio element manager');
  };

  // Expose audio element pause function for watchdog coordination
  (window as any).__pauseAudioElement = () => {
    if (audioEl && !audioEl.paused) {
      try {
        audioEl.pause();
        console.log('🔇 Audio element paused by external trigger (watchdog)');
      } catch (error) {
        console.error('Failed to pause audio element externally:', error);
      }
    }
  };

  // Fallback: ensure analyser is running even if remote_track isn't emitted
  audioEl.addEventListener('playing', async () => {
    if (useAnimationStore.getState().isVoiceDisabled) {
      console.log('🔇 Voice disabled: pausing audio element on playing');
      try { (audioEl as any).muted = true; if (!audioEl.paused) audioEl.pause(); } catch {}
      (window as any).__currentVoiceState = 'idle';
      setVoiceState('idle');
      return;
    }

    // STRICT VALIDATION: Verify audio stream is valid before starting animation
    if (!isAudioStreamValid(audioEl)) {
      console.warn('⚠️ Audio playing event fired but stream validation failed - not starting animation');
      useAnimationStore.getState().setAudioPlaying(false);
      return;
    }

    console.log('🎵 Audio playing - ensuring analyser is running and mouth animating');
    console.log('🎵 Audio element state during playing:', {
      srcObject: audioEl.srcObject,
      readyState: audioEl.readyState,
      paused: audioEl.paused,
      currentTime: audioEl.currentTime
    });
    audioPlaying = true;
    useAnimationStore.getState().setAudioPlaying(true);

    // Set up audio track monitoring for this stream
    if (audioEl.srcObject instanceof MediaStream) {
      // Clean up previous monitor if exists
      if (trackMonitorCleanup) {
        trackMonitorCleanup();
        trackMonitorCleanup = null;
      }

      // Start monitoring audio tracks
      trackMonitorCleanup = monitorAudioTracks(audioEl.srcObject, () => {
        console.log('🔇 Audio track stopped - forcing idle state');
        audioPlaying = false;
        analysisStarted = false;
        useAnimationStore.getState().setAudioPlaying(false);
        resetAudioAnalysis();
        if (stopSpeaking) {
          stopSpeaking();
        } else {
          setVoiceState('idle');
        }
        (window as any).__currentVoiceState = 'idle';
      });
    }

    if (!analysisStarted) {
      const stream =
        audioEl.srcObject instanceof MediaStream ? (audioEl.srcObject as MediaStream) : null;
      console.log(
        `🎵 Starting analysis with ${stream ? 'MediaStream source' : 'MediaElementSource'}`
      );
      await initializeAudioAnalysis(stream, audioEl, {
        audioContextRef,
        setSpeechIntensity,
        startSpeaking,
        stopSpeaking,
        setVoiceState,
      });
    } else {
      console.log('🎵 Analysis already started, skipping');
    }
    // Always trigger speaking state when audio is playing
    if (startSpeaking) {
      startSpeaking();
    } else {
      setVoiceState('speaking');
    }
  });
  
  // Also handle play event
  audioEl.addEventListener('play', () => {
    if (useAnimationStore.getState().isVoiceDisabled) {
      console.log('🔇 Voice disabled: pausing audio element on play');
      try { (audioEl as any).muted = true; if (!audioEl.paused) audioEl.pause(); } catch {}
      (window as any).__currentVoiceState = 'idle';
      setVoiceState('idle');
      return;
    }

    // STRICT VALIDATION: Verify audio stream is valid before starting animation
    if (!isAudioStreamValid(audioEl)) {
      console.warn('⚠️ Audio play event fired but stream validation failed - not starting animation');
      return;
    }

    console.log('🎵 Audio play event - starting mouth animation');
    audioPlaying = true;
    if (startSpeaking) {
      startSpeaking();
    } else {
      setVoiceState('speaking');
    }
  });
  
  // Monitor time updates to ensure mouth stays animated during playback
  audioEl.addEventListener('timeupdate', () => {
    if (!audioPlaying || audioEl.paused || audioEl.currentTime <= 0) {
      return;
    }

    // Log audio playback progress occasionally
    if (Math.random() < 0.01) {
      console.log(`🎵 Audio playing: time=${audioEl.currentTime.toFixed(2)}s, duration=${audioEl.duration.toFixed(2)}s`);
    }
    
    const store = useAnimationStore.getState();
    const now = Date.now();
    const lastMouthMotion = store.mouthTargetUpdatedAt || 0;
    const speechIntensity = store.speechIntensity || 0;
    const vadSpeaking = !!store.vadSpeaking;
    const energyAge = lastMouthMotion > 0 ? now - lastMouthMotion : Number.POSITIVE_INFINITY;
    const hasRecentAnalyzerEnergy = energyAge < 900;
    const currentState = store.voiceState;
    const prevState = lastVoiceState;
    lastVoiceState = currentState;

    const hasLiveEnergy =
      vadSpeaking ||
      speechIntensity > 0.015 ||
      hasRecentAnalyzerEnergy;

    if (currentState !== 'speaking') {
      if (prevState === 'speaking') {
        lastForcedIdleAt = now;
        lastHandledEnergyTs = Math.max(lastHandledEnergyTs, lastMouthMotion);
      }

      // INCREASED COOLDOWN: Changed from 250ms to 1000ms
      // This prevents recovery logic from overriding authoritative transport stop events
      // during buffered audio playback. 1 second is long enough to prevent false recoveries
      // from buffered audio, yet short enough to catch genuinely missed events.
      if (now - lastForcedIdleAt < 1000) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`⏸️ Cooldown active: ${now - lastForcedIdleAt}ms since forced idle (threshold: 1000ms)`);
        }
        return;
      }

      // ADDITIONAL CHECK: Respect transport stop events with extended cooldown
      // If a transport stop event occurred recently, don't allow recovery for longer
      const timeSinceTransportStop = lastTransportStopAt > 0 ? now - lastTransportStopAt : Number.POSITIVE_INFINITY;
      if (timeSinceTransportStop < 1000) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`⏸️ Transport stop cooldown active: ${timeSinceTransportStop}ms since transport stop`);
        }
        return;
      }

      if (!hasLiveEnergy) {
        lastHandledEnergyTs = Math.max(lastHandledEnergyTs, lastMouthMotion);
        return;
      }

      if (lastMouthMotion <= lastHandledEnergyTs) {
        lastHandledEnergyTs = Math.max(lastHandledEnergyTs, lastMouthMotion);
        return;
      }

      lastHandledEnergyTs = lastMouthMotion;
      console.log('⚠️ Audio playing with recent energy; re-entering speaking state (cooldown expired)');
      if (startSpeaking) {
        startSpeaking();
      } else {
        setVoiceState('speaking');
      }
      return;
    }

    const analyzerFullySilent = !vadSpeaking && speechIntensity < 0.01 && !hasRecentAnalyzerEnergy;

    if (analyzerFullySilent && energyAge > 2000) {
      if (now - lastForcedIdleAt < 500) {
        return;
      }
      lastForcedIdleAt = now;
      lastHandledEnergyTs = Math.max(lastHandledEnergyTs, lastMouthMotion);
      console.warn('⚠️ Audio element playing but analyzer silent - forcing idle state');
      setSpeechIntensity?.(0);
      if (stopSpeaking) {
        stopSpeaking();
      } else {
        setVoiceState('idle');
      }
      (window as any).__currentVoiceState = 'idle';
    }
  });
  
  // Add duration tracking to know when audio should end
  audioEl.addEventListener('loadedmetadata', () => {
    console.log('🎵 Audio metadata loaded, duration:', audioEl.duration);
    
    // Set a timeout based on audio duration to ensure stopping
    if (audioEl.duration && isFinite(audioEl.duration)) {
      if (audioDurationTimeout) clearTimeout(audioDurationTimeout);
      
      audioDurationTimeout = setTimeout(() => {
        console.log('⏰ Audio duration timeout reached, forcing stop');
        if (stopSpeaking) stopSpeaking();
        setVoiceState('idle');
      }, (audioEl.duration + 1) * 1000); // Add 1 second buffer
    }
  });

  // Clear timeout when audio actually ends
  audioEl.addEventListener('ended', () => {
    console.log('🔇 Audio ended - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);

    // Clean up track monitoring
    if (trackMonitorCleanup) {
      trackMonitorCleanup();
      trackMonitorCleanup = null;
    }

    // Reset mouth animation target (SSR-safe)
    try {
      const store = useAnimationStore.getState();
      store.setAudioPlaying(false);
      if (store.setMouthTarget) {
        store.setMouthTarget(0);
      }
    } catch (error) {
      // Store not available, ignore
    }

    // Stop the audio analyzer completely
    resetAudioAnalysis();

    // Force stop speaking state
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }

    // Update global state for debugging
    (window as any).__currentVoiceState = 'idle';

    // Record latest idle transition for playback guard
    try {
      const storeState = useAnimationStore.getState();
      lastHandledEnergyTs = Math.max(lastHandledEnergyTs, storeState.mouthTargetUpdatedAt || 0);
    } catch {}
    lastVoiceState = 'idle';
    lastForcedIdleAt = Date.now();

    // Clear duration timeout
    if (audioDurationTimeout) {
      clearTimeout(audioDurationTimeout);
      audioDurationTimeout = null;
    }
  });

  audioEl.addEventListener('pause', () => {
    console.log('🔇 Audio paused - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);

    // Clean up track monitoring
    if (trackMonitorCleanup) {
      trackMonitorCleanup();
      trackMonitorCleanup = null;
    }

    // Stop the audio analyzer completely
    resetAudioAnalysis();

    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }

    (window as any).__currentVoiceState = 'idle';

    // Record latest idle transition for playback guard
    try {
      const storeState = useAnimationStore.getState();
      lastHandledEnergyTs = Math.max(lastHandledEnergyTs, storeState.mouthTargetUpdatedAt || 0);
    } catch {}
    lastVoiceState = 'idle';
    lastForcedIdleAt = Date.now();
  });

  audioEl.addEventListener('emptied', () => {
    console.log('🔇 Audio emptied - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    // Reset mouth animation target (SSR-safe)
    try {
      const store = useAnimationStore.getState();
      store.setAudioPlaying(false);
      if (store.setMouthTarget) {
        store.setMouthTarget(0);
      }
    } catch (error) {
      // Store not available, ignore
    }

    // Stop the audio analyzer completely
    resetAudioAnalysis();
    
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    
    (window as any).__currentVoiceState = 'idle';

    // Record latest idle transition for playback guard
    try {
      const storeState = useAnimationStore.getState();
      lastHandledEnergyTs = Math.max(lastHandledEnergyTs, storeState.mouthTargetUpdatedAt || 0);
    } catch {}
    lastVoiceState = 'idle';
    lastForcedIdleAt = Date.now();
  });

  // Add error handler to stop animation on audio errors
  audioEl.addEventListener('error', (e) => {
    console.log('❌ Audio error - stopping speech and mouth animation', e);
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    // Reset mouth animation target (SSR-safe)
    try {
      const store = useAnimationStore.getState();
      store.setAudioPlaying(false);
      if (store.setMouthTarget) {
        store.setMouthTarget(0);
      }
    } catch (error) {
      // Store not available, ignore
    }

    // Stop the audio analyzer completely
    resetAudioAnalysis();
    
    if (stopSpeaking) stopSpeaking();
    (window as any).__currentVoiceState = 'idle';

    // Record latest idle transition for playback guard
    try {
      const storeState = useAnimationStore.getState();
      lastHandledEnergyTs = Math.max(lastHandledEnergyTs, storeState.mouthTargetUpdatedAt || 0);
    } catch {}
    lastVoiceState = 'idle';
    lastForcedIdleAt = Date.now();
  });
};
