import { initializeAudioAnalysis, stopAudioAnalysis } from './voiceAudioAnalysis';
import { useAnimationStore, VoiceState } from '@/store/animationStore';



interface AudioElementHandlersOptions {
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
}

export const setupAudioElementHandlers = (
  audioEl: HTMLAudioElement, 
  handlers: AudioElementHandlersOptions
) => {
  const { setVoiceState, startSpeaking, stopSpeaking, setSpeechIntensity } = handlers;
  
  // Track audio element state for mouth animation
  let audioPlaying = false;
  let analysisStarted = false;
  let audioDurationTimeout: NodeJS.Timeout | null = null;
  let lastForcedIdleAt = 0;
  let lastHandledEnergyTs = 0;
  let lastVoiceState: VoiceState = 'idle';
  
  // Fallback: ensure analyser is running even if remote_track isn't emitted
  audioEl.addEventListener('playing', async () => {
    if (useAnimationStore.getState().isVoiceDisabled) {
      console.log('🔇 Voice disabled: pausing audio element on playing');
      try { (audioEl as any).muted = true; if (!audioEl.paused) audioEl.pause(); } catch {}
      (window as any).__currentVoiceState = 'idle';
      setVoiceState('idle');
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
    if (!analysisStarted) {
      console.log('🎵 Starting analysis with MediaElementSource');
      await initializeAudioAnalysis(null, audioEl, {
        audioContextRef: undefined,
        setSpeechIntensity,
        startSpeaking,
        stopSpeaking,
        setVoiceState
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

      if (now - lastForcedIdleAt < 250) {
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
      console.log('⚠️ Audio playing with recent energy; re-entering speaking state');
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
    
    // Stop the audio analyzer
    stopAudioAnalysis();
    
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
    
    // Reset VAD flag and mouth animation target (SSR-safe)
    try {
      const store = useAnimationStore.getState();
      if (store.setVadSpeaking) {
        store.setVadSpeaking(false);
      }
      if (store.setMouthTarget) {
        store.setMouthTarget(0);
      }
    } catch (error) {
      // Store not available, ignore
    }
    
    // Stop the audio analyzer
    stopAudioAnalysis();
    
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
    
    // Stop the audio analyzer
    stopAudioAnalysis();
    
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
    
    // Stop the audio analyzer
    stopAudioAnalysis();
    
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
