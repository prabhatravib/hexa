import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { useAnimationState, useAnimationSequence } from '@/hooks/useAnimationState';
import { TIMING, EASING, SCALE, ROTATION, OPACITY, MOUTH_PATHS, KEYFRAMES } from '@/animations/constants';

interface AnimatedHexagonProps {
  size?: number;
  className?: string;
}

export const AnimatedHexagon: React.FC<AnimatedHexagonProps> = ({
  size = 200,
  className = ''
}) => {
  const {
    animationState,
    isBlinking,
    isPulsing,
    startIdleAnimation,
    stopIdleAnimation,
    handleMouseEnter,
    handleMouseLeave,
    handleClick,
  } = useAnimationStore();

  // Use the enhanced animation hooks
  const { timeSinceLastActivity } = useAnimationState();
  const { greet, thinking } = useAnimationSequence();

  useEffect(() => {
    startIdleAnimation();
    return () => stopIdleAnimation();
  }, []);

  const hexagonPoints = "100,20 180,60 180,140 100,180 20,140 20,60";
  
  // Animation variants using constants
  const containerVariants = {
    idle: {
      scale: SCALE.IDLE,
      rotate: ROTATION.IDLE,
    },
    hover: {
      scale: SCALE.HOVER,
      rotate: ROTATION.HOVER_WIGGLE,
      transition: {
        rotate: {
          duration: TIMING.HOVER_ROTATE_DURATION / 1000,
          ease: EASING.SMOOTH
        },
        scale: {
          duration: TIMING.HOVER_TRANSITION / 1000
        }
      }
    },
    active: {
      scale: [SCALE.IDLE, SCALE.PRESSED, SCALE.ACTIVE, SCALE.IDLE],
      transition: {
        duration: TIMING.CLICK_BOUNCE_DURATION / 1000,
        times: [0, 0.2, 0.5, 1]
      }
    }
  };

  const glowVariants = {
    idle: {
      opacity: isPulsing ? [OPACITY.GLOW_MIN, OPACITY.GLOW_MAX, OPACITY.GLOW_MIN] : OPACITY.GLOW_MIN,
      scale: isPulsing ? [SCALE.IDLE, SCALE.PULSE_MAX, SCALE.IDLE] : SCALE.IDLE,
      transition: {
        duration: TIMING.GLOW_PULSE_DURATION / 1000,
        repeat: Infinity,
        ease: EASING.SMOOTH
      }
    },
    hover: {
      opacity: OPACITY.GLOW_MAX,
      scale: 1.15,
      transition: {
        duration: TIMING.HOVER_TRANSITION / 1000
      }
    }
  };

  const eyeVariants = {
    open: {
      scaleY: 1,
      transition: { duration: TIMING.BLINK_DURATION / 1000 }
    },
    closed: {
      scaleY: 0.1,
      transition: { duration: TIMING.BLINK_DURATION / 1000 }
    }
  };

  return (
    <motion.div 
      className={`inline-block cursor-pointer ${className}`}
      style={{ width: size, height: size }}
      variants={containerVariants}
      animate={animationState}
      initial="idle"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      whileTap={{ scale: 0.95 }}
    >
      <svg 
        width="100%" 
        height="100%" 
        viewBox="0 0 200 200" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hexagonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="30%" stopColor="#6ee7b7" />
            <stop offset="70%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          
          <radialGradient id="centerHighlight" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#6ee7b7" stopOpacity="0.4" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Animated glow background */}
        <motion.circle 
          cx="100" 
          cy="100" 
          r="95" 
          fill="url(#centerHighlight)"
          variants={glowVariants}
          animate={animationState}
        />
        
        {/* Main hexagon */}
        <motion.polygon 
          points={hexagonPoints} 
          fill="url(#hexagonGradient)" 
          stroke="#059669" 
          strokeWidth="1.5"
          filter="url(#glow)"
        />
        
        {/* Animated breathing effect rings */}
        <AnimatePresence>
          {isPulsing && (
            <motion.circle
              cx="100"
              cy="100"
              r="40"
              fill="none"
              stroke="#10b981"
              strokeWidth="1"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={KEYFRAMES.PULSE_RING}
            />
          )}
        </AnimatePresence>
        
        {/* Eyes with blink animation */}
        <motion.g>
          <motion.ellipse 
            cx="85" 
            cy="85" 
            rx="4.5" 
            ry="5"
            fill="#064e3b"
            variants={eyeVariants}
            animate={isBlinking ? "closed" : "open"}
            style={{ originY: "85px", originX: "85px" }}
          />
          <motion.ellipse 
            cx="115" 
            cy="85" 
            rx="4.5" 
            ry="5"
            fill="#064e3b"
            variants={eyeVariants}
            animate={isBlinking ? "closed" : "open"}
            style={{ originY: "85px", originX: "115px" }}
          />
          
          {/* Eye highlights */}
          <motion.circle 
            cx="86" 
            cy="83" 
            r="1.5" 
            fill="#a7f3d0" 
            opacity={isBlinking ? OPACITY.BLINK : OPACITY.EYE_HIGHLIGHT}
          />
          <motion.circle 
            cx="116" 
            cy="83" 
            r="1.5" 
            fill="#a7f3d0" 
            opacity={isBlinking ? OPACITY.BLINK : OPACITY.EYE_HIGHLIGHT}
          />
        </motion.g>
        
        {/* Animated smile */}
        <motion.path 
          d={MOUTH_PATHS.HAPPY} 
          stroke="#064e3b" 
          strokeWidth="4" 
          fill="none" 
          strokeLinecap="round"
          animate={{
            d: animationState === 'hover' 
              ? MOUTH_PATHS.CURIOUS
              : animationState === 'active'
              ? MOUTH_PATHS.EXCITED
              : MOUTH_PATHS.HAPPY
          }}
          transition={{ duration: TIMING.EXPRESSION_TRANSITION / 1000 }}
        />
      </svg>
    </motion.div>
  );
};
