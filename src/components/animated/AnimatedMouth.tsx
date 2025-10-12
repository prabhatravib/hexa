import React, { useEffect, useRef, useCallback, useState } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useAnimationStore, VoiceState } from '@/store/animationStore';
import { MOUTH_PATHS, TIMING, EASING } from '@/animations/constants';

interface AnimatedMouthProps {
  position?: { x: number; y: number };
  width?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}

export const AnimatedMouth: React.FC<AnimatedMouthProps> = ({
  position = { x: 100, y: 118 },
  width = 40,
  strokeWidth = 4,
  color = '#064e3b',
  className = '',
}) => {
  const { expressionState, animationState, mouthOpennessTarget, voiceState } = useAnimationStore();
  
  // Local animation state using refs to prevent re-renders
  const animationFrameRef = useRef<number | null>(null);
  const lastTargetRef = useRef(0);
  const lastDirectionRef = useRef<'opening' | 'closing'>('closing');
  const microMotionRef = useRef(0);
  const reducedMotionRef = useRef(false);
  
  // Motion values for smooth animation
  const currentOpenness = useMotionValue(0);
  const springOpenness = useSpring(currentOpenness, {
    stiffness: 400,
    damping: 30,
    mass: 0.8,
  });
  
  // Transform mouth openness to visual scale with floor
  const visualOpenness = useTransform(springOpenness, (value) => {
    // Map target ∈[0,1] to visual openness with small floor (never fully flat)
    // visualOpen = 0.2 + 0.8*target
    return 0.2 + 0.8 * value;
  });
  
  // Gate logic: force mouth toward 0 when not speaking to prevent "stuck open"
  const gatedOpenness = useTransform(springOpenness, (value) => {
    // Always use the current value for now - we'll handle gating in the animation loop
    return value;
  });
  

  
  // Use ref to capture latest target value and avoid stale closure
  const targetRef = useRef(0);
  const lastNonZeroTargetTimeRef = useRef(0);
  useEffect(() => { 
    targetRef.current = mouthOpennessTarget; 
    if (mouthOpennessTarget > 0.02) {
      lastNonZeroTargetTimeRef.current = Date.now();
    }
  }, [mouthOpennessTarget]);
  
  // State for dynamic path that updates with motion values
  const [pathD, setPathD] = useState('');
  
  // Get expression-based mouth path for non-speaking states
  const getExpressionPath = useCallback(() => {
    switch (expressionState) {
      case 'excited':
        return MOUTH_PATHS.EXCITED;
      case 'neutral':
        return MOUTH_PATHS.NEUTRAL;
      case 'curious':
        return MOUTH_PATHS.CURIOUS;
      case 'happy':
      default:
        return MOUTH_PATHS.HAPPY;
    }
  }, [expressionState]);
  
  // Subscribe to spring changes to update path without re-renders
  useEffect(() => {
    const unsubscribe = springOpenness.on('change', (value) => {
      const openness = value + microMotionRef.current;
      const clampedOpenness = Math.max(0, Math.min(1, openness));
      
      // Base mouth position
      const centerX = position.x;
      const centerY = position.y;
      const halfWidth = width / 2;
      
      // Dynamic mouth curve based on openness - INVERTED for smiling expression
      // Maintain baseline smile even at 0 openness to prevent horizontal line
      const baselineSmile = 15; // Minimum smile curve (matches HAPPY mouth)
      const additionalRange = 10; // Extra range for speech animation
      const curveHeight = baselineSmile + (clampedOpenness * additionalRange);
      const controlY = centerY + curveHeight; // INVERTED: + instead of - for upward curve
      
      // Create smooth curve path with enhanced opening
      // Also add slight width change when opening for more natural look
      const widthScale = 1 + (clampedOpenness * 0.1); // Slight width increase when open
      const adjustedHalfWidth = halfWidth * widthScale;
      
      const newPath = `M ${centerX - adjustedHalfWidth} ${centerY} Q ${centerX} ${controlY} ${centerX + adjustedHalfWidth} ${centerY}`;
      setPathD(newPath);
    });
    
    // Initialize path with current spring value to prevent empty path flash
    const initialOpenness = springOpenness.get();
    const centerX = position.x;
    const centerY = position.y;
    const halfWidth = width / 2;
    // Match the baseline smile calculation
    const baselineSmile = 15;
    const additionalRange = 10;
    const curveHeight = baselineSmile + (initialOpenness * additionalRange);
    const controlY = centerY + curveHeight; // INVERTED: + instead of - for upward curve
    const widthScale = 1 + (initialOpenness * 0.1);
    const adjustedHalfWidth = halfWidth * widthScale;
    const initialPath = `M ${centerX - adjustedHalfWidth} ${centerY} Q ${centerX} ${controlY} ${centerX + adjustedHalfWidth} ${centerY}`;
    setPathD(initialPath);
    
    return unsubscribe;
  }, [springOpenness, position, width]);
  
  // Ensure pathD is never empty to prevent path switching artifacts
  useEffect(() => {
    if (!pathD) {
      const fallbackPath = getExpressionPath();
      setPathD(fallbackPath);
    }
  }, [pathD, getExpressionPath]);
  
  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mediaQuery.matches;
    
    const handleChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  // Main animation loop using requestAnimationFrame - now reads from ref
  const animateMouth = useCallback(() => {
    // Get the current voice state from the store to avoid stale closures
    const currentVoiceState = useAnimationStore.getState().voiceState;
    
    // Stop animation if voice state is idle
    if (currentVoiceState === 'idle') {
      // console.log('👄 Voice state is idle, stopping mouth animation');
      currentOpenness.set(0); // Reset to closed
      
      // Reset store target only if it's not already 0 (avoid hammering store)
      const currentTarget = useAnimationStore.getState().mouthOpennessTarget;
      if (currentTarget !== 0) {
        useAnimationStore.getState().setMouthTarget(0);
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return; // Exit the animation loop
    }
    
    // Use the target from the store (set by analyzer or fallback flap)
    const target = targetRef.current;
    
    // console.log(`👄 Animating mouth: state=${currentVoiceState}, target=${target.toFixed(3)}`);
    
    // Drive openness directly for clear, visible motion
    currentOpenness.set(target);
    
    // Add micro-motion when not speaking (subtle breathing)
    if (currentVoiceState !== 'speaking' && !reducedMotionRef.current) {
      const time = Date.now() * 0.001;
      const microAmplitude = 0.02;
      microMotionRef.current = Math.sin(time * 2) * microAmplitude * 0.5;
    } else {
      microMotionRef.current = 0;
    }
    
    // Continue animation only if still speaking
    if (currentVoiceState === 'speaking') {
      animationFrameRef.current = requestAnimationFrame(animateMouth);
    } else {
      // Stop and reset
      currentOpenness.set(0);
      animationFrameRef.current = null;
    }
  }, [currentOpenness]);
  
  // Start/stop animation loop based on voice state
  useEffect(() => {
    const isSpeaking = voiceState === 'speaking';
    
    if (isSpeaking) {
      // Start animation if not already running
      if (!animationFrameRef.current) {
        // console.log('🚀 Starting mouth animation loop (speaking detected)');
        animationFrameRef.current = requestAnimationFrame(animateMouth);
      }
    } else {
      // Stop animation when not speaking
      if (animationFrameRef.current) {
        // console.log('⏹️ Stopping mouth animation loop (not speaking)');
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Reset mouth to closed
      currentOpenness.set(0);
    }
    
    // Cleanup on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [voiceState, animateMouth, currentOpenness]);
  
  // Force update when target changes to ensure immediate response
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // console.log(`🎯 Mouth Target Changed: ${mouthOpennessTarget.toFixed(3)}`);
    }
    
    if (mouthOpennessTarget > 0) { // Allow even tiny targets to trigger updates
      // Force a small update to trigger re-render
      currentOpenness.set(currentOpenness.get() + 0.001);
      if (process.env.NODE_ENV === 'development') {
        // console.log(`🔄 Force update applied to currentOpenness`);
      }
    }
  }, [mouthOpennessTarget, currentOpenness]);

  // Note: Audio monitoring removed - we now trust the voice state from the store
  // The voice state is the authoritative source of truth for when OpenAI is speaking
  
  // Debug motion values
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const unsubscribe = currentOpenness.on('change', (value) => {
        // console.log(`📊 currentOpenness changed to: ${value.toFixed(3)}`);
      });
      
      const unsubscribeSpring = springOpenness.on('change', (value) => {
        // console.log(`🎢 springOpenness changed to: ${value.toFixed(3)}`);
      });
      
      const unsubscribeGated = gatedOpenness.on('change', (value) => {
        // console.log(`🚪 gatedOpenness changed to: ${value.toFixed(3)}`);
      });
      
      return () => {
        unsubscribe();
        unsubscribeSpring();
        unsubscribeGated();
      };
    }
  }, [currentOpenness, springOpenness, gatedOpenness]);
  
  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  // Determine which path to use
  const isCurrentlySpeaking = voiceState === 'speaking';
  const hasTargetValue = mouthOpennessTarget > 0; // Allow even tiny targets to use dynamic path
  const isAnimating = animationFrameRef.current !== null;

  // STRICT PRODUCTION MODE: Use dynamic path ONLY when ALL conditions are met
  // This prevents phantom mouth animation when no audio is actually playing
  const { isAudioPlaying } = useAnimationStore();
  const shouldUseDynamicPath =
    isCurrentlySpeaking &&           // Voice state must be 'speaking'
    isAudioPlaying &&                 // Audio element must be actively playing
    (hasTargetValue || isAnimating);  // Must have energy OR already animating
  
  // Select the appropriate path - only one path should be used
  const finalPath = shouldUseDynamicPath && pathD ? pathD : getExpressionPath();
  
  // Debug path selection
  if (process.env.NODE_ENV === 'development') {
    // console.log(`🛤️ Path Selection: target=${mouthOpennessTarget.toFixed(3)}, speaking=${isCurrentlySpeaking}, animating=${isAnimating}, usingDynamic=${shouldUseDynamicPath}, pathD=${pathD ? 'set' : 'empty'}`);
    // console.log(`🛤️ Final Path: ${finalPath.substring(0, 50)}...`);
  }
  
  // Variants for expression-based animations - only control scale/transition, not path
  const mouthVariants = {
    static: {
      transition: {
        duration: TIMING.EXPRESSION_TRANSITION / 1000,
        ease: EASING.SMOOTH,
      }
    },
    breathing: {
      transition: {
        duration: TIMING.IDLE_PULSE_DURATION / 1000,
        ease: EASING.SMOOTH,
      }
    },
    smile: {
      scale: 1.05,
      transition: {
        duration: 0.3,
        ease: EASING.ELASTIC,
      }
    },
    speaking: {
      scaleY: [1, 1.15, 1, 0.95, 1],
      transition: {
        duration: 0.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  };
  
  // Helper to get current animation variant
  const getCurrentVariant = () => {
    if (voiceState === 'speaking') return 'speaking';
    if (animationState === 'active') return 'smile';
    if (animationState === 'idle') return 'breathing';
    return 'static';
  };
  

  
  return (
    <g className={className}>
      {/* Single mouth path with layered effects */}
      <motion.path
        d={finalPath}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        variants={mouthVariants}
        animate={getCurrentVariant()}
        style={{
          originX: `${position.x}px`,
          originY: `${position.y}px`,
          filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1)) drop-shadow(0 0 2px rgba(16, 185, 129, 0.3))',
        }}
      />
      
      {/* Additional effects - removed BreathPuff to eliminate interior pulsing */}
    </g>
  );
};
