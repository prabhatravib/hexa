import React from 'react';
import { Mic, MicOff, Volume2, AlertCircle, Loader2 } from 'lucide-react';
import { useAnimationStore } from '@/store/animationStore';

/**
 * Hook for voice status display logic
 * Extracted from AnimatedHexagon to reduce redundancy
 * Preserves all existing functionality
 */
export const useVoiceStatus = () => {
  const { 
    voiceState, 
    isVoiceDisabled, 
    initializationState
  } = useAnimationStore();

  // Get voice status icon for the center of the hexagon
  const getVoiceStatusIcon = (isConnected: boolean) => {
    if (isVoiceDisabled) {
      return <MicOff className="w-6 h-6" />;
    }
    
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
  const getVoiceStatusColor = (isConnected: boolean) => {
    if (isVoiceDisabled) {
      return 'text-gray-400';
    }
    
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

  return {
    getVoiceStatusIcon,
    getVoiceStatusColor,
    voiceState,
    isVoiceDisabled,
    initializationState
  };
};
