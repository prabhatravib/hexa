import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { useAnimationState, useAnimationSequence } from '@/hooks/useAnimationState';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';
import { AnimatedMouth } from './AnimatedMouth';
import { DevPanel } from './DevPanel';
import { TIMING, EASING, SCALE, ROTATION, OPACITY, KEYFRAMES } from '@/animations/constants';
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
    initializationState,
    initializationProgress,
    isReadyForInteraction,
  } = useAnimationStore();

  // Use the enhanced animation hooks
  const { timeSinceLastActivity } = useAnimationState();
  const { greet, thinking } = useAnimationSequence();

  // Voice interaction hook
  const {
    isConnected,
    isRecording,
    transcript,
    response,
    startRecording,
    stopRecording,
  } = useVoiceInteraction({
    autoStart: true,
    onTranscription: (text) => {
      // Handle transcription if needed
    }
  });

  // Dev panel visibility (can be controlled by query param or environment)
  const [showDevPanel, setShowDevPanel] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('dev') === 'true' || process.env.NODE_ENV === 'development';
    }
    return false;
  });

  useEffect(() => {
    startIdleAnimation();
    return () => stopIdleAnimation();
  }, []);

  const hexagonPoints = "100,20 180,60 180,140 100,180 20,140 20,60";
  
  // Handle voice toggle - now the entire hexagon is the voice interface
  const handleVoiceToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the main click handler
    
    // Prevent interaction until system is ready
    if (initializationState !== 'ready') {
      console.log('⚠️ Voice interaction blocked - system not ready');
      return;
    }
    
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Get voice status icon for the center of the hexagon
  const getVoiceStatusIcon = () => {
    if (initializationState !== 'ready') {
      return <Loader2 className="w-6 h-6 animate-spin" />;
    }
    
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
    if (initializationState !== 'ready') {
      return 'text-blue-500';
    }
    
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
      {/* Dev Panel */}
      <DevPanel isVisible={showDevPanel} />
      
      {/* Loading overlay during initialization */}
      <AnimatePresence>
        {initializationState !== 'ready' && (
          <motion.div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-full z-20 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              {initializationState === 'initializing' && (
                <div className="flex flex-col items-center space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                  <span className="text-sm text-white font-medium">Initializing...</span>
                </div>
              )}
              
              {initializationState === 'connecting' && (
                <div className="flex flex-col items-center space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm text-white font-medium">Connecting...</span>
                  <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-blue-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${initializationProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <span className="text-xs text-gray-300">{initializationProgress}%</span>
                </div>
              )}
              
              {initializationState === 'error' && (
                <div className="flex flex-col items-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                  <span className="text-sm text-white font-medium">Connection Failed</span>
                  <span className="text-xs text-gray-300 text-center px-2">Please refresh the page to retry</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
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
        className={`inline-block w-full h-full relative ${
          initializationState === 'ready' ? 'cursor-pointer' : 'cursor-not-allowed'
        }`}
        variants={containerVariants}
        animate={animationState}
        initial="idle"
        onMouseEnter={initializationState === 'ready' ? handleMouseEnter : undefined}
        onMouseLeave={initializationState === 'ready' ? handleMouseLeave : undefined}
        onClick={handleVoiceToggle}
        whileTap={initializationState === 'ready' ? { scale: 0.95 } : {}}
        title={
          initializationState === 'ready' 
            ? (isConnected ? 'Click to toggle voice recording' : 'Voice service not connected')
            : 'Voice system initializing...'
        }
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
            className={voiceState === 'listening' ? 'animate-pulse' : ''}
          />
          
          {/* Main hexagon */}
          <motion.polygon 
            points={hexagonPoints} 
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
          
          {/* Animated Mouth - integrated with proper z-order and sizing */}
          <AnimatedMouth
            position={{ x: 100, y: 118 }}
            width={40}
            strokeWidth={4}
            color="#064e3b"
            className="z-10"
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
        {isVoiceActive && (
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
      
      {/* Status text below hexagon */}
      <AnimatePresence>
        {initializationState !== 'ready' && (
          <motion.div
            className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              {initializationState === 'initializing' && 'Initializing voice system...'}
              {initializationState === 'connecting' && 'Connecting to voice service...'}
              {initializationState === 'error' && 'Connection failed'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Dev panel toggle button */}
      <button
        onClick={() => setShowDevPanel(!showDevPanel)}
        className="absolute bottom-2 left-2 w-6 h-6 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
        title="Toggle Dev Panel"
      >
        {showDevPanel ? '×' : '⚙'}
      </button>
    </div>
  );
};
