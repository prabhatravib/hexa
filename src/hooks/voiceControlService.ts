import { useCallback } from 'react';
import { useAnimationStore } from '@/store/animationStore';
import { safeSessionSend } from '@/lib/voiceSessionUtils';

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
  
  // Get voice disabled state from animation store
  const { isVoiceDisabled } = useAnimationStore();
  
  // Start recording
  const startRecording = useCallback(async () => {
    // Block recording if voice is disabled
    if (isVoiceDisabled) {
      console.log('🔇 Voice recording blocked - voice is disabled');
      return;
    }

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
      
      // Add debugging to check if session is receiving audio
      const session = openaiAgentRef.current;
      if (session) {
        console.log('🔍 Session state:', session.state);
        console.log('🔍 Session ready state:', session.readyState);
        
        // Check if we can access the input audio buffer
        if (session._inputAudioBuffer) {
          console.log('🔍 Input audio buffer available');
        } else {
          console.log('⚠️ Input audio buffer not available');
        }
      }
      
      // Check microphone permissions
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            console.log('🎤 Microphone access granted');
            // Stop the stream immediately as we don't need it
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(error => {
            console.error('❌ Microphone access denied:', error);
            onError?.('Microphone access is required for voice interaction');
          });
      } else {
        console.error('❌ MediaDevices API not available');
        onError?.('Your browser does not support microphone access');
      }
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setVoiceState('error');
    }
  }, [startListening, setVoiceState, isVoiceDisabled]);
   
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
  
  // Enhanced audio playback with real-time speech intensity analysis
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
      
      // Create analyser for mouth animation with higher resolution
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512; // Higher resolution for better analysis
      analyser.smoothingTimeConstant = 0.3; // Smoother transitions
      source.connect(analyser);
      analyser.connect(audioContextRef.current.destination);
      
      // Enhanced speech intensity analysis for mouth animation
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateIntensity = () => {
        if (!isPlayingRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate speech intensity with better frequency weighting
        // Focus on speech frequencies (85Hz - 255Hz) for more accurate mouth movement
        const speechFrequencies = dataArray.slice(2, 8); // Roughly 85-255Hz range
        const speechAverage = speechFrequencies.reduce((a, b) => a + b) / speechFrequencies.length;
        
        // Apply perceptual weighting and normalize
        const intensity = Math.pow(speechAverage / 255, 0.7); // Perceptual curve
        const normalizedIntensity = Math.max(0, Math.min(1, intensity));
        
        // Update speech intensity for mouth animation
        setSpeechIntensity(normalizedIntensity);
        
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

  // New function to handle OpenAI audio streaming with real-time analysis
  const handleOpenAIAudioStream = useCallback(async (audioChunk: ArrayBuffer) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    try {
      // Decode the audio chunk
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioChunk);
      
      // Create a source for analysis
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create analyser for real-time speech intensity
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2; // Faster response for real-time
      
      source.connect(analyser);
      analyser.connect(audioContextRef.current.destination);
      
      // Real-time speech intensity analysis
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateIntensity = () => {
        analyser.getByteFrequencyData(dataArray);
        
        // Focus on speech frequencies and calculate intensity
        const speechFrequencies = dataArray.slice(2, 8);
        const speechAverage = speechFrequencies.reduce((a, b) => a + b) / speechFrequencies.length;
        
        // Apply perceptual weighting and normalize
        const intensity = Math.pow(speechAverage / 255, 0.7);
        const normalizedIntensity = Math.max(0, Math.min(1, intensity));
        
        // Update speech intensity for mouth animation
        setSpeechIntensity(normalizedIntensity);
      };
      
      // Update intensity during playback
      const updateInterval = setInterval(updateIntensity, 16); // ~60fps
      
      source.onended = () => {
        clearInterval(updateInterval);
        setSpeechIntensity(0); // Reset when audio ends
      };
      
      source.start();
      
    } catch (error) {
      console.error('Failed to process OpenAI audio chunk:', error);
    }
  }, [audioContextRef, setSpeechIntensity]);
   
  // Send text message via HTTP POST
  const sendText = useCallback(async (text: string) => {
    // Block text sending if voice is disabled
    if (isVoiceDisabled) {
      console.log('🔇 Text sending blocked - voice is disabled');
      return false;
    }

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
  }, [onError, isVoiceDisabled]);
   
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
      // First, try to cancel locally via RealtimeSession if available
      const s: any = openaiAgentRef.current;
      if (s) {
        try {
          // FIXED: Only cancel if there's no active response being created
          // This prevents cancelling new responses that are just starting
          const currentResponseId = (window as any).__currentResponseId;
          if (currentResponseId) {
            console.log('🛑 Interrupt blocked: Active response in progress, ID:', currentResponseId);
            return true; // Don't interrupt, let the response complete
          }
          
          // Best-effort set of cancellation events used across SDK versions
          // Note: response.cancel_all was removed in newer SDK versions - only response.cancel is valid
          await safeSessionSend(s, { type: 'response.cancel' });
          await safeSessionSend(s, { type: 'input_audio_buffer.clear' });
          await safeSessionSend(s, { type: 'output_audio_buffer.clear' });
        } catch (e) {
          console.warn('⚠️ Local interrupt via session failed, will fall back to HTTP', e);
        }
      }

      // Also notify the worker for parity (no-ops on frontend is fine)
      try {
        const response = await fetch('/voice/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'control', command: 'interrupt' })
        });
        // Ignore non-OK here – local cancellation is primary
      } catch {}

      // Clear UI state
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
    handleOpenAIAudioStream, // Export the new function
    sendText,
    switchAgent,
    interrupt
  };
};
