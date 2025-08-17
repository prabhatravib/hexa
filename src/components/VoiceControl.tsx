import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, AlertCircle, Loader2 } from 'lucide-react';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';
import { useAnimationStore } from '@/store/animationStore';

export const VoiceControl: React.FC = () => {
  const { voiceState, isVoiceActive } = useAnimationStore();
  const [showTranscript, setShowTranscript] = useState(false);
  
  const {
    isConnected,
    isRecording,
    transcript,
    response,
    connect,
    startRecording,
    stopRecording,
    sendText,
    interrupt,
    clearTranscript,
    clearResponse
  } = useVoiceInteraction({
    autoStart: true,
    onTranscription: (text) => {
      setShowTranscript(true);
      setTimeout(() => setShowTranscript(false), 3000);
    }
  });
  
  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  const getStatusIcon = () => {
    switch (voiceState) {
      case 'listening':
        return <Mic className="w-5 h-5 animate-pulse" />;
      case 'thinking':
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case 'speaking':
        return <Volume2 className="w-5 h-5 animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <MicOff className="w-5 h-5" />;
    }
  };
  
  const getStatusColor = () => {
    switch (voiceState) {
      case 'listening':
        return 'bg-green-500';
      case 'thinking':
        return 'bg-yellow-500';
      case 'speaking':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };
  
  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
      {/* Main control button */}
      <motion.button
        className={`
          relative p-4 rounded-full text-white shadow-lg
          transition-colors duration-300 ${getStatusColor()}
          ${isConnected ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
        `}
        onClick={handleToggleRecording}
        disabled={!isConnected}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {getStatusIcon()}
        
        {/* Pulse animation when active */}
        <AnimatePresence>
          {isVoiceActive && (
            <motion.div
              className={`absolute inset-0 rounded-full ${getStatusColor()}`}
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{
                scale: [1, 1.5, 1.5],
                opacity: [0.5, 0, 0]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity
              }}
            />
          )}
        </AnimatePresence>
      </motion.button>
      
      {/* Transcript display */}
      <AnimatePresence>
        {showTranscript && transcript && (
          <motion.div
            className="absolute bottom-20 left-1/2 transform -translate-x-1/2 
                     bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 
                     max-w-xs whitespace-nowrap"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <p className="text-sm text-gray-700 dark:text-gray-300">
              "{transcript}"
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Response display */}
      <AnimatePresence>
        {response && (
          <motion.div
            className="absolute bottom-20 left-1/2 transform -translate-x-1/2 
                     bg-blue-50 dark:bg-blue-900 rounded-lg shadow-lg p-3 
                     max-w-md"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {response}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Connection status */}
      {!isConnected && (
        <div className="absolute -top-2 -right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </div>
  );
};
