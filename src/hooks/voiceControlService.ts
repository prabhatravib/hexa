import { useCallback } from 'react';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceControlServiceOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startListening: () => void;
  stopListening: () => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
  setSpeechIntensity: (intensity: number) => void;
  openaiAgentRef: React.MutableRefObject<any>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  audioQueueRef: React.MutableRefObject<ArrayBuffer[]>;
  isPlayingRef: React.MutableRefObject<boolean>;
}

export const useVoiceControlService = ({
  setVoiceState,
  onError,
  startListening,
  stopListening,
  startSpeaking,
  stopSpeaking,
  setSpeechIntensity,
  openaiAgentRef,
  audioContextRef,
  audioQueueRef,
  isPlayingRef
}: VoiceControlServiceOptions) => {
  
  // Start recording
  const startRecording = useCallback(async () => {
    try {
      if (!openaiAgentRef.current) {
        console.error('❌ OpenAI Agent not initialized');
        return;
      }

      console.log('🎤 Starting recording with OpenAI Agent...');
      
      // The RealtimeSession automatically handles audio input/output
      // Just update the UI state
      startListening();
      setVoiceState('listening');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setVoiceState('error');
    }
  }, [startListening, setVoiceState]);
   
  // Stop recording
  const stopRecording = useCallback(async () => {
    try {
      // The RealtimeSession automatically handles stopping
      stopListening();
      setSpeechIntensity(0);
      setVoiceState('idle');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [stopListening, setVoiceState, setSpeechIntensity]);
  
  // Play audio queue
  const playAudioQueue = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      stopSpeaking();
      return;
    }
    
    isPlayingRef.current = true;
    startSpeaking();
    
    const audioData = audioQueueRef.current.shift()!;
    
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    
    try {
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create analyser for mouth animation
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContextRef.current.destination);
      
      // Animate mouth during playback
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateIntensity = () => {
        if (!isPlayingRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setSpeechIntensity(average / 255);
        
        requestAnimationFrame(updateIntensity);
      };
      updateIntensity();
      
      source.onended = () => {
        playAudioQueue(); // Play next in queue
      };
      
      source.start();
    } catch (error) {
      console.error('Failed to play audio:', error);
      playAudioQueue(); // Skip and continue
    }
  };
   
  // Send text message via HTTP POST
  const sendText = useCallback(async (text: string) => {
    try {
      const response = await fetch('/voice/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', text })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send text:', error);
      onError?.('Failed to send message');
      return false;
    }
  }, [onError]);
   
  // Switch agent
  const switchAgent = useCallback(async (agentId: string) => {
    try {
      const response = await fetch('/voice/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'switch_agent', agentId })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to switch agent:', error);
      onError?.('Failed to switch agent');
      return false;
    }
  }, [onError]);
 
  // Interrupt current response
  const interrupt = useCallback(async () => {
    try {
      // The RealtimeSession handles interruption automatically
      // Just clear the audio queue and update UI state
      
      const response = await fetch('/voice/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'control', command: 'interrupt' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      stopSpeaking();
      setVoiceState('idle');
      
      return true;
    } catch (error) {
      console.error('Failed to interrupt:', error);
      onError?.('Failed to interrupt response');
      return false;
    }
  }, [onError, stopSpeaking, setVoiceState, audioQueueRef, isPlayingRef]);

  return {
    startRecording,
    stopRecording,
    playAudioQueue,
    sendText,
    switchAgent,
    interrupt
  };
};
