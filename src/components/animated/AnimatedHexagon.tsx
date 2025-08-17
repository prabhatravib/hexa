import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { useAnimationState, useAnimationSequence } from '@/hooks/useAnimationState';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';
import { TIMING, EASING, SCALE, ROTATION, OPACITY, MOUTH_PATHS, KEYFRAMES } from '@/animations/constants';
import { Mic, MicOff, Volume2, AlertCircle, Loader2 } from 'lucide-react';

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
    voiceState,
    isVoiceActive,
  } = useAnimationStore();

  // Use the enhanced animation hooks
  const { timeSinceLastActivity } = useAnimationState();
  const { greet, thinking } = useAnimationSequence();

  // Voice interaction hook - restored with proper functionality
  const {
    isConnected,
    isRecording,
    transcript,
    response,
    startRecording,
    stopRecording,
  } = useVoiceInteraction({
    autoStart: false,
    onTranscription: (text) => {
      // Handle transcription if needed
    }
  });

  useEffect(() => {
    startIdleAnimation();
    return () => {
      stopIdleAnimation();
      // Clean up any remaining timers
      const { cleanup } = useAnimationStore.getState();
      cleanup();
    };
  }, []);

  const hexagonPoints = "100,20 180,60 180,140 100,180 20,140 20,60";
  
  // Handle voice toggle - now the entire hexagon is the voice interface
  const handleVoiceToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the main click handler
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Get voice status icon for the center of the hexagon
  const getVoiceStatusIcon = () => {
    if (!isConnected) {
      return <MicOff className="w-6 h-6" />;
    }
    
    switch (voiceState) {
      case 'listening':
        return <Mic className="w-6 h-6 animate-pulse" />;
      case 'thinking':
        return <Loader2 className="w-6 h-6 animate-spin" />;
      case 'speaking':
        return <Volume2 className="w-6 h-6 animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-6 h-6" />;
      default:
        return <Mic className="w-6 h-6" />;
    }
  };

  // Get voice status color
  const getVoiceStatusColor = () => {
    if (!isConnected) return 'text-gray-400';
    
    switch (voiceState) {
      case 'listening':
        return 'text-green-500';
      case 'thinking':
        return 'text-yellow-500';
      case 'speaking':
        return 'text-blue-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-green-400';
    }
  };

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
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      {/* Transcript display above hexagon */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            className="absolute -top-20 left-1/2 transform -translate-x-1/2 
                     bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 
                     max-w-xs whitespace-nowrap z-10 border border-gray-200 dark:border-gray-600"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
              "{transcript}"
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Response display above hexagon */}
      <AnimatePresence>
        {response && (
          <motion.div
            className="absolute -top-20 left-1/2 transform -translate-x-1/2 
                     bg-blue-50 dark:bg-blue-900 rounded-lg shadow-lg p-3 
                     max-w-md z-10 border border-blue-200 dark:border-blue-700"
            initial={{ opacity: 0, y: 10 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <p className="text-sm text-blue-700 dark:text-blue-300 text-center">
              {response}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        className="inline-block cursor-pointer w-full h-full relative"
        variants={containerVariants}
        animate={animationState || 'idle'}
        initial="idle"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleVoiceToggle}
        whileTap={{ scale: 0.95 }}
        title={isConnected ? 'Click to toggle voice recording' : 'Voice service not connected'}
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
            animate={animationState || 'idle'}
            className={(voiceState || 'idle') === 'listening' ? 'animate-pulse' : ''}
          />
          
          {/* Main hexagon */}
          <motion.polygon 
            points={hexagonPoints} 
            fill="url(#hexagonGradient)" 
            stroke={(voiceState || 'idle') === 'listening' ? '#10b981' : '#059669'}
            strokeWidth={(voiceState || 'idle') === 'listening' ? '2.5' : '1.5'}
            filter="url(#glow)"
            className={(voiceState || 'idle') === 'listening' ? 'animate-pulse' : ''}
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
            initial={{ d: MOUTH_PATHS.HAPPY }}
          />
        </svg>

        {/* Voice status indicator in the center of the hexagon */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`${getVoiceStatusColor()} ${isVoiceActive ? 'animate-pulse' : ''}`}>
            {getVoiceStatusIcon()}
          </div>
        </div>

        {/* Connection status indicator */}
        {!isConnected && (
          <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </motion.div>

      {/* Voice active pulse ring around the entire hexagon */}
      <AnimatePresence>
        {(isVoiceActive || false) && (
          <motion.div
            className="absolute inset-0 border-2 border-green-500 rounded-full"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{
              scale: [1, 1.1, 1.1],
              opacity: [0.7, 0, 0]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
