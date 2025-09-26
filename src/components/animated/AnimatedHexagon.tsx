import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { useAnimationState, useAnimationSequence } from '@/hooks/useAnimationState';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';
import { useVoiceStatus } from '@/hooks/useVoiceStatus';
// import { DevPanel } from './DevPanel';
import { HexagonSVG } from './HexagonSVG';
import { LoadingOverlay, TranscriptDisplay, ResponseDisplay, StatusText } from './StatusOverlays';
import { HEXAGON_ANIMATION_VARIANTS, SCALE, OPACITY } from '@/animations/constants';
import './hexagon.css';
import { useVoiceDisableEffects } from '@/hooks/useVoiceDisableEffects';

interface AnimatedHexagonProps {
  size?: number;
  className?: string;
  onTranscript?: (transcript: string) => void;
  onResponse?: (response: string) => void;
  onSendTextAvailable?: (handler: ((text: string) => Promise<boolean>) | null) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export const AnimatedHexagon: React.FC<AnimatedHexagonProps> = ({
  size = 200,
  className = '',
  onTranscript,
  onResponse,
  onSendTextAvailable,
  onConnectionChange
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
    isVoiceDisabled,
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
    sendText,
    startRecording,
    stopRecording,
    interrupt,
  } = useVoiceInteraction({
    autoStart: true, // Let the voice system initialize normally
  });

  // Pass transcript to parent component
  useEffect(() => {
    if (transcript && onTranscript) {
      console.log('📝 AnimatedHexagon: Sending transcript to parent:', transcript);
      onTranscript(transcript);
    }
  }, [transcript, onTranscript]);

  // Pass response to parent component
  useEffect(() => {
    console.log('🤖 AnimatedHexagon: Response changed:', response);
    if (response && onResponse) {
      console.log('🤖 AnimatedHexagon: Sending response to parent:', response);
      onResponse(response);
    }
  }, [response, onResponse]);

  useEffect(() => {
    if (!onSendTextAvailable) {
      return;
    }

    onSendTextAvailable(sendText);
    return () => {
      onSendTextAvailable(null);
    };
  }, [onSendTextAvailable, sendText]);

  useEffect(() => {
    if (!onConnectionChange) {
      return;
    }

    onConnectionChange(isConnected);
    return () => {
      onConnectionChange(false);
    };
  }, [onConnectionChange, isConnected]);

  // Voice status hook
  const { getVoiceStatusIcon, getVoiceStatusColor } = useVoiceStatus();

  // Dev panel visibility (can be controlled by query param or environment)
  // const [showDevPanel, setShowDevPanel] = useState(() => {
  //   if (typeof window !== 'undefined') {
  //     const urlParams = new URLSearchParams(window.location.search);
  //     return urlParams.get('dev') === 'true' || process.env.NODE_ENV === 'development';
  //   }
  //   return false;
  // });

  // UI preferences: hide floating bubbles above the hexagon
  // Keep chat panel as the single source of conversation UI
  const SHOW_TRANSCRIPT_OVERLAY = false;
  const SHOW_RESPONSE_OVERLAY = false;


  useEffect(() => {
    startIdleAnimation();
    return () => stopIdleAnimation();
  }, []);

  // Centralized voice disable/enable side effects
  useVoiceDisableEffects({ isVoiceDisabled, stopRecording, interrupt });

  // Handle voice toggle - now the entire hexagon is the voice interface
  const handleVoiceToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the main click handler
    
    // Prevent interaction if voice is disabled
    if (isVoiceDisabled) {
      console.log('⚠️ Voice interaction blocked - voice is disabled');
      return;
    }
    
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


  // Animation variants using constants
  const containerVariants = HEXAGON_ANIMATION_VARIANTS.container;
  
  const glowVariants = {
    ...HEXAGON_ANIMATION_VARIANTS.glow,
    idle: {
      ...HEXAGON_ANIMATION_VARIANTS.glow.idle,
      opacity: isPulsing ? [OPACITY.GLOW_MIN, OPACITY.GLOW_MAX, OPACITY.GLOW_MIN] : OPACITY.GLOW_MIN,
      scale: isPulsing ? [SCALE.IDLE, SCALE.PULSE_MAX, SCALE.IDLE] : SCALE.IDLE,
    }
  };
  
  const eyeVariants = HEXAGON_ANIMATION_VARIANTS.eye;

  return (
    // Match the wrapper size to `size` so absolute overlays (e.g., progress bar)
    // align with the same column as the Voice toggle above.
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      {/* Dev Panel */}
      {/* <DevPanel isVisible={showDevPanel} /> */}
      
      {/* Loading overlay during initialization */}
      <LoadingOverlay 
        isVisible={initializationState !== 'ready'}
        initializationState={initializationState}
        initializationProgress={initializationProgress}
      />
      
      {/* Optional floating bubbles above hexagon (disabled by default) */}
      {SHOW_TRANSCRIPT_OVERLAY && <TranscriptDisplay transcript={transcript} />}
      {SHOW_RESPONSE_OVERLAY && <ResponseDisplay response={response} />}

      <motion.div 
        className={`inline-block w-full h-full relative ${
          initializationState === 'ready' && !isVoiceDisabled ? 'cursor-pointer' : 'cursor-not-allowed'
        } ${isVoiceActive ? 'voice-active' : ''} ${initializationState !== 'ready' ? 'loading' : ''}`}
        style={{ 
          width: size,
          height: size,
          margin: '0 auto',
          filter: initializationState !== 'ready' ? 'blur(15px)' : 'none'
        }}
        variants={containerVariants}
        animate={animationState}
        initial="idle"
        onMouseEnter={initializationState === 'ready' && !isVoiceDisabled ? handleMouseEnter : undefined}
        onMouseLeave={initializationState === 'ready' && !isVoiceDisabled ? handleMouseLeave : undefined}
        onClick={handleVoiceToggle}
        whileTap={initializationState === 'ready' && !isVoiceDisabled ? { scale: 0.95 } : {}}
        title={
          isVoiceDisabled
            ? 'Voice disabled - use toggle button to enable'
            : initializationState === 'ready' 
              ? (isConnected ? 'Click to toggle voice recording' : 'Voice service not connected')
              : 'Voice system initializing...'
        }
      >
        <HexagonSVG 
          size={size}
          voiceState={voiceState}
          isBlinking={isBlinking}
          initializationState={initializationState}
        />

        {/* Voice status indicator in the center of the hexagon */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`${getVoiceStatusColor(isConnected)} ${isVoiceActive ? 'animate-pulse' : ''}`}>
            {getVoiceStatusIcon(isConnected)}
          </div>
        </div>

        {/* Connection status indicator */}
        {!isConnected && (
          <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </motion.div>

      
      {/* Status text below hexagon */}
      {/* <StatusText initializationState={initializationState} /> */}
      
      {/* Dev panel toggle button */}
      {/* <button
        onClick={() => setShowDevPanel(!showDevPanel)}
        className="absolute bottom-2 left-2 w-6 h-6 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
        title="Toggle Dev Panel"
      >
        {showDevPanel ? '×' : '⚙'}
      </button> */}
    </div>
  );
};
