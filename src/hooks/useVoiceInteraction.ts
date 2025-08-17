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
          const data = JSON.parse(event.data);
          
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
              console.error('Voice error:', data.error);
              setVoiceState('error');
              onError?.(data.error?.message || 'Unknown error');
              break;
          }
        } catch (parseError) {
          console.error('Failed to parse WebSocket message:', parseError);
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
          onError?.('Voice connection lost. Please try again.');
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
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
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
