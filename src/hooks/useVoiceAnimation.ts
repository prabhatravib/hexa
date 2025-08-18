import { useEffect, useRef, useCallback } from 'react';
import { useAnimationStore } from '@/store/animationStore';

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
  const lastAnalyzerWriteRef = useRef(0); // Last time real analyser updated the mouth
  const fallbackFlapRafRef = useRef<number | null>(null); // RAF id for synthetic flap
  
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
        console.log(`🎯 Mouth target updated: ${target.toFixed(3)} (${timeSinceLastUpdate}ms since last update)`);
        
        // Log performance stats every 10 writes
        if (performanceRef.current.writeCount % 10 === 0) {
          const timeSinceStart = now - performanceRef.current.lastWriteTime;
          const writesPerSecond = (performanceRef.current.writeCount / timeSinceStart) * 1000;
          console.log(`📊 Performance: ${writesPerSecond.toFixed(1)} writes/sec, Max delta: ${performanceRef.current.maxDelta.toFixed(3)}`);
        }
      }
    }
  }, [setMouthTarget]);

  const stopFallbackFlap = useCallback(() => {
    if (fallbackFlapRafRef.current) {
      console.log('🎯 Stopping fallback flap animation');
      cancelAnimationFrame(fallbackFlapRafRef.current);
      fallbackFlapRafRef.current = null;
      // Reset mouth to closed position
      setMouthTarget(0);
      resetMouth();
    }
  }, [setMouthTarget, resetMouth]);

  // Fallback: If we are in 'speaking' but no analyser updates are coming, drive a synthetic flap
  const startFallbackFlap = useCallback(() => {
    // Always stop any existing flap first
    stopFallbackFlap();
    
    console.log('🎯 Starting fallback flap animation');
    
    let frameCount = 0;
    const maxFrames = 1200; // 20 seconds maximum for very long responses
    
    const loop = () => {
      frameCount++;
      
      // Check current state from store directly
      const currentState = useAnimationStore.getState().voiceState;
      
      // Stop only if voice state changes or we hit max frames
      if (currentState !== 'speaking' || frameCount > maxFrames) {
        console.log(`🎯 Stopping fallback flap: state=${currentState}, frames=${frameCount}`);
        fallbackFlapRafRef.current = null;
        setMouthTarget(0);
        resetMouth();
        
        // Force stop speaking if we hit max frames
        if (frameCount > maxFrames && currentState === 'speaking') {
          console.log('🔇 Forcing stop speaking due to timeout');
          useAnimationStore.getState().stopSpeaking();
        }
        return;
      }
      
      // Continue flapping
      const sinceAnalyzer = Date.now() - lastAnalyzerWriteRef.current;
      if (sinceAnalyzer > 150) {
        const t = performance.now() / 1000;
        const base = 0.35;
        const amp = 0.25;
        const value = base + Math.max(0, Math.sin(t * 6.0)) * amp;
        console.log(`🎯 Fallback flap setting mouth target: ${value.toFixed(3)}`);
        setMouthTarget(value);
      }
      
      fallbackFlapRafRef.current = requestAnimationFrame(loop);
    };
    
    fallbackFlapRafRef.current = requestAnimationFrame(loop);
  }, [setMouthTarget, resetMouth, stopFallbackFlap]);

  // Handle voice state changes for mouth target management
  useEffect(() => {
    console.log(`🎤 Voice state changed to: ${voiceState}`);
    
    if (voiceState === 'speaking') {
      console.log('🎤 Starting speaking mode - initializing fallback flap');
      // When speaking starts, ensure EMA accumulator is ready
      if (emaAccumulatorRef.current === 0) {
        emaAccumulatorRef.current = 0.1; // Small initial value to avoid jump
      }
      // Begin fallback flapping in case analyser isn't feeding us
      startFallbackFlap();
    } else {
      console.log('🎤 Not speaking - stopping all mouth animations');
      // When not speaking, stop everything and reset
      stopFallbackFlap();
      resetMouth();
      setMouthTarget(0);
      emaAccumulatorRef.current = 0;
      lastTargetRef.current = 0;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Voice state changed to non-speaking, stopped all animations');
      }
    }
    
    // Cleanup on unmount
    return () => {
      stopFallbackFlap();
    };
  }, [voiceState, resetMouth, setMouthTarget, startFallbackFlap, stopFallbackFlap]);

  // Enhanced speech intensity handler with mouth target updates
  const handleSpeechIntensity = useCallback((rawIntensity: number) => {
    console.log(`🎤 handleSpeechIntensity called with: ${rawIntensity.toFixed(3)}`);
    
    // Mark that we received a real analyser update
    lastAnalyzerWriteRef.current = Date.now();
    // Update legacy speech intensity for backward compatibility
    setSpeechIntensity(rawIntensity);
    
    // Process mouth targets for all intensity levels (including zero)
    // The WebRTC session will call this during audio playback
    const processedIntensity = processSpeechIntensity(rawIntensity);
    updateMouthTarget(processedIntensity);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎤 handleSpeechIntensity: raw=${rawIntensity.toFixed(3)}, processed=${processedIntensity.toFixed(3)}`);
    }
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
