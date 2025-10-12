import { useEffect, useRef, useCallback } from 'react';
import { useAnimationStore } from '@/store/animationStore';

// Global reference for immediate control from non-React modules
let globalHandleSilence: (() => void) | null = null;

export const useVoiceAnimation = () => {
  const {
    setVoiceState,
    setVoiceActive,
    setSpeaking,
    setSpeechIntensity,
    setMouthTarget,
    resetMouth,
    voiceState,
    isAudioPlaying,
    speechIntensity: storeSpeechIntensity,
    vadSpeaking,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking,
    setInitializationState,
  } = useAnimationStore();

  // Shared AudioContext for all analysis and playback; resumed on user gesture
  const audioContextRef = useRef<AudioContext | null>(null);

  // Speech intensity smoothing and mouth target management
  const emaAccumulatorRef = useRef(0); // EMA accumulator for speech intensity
  const lastUpdateTimeRef = useRef(0); // Last store update time for throttling
  const lastTargetRef = useRef(0); // Last target value for change-based throttling
  const silenceDetectedRef = useRef(false);
  const mouthAnimationRafRef = useRef<number | null>(null);
  const latestIntensityRef = useRef(0);
  const lastEnergySampleTimeRef = useRef(0); // Timestamp of last analyzer energy sample
  
  // Performance instrumentation
  const performanceRef = useRef({
    writeCount: 0,
    lastWriteTime: Date.now(),
    maxDelta: 0,
    lastTarget: 0
  });
  
  // Speech intensity processing with EMA smoothing and perceptual shaping
  const processSpeechIntensity = useCallback((rawIntensity: number) => {
    const alpha = 0.3; // EMA smoothing factor
    const clampedIntensity = Math.max(0, Math.min(1, rawIntensity));
    
    // Apply EMA smoothing: new = α * current + (1-α) * previous
    emaAccumulatorRef.current = alpha * clampedIntensity + (1 - alpha) * emaAccumulatorRef.current;
    
    // Apply perceptual shaping curve: x^0.65 to widen midrange openness
    const shapedIntensity = Math.pow(emaAccumulatorRef.current, 0.65);
    
    return shapedIntensity;
  }, []);

  // Throttled mouth target update (max 30 Hz or when change > 0.02)
  const updateMouthTarget = useCallback((target: number) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    const targetChange = Math.abs(target - lastTargetRef.current);
    
    // Update if 33ms have passed (30 Hz) OR if change is significant (>0.02)
    if (timeSinceLastUpdate >= 33 || targetChange > 0.02) {
      setMouthTarget(target);
      lastUpdateTimeRef.current = now;
      lastTargetRef.current = target;
      
      // Performance instrumentation
      performanceRef.current.writeCount++;
      performanceRef.current.lastWriteTime = now;
      
      // Track max delta between target and current
      const delta = Math.abs(target - performanceRef.current.lastTarget);
      if (delta > performanceRef.current.maxDelta) {
        performanceRef.current.maxDelta = delta;
      }
      performanceRef.current.lastTarget = target;
      
      if (process.env.NODE_ENV === 'development') {
        // console.log(`🎯 Mouth target updated: ${target.toFixed(3)} (${timeSinceLastUpdate}ms since last update)`);
        
        // Log performance stats every 10 writes
        if (performanceRef.current.writeCount % 10 === 0) {
          const timeSinceStart = now - performanceRef.current.lastWriteTime;
          const writesPerSecond = (performanceRef.current.writeCount / timeSinceStart) * 1000;
          // console.log(`📊 Performance: ${writesPerSecond.toFixed(1)} writes/sec, Max delta: ${performanceRef.current.maxDelta.toFixed(3)}`);
        }
      }
    }
  }, [setMouthTarget]);

  const handleImmediateSilence = useCallback(() => {
    silenceDetectedRef.current = true;
    lastEnergySampleTimeRef.current = 0;
    latestIntensityRef.current = 0;
    setMouthTarget(0);
    resetMouth();
    setSpeechIntensity(0);
    emaAccumulatorRef.current = 0;
    lastTargetRef.current = 0;
    lastUpdateTimeRef.current = Date.now();
    if (mouthAnimationRafRef.current) {
      cancelAnimationFrame(mouthAnimationRafRef.current);
      mouthAnimationRafRef.current = null;
    }
  }, [resetMouth, setMouthTarget, setSpeechIntensity]);

  useEffect(() => {
    globalHandleSilence = handleImmediateSilence;
    return () => {
      if (globalHandleSilence === handleImmediateSilence) {
        globalHandleSilence = null;
      }
    };
  }, [handleImmediateSilence]);

  const startMouthAnimation = useCallback(() => {
    if (mouthAnimationRafRef.current) return;
    silenceDetectedRef.current = false;

    const animate = () => {
      if (silenceDetectedRef.current) {
        mouthAnimationRafRef.current = null;
        setMouthTarget(0);
        resetMouth();
        return;
      }

      const storeState = useAnimationStore.getState();
      const allowAnimation =
        storeState.voiceState === 'speaking' ||
        storeState.vadSpeaking ||
        storeState.isAudioPlaying;

      if (!allowAnimation) {
        mouthAnimationRafRef.current = null;
        setMouthTarget(0);
        resetMouth();
        return;
      }

      const now = performance.now() / 1000;
      const energy = Math.max(0, Math.min(1, latestIntensityRef.current));

      const base = 0.18 + energy * 0.55;
      const amplitude = 0.15 + energy * 0.45;
      const frequency = 4.2 + energy * 4.5;
      const wave = Math.max(0, Math.sin(now * frequency));
      const dynamicTarget = Math.min(1, base + wave * amplitude);

      updateMouthTarget(dynamicTarget);

      mouthAnimationRafRef.current = requestAnimationFrame(animate);
    };

    mouthAnimationRafRef.current = requestAnimationFrame(animate);
  }, [resetMouth, setMouthTarget, updateMouthTarget]);

  const stopMouthAnimation = useCallback(() => {
    if (mouthAnimationRafRef.current) {
      cancelAnimationFrame(mouthAnimationRafRef.current);
      mouthAnimationRafRef.current = null;
    }
  }, []);

  // Watch voice state to prime smoothing and clamp mouth when not speaking
  useEffect(() => {
    const shouldAnimate =
      voiceState === 'speaking' ||
      vadSpeaking ||
      isAudioPlaying;

    if (shouldAnimate) {
      if (emaAccumulatorRef.current === 0) {
        emaAccumulatorRef.current = 0.1;
      }
      silenceDetectedRef.current = false;
      lastUpdateTimeRef.current = Date.now();
      if (lastEnergySampleTimeRef.current === 0) {
        lastEnergySampleTimeRef.current = Date.now();
      }
      startMouthAnimation();
      return;
    }

    handleImmediateSilence();
    stopMouthAnimation();
  }, [
    voiceState,
    vadSpeaking,
    isAudioPlaying,
    handleImmediateSilence,
    startMouthAnimation,
    stopMouthAnimation
  ]);

  // Watchdog: if analyzer stops updating while we're in speaking state, force silence
  // FIXED: Single 250ms timeout for all interactions - no special case for first load
  useEffect(() => {
    const shouldWatch =
      voiceState === 'speaking' ||
      vadSpeaking ||
      isAudioPlaying;

    if (!shouldWatch) {
      return;
    }

    const SILENCE_TIMEOUT = 500; // Single timeout for all interactions
    const WATCHDOG_CHECK_INTERVAL = 100; // Check every 100ms

    if (process.env.NODE_ENV === 'development') {
      console.log(`🐕 Watchdog monitoring with ${SILENCE_TIMEOUT}ms timeout`);
    }

    const watchdogInterval = window.setInterval(() => {
      const now = Date.now();
      const energyAge = lastEnergySampleTimeRef.current
        ? now - lastEnergySampleTimeRef.current
        : Number.POSITIVE_INFINITY;

      // Get current store state for audio playing check
      const storeState = useAnimationStore.getState();
      const hasStoreEnergy = vadSpeaking || storeSpeechIntensity > 0.02;
      const hasCurrentAudio = hasStoreEnergy || storeState.isAudioPlaying;

      // DEFENSIVE CHECK: Verify actual audio element state directly
      // This catches cases where store state might be stale or incorrect
      let audioElementActuallyPlaying = false;
      try {
        const audioEl = (window as any).__hexaAudioEl as HTMLAudioElement | undefined;
        if (audioEl) {
          // Check if audio element is actually playing and has valid source
          audioElementActuallyPlaying =
            !audioEl.paused &&
            audioEl.srcObject !== null &&
            audioEl.readyState >= 2; // HAVE_CURRENT_DATA or higher

          if (audioElementActuallyPlaying && process.env.NODE_ENV === 'development') {
            console.log(`🐕 Watchdog: Audio element is actually playing (paused=${audioEl.paused}, readyState=${audioEl.readyState})`);
          }
        }
      } catch (error) {
        console.error('Watchdog failed to check audio element state:', error);
      }

      // CRITICAL FIX: If audio is actually playing (either store says so OR element check confirms), don't fire watchdog
      // This prevents premature timeout when audio is playing but analyzer hasn't warmed up yet
      if (hasCurrentAudio || audioElementActuallyPlaying) {
        return;
      }

      // Force silence if no audio energy detected for SILENCE_TIMEOUT
      if (energyAge > SILENCE_TIMEOUT) {
        console.log(`🐕 Watchdog triggered: No audio energy for ${energyAge}ms (threshold: ${SILENCE_TIMEOUT}ms)`);

        // CRITICAL: Also pause the audio element to ensure consistency
        // This prevents the audio element from continuing to play while animation stops
        try {
          if ((window as any).__pauseAudioElement) {
            (window as any).__pauseAudioElement();
            console.log('🐕 Watchdog paused audio element for consistency');
          }
        } catch (error) {
          console.error('Watchdog failed to pause audio element:', error);
        }

        handleImmediateSilence();
      }
    }, WATCHDOG_CHECK_INTERVAL);

    return () => {
      window.clearInterval(watchdogInterval);
    };
  }, [voiceState, vadSpeaking, storeSpeechIntensity, isAudioPlaying, handleImmediateSilence]);

  // Enhanced speech intensity handler with mouth target updates
  const handleSpeechIntensity = useCallback((rawIntensity: number) => {
    // Update legacy speech intensity for backward compatibility
    setSpeechIntensity(rawIntensity);
    
    const processedIntensity = processSpeechIntensity(rawIntensity);
    latestIntensityRef.current = processedIntensity;
    const storeState = useAnimationStore.getState();

    const shouldAnimate =
      storeState.voiceState === 'speaking' ||
      storeState.vadSpeaking ||
      storeState.isAudioPlaying;

    if (shouldAnimate) {
      if (rawIntensity > 0.002 || processedIntensity > 0.002) {
        lastEnergySampleTimeRef.current = Date.now();
      }
      silenceDetectedRef.current = false;
      if (!mouthAnimationRafRef.current) {
        startMouthAnimation();
      }

      const expressiveFloor = 0.14;
      const expressiveScale = 0.78;

      const expressiveTarget =
        rawIntensity > 0.002 || processedIntensity > 0.01
          ? Math.min(1, expressiveFloor + processedIntensity * expressiveScale)
          : processedIntensity * 0.45;

      updateMouthTarget(expressiveTarget);
    } else if (!silenceDetectedRef.current) {
      handleImmediateSilence();
    }
  }, [
    setSpeechIntensity,
    processSpeechIntensity,
    updateMouthTarget,
    handleImmediateSilence,
    startMouthAnimation
  ]);

  return {
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
  };
};

export const handleSilenceImmediately = () => {
  if (globalHandleSilence) {
    globalHandleSilence();
  }
};
