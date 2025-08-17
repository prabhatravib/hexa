import { useEffect, useRef, useState, useCallback } from 'react';
import { useAnimationStore } from '@/store/animationStore';

interface UseVoiceInteractionOptions {
  wakeWord?: string;
  autoStart?: boolean;
  onTranscription?: (text: string) => void;
  onResponse?: (text: string) => void;
  onError?: (error: string) => void;
}

export const useVoiceInteraction = (options: UseVoiceInteractionOptions = {}) => {
  const {
    wakeWord = 'hey hexagon',
    autoStart = false,
    onTranscription,
    onResponse,
    onError
  } = options;

  const {
    setVoiceState,
    setVoiceActive,
    setSpeaking,
    setSpeechIntensity,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking
  } = useAnimationStore();

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  
  // Connect to WebSocket
  const connect = useCallback(async () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/voice/ws`);
      
      ws.onopen = () => {
        setIsConnected(true);
        setVoiceState('idle');
        console.log('Voice WebSocket connected successfully');
      };
      
      ws.onmessage = async (event) => {
        try {
          console.log('Raw WebSocket message received:', event.data);
          const data = JSON.parse(event.data as string);
          console.log('Parsed WebSocket message:', data);
          
          switch (data.type) {
            case 'ready':
              console.log('Voice session ready:', data.sessionId);
              break;
              
            case 'speech_started':
              startListening();
              break;
              
            case 'speech_stopped':
              stopListening();
              break;
              
            case 'transcription':
              setTranscript(data.text);
              onTranscription?.(data.text);
              break;
              
            case 'response_text_delta':
              setResponse(prev => prev + data.text);
              break;
              
            case 'audio_delta':
              // Queue audio for playback
              const audioData = base64ToArrayBuffer(data.audio);
              audioQueueRef.current.push(audioData);
              if (!isPlayingRef.current) {
                playAudioQueue();
              }
              break;
              
            case 'audio_done':
              // Response complete
              stopSpeaking();
              break;
              
            case 'error':
              console.error('Voice error received:', data);
              console.error('Error details:', data.error);
              setVoiceState('error');
              onError?.(data.error?.message || data.error || 'Unknown error');
              break;
              
            default:
              console.log('Unknown message type:', data.type, data);
          }
        } catch (parseError) {
          console.error('Failed to parse WebSocket message:', parseError, 'Raw data:', event.data);
          setVoiceState('error');
          onError?.('Failed to process voice message. Please try again.');
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setVoiceState('error');
        // Show user-friendly error message
        onError?.('Voice service connection failed. Please check your internet connection.');
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setVoiceState('idle');
        
        // If it's not a normal closure, show error
        if (event.code !== 1000) {
          const errorMessage = event.reason || `Connection closed with code ${event.code}`;
          onError?.(`Voice connection lost: ${errorMessage}`);
        }
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect:', error);
      setVoiceState('error');
      onError?.('Failed to initialize voice service');
    }
  }, []);
  
  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Try to use a supported format, fallback to default if needed
      let mimeType = 'audio/webm;codecs=opus';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        mimeType = 'audio/webm;codecs=pcm';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });
      
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          try {
            // Convert audio to PCM16 format
            const audioBuffer = await convertToPCM16(event.data);
            const base64 = arrayBufferToBase64(audioBuffer);
            
            wsRef.current?.send(JSON.stringify({
              type: 'audio',
              audio: base64
            }));
          } catch (error) {
            console.error('Failed to convert audio:', error);
            // Fallback to original format
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result?.toString().split(',')[1];
              if (base64) {
                wsRef.current?.send(JSON.stringify({
                  type: 'audio',
                  audio: base64
                }));
              }
            };
            reader.readAsDataURL(event.data);
          }
        }
      };
      
      mediaRecorder.start(100); // Send chunks every 100ms
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      startListening();
      
      // Set up audio context for visualization
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      // Animate mouth based on audio intensity
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateIntensity = () => {
        if (!isRecording) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setSpeechIntensity(average / 255);
        
        requestAnimationFrame(updateIntensity);
      };
      updateIntensity();
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setVoiceState('error');
    }
  }, [isRecording]);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    stopListening();
    setSpeechIntensity(0);
  }, []);
  
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
  
  // Send text message
  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text',
        text
      }));
      setTranscript(text);
    }
  }, []);
  
  // Switch agent
  const switchAgent = useCallback((agentId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'switch_agent',
        agentId
      }));
    }
  }, []);

  // Interrupt current response
  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'control',
        command: 'interrupt'
      }));
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    stopSpeaking();
  }, []);
  
  // Clean up
  useEffect(() => {
    if (autoStart) {
      connect();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopRecording();
    };
  }, []);
  
  return {
    isConnected,
    isRecording,
    transcript,
    response,
    connect,
    disconnect: () => wsRef.current?.close(),
    startRecording,
    stopRecording,
    sendText,
    switchAgent,
    interrupt,
    clearTranscript: () => setTranscript(''),
    clearResponse: () => setResponse('')
  };
};

// Helper function
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert audio blob to PCM16 format
async function convertToPCM16(audioBlob: Blob): Promise<ArrayBuffer> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Convert to PCM16
  const length = audioBuffer.length;
  const pcm16 = new Int16Array(length);
  
  for (let i = 0; i < length; i++) {
    // Convert float32 to int16
    const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(0)[i]));
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  
  return pcm16.buffer;
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
