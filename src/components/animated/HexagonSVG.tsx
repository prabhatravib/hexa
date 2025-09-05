import React from 'react';
import { motion } from 'framer-motion';
import { AnimatedMouth } from './AnimatedMouth';
import { useAnimationStore } from '@/store/animationStore';
import { OPACITY } from '@/animations/constants';

interface HexagonSVGProps {
  size: number;
  voiceState: string;
  isBlinking: boolean;
  initializationState: string;
}

export const HexagonSVG: React.FC<HexagonSVGProps> = ({
  size,
  voiceState,
  isBlinking,
  initializationState
}) => {
  return (
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
      
      {/* Main hexagon with rounded corners - only this shape changes */}
      <motion.path 
        d="M 100 25
           L 165 55
           Q 175 60 175 70
           L 175 130
           Q 175 140 165 145
           L 100 175
           L 35 145
           Q 25 140 25 130
           L 25 70
           Q 25 60 35 55
           L 100 25 Z"
        fill="url(#hexagonGradient)" 
        stroke={voiceState === 'listening' ? '#10b981' : '#059669'}
        strokeWidth={voiceState === 'listening' ? '2.5' : '1.5'}
        filter="url(#glow)"
        className={voiceState === 'listening' ? 'animate-pulse' : ''}
        animate={
          initializationState !== 'ready' 
            ? { 
                scale: [1, 1.02, 1],
                opacity: [0.8, 1, 0.8]
              }
            : {}
        }
        transition={
          initializationState !== 'ready'
            ? {
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }
            : {}
        }
      />
      
      {/* Eyes with blink animation */}
      <motion.g>
        <motion.ellipse 
          cx="85" 
          cy="85" 
          rx="4.5" 
          ry="5"
          fill="#064e3b"
          animate={isBlinking ? { scaleY: 0.1 } : { scaleY: 1 }}
          transition={{ duration: 0.15 }}
          style={{ originY: "85px", originX: "85px" }}
        />
        <motion.ellipse 
          cx="115" 
          cy="85" 
          rx="4.5" 
          ry="5"
          fill="#064e3b"
          animate={isBlinking ? { scaleY: 0.1 } : { scaleY: 1 }}
          transition={{ duration: 0.15 }}
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
      
      {/* Animated Mouth - integrated with proper z-order and sizing */}
      <AnimatedMouth
        position={{ x: 100, y: 118 }}
        width={40}
        strokeWidth={4}
        color="#064e3b"
        className="z-10"
      />
    </svg>
  );
};
