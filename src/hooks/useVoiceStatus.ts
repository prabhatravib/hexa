import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';
import { useAnimationStore } from '@/store/animationStore';
import { Mic, MicOff, Volume2, AlertCircle, Loader2 } from 'lucide-react';

export const useVoiceStatus = () => {
  // Voice interaction hook
  const {
    isConnected,
    isRecording,
    transcript,
    response,
    startRecording,
    stopRecording,
    voiceState,
  } = useVoiceInteraction({
    autoStart: true,
    onTranscription: (text) => {
      // Handle transcription if needed
    }
  });

  // Get voice active state from animation store
  const { isVoiceActive } = useAnimationStore();

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

  return {
    isConnected,
    isRecording,
    transcript,
    response,
    startRecording,
    stopRecording,
    voiceState,
    isVoiceActive,
    handleVoiceToggle,
    getVoiceStatusIcon,
    getVoiceStatusColor,
  };
};
