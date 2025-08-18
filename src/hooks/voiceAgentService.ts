import { useCallback } from 'react';
import { getLanguageInstructions } from '@/lib/languageConfig';
import { initializeAudioAnalysis } from './voiceAudioAnalysis';
import { setupSessionEventHandlers } from './voiceSessionEvents';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceAgentServiceOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

export const useVoiceAgentService = ({ setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef }: VoiceAgentServiceOptions) => {
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
        instructions: `You are Hexa, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help. You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone.

${getLanguageInstructions()}`
      });

      // Create a dedicated audio element for the Realtime session and expose it globally for debugging
      const audioEl = new Audio();
      audioEl.autoplay = true;
      (window as any).__hexaAudioEl = audioEl;
      (window as any).__currentVoiceState = 'idle';
      
      // Add global debug function
      (window as any).__hexaDebug = () => {
        console.log('🔍 Hexa Debug Info:');
        console.log('Audio Element:', audioEl);
        console.log('Audio srcObject:', audioEl.srcObject);
        console.log('Audio readyState:', audioEl.readyState);
        console.log('Audio paused:', audioEl.paused);
        console.log('Voice State:', (window as any).__currentVoiceState);
        console.log('Session:', session);
      };

      // Monitor audio element state
      audioEl.addEventListener('loadeddata', () => {
        console.log('🎵 Audio element loaded data');
        console.log('Audio element state:', {
          srcObject: audioEl.srcObject,
          readyState: audioEl.readyState,
          paused: audioEl.paused,
          duration: audioEl.duration
        });
      });
      
      // Monitor all audio element events for debugging
      ['loadstart', 'durationchange', 'loadedmetadata', 'canplay', 'canplaythrough', 'play', 'playing', 'pause', 'ended', 'error'].forEach(eventName => {
        audioEl.addEventListener(eventName, (e) => {
          console.log(`🎵 Audio event: ${eventName}`, {
            srcObject: audioEl.srcObject,
            readyState: audioEl.readyState,
            paused: audioEl.paused,
            currentTime: audioEl.currentTime,
            duration: audioEl.duration
          });
        });
      });
      
      // Create session and connect
      const session = new RealtimeSession(agent);
      
      // Debug: Log all session events to understand what's available
      const originalEmit = (session as any).emit;
      if (originalEmit) {
        (session as any).emit = function(event: string, ...args: any[]) {
          console.log(`🔍 Session event: ${event}`, args);
          return originalEmit.call(this, event, ...args);
        };
      }
      
      // Set up session event handlers
      setupSessionEventHandlers(session, {
        setVoiceState,
        startSpeaking,
        stopSpeaking,
        audioEl,
        audioContextRef,
        setSpeechIntensity
      });
      
      // Use the working method: WebRTC with client secret
      if (sessionData.clientSecret) {
        console.log('🔧 Connecting with client secret...');
        const connectionOptions = {
          apiKey: sessionData.clientSecret,
          useInsecureApiKey: true,
          transport: 'webrtc' as const
        };
        
        console.log('🔧 Connecting with client secret options:', connectionOptions);
        await session.connect(connectionOptions);
        console.log('✅ WebRTC connection successful with client secret');
        
        // Debug: Log session state and properties
        console.log('🔍 Session after connection:', {
          hasStream: !!(session as any).stream,
          hasPc: !!(session as any)._pc,
          pcState: (session as any)._pc?.connectionState,
          pcIceState: (session as any)._pc?.iceConnectionState,
          events: Object.keys(session)
        });
        
        // Set up remote track handling to get the actual audio stream
        session.on('remote_track' as any, async (event: any) => {
          console.log('🎵 Remote track received:', event);
          console.log('Track details:', {
            kind: event.track?.kind,
            readyState: event.track?.readyState,
            enabled: event.track?.enabled
          });
          
          if (event.track && event.track.kind === 'audio') {
            console.log('🎵 Audio track received, attaching to audio element');
            
            // Create a new MediaStream with the audio track
            const stream = new MediaStream([event.track]);
            audioEl.srcObject = stream;
            
            // Start audio analysis immediately on remote_track
            await initializeAudioAnalysis(stream, audioEl, {
              audioContextRef,
              setSpeechIntensity,
              startSpeaking,
              stopSpeaking,
              setVoiceState
            });
            
            // Start playing to trigger the playing event (for compatibility)
            audioEl.play().catch((error: any) => {
              console.warn('⚠️ Failed to autoplay audio:', error);
            });
            
            // Monitor the track for when it ends
            event.track.addEventListener('ended', () => {
              console.log('🔇 Audio track ended - stopping speech and mouth animation');
              if (setSpeechIntensity) setSpeechIntensity(0);
              if (stopSpeaking) {
                stopSpeaking();
              } else {
                setVoiceState('idle');
              }
              (window as any).__currentVoiceState = 'idle';
            });
            
            // Also monitor track state changes
            event.track.addEventListener('ended', () => {
              console.log('🔇 Audio track ended event fired');
            });
          }
        });
        
        // Debug: Monitor all session events
        const sessionEvents = ['track', 'stream', 'connectionstatechange', 'iceconnectionstatechange', 'signalingstatechange'];
        sessionEvents.forEach(eventName => {
          session.on(eventName as any, (event: any) => {
            console.log(`🔍 Session event: ${eventName}`, event);
          });
        });
        
        // More aggressive stream detection
        const checkForStream = async () => {
          let attempts = 0;
          const maxAttempts = 10;
          
          const interval = setInterval(async () => {
            attempts++;
            console.log(`🔍 Checking for audio stream (attempt ${attempts}/${maxAttempts})...`);
            
            // Check if audio element has a source
            if (audioEl.srcObject) {
              console.log('🎵 Found audio srcObject, starting analyzer');
              clearInterval(interval);
              
              const stream = audioEl.srcObject as MediaStream;
              await initializeAudioAnalysis(stream, audioEl, {
                audioContextRef,
                setSpeechIntensity,
                startSpeaking,
                stopSpeaking,
                setVoiceState
              });
              return;
            }
            
            // Check if session has stream
            if ((session as any).stream) {
              console.log('🎵 Found session stream, attaching to audio element');
              audioEl.srcObject = (session as any).stream;
              clearInterval(interval);
              return;
            }
            
            // Check for any media streams in the session
            if ((session as any)._pc?.getRemoteStreams) {
              const remoteStreams = (session as any)._pc.getRemoteStreams();
              if (remoteStreams && remoteStreams.length > 0) {
                console.log('🎵 Found remote streams from RTCPeerConnection');
                audioEl.srcObject = remoteStreams[0];
                clearInterval(interval);
                return;
              }
            }
            
            if (attempts >= maxAttempts) {
              console.warn('⚠️ Could not find audio stream after', maxAttempts, 'attempts');
              clearInterval(interval);
              console.log('🎯 No audio stream found; relying on session events for speaking state');
            }
          }, 500);
        };

        // Start checking immediately after connection
        checkForStream();
        
        // Set up audio element event handlers
        setupAudioElementHandlers(audioEl, {
          setVoiceState,
          startSpeaking,
          stopSpeaking,
          setSpeechIntensity
        });
        
      } else {
        throw new Error('Client secret not available for WebRTC connection');
      }
      
      console.log('✅ OpenAI Agent initialized and connected with WebRTC');
      setVoiceState('idle');
      
      return session;
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Agent:', error);
      setVoiceState('error');
      onError?.('Failed to initialize OpenAI Agent');
      return null;
    }
  }, [setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity]);

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
  }, [setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity]);

  return {
    initializeOpenAIAgent,
    initializeOpenAIAgentFromWorker
  };
};

