import { initializeAudioAnalysis, stopAudioAnalysis } from './voiceAudioAnalysis';
import { useAnimationStore } from '@/store/animationStore';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

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
  let lastMouthUpdateTime = Date.now();
  
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
    if (audioPlaying && !audioEl.paused && audioEl.currentTime > 0) {
      // Log audio playback progress occasionally
      if (Math.random() < 0.01) {
        console.log(`🎵 Audio playing: time=${audioEl.currentTime.toFixed(2)}s, duration=${audioEl.duration.toFixed(2)}s`);
      }
      
      const store = useAnimationStore.getState();
      const currentState = (window as any).__currentVoiceState;
      const vadSpeaking = store.vadSpeaking;
      const mouthTarget = store.mouthOpennessTarget;
      
      // Check 1: Ensure we're in speaking state while audio is playing
      if (currentState !== 'speaking') {
        console.log('⚠️ Audio playing but not in speaking state, fixing...');
        if (startSpeaking) {
          startSpeaking();
        } else {
          setVoiceState('speaking');
        }
      }
      
      // Check 2: Watchdog - If VAD detects speech but mouth isn't moving, restart animation
      const timeSinceLastCheck = Date.now() - lastMouthUpdateTime;
      if (vadSpeaking && mouthTarget < 0.05 && currentState === 'speaking' && timeSinceLastCheck > 300) {
        console.log('⚠️ VAD detects speech but mouth stuck at', mouthTarget.toFixed(3), '- restarting animation');
        if (startSpeaking) {
          startSpeaking();
        }
        lastMouthUpdateTime = Date.now(); // Reset timer to avoid spam
      }
      
      // Update mouth check timer if mouth is moving
      if (mouthTarget > 0.05) {
        lastMouthUpdateTime = Date.now();
      }
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
    
    // Reset mouth animation target (SSR-safe)
    try {
      const store = useAnimationStore.getState();
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
  });

  audioEl.addEventListener('emptied', () => {
    console.log('🔇 Audio emptied - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    // Reset mouth animation target (SSR-safe)
    try {
      const store = useAnimationStore.getState();
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
  });
};
