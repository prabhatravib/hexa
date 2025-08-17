import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { TIMING, COLORS, OPACITY, EASING } from '@/animations/constants';

interface AnimatedEyesProps {
  leftEyePosition?: { x: number; y: number };
  rightEyePosition?: { x: number; y: number };
  eyeSize?: { width: number; height: number };
  trackMouse?: boolean;
  className?: string;
}

export const AnimatedEyes: React.FC<AnimatedEyesProps> = ({
  leftEyePosition = { x: 85, y: 85 },
  rightEyePosition = { x: 115, y: 85 },
  eyeSize = { width: 4.5, height: 5 },
  trackMouse = false,
  className = '',
}) => {
  const { isBlinking, expressionState, animationState } = useAnimationStore();
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [isLookingAround, setIsLookingAround] = useState(false);

  // Mouse tracking logic
  useEffect(() => {
    if (!trackMouse || animationState !== 'hover') return;

    const handleMouseMove = (e: MouseEvent) => {
      const svg = document.querySelector('svg');
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const angleX = (e.clientX - centerX) / rect.width;
      const angleY = (e.clientY - centerY) / rect.height;
      
      setEyeOffset({
        x: Math.max(-2, Math.min(2, angleX * 4)),
        y: Math.max(-2, Math.min(2, angleY * 4)),
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [trackMouse, animationState]);

  // Random look around when idle
  useEffect(() => {
    if (animationState !== 'idle') {
      setIsLookingAround(false);
      return;
    }

    const lookAroundInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        setIsLookingAround(true);
        setEyeOffset({
          x: (Math.random() - 0.5) * 3,
          y: (Math.random() - 0.5) * 2,
        });
        
        setTimeout(() => {
          setEyeOffset({ x: 0, y: 0 });
          setIsLookingAround(false);
        }, 1500);
      }
    }, 5000);

    return () => clearInterval(lookAroundInterval);
  }, [animationState]);

  // Eye variants based on expression
  const getEyeScale = () => {
    switch (expressionState) {
      case 'excited':
        return { scaleX: 1.1, scaleY: 1.1 };
      case 'curious':
        return { scaleX: 1.05, scaleY: 1.05 };
      case 'neutral':
        return { scaleX: 0.95, scaleY: 0.95 };
      default:
        return { scaleX: 1, scaleY: 1 };
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
    },
    squint: {
      scaleY: 0.6,
      transition: { duration: 0.2 }
    }
  };

  const pupilVariants = {
    normal: {
      scale: 1,
      x: eyeOffset.x,
      y: eyeOffset.y,
    },
    dilated: {
      scale: 1.2,
      x: eyeOffset.x,
      y: eyeOffset.y,
    },
    focused: {
      scale: 0.8,
      x: eyeOffset.x,
      y: eyeOffset.y,
    }
  };

  const getPupilState = () => {
    if (animationState === 'active') return 'dilated';
    if (expressionState === 'curious') return 'focused';
    return 'normal';
  };

  // Sparkle effect for excited state
  const SparkleEffect = ({ x, y }: { x: number; y: number }) => (
    <AnimatePresence>
      {expressionState === 'excited' && (
        <motion.g
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
            rotate: [0, 180, 360]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatDelay: 1
          }}
        >
          <motion.path
            d={`M ${x} ${y - 8} L ${x + 2} ${y - 2} L ${x + 8} ${y} L ${x + 2} ${y + 2} L ${x} ${y + 8} L ${x - 2} ${y + 2} L ${x - 8} ${y} L ${x - 2} ${y - 2} Z`}
            fill="#fbbf24"
            opacity={0.6}
          />
        </motion.g>
      )}
    </AnimatePresence>
  );

  return (
    <g className={className}>
      {/* Left Eye */}
      <g>
        {/* Eye socket shadow */}
        <ellipse
          cx={leftEyePosition.x}
          cy={leftEyePosition.y + 1}
          rx={eyeSize.width + 1}
          ry={eyeSize.height + 1}
          fill="#000000"
          opacity={0.1}
        />
        
        {/* Eye white */}
        <motion.ellipse
          cx={leftEyePosition.x}
          cy={leftEyePosition.y}
          rx={eyeSize.width}
          ry={eyeSize.height}
          fill="#ffffff"
          variants={eyeVariants}
          animate={isBlinking ? 'closed' : 'open'}
          style={{ 
            originY: `${leftEyePosition.y}px`,
            originX: `${leftEyePosition.x}px`,
            ...getEyeScale()
          }}
        />
        
        {/* Iris/Pupil */}
        <motion.ellipse
          cx={leftEyePosition.x}
          cy={leftEyePosition.y}
          rx={eyeSize.width * 0.7}
          ry={eyeSize.height * 0.7}
          fill={COLORS.EYES[expressionState === 'excited' ? 'excited' : 'normal']}
          variants={pupilVariants}
          animate={getPupilState()}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{ 
            opacity: isBlinking ? 0 : 1,
            originY: `${leftEyePosition.y}px`,
            originX: `${leftEyePosition.x}px`
          }}
        />
        
        {/* Eye highlight */}
        <motion.circle
          cx={leftEyePosition.x + 1}
          cy={leftEyePosition.y - 2}
          r={1.5}
          fill="#a7f3d0"
          animate={{ opacity: isBlinking ? 0 : OPACITY.EYE_HIGHLIGHT }}
        />
        
        <SparkleEffect x={leftEyePosition.x - 10} y={leftEyePosition.y - 10} />
      </g>

      {/* Right Eye */}
      <g>
        {/* Eye socket shadow */}
        <ellipse
          cx={rightEyePosition.x}
          cy={rightEyePosition.y + 1}
          rx={eyeSize.width + 1}
          ry={eyeSize.height + 1}
          fill="#000000"
          opacity={0.1}
        />
        
        {/* Eye white */}
        <motion.ellipse
          cx={rightEyePosition.x}
          cy={rightEyePosition.y}
          rx={eyeSize.width}
          ry={eyeSize.height}
          fill="#ffffff"
          variants={eyeVariants}
          animate={isBlinking ? 'closed' : 'open'}
          style={{ 
            originY: `${rightEyePosition.y}px`,
            originX: `${rightEyePosition.x}px`,
            ...getEyeScale()
          }}
        />
        
        {/* Iris/Pupil */}
        <motion.ellipse
          cx={rightEyePosition.x}
          cy={rightEyePosition.y}
          rx={eyeSize.width * 0.7}
          ry={eyeSize.height * 0.7}
          fill={COLORS.EYES[expressionState === 'excited' ? 'excited' : 'normal']}
          variants={pupilVariants}
          animate={getPupilState()}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{ 
            opacity: isBlinking ? 0 : 1,
            originY: `${rightEyePosition.y}px`,
            originX: `${rightEyePosition.x}px`
          }}
        />
        
        {/* Eye highlight */}
        <motion.circle
          cx={rightEyePosition.x + 1}
          cy={rightEyePosition.y - 2}
          r={1.5}
          fill="#a7f3d0"
          animate={{ opacity: isBlinking ? 0 : OPACITY.EYE_HIGHLIGHT }}
        />
        
        <SparkleEffect x={rightEyePosition.x + 10} y={rightEyePosition.y - 10} />
      </g>

      {/* Optional eyebrow animations for expressions */}
      <AnimatePresence>
        {expressionState === 'curious' && (
          <motion.g
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 0.5, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
          >
            <motion.path
              d={`M ${leftEyePosition.x - 8} ${leftEyePosition.y - 12} Q ${leftEyePosition.x} ${leftEyePosition.y - 15} ${leftEyePosition.x + 8} ${leftEyePosition.y - 10}`}
              stroke="#064e3b"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <motion.path
              d={`M ${rightEyePosition.x - 8} ${rightEyePosition.y - 10} Q ${rightEyePosition.x} ${rightEyePosition.y - 15} ${rightEyePosition.x + 8} ${rightEyePosition.y - 12}`}
              stroke="#064e3b"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </motion.g>
        )}
      </AnimatePresence>
    </g>
  );
};
