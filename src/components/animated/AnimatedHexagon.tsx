import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';
import { useAnimationState, useAnimationSequence } from '@/hooks/useAnimationState';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';
import { useVoiceStatus } from '@/hooks/useVoiceStatus';
import { DevPanel } from './DevPanel';
import { HexagonSVG } from './HexagonSVG';
import { LoadingOverlay, TranscriptDisplay, ResponseDisplay, StatusText } from './StatusOverlays';
import { HEXAGON_ANIMATION_VARIANTS, SCALE, OPACITY } from '@/animations/constants';
import './hexagon.css';

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
    startRecording,
    stopRecording,
    interrupt,
  } = useVoiceInteraction({
    autoStart: true, // Let the voice system initialize normally
    onTranscription: (text) => {
      // Handle transcription if needed
    }
  });

  // Voice status hook
  const { getVoiceStatusIcon, getVoiceStatusColor } = useVoiceStatus();

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

  // Block voice system immediately if disabled on mount
  useEffect(() => {
    if (isVoiceDisabled) {
      console.log('🔇 Voice disabled on mount - preventing all voice initialization');
      // Set a global flag to prevent voice system initialization
      (window as any).__voiceSystemBlocked = true;
    } else {
      (window as any).__voiceSystemBlocked = false;
    }
  }, [isVoiceDisabled]);


  // Block voice system when disabled
  useEffect(() => {
    if (isVoiceDisabled) {
      console.log('🔇 Voice disabled - blocking all voice processing');
      
      // Block microphone access at the browser level immediately
      try {
        // Override getUserMedia to block microphone access
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          console.log('🔇 Voice disabled: blocking microphone access');
          throw new Error('Microphone access blocked - voice is disabled');
        };
        
        // Store the original function for restoration
        (window as any).__originalGetUserMedia = originalGetUserMedia;
      } catch (error) {
        console.error('Failed to block microphone access:', error);
      }
      
      // Stop any active recording
      try { stopRecording(); } catch {}
      
      // Interrupt any ongoing responses
      try { interrupt?.(); } catch {}
      
      // Block the AI from processing by disabling turn detection and audio
      try {
        const s: any = (window as any).activeSession;
        const send = s?.send || s?.emit || s?.transport?.sendEvent;
        if (send) {
          // Cancel any ongoing responses
          send.call(s, { type: 'response.cancel' });
          send.call(s, { type: 'response.cancel_all' });
          send.call(s, { type: 'input_audio_buffer.clear' });
          send.call(s, { type: 'output_audio_buffer.clear' });
          
          // Completely disable the AI from processing
          send.call(s, { type: 'session.update', session: { 
            turn_detection: { 
              create_response: false,
              threshold: 0,
              silence_duration_ms: 0
            } 
          }});
          
          // Also disable audio input/output
          send.call(s, { type: 'input_audio_buffer.disable' });
          send.call(s, { type: 'output_audio_buffer.disable' });
          
          // Block microphone input at the RealtimeSession level
          try {
            // Override the session's internal microphone handling
            if (s._inputAudioBuffer) {
              s._inputAudioBuffer.disable = () => console.log('🔇 Input audio buffer disabled');
              s._inputAudioBuffer.enable = () => console.log('🔇 Input audio buffer enable blocked');
            }
            
            // Block the session's internal audio processing
            if (s._audioProcessor) {
              s._audioProcessor.stop = () => console.log('🔇 Audio processor stopped');
              s._audioProcessor.start = () => console.log('🔇 Audio processor start blocked');
            }
          } catch (audioError) {
            console.log('🔇 Audio blocking applied:', audioError instanceof Error ? audioError.message : 'Unknown error');
          }
        }
      } catch (error) {
        console.error('Failed to disable voice processing:', error);
      }
      
      // Mute all audio elements
      try {
        const els = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
        els.forEach(el => { 
          try { 
            el.muted = true; 
            if (!el.paused) el.pause(); 
          } catch {} 
        });
      } catch {}
    } else {
      console.log('🔊 Voice enabled - restoring voice processing');
      
      
      // Restore AI processing
      try {
        const s: any = (window as any).activeSession;
        const send = s?.send || s?.emit || s?.transport?.sendEvent;
        if (send) {
          send.call(s, { type: 'session.update', session: { 
            turn_detection: { 
              create_response: true,
              threshold: 0.5,
              silence_duration_ms: 500
            } 
          }});
          
          // Re-enable audio input/output
          send.call(s, { type: 'input_audio_buffer.enable' });
          send.call(s, { type: 'output_audio_buffer.enable' });
        }
      } catch (error) {
        console.error('Failed to enable voice processing:', error);
      }
      
      // Force re-initialization of voice system
      try {
        // Clear any existing session to force re-initialization
        if ((window as any).activeSession) {
          console.log('🔊 Voice enabled: clearing existing session for re-initialization');
          (window as any).activeSession = null;
        }
        
        // Trigger a re-connection to ensure everything is working
        if (typeof window !== 'undefined' && (window as any).__hexaReset) {
          console.log('🔊 Voice enabled: triggering voice system reset');
          (window as any).__hexaReset();
        }
      } catch (error) {
        console.error('Failed to reset voice system:', error);
      }
      
      // Unmute audio elements
      try {
        const els = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
        els.forEach(el => { 
          try { 
            el.muted = false; 
          } catch {} 
        });
      } catch {}
    }
  }, [isVoiceDisabled, stopRecording, interrupt]);

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
    <div className={`relative inline-block ${className}`} style={{ width: size * 1.4, height: size * 1.4 }}>
      {/* Dev Panel */}
      <DevPanel isVisible={showDevPanel} />
      
      {/* Loading overlay during initialization */}
      <LoadingOverlay 
        isVisible={initializationState !== 'ready'}
        initializationState={initializationState}
        initializationProgress={initializationProgress}
      />
      
      {/* Transcript display above hexagon */}
      <TranscriptDisplay transcript={transcript} />

      {/* Response display above hexagon */}
      <ResponseDisplay response={response} />

      <motion.div 
        className={`inline-block w-full h-full relative ${
          initializationState === 'ready' && !isVoiceDisabled ? 'cursor-pointer' : 'cursor-not-allowed'
        } ${isVoiceActive ? 'voice-active' : ''} ${initializationState !== 'ready' ? 'loading' : ''}`}
        style={{ 
          width: size,
          height: size,
          margin: '0 auto'
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
      <StatusText initializationState={initializationState} />
      
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
