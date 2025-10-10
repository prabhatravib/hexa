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
    setMouthTarget(0);
    resetMouth();
    setSpeechIntensity(0);
    emaAccumulatorRef.current = 0;
    lastTargetRef.current = 0;
  }, [resetMouth, setMouthTarget, setSpeechIntensity]);

  useEffect(() => {
    globalHandleSilence = handleImmediateSilence;
    return () => {
      if (globalHandleSilence === handleImmediateSilence) {
        globalHandleSilence = null;
      }
    };
  }, [handleImmediateSilence]);

  // Mouth animation based on voiceState
  const startMouthAnimation = useCallback(() => {
    if (mouthAnimationRafRef.current) return; // Already running
    
    let frameCount = 0;
    let lastAnalyzerUpdateCheck = Date.now();
    
    const animate = () => {
      frameCount++;
      
      if (silenceDetectedRef.current) {
        mouthAnimationRafRef.current = null;
        setMouthTarget(0);
        resetMouth();
        return;
      }
      
      // Check current state from store
      const currentState = useAnimationStore.getState().voiceState;
      
      if (currentState !== 'speaking') {
        mouthAnimationRafRef.current = null;
        setMouthTarget(0);
        resetMouth();
        return;
      }
      
      // Check if analyzer is providing updates (instead of arbitrary time limit)
      const now = Date.now();
      if (now - lastAnalyzerUpdateCheck > 2000) { // Check every 2 seconds
        lastAnalyzerUpdateCheck = now;
        const store = useAnimationStore.getState();
        const lastUpdate = store.mouthTargetUpdatedAt || 0;
        const staleDuration = now - lastUpdate;
        
        // Only stop if analyzer hasn't updated in 30+ seconds AND we've been running for a while
        // This allows long responses to continue with fallback animation
        if (staleDuration > 30000 && frameCount > 60) {
          console.warn('⚠️ Fallback animation: No analyzer updates for 30s, stopping');
          mouthAnimationRafRef.current = null;
          setMouthTarget(0);
          resetMouth();
          useAnimationStore.getState().stopSpeaking();
          return;
        }
      }
      
      // Generate smooth mouth movement as fallback
      // This will be overridden by analyzer data when available
      const t = performance.now() / 1000;
      const base = 0.35;
      const amp = 0.25;
      const value = base + Math.max(0, Math.sin(t * 6.0)) * amp;
      setMouthTarget(value);
      
      mouthAnimationRafRef.current = requestAnimationFrame(animate);
    };
    
    mouthAnimationRafRef.current = requestAnimationFrame(animate);
  }, [setMouthTarget, resetMouth]);

  const stopMouthAnimation = useCallback(() => {
    if (mouthAnimationRafRef.current) {
      cancelAnimationFrame(mouthAnimationRafRef.current);
      mouthAnimationRafRef.current = null;
    }
  }, []);

  // Start/stop animation based on voiceState
  useEffect(() => {
    if (voiceState === 'speaking') {
      // When speaking starts, ensure EMA is ready
      if (emaAccumulatorRef.current === 0) {
        emaAccumulatorRef.current = 0.1;
      }
      silenceDetectedRef.current = false;
      startMouthAnimation();
    } else {
      // When not speaking, stop and reset
      stopMouthAnimation();
      resetMouth();
      setMouthTarget(0);
      setSpeechIntensity(0);
      emaAccumulatorRef.current = 0;
      lastTargetRef.current = 0;
    }
    
    return () => {
      stopMouthAnimation();
    };
  }, [voiceState, resetMouth, setMouthTarget, setSpeechIntensity, startMouthAnimation, stopMouthAnimation]);

  // Enhanced speech intensity handler with mouth target updates
  const handleSpeechIntensity = useCallback((rawIntensity: number) => {
    // Update legacy speech intensity for backward compatibility
    setSpeechIntensity(rawIntensity);
    
    // Process mouth targets for all intensity levels (including zero)
    // The WebRTC session will call this during audio playback
    const processedIntensity = processSpeechIntensity(rawIntensity);
    updateMouthTarget(processedIntensity);
  }, [setSpeechIntensity, processSpeechIntensity, updateMouthTarget]);

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
