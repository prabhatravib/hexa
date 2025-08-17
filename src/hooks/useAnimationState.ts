import { useEffect, useRef, useCallback } from 'react';
import { useAnimationStore } from '@/store/animationStore';

interface UseAnimationStateOptions {
  enableBlink?: boolean;
  blinkInterval?: number;
  blinkProbability?: number;
  enableIdle?: boolean;
  idleDelay?: number;
}

export const useAnimationState = (options: UseAnimationStateOptions = {}) => {
  const {
    enableBlink = true,
    blinkInterval = 3000,
    blinkProbability = 0.3,
    enableIdle = true,
    idleDelay = 5000,
  } = options;

  const {
    animationState,
    expressionState,
    isBlinking,
    triggerBlink,
    setAnimationState,
    setExpressionState,
  } = useAnimationStore();

  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Blink logic
  const scheduleNextBlink = useCallback(() => {
    if (!enableBlink) return;
    
    const delay = blinkInterval + (Math.random() * 2000 - 1000); // Add some randomness
    
    blinkTimerRef.current = setTimeout(() => {
      if (Math.random() < blinkProbability) {
        triggerBlink();
      }
      scheduleNextBlink();
    }, delay);
  }, [enableBlink, blinkInterval, blinkProbability, triggerBlink]);

  // Auto-idle logic
  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    
    if (enableIdle && animationState !== 'idle') {
      idleTimerRef.current = setTimeout(() => {
        setAnimationState('idle');
        setExpressionState('happy');
      }, idleDelay);
    }
  }, [enableIdle, idleDelay, animationState, setAnimationState, setExpressionState]);

  // Initialize blink schedule
  useEffect(() => {
    if (enableBlink) {
      scheduleNextBlink();
    }
    
    return () => {
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
      }
    };
  }, [enableBlink, scheduleNextBlink]);

  // Handle idle timer
  useEffect(() => {
    if (animationState !== 'idle') {
      resetIdleTimer();
    }
    
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [animationState, resetIdleTimer]);

  // Manual blink trigger
  const blink = useCallback(() => {
    triggerBlink();
  }, [triggerBlink]);

  // Expression helpers
  const setExpression = useCallback((expression: 'happy' | 'neutral' | 'curious' | 'excited') => {
    setExpressionState(expression);
    resetIdleTimer();
  }, [setExpressionState, resetIdleTimer]);

  // Animation state helpers
  const animate = useCallback((state: 'idle' | 'hover' | 'active') => {
    setAnimationState(state);
    if (state !== 'idle') {
      resetIdleTimer();
    }
  }, [setAnimationState, resetIdleTimer]);

  return {
    // Current states
    animationState,
    expressionState,
    isBlinking,
    
    // Control functions
    blink,
    setExpression,
    animate,
    resetIdleTimer,
    
    // Utility
    timeSinceLastActivity: () => Date.now() - lastActivityRef.current,
  };
};

// Hook for specific animation sequences
export const useAnimationSequence = () => {
  const { setAnimationState, setExpressionState, triggerBlink } = useAnimationStore();
  const sequenceRef = useRef<NodeJS.Timeout[]>([]);

  const clearSequence = useCallback(() => {
    sequenceRef.current.forEach(timer => clearTimeout(timer));
    sequenceRef.current = [];
  }, []);

  const playSequence = useCallback((steps: Array<{
    state?: 'idle' | 'hover' | 'active';
    expression?: 'happy' | 'neutral' | 'curious' | 'excited';
    blink?: boolean;
    delay: number;
  }>) => {
    clearSequence();
    
    let cumulativeDelay = 0;
    steps.forEach(step => {
      const timer = setTimeout(() => {
        if (step.state) setAnimationState(step.state);
        if (step.expression) setExpressionState(step.expression);
        if (step.blink) triggerBlink();
      }, cumulativeDelay);
      
      sequenceRef.current.push(timer);
      cumulativeDelay += step.delay;
    });
  }, [setAnimationState, setExpressionState, triggerBlink, clearSequence]);

  // Predefined sequences
  const greet = useCallback(() => {
    playSequence([
      { expression: 'excited', blink: true, delay: 0 },
      { state: 'active', delay: 200 },
      { state: 'hover', delay: 300 },
      { state: 'idle', expression: 'happy', delay: 400 },
    ]);
  }, [playSequence]);

  const thinking = useCallback(() => {
    playSequence([
      { expression: 'neutral', delay: 0 },
      { blink: true, delay: 300 },
      { expression: 'curious', delay: 200 },
      { blink: true, delay: 500 },
      { expression: 'neutral', delay: 300 },
    ]);
  }, [playSequence]);

  useEffect(() => {
    return () => clearSequence();
  }, [clearSequence]);

  return {
    playSequence,
    clearSequence,
    // Predefined animations
    greet,
    thinking,
  };
};
