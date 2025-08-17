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
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const openaiAgentRef = useRef<any>(null);
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
        
        // Initialize OpenAI Agent immediately after SSE connection
        // We'll get the API key from the worker
        initializeOpenAIAgentFromWorker();
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
              
            case 'session_info':
              console.log('Session info received, updating OpenAI Agent...');
              setSessionInfo(data);
              // Update the agent with new session info if needed
              if (openaiAgentRef.current) {
                console.log('✅ OpenAI Agent already initialized, session info updated');
              } else {
                // Initialize with real session info
                await initializeOpenAIAgent(data);
              }
              break;
              
            case 'response_text':
              console.log('Text response received:', data.text);
              setResponse(data.text);
              onResponse?.(data.text);
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

  // Initialize OpenAI Agent with WebRTC
  const initializeOpenAIAgent = useCallback(async (sessionData: any) => {
    try {
      console.log('🔧 Initializing OpenAI Agent with WebRTC...');
      console.log('🔧 Session data received:', {
        hasApiKey: !!sessionData.apiKey,
        apiKeyPrefix: sessionData.apiKey?.substring(0, 10) + '...',
        sessionId: sessionData.sessionId,
        hasClientSecret: !!sessionData.clientSecret
      });
      
      // Import OpenAI Agents Realtime SDK dynamically
      const { RealtimeAgent, RealtimeSession } = await import('@openai/agents-realtime');
      
      // Create agent with proper configuration
      const agent = new RealtimeAgent({
        name: 'Hexa, an AI Assistant',
        instructions: 'You are Hexa, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help. You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone.'
      });

      // Create session and connect
      const session = new RealtimeSession(agent);
      
      // Use the working method: WebRTC with client secret
      if (sessionData.clientSecret) {
        console.log('🔧 Connecting with client secret...');
        const connectionOptions = {
          apiKey: sessionData.clientSecret, // Use client secret instead of API key
          useInsecureApiKey: true,
          transport: 'webrtc' as const
        };
        
        console.log('🔧 Connecting with client secret options:', connectionOptions);
        await session.connect(connectionOptions);
        console.log('✅ WebRTC connection successful with client secret');
      } else {
        throw new Error('Client secret not available for WebRTC connection');
      }
      
      // Store the session reference
      openaiAgentRef.current = session;
      
      console.log('✅ OpenAI Agent initialized and connected with WebRTC');
      setVoiceState('idle');
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Agent:', error);
      setVoiceState('error');
      onError?.('Failed to initialize OpenAI Agent');
    }
  }, [setVoiceState, onError]);

  // Initialize OpenAI Agent from worker (gets session info)
  const initializeOpenAIAgentFromWorker = useCallback(async () => {
    try {
      console.log('🔧 Initializing OpenAI Agent from worker...');
      
      // Get the session info from the worker by sending a connection ready message
      const response = await fetch('/voice/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'connection_ready' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      console.log('✅ Connection ready message sent, waiting for session info...');
      // The agent will be initialized when we receive session_info via SSE
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Agent from worker:', error);
      setVoiceState('error');
      onError?.('Failed to initialize voice service');
    }
  }, [setVoiceState, onError]);
  
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
      setIsRecording(true);
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
      setIsRecording(false);
      stopListening();
      setSpeechIntensity(0);
      setVoiceState('idle');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [stopListening, setVoiceState]);
  
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
    } catch (error) {
      console.error('Failed to interrupt:', error);
      onError?.('Failed to interrupt response');
    }
    
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    stopSpeaking();
    setVoiceState('idle');
  }, [onError, stopSpeaking, setVoiceState]);
   
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
      if (openaiAgentRef.current) {
        // Close the RealtimeSession
        openaiAgentRef.current.close();
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
      if (openaiAgentRef.current) {
        // Close the RealtimeSession
        openaiAgentRef.current.close();
      }
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