// Helper function
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper function to set up audio element event handlers
function setupAudioElementHandlers(audioEl: HTMLAudioElement, handlers: {
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
}) {
  const { setVoiceState, startSpeaking, stopSpeaking, setSpeechIntensity } = handlers;
  
  // Track audio element state for mouth animation
  let audioPlaying = false;
  let analysisStarted = false;
  let audioDurationTimeout: NodeJS.Timeout | null = null;
  
  // Fallback: ensure analyser is running even if remote_track isn't emitted
  audioEl.addEventListener('playing', async () => {
    console.log('🎵 Audio playing - ensuring analyser is running and mouth animating');
    console.log('🎵 Audio element state during playing:', {
      srcObject: audioEl.srcObject,
      readyState: audioEl.readyState,
      paused: audioEl.paused,
      currentTime: audioEl.currentTime
    });
    audioPlaying = true;
          if (!analysisStarted) {
        console.log('🎵 Starting analysis with MediaElementSource');
        await initializeAudioAnalysis(null, audioEl, {
          audioContextRef: undefined,
          setSpeechIntensity,
          startSpeaking,
          stopSpeaking,
          setVoiceState
        });
      } else {
      console.log('🎵 Analysis already started, skipping');
    }
    // Always trigger speaking state when audio is playing
    if (startSpeaking) {
      startSpeaking();
    } else {
      setVoiceState('speaking');
    }
  });
  
  // Also handle play event
  audioEl.addEventListener('play', () => {
    console.log('🎵 Audio play event - starting mouth animation');
    audioPlaying = true;
    if (startSpeaking) {
      startSpeaking();
    } else {
      setVoiceState('speaking');
    }
  });
  
  // Monitor time updates to ensure mouth stays animated during playback
  audioEl.addEventListener('timeupdate', () => {
    if (audioPlaying && !audioEl.paused && audioEl.currentTime > 0) {
      // Log audio playback progress occasionally
      if (Math.random() < 0.01) {
        console.log(`🎵 Audio playing: time=${audioEl.currentTime.toFixed(2)}s, duration=${audioEl.duration.toFixed(2)}s`);
      }
      
      // Ensure we're in speaking state while audio is playing
      const currentState = (window as any).__currentVoiceState;
      if (currentState !== 'speaking') {
        console.log('⚠️ Audio playing but not in speaking state, fixing...');
        if (startSpeaking) {
          startSpeaking();
        } else {
          setVoiceState('speaking');
        }
      }
    }
  });
  
  // Add duration tracking to know when audio should end
  audioEl.addEventListener('loadedmetadata', () => {
    console.log('🎵 Audio metadata loaded, duration:', audioEl.duration);
    
    // Set a timeout based on audio duration to ensure stopping
    if (audioEl.duration && isFinite(audioEl.duration)) {
      if (audioDurationTimeout) clearTimeout(audioDurationTimeout);
      
      audioDurationTimeout = setTimeout(() => {
        console.log('⏰ Audio duration timeout reached, forcing stop');
        if (stopSpeaking) stopSpeaking();
        setVoiceState('idle');
      }, (audioEl.duration + 1) * 1000); // Add 1 second buffer
    }
  });

  // Clear timeout when audio actually ends
  audioEl.addEventListener('ended', () => {
    console.log('🔇 Audio ended - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    // Force stop speaking state
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    
    // Update global state for debugging
    (window as any).__currentVoiceState = 'idle';
    
    // Clear duration timeout
    if (audioDurationTimeout) {
      clearTimeout(audioDurationTimeout);
      audioDurationTimeout = null;
    }
  });

  audioEl.addEventListener('pause', () => {
    console.log('🔇 Audio paused - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    
    (window as any).__currentVoiceState = 'idle';
  });

  audioEl.addEventListener('emptied', () => {
    console.log('🔇 Audio emptied - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    
    (window as any).__currentVoiceState = 'idle';
  });

  // Add error handler to stop animation on audio errors
  audioEl.addEventListener('error', (e) => {
    console.log('❌ Audio error - stopping speech and mouth animation', e);
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    if (stopSpeaking) stopSpeaking();
    (window as any).__currentVoiceState = 'idle';
  });
}
