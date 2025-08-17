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
  useEffect(() => { 
    targetRef.current = mouthOpennessTarget; 
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
      
      // Dynamic mouth curve based on openness
      const curveHeight = clampedOpenness * 15; // Max curve height
      const controlY = centerY - curveHeight;
      
      // Create smooth curve path
      const newPath = `M ${centerX - halfWidth} ${centerY} Q ${centerX} ${controlY} ${centerX + halfWidth} ${centerY}`;
      setPathD(newPath);
    });
    
    // Initialize path with current spring value to prevent empty path flash
    const initialOpenness = springOpenness.get();
    const centerX = position.x;
    const centerY = position.y;
    const halfWidth = width / 2;
    const curveHeight = initialOpenness * 15;
    const controlY = centerY - curveHeight;
    const initialPath = `M ${centerX - halfWidth} ${centerY} Q ${centerX} ${controlY} ${centerX + halfWidth} ${centerY}`;
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
    const target = targetRef.current; // Read fresh target from ref
    const current = currentOpenness.get();
    const delta = target - current;
    
    if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) { // Log 1% of frames to avoid spam
      console.log(`🔄 Animation Frame: target=${target.toFixed(3)}, current=${current.toFixed(3)}, delta=${delta.toFixed(3)}`);
    }
    
    // Determine direction for spring tuning
    const direction: 'opening' | 'closing' = delta > 0 ? 'opening' : 'closing';
    
    // Adjust spring parameters based on direction (fast open, slower close)
    if (direction !== lastDirectionRef.current) {
      lastDirectionRef.current = direction;
      
      // Recreate spring with new parameters for direction changes
      if (direction === 'opening') {
        // Fast opening: higher stiffness, lower damping
        springOpenness.set(springOpenness.get());
        // Note: In a real implementation, we'd need to recreate the spring
        // For now, we'll use the default spring behavior
      } else {
        // Slower closing: lower stiffness, higher damping
        springOpenness.set(springOpenness.get());
        // Note: In a real implementation, we'd need to recreate the spring
        // For now, we'll use the default spring behavior
      }
    }
    
    // Update target with velocity capping to prevent jitter
    const maxVelocity = 0.05; // Cap max velocity
    const clampedDelta = Math.max(-maxVelocity, Math.min(maxVelocity, delta));
    
    if (Math.abs(clampedDelta) > 0.001) {
      currentOpenness.set(current + clampedDelta);
    }
    
    // Add micro-motion when not speaking (subtle breathing)
    const isCurrentlySpeaking = voiceState === 'speaking';
    if (!isCurrentlySpeaking && !reducedMotionRef.current) {
      const time = Date.now() * 0.001;
      const microAmplitude = 0.02; // Max micro-motion amplitude
      microMotionRef.current = Math.sin(time * 2) * microAmplitude * 0.5;
    } else {
      microMotionRef.current = 0;
    }
    
    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(animateMouth);
  }, [voiceState, currentOpenness, springOpenness]); // Removed mouthOpennessTarget dependency
  
  // Start/stop animation loop based on voice state and target values
  useEffect(() => {
    const isSpeaking = voiceState === 'speaking';
    const hasTargetValue = mouthOpennessTarget > 0.01;
    
    // Always start animation when there's a target value or when speaking
    if (hasTargetValue || isSpeaking) {
      if (!animationFrameRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🚀 Starting mouth animation loop');
        }
        animationFrameRef.current = requestAnimationFrame(animateMouth);
      }
    } else {
      // Stop animation only when no target and not speaking
      if (animationFrameRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('⏹️ Stopping mouth animation loop');
        }
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
    
    lastTargetRef.current = mouthOpennessTarget;
  }, [voiceState, mouthOpennessTarget, animateMouth]);
  
  // Force update when target changes to ensure immediate response
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 Mouth Target Changed: ${mouthOpennessTarget.toFixed(3)}`);
    }
    
    if (mouthOpennessTarget > 0.01) {
      // Force a small update to trigger re-render
      currentOpenness.set(currentOpenness.get() + 0.001);
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Force update applied to currentOpenness`);
      }
    }
  }, [mouthOpennessTarget, currentOpenness]);
  
  // Debug motion values
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const unsubscribe = currentOpenness.on('change', (value) => {
        console.log(`📊 currentOpenness changed to: ${value.toFixed(3)}`);
      });
      
      const unsubscribeSpring = springOpenness.on('change', (value) => {
        console.log(`🎢 springOpenness changed to: ${value.toFixed(3)}`);
      });
      
      const unsubscribeGated = gatedOpenness.on('change', (value) => {
        console.log(`🚪 gatedOpenness changed to: ${value.toFixed(3)}`);
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
  const hasTargetValue = mouthOpennessTarget > 0.01;
  const isAnimating = animationFrameRef.current !== null;
  
  // Use dynamic path when there's a target value, speaking, or animating
  const shouldUseDynamicPath = hasTargetValue || isCurrentlySpeaking || isAnimating;
  
  // Select the appropriate path - only one path should be used
  const finalPath = shouldUseDynamicPath && pathD ? pathD : getExpressionPath();
  
  // Debug path selection
  if (process.env.NODE_ENV === 'development') {
    console.log(`🛤️ Path Selection: target=${mouthOpennessTarget.toFixed(3)}, speaking=${isCurrentlySpeaking}, animating=${isAnimating}, usingDynamic=${shouldUseDynamicPath}, pathD=${pathD ? 'set' : 'empty'}`);
    console.log(`🛤️ Final Path: ${finalPath.substring(0, 50)}...`);
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
    }
  };
  
  // Helper to get current animation variant
  const getCurrentVariant = () => {
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
