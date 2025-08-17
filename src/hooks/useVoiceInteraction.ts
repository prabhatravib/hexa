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
  
  const wsRef = useRef<any>(null);
  const openaiAgentRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  
  // Connect using SSE for receiving messages
  const connect = useCallback(async () => {
    // Prevent multiple connections
    if (isConnected || wsRef.current) {
      console.log('🔌 Already connected, skipping duplicate connection');
      return;
    }
    
    // Clean up any existing connections first
    if (wsRef.current) {
      console.log('🔌 Cleaning up existing connection...');
      try {
        wsRef.current.close();
      } catch (error) {
        console.log('🔌 Error closing existing connection:', error);
      }
      wsRef.current = null;
    }
    
    try {
      console.log('🔌 Establishing new SSE connection...');
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
              console.log('🎤 Session info received:', data);
              console.log('🎤 Session details:', {
                hasSessionId: !!data.sessionId,
                hasClientSecret: !!data.clientSecret,
                hasApiKey: !!data.apiKey,
                clientSecretLength: data.clientSecret?.length || 0
              });
              setSessionInfo(data);
              
              // Check if we have the required data
              if (!data.clientSecret) {
                console.error('❌ No client secret in session info:', data);
                setVoiceState('error');
                onError?.('No client secret available for voice connection');
                return;
              }
              
              // Initialize the agent with the real session data
              if (!openaiAgentRef.current) {
                console.log('🎤 Initializing OpenAI Agent with session data...');
                await initializeOpenAIAgent(data);
              } else {
                console.log('✅ OpenAI Agent already initialized, skipping duplicate initialization');
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
       wsRef.current = eventSource;
      
    } catch (error) {
      console.error('Failed to connect:', error);
      setVoiceState('error');
      onError?.('Failed to initialize voice service');
    }
  }, []);

  // Initialize OpenAI Agent with WebRTC
  const initializeOpenAIAgent = useCallback(async (sessionData: any) => {
    // Prevent multiple initializations
    if (openaiAgentRef.current) {
      console.log('🔌 OpenAI Agent already initialized, skipping duplicate initialization');
      return;
    }
    
    try {
      console.log('🔧 Initializing OpenAI Agent with WebRTC...');
      console.log('🔧 Session data received:', {
        hasApiKey: !!sessionData.apiKey,
        apiKeyPrefix: sessionData.apiKey?.substring(0, 10) + '...',
        sessionId: sessionData.sessionId,
        hasClientSecret: !!sessionData.clientSecret,
        clientSecretLength: sessionData.clientSecret?.length || 0
      });
      
      // Validate session data
      if (!sessionData.clientSecret) {
        throw new Error('Client secret is missing from session data');
      }
      
      if (!sessionData.sessionId) {
        throw new Error('Session ID is missing from session data');
      }
      
      // Import OpenAI Agents Realtime SDK dynamically
      const { RealtimeAgent, RealtimeSession } = await import('@openai/agents-realtime');
      
      // Create agent with proper configuration
      const agent = new RealtimeAgent({
        name: 'Hexagon Voice Assistant',
        instructions: 'You are Hexagon, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help. You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone.'
      });

      // Create session and connect
      const session = new RealtimeSession(agent);
      
      // Connect using client secret (the working method)
      console.log('🔧 Connecting with client secret...');
      const connectionOptions = {
        apiKey: sessionData.clientSecret,
        useInsecureApiKey: true,
        transport: 'webrtc' as const
      };
      
      console.log('🔧 Connecting with options:', connectionOptions);
      await session.connect(connectionOptions);
      console.log('✅ WebRTC connection successful with client secret');
      
      // Store the session reference
      openaiAgentRef.current = session;
      
      console.log('✅ OpenAI Agent initialized and connected with WebRTC');
      setVoiceState('idle');
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Agent:', error);
      setVoiceState('error');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onError?.(`Failed to initialize OpenAI Agent: ${errorMessage}`);
    }
  }, [setVoiceState, onError]);

  // Initialize OpenAI Agent from worker (gets API key)
  const initializeOpenAIAgentFromWorker = useCallback(async () => {
    try {
      console.log('🔧 Initializing OpenAI Agent from worker...');
      
      // Get the API key from the worker by sending a dummy message
      const response = await fetch('/voice/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'connection_ready' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      console.log('🔧 Connection ready message sent, waiting for session info...');
      // Don't initialize the agent yet - wait for session_info from SSE
      // The agent will be initialized when we receive the actual session data
      
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
         try {
           wsRef.current.close();
         } catch (error) {
           console.log('🔌 Error closing connection during cleanup:', error);
         }
         wsRef.current = null;
       }
       if (openaiAgentRef.current) {
         try {
           openaiAgentRef.current.close();
         } catch (error) {
           console.log('🔌 Error closing OpenAI agent during cleanup:', error);
         }
         openaiAgentRef.current = null;
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
       console.log('🔌 Disconnecting voice service...');
       if (wsRef.current) {
         try {
           wsRef.current.close();
         } catch (error) {
           console.log('🔌 Error closing SSE connection:', error);
         }
         wsRef.current = null;
       }
      if (openaiAgentRef.current) {
        try {
          openaiAgentRef.current.close();
        } catch (error) {
          console.log('🔌 Error closing OpenAI agent:', error);
        }
        openaiAgentRef.current = null;
      }
      setIsConnected(false);
      setVoiceState('idle');
      console.log('🔌 Voice service disconnected');
    },
    startRecording,
    stopRecording,
    sendText,
    switchAgent,
    interrupt,
    clearTranscript: () => setTranscript(''),
    clearResponse: () => setResponse(''),
    // Debug function to test voice connection
    testVoiceConnection: () => {
      console.log('🧪 Testing voice connection...');
      console.log('🧪 Current state:', {
        isConnected,
        isRecording,
        openaiAgent: !!openaiAgentRef.current,
        sessionInfo
      });
      
      // Try to trigger the connection flow
      if (!isConnected) {
        console.log('🧪 Not connected, trying to connect...');
        connect();
      } else if (!openaiAgentRef.current) {
        console.log('🧪 Connected but no agent, sending connection_ready...');
        fetch('/voice/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'connection_ready' })
        });
      } else {
        console.log('🧪 Voice system appears to be working!');
      }
    }
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
