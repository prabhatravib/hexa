import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
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
  const { expressionState, animationState, speechIntensity, isSpeaking } = useAnimationStore();
  const [isBreathing, setIsBreathing] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(MOUTH_PATHS.HAPPY);

  // Update mouth path based on expression
  useEffect(() => {
    switch (expressionState) {
      case 'excited':
        setCurrentPath(MOUTH_PATHS.EXCITED);
        break;
      case 'neutral':
        setCurrentPath(MOUTH_PATHS.NEUTRAL);
        break;
      case 'curious':
        setCurrentPath(MOUTH_PATHS.CURIOUS);
        break;
      case 'happy':
      default:
        setCurrentPath(MOUTH_PATHS.HAPPY);
        break;
    }
  }, [expressionState]);

  // Modify mouth shape based on speech intensity
  useEffect(() => {
    if (isSpeaking && speechIntensity > 0) {
      const openness = speechIntensity * 20; // Scale intensity to mouth openness
      const dynamicPath = `M ${82 - openness/2} ${108 + openness} Q 100 ${128 + openness} ${118 + openness/2} ${108 + openness}`;
      setCurrentPath(dynamicPath);
    } else if (!isSpeaking) {
      // Reset to expression-based path
      setCurrentPath(MOUTH_PATHS[expressionState === 'excited' ? 'EXCITED' : 
                                 expressionState === 'neutral' ? 'NEUTRAL' :
                                 expressionState === 'curious' ? 'CURIOUS' : 'HAPPY']);
    }
  }, [speechIntensity, isSpeaking, expressionState]);

  // Breathing animation for idle state
  useEffect(() => {
    setIsBreathing(animationState === 'idle');
  }, [animationState]);

  // Variants for mouth animations
  const mouthVariants = {
    static: {
      d: currentPath,
      transition: {
        duration: TIMING.EXPRESSION_TRANSITION / 1000,
        ease: EASING.SMOOTH,
      }
    },
    breathing: {
      d: currentPath,
      scale: [1, 1.02, 1],
      y: [0, 1, 0],
      transition: {
        duration: TIMING.IDLE_PULSE_DURATION / 1000,
        repeat: Infinity,
        ease: EASING.SMOOTH,
      }
    },
    talking: {
      d: [
        currentPath,
        MOUTH_PATHS.SPEAKING,
        MOUTH_PATHS.NEUTRAL,
        currentPath,
      ],
      transition: {
        duration: 0.2,
        repeat: Infinity,
        repeatType: "loop" as const,
      }
    },
    smile: {
      d: MOUTH_PATHS.HAPPY,
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
    if (isBreathing) return 'breathing';
    return 'static';
  };

  // Dimple effects for happy expressions
  const Dimples = () => (
    <AnimatePresence>
      {(expressionState === 'happy' || expressionState === 'excited') && (
        <motion.g
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.3, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ duration: 0.2 }}
        >
          <circle
            cx={position.x - 25}
            cy={position.y - 5}
            r={2}
            fill={color}
            opacity={0.2}
          />
          <circle
            cx={position.x + 25}
            cy={position.y - 5}
            r={2}
            fill={color}
            opacity={0.2}
          />
        </motion.g>
      )}
    </AnimatePresence>
  );

  // Subtle lip shine effect
  const LipShine = () => (
    <AnimatePresence>
      {animationState === 'hover' && (
        <motion.path
          d={currentPath}
          stroke="#a7f3d0"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
          initial={{ opacity: 0, pathOffset: 1 }}
          animate={{ 
            opacity: [0, 0.4, 0],
            pathOffset: [1, 0, -1],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "linear"
          }}
          style={{ strokeDasharray: "10 20" }}
        />
      )}
    </AnimatePresence>
  );

  // Small breath puff for idle
  const BreathPuff = () => (
    <AnimatePresence>
      {isBreathing && Math.random() > 0.7 && (
        <motion.g
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 0.2, 0],
            scale: [0, 1.5, 2],
            y: [0, -10, -20]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatDelay: 4,
          }}
        >
          <circle
            cx={position.x}
            cy={position.y + 10}
            r={3}
            fill="#6ee7b7"
            filter="blur(2px)"
          />
        </motion.g>
      )}
    </AnimatePresence>
  );

  return (
    <g className={className}>
      {/* Shadow/depth for mouth */}
      <motion.path
        d={currentPath}
        stroke="#000000"
        strokeWidth={strokeWidth + 1}
        fill="none"
        strokeLinecap="round"
        opacity={0.1}
        style={{ 
          transform: 'translate(0, 1px)',
          filter: 'blur(1px)'
        }}
      />
      
      {/* Main mouth path */}
      <motion.path
        d={currentPath}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        variants={mouthVariants}
        animate={getCurrentVariant()}
        style={{
          originX: `${position.x}px`,
          originY: `${position.y}px`,
        }}
      />
      
      {/* Highlight for depth */}
      <motion.path
        d={currentPath}
        stroke="#10b981"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.3}
        style={{ 
          transform: 'translate(0, 1px)',
        }}
        animate={{
          opacity: animationState === 'hover' ? 0.5 : 0.3
        }}
      />
      
      {/* Additional effects */}
      <LipShine />
      <Dimples />
      <BreathPuff />
      
      {/* Corner accent for smile */}
      <AnimatePresence>
        {expressionState === 'excited' && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
          >
            <circle cx={position.x - 18} cy={position.y - 10} r={1.5} fill="#34d399" />
            <circle cx={position.x + 18} cy={position.y - 10} r={1.5} fill="#34d399" />
          </motion.g>
        )}
      </AnimatePresence>
    </g>
  );
};
