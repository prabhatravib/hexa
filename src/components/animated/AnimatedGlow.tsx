import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { TIMING, OPACITY, COLORS, SCALE } from '@/animations/constants';

interface AnimatedGlowProps {
  size?: number;
  baseColor?: string;
  pulseEnabled?: boolean;
  ringsEnabled?: boolean;
  className?: string;
}

export const AnimatedGlow: React.FC<AnimatedGlowProps> = ({
  size = 200,
  baseColor = COLORS.GLOW.idle,
  pulseEnabled = true,
  ringsEnabled = true,
  className = '',
}) => {
  const { animationState, expressionState, isPulsing } = useAnimationStore();
  
  // Dynamic color based on state
  const getGlowColor = () => {
    if (animationState === 'active') return COLORS.GLOW.active;
    if (animationState === 'hover') return COLORS.GLOW.hover;
    if (expressionState === 'excited') return COLORS.GLOW.active;
    return baseColor;
  };

  // Glow intensity based on state
  const getGlowIntensity = () => {
    if (animationState === 'active') return OPACITY.GLOW_MAX;
    if (animationState === 'hover') return 0.8;
    return isPulsing ? OPACITY.GLOW_MIN : 0.5;
  };

  // Main glow variants
  const glowVariants = {
    idle: {
      scale: isPulsing ? [1, 1.05, 1] : 1,
      opacity: isPulsing ? [getGlowIntensity(), getGlowIntensity() + 0.2, getGlowIntensity()] : getGlowIntensity(),
      transition: {
        duration: TIMING.GLOW_PULSE_DURATION / 1000,
        repeat: Infinity,
        ease: "easeInOut"
      }
    },
    hover: {
      scale: 1.08,
      opacity: 0.8,
      transition: {
        duration: TIMING.HOVER_TRANSITION / 1000,
        ease: "easeOut"
      }
    },
    active: {
      scale: [1, 1.15, 1.1],
      opacity: [0.7, 1, 0.9],
      transition: {
        duration: TIMING.CLICK_BOUNCE_DURATION / 1000,
        ease: "easeOut"
      }
    }
  };

  // Outer aura effect
  const auraVariants = {
    idle: {
      scale: isPulsing ? [1.1, 1.2, 1.1] : 1.1,
      opacity: isPulsing ? [0.2, 0.3, 0.2] : 0.2,
      transition: {
        duration: (TIMING.GLOW_PULSE_DURATION + 500) / 1000,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 0.2
      }
    },
    hover: {
      scale: 1.25,
      opacity: 0.4,
      transition: {
        duration: TIMING.HOVER_TRANSITION / 1000,
      }
    },
    active: {
      scale: [1.2, 1.4, 1.3],
      opacity: [0.3, 0.5, 0.4],
      transition: {
        duration: TIMING.CLICK_BOUNCE_DURATION / 1000,
      }
    }
  };

  // Pulse ring component
  const PulseRing = ({ delay = 0, scale = 1 }: { delay?: number; scale?: number }) => (
    <motion.circle
      cx={size / 2}
      cy={size / 2}
      r={size * 0.3 * scale}
      fill="none"
      stroke={getGlowColor()}
      strokeWidth="0.5"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: [0.8, 1.5, 1.5],
        opacity: [0, 0.4, 0],
      }}
      transition={{
        duration: TIMING.RING_PULSE_DURATION / 1000,
        repeat: Infinity,
        delay,
        ease: "easeOut"
      }}
    />
  );

  // Energy particles for excited state
  const EnergyParticles = () => {
    const particles = Array.from({ length: 6 }, (_, i) => {
      const angle = (i * 60) * Math.PI / 180;
      const radius = size * 0.35;
      const x = size / 2 + Math.cos(angle) * radius;
      const y = size / 2 + Math.sin(angle) * radius;
      
      return (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r={2}
          fill={COLORS.GLOW.active}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1, 0],
            opacity: [0, 0.8, 0],
            x: [x, x + Math.cos(angle) * 20, x + Math.cos(angle) * 40],
            y: [y, y + Math.sin(angle) * 20, y + Math.sin(angle) * 40],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeOut"
          }}
        />
      );
    });
    
    return <>{particles}</>;
  };

  return (
    <g className={className}>
      {/* Outer aura layer */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.48}
        fill={getGlowColor()}
        variants={auraVariants}
        animate={animationState}
        style={{
          filter: 'blur(20px)',
          mixBlendMode: 'screen'
        }}
      />
      
      {/* Main glow layer */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.45}
        fill={getGlowColor()}
        variants={glowVariants}
        animate={animationState}
        style={{
          filter: 'blur(10px)',
          mixBlendMode: 'screen'
        }}
      />
      
      {/* Inner bright core */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.35}
        fill={COLORS.PRIMARY.light}
        animate={{
          opacity: animationState === 'active' ? 0.6 : 0.3,
          scale: animationState === 'hover' ? 1.05 : 1,
        }}
        transition={{ duration: 0.3 }}
        style={{
          filter: 'blur(5px)',
          mixBlendMode: 'screen'
        }}
      />
      
      {/* Pulse rings when enabled */}
      <AnimatePresence>
        {ringsEnabled && isPulsing && (
          <>
            <PulseRing delay={0} scale={1} />
            <PulseRing delay={0.8} scale={1.2} />
            {animationState === 'active' && <PulseRing delay={0.3} scale={0.8} />}
          </>
        )}
      </AnimatePresence>
      
      {/* Energy particles for excited expression */}
      <AnimatePresence>
        {expressionState === 'excited' && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <EnergyParticles />
          </motion.g>
        )}
      </AnimatePresence>
      
      {/* Shimmer effect for hover */}
      <AnimatePresence>
        {animationState === 'hover' && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.ellipse
              cx={size / 2}
              cy={size / 2}
              rx={size * 0.4}
              ry={size * 0.2}
              fill="url(#shimmerGradient)"
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear"
              }}
              style={{
                filter: 'blur(8px)',
                mixBlendMode: 'overlay'
              }}
            />
          </motion.g>
        )}
      </AnimatePresence>
      
      {/* Define gradients */}
      <defs>
        <linearGradient id="shimmerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={COLORS.PRIMARY.light} stopOpacity="0" />
          <stop offset="50%" stopColor={COLORS.PRIMARY.medium} stopOpacity="0.5" />
          <stop offset="100%" stopColor={COLORS.PRIMARY.light} stopOpacity="0" />
        </linearGradient>
      </defs>
    </g>
  );
};
