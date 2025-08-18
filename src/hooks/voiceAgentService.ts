import { useCallback } from 'react';
import { getLanguageInstructions } from '@/lib/languageConfig';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceAgentServiceOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void; // NEW: for real-time audio analysis
  // Use a shared AudioContext that is resumed on user gesture to avoid autoplay blocks
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
      let analysisStarted = false; // guard so analyser is wired only once
      (window as any).__hexaAudioEl = audioEl;
      (window as any).__currentVoiceState = 'idle'; // Add this for debugging
      
      // Add global debug function
      (window as any).__hexaDebug = () => {
        console.log('🔍 Hexa Debug Info:');
        console.log('Audio Element:', audioEl);
        console.log('Audio srcObject:', audioEl.srcObject);
        console.log('Audio readyState:', audioEl.readyState);
        console.log('Audio paused:', audioEl.paused);
        console.log('Voice State:', (window as any).__currentVoiceState);
        console.log('Analysis Started:', analysisStarted);
        console.log('Session:', session);
      };

      // ADD THIS: Monitor audio element state
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

      // Helper to start analyser using either a MediaStreamSource or MediaElementSource
      const startAnalysisWithNodes = async (
        makeSource: (ctx: AudioContext) => AudioNode
      ) => {
        if (analysisStarted) {
          console.log('🎵 Analysis already started, skipping');
          return;
        }
        console.log('🎵 Starting audio analysis...');
        analysisStarted = true;

        // Prefer shared AudioContext (resumed on user gesture)
        let ctx: AudioContext;
        if (audioContextRef && audioContextRef.current) {
          ctx = audioContextRef.current;
          try { if (ctx.state === 'suspended') { await ctx.resume(); } } catch {}
        } else {
          ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          if (audioContextRef) audioContextRef.current = ctx;
          if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch {}
          }
        }

        const srcNode = makeSource(ctx);
        console.log('🎵 Created audio source node:', srcNode.constructor.name);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.25;
        srcNode.connect(analyser);
        console.log('🎵 Connected source to analyzer, starting tick loop');

        // Dynamic gate with hysteresis for natural mouth movement
        let noiseFloor = 0.02;
        let speaking = false;
        let level = 0;
        const OPEN_MARGIN = 0.03;
        const CLOSE_MARGIN = 0.015;
        const ATTACK = 0.30;
        const RELEASE = 0.06;

        const tick = () => {
          const td = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(td);
          let sum = 0;
          for (let i = 0; i < td.length; i++) {
            const v = (td[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / td.length);
          if (!speaking) noiseFloor = 0.9 * noiseFloor + 0.1 * rms;
          const openThr = noiseFloor + OPEN_MARGIN;
          const closeThr = noiseFloor + CLOSE_MARGIN;
          if (!speaking && rms > openThr) speaking = true;
          if (speaking && rms < closeThr) speaking = false;
          const over = Math.max(0, rms - noiseFloor);
          const norm = Math.min(1, over / (1 - noiseFloor));
          const alpha = speaking ? ATTACK : RELEASE;
          level += alpha * ((speaking ? norm : 0) - level);
          
          // Add debugging for analyzer output
          if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) { // Log 1% of the time
            console.log(`🎵 Analyzer: rms=${rms.toFixed(4)}, level=${level.toFixed(4)}, speaking=${speaking}`);
          }
          
          if (setSpeechIntensity) setSpeechIntensity(level);
          requestAnimationFrame(tick);
        };
        
        // Start the analyzer tick loop
        tick();
      };
      
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
        
        // Track if we're currently speaking to avoid duplicate calls
        let isCurrentlySpeaking = false;
        
        // Set up various event handlers for mouth animation
        // Try multiple event names as the SDK might use different ones
        const possibleAudioEvents = ['audio', 'response.audio.delta', 'response.audio', 'conversation.item.audio'];
        possibleAudioEvents.forEach(eventName => {
          session.on(eventName as any, (audioData: any) => {
            console.log(`🎵 Event ${eventName} fired - starting mouth animation`);
            if (!isCurrentlySpeaking) {
              isCurrentlySpeaking = true;
              if (startSpeaking) {
                startSpeaking();
              } else {
                setVoiceState('speaking');
              }
            }
          });
        });
        
        // Handle audio completion events
        const possibleDoneEvents = ['audio_done', 'response.audio.done', 'response.done', 'conversation.item.done'];
        possibleDoneEvents.forEach(eventName => {
          session.on(eventName as any, () => {
            console.log(`🔇 Event ${eventName} fired - stopping mouth animation`);
            isCurrentlySpeaking = false;
            if (stopSpeaking) {
              stopSpeaking();
            } else {
              setVoiceState('idle');
            }
          });
        });
        
        // Also listen for response events that might indicate speaking
        session.on('response.created' as any, () => {
          console.log('📢 Response created - AI is preparing to speak');
          setVoiceState('thinking');
        });
        
        // Debug: Log all voice state changes
        const originalSetVoiceState = setVoiceState;
        setVoiceState = (state: VoiceState) => {
          console.log(`🎤 Voice state changing from ${(window as any).__currentVoiceState} to ${state}`);
          originalSetVoiceState(state);
        };
        
        session.on('response.output_item.added' as any, (item: any) => {
          console.log('📢 Output item added:', item);
          if (item?.type === 'audio' || item?.content_type?.includes('audio')) {
            console.log('🎵 Audio output item detected - starting mouth animation');
            if (!isCurrentlySpeaking) {
              isCurrentlySpeaking = true;
              if (startSpeaking) {
                startSpeaking();
              } else {
                setVoiceState('speaking');
              }
            }
          }
        });
      
      session.on('error' as any, (error: any) => {
        console.error('❌ OpenAI session error:', error);
        setVoiceState('error');
        onError?.(error.message || 'OpenAI session error');
      });
      
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
             await startAnalysisWithNodes((ctx) => ctx.createMediaStreamSource(stream));
             
             // Start playing to trigger the playing event (for compatibility)
             audioEl.play().catch((error: any) => {
               console.warn('⚠️ Failed to autoplay audio:', error);
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
              
              if (!analysisStarted) {
                const stream = audioEl.srcObject as MediaStream;
                await startAnalysisWithNodes((ctx) => ctx.createMediaStreamSource(stream));
              }
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
              
              // Last resort: start synthetic flapping
              console.log('🎯 Starting synthetic mouth flapping as fallback');
              startSpeaking?.();
            }
          }, 500); // Check every 500ms
        };

        // Start checking immediately after connection
        checkForStream();
        
         // Track audio element state for mouth animation
         let audioPlaying = false;
         
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
             await startAnalysisWithNodes((ctx) => ctx.createMediaElementSource(audioEl));
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
            if (Math.random() < 0.01) { // Log 1% of the time
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
        let audioDurationTimeout: NodeJS.Timeout | null = null;

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
          analysisStarted = false; // Reset analysis flag
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
