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
  const openaiWsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  
  // Connect using SSE for receiving messages
  const connect = useCallback(async () => {
    try {
      // Use SSE for receiving messages (real-time updates)
      const eventSource = new EventSource(`${window.location.origin}/voice/sse`);
      
      eventSource.onopen = () => {
        setIsConnected(true);
        setVoiceState('idle');
        console.log('Voice SSE connected successfully');
        // OpenAI connection is now handled automatically by the Worker
      };
      
      eventSource.onmessage = async (event) => {
        try {
          console.log('Raw SSE message received:', event.data);
          const data = JSON.parse(event.data);
          console.log('Parsed SSE message:', data);
          
          switch (data.type) {
            case 'connected':
              console.log('SSE connection established');
              break;
              
            case 'ready':
              console.log('Voice session ready:', data.sessionId);
              break;
              
            case 'openai_message':
              console.log('OpenAI message received:', data.data);
              // Handle OpenAI messages (transcription, audio, etc.)
              await handleOpenAIMessage(data.data);
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
          console.error('Failed to parse SSE message:', parseError, 'Raw data:', event.data);
          setVoiceState('error');
          onError?.('Failed to process voice message. Please try again.');
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setVoiceState('error');
        onError?.('Voice service connection failed. Please check your internet connection.');
      };
      
      // Store reference for cleanup
      wsRef.current = eventSource as any; // Reuse wsRef for cleanup
      
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
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else {
        mimeType = 'audio/webm'; // Default fallback
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });
      
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          try {
            // Try to send the original audio format first
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64 = reader.result?.toString().split(',')[1];
              if (base64) {
                try {
                  const response = await fetch('/voice/message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'audio', audio: base64 })
                  });
                  
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                  }
                } catch (error) {
                  console.error('Failed to send audio:', error);
                }
              }
            };
            reader.readAsDataURL(event.data);
            
          } catch (error) {
            console.error('Failed to process audio:', error);
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
      
      setTranscript(text);
    } catch (error) {
      console.error('Failed to send text:', error);
      onError?.('Failed to send message');
    }
  }, [onError]);
  
    // Handle OpenAI messages received through SSE
  const handleOpenAIMessage = useCallback(async (data: any) => {
    try {
      console.log('🔧 Processing OpenAI message:', data.type);
      
      switch (data.type) {
        case 'input_audio_buffer.speech_started':
          console.log('🎤 Speech started');
          startListening();
          break;
          
        case 'input_audio_buffer.speech_stopped':
          console.log('🔇 Speech stopped');
          stopListening();
          break;
          
        case 'response.audio_transcript.delta':
          console.log('📝 Transcription delta:', data.delta);
          setTranscript(prev => prev + data.delta);
          onTranscription?.(data.delta);
          break;
          
        case 'response.audio_transcript.done':
          console.log('✅ Transcription complete:', data.transcript);
          setTranscript(data.transcript);
          onTranscription?.(data.transcript);
          break;
          
        case 'response.audio.delta':
          console.log('🎵 Audio delta received');
          // Queue audio for playback
          const audioData = base64ToArrayBuffer(data.delta);
          audioQueueRef.current.push(audioData);
          if (!isPlayingRef.current) {
            playAudioQueue();
          }
          break;
          
        case 'response.done':
          console.log('✅ Response complete');
          stopSpeaking();
          break;
          
        case 'error':
          console.error('❌ OpenAI error:', data.error);
          setVoiceState('error');
          onError?.(data.error?.message || 'OpenAI error occurred');
          break;
          
        default:
          console.log('📨 Unknown OpenAI message type:', data.type, data);
      }
    } catch (error) {
      console.error('❌ Failed to handle OpenAI message:', error);
    }
  }, [startListening, stopListening, onTranscription, onError, setVoiceState, stopSpeaking]);

  // This function is no longer needed since connection is handled automatically
  // when SSE connects. Keeping for backward compatibility but not using it.
  const establishOpenAIConnection = useCallback(async (sessionId: string, clientSecret: string, instructions: string) => {
    console.log('🔧 Connection already established via SSE');
  }, []);

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
    } catch (error) {
      console.error('Failed to switch agent:', error);
      onError?.('Failed to switch agent');
    }
  }, [onError]);

  // Interrupt current response
  const interrupt = useCallback(async () => {
    try {
      const response = await fetch('/voice/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'control', command: 'interrupt' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to interrupt:', error);
      onError?.('Failed to interrupt response');
    }
    
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    stopSpeaking();
  }, [onError, stopSpeaking]);
  
  // Clean up
  useEffect(() => {
    if (autoStart) {
      connect();
    }
    
    return () => {
      if (wsRef.current) {
        // Handle both WebSocket and EventSource cleanup
        if ('close' in wsRef.current) {
          wsRef.current.close();
        } else if ('close' in wsRef.current) {
          (wsRef.current as EventSource).close();
        }
      }
      if (openaiWsRef.current) {
        openaiWsRef.current.close();
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
    disconnect: () => {
      if (wsRef.current) {
        // Handle both WebSocket and EventSource cleanup
        if ('close' in wsRef.current) {
          wsRef.current.close();
        } else if ('close' in wsRef.current) {
          (wsRef.current as EventSource).close();
        }
      }
      openaiWsRef.current?.close();
    },
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
