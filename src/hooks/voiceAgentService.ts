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

      // Helper to start analyser using either a MediaStreamSource or MediaElementSource
      const startAnalysisWithNodes = async (
        makeSource: (ctx: AudioContext) => AudioNode
      ) => {
        if (analysisStarted) return;
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
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.25;
        srcNode.connect(analyser);

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
          if (setSpeechIntensity) setSpeechIntensity(level);
          requestAnimationFrame(tick);
        };

        startSpeaking?.();
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
        
        // Set up audio event handlers for mouth animation and speech intensity analysis
        session.on('audio' as any, (audioChunk: any) => {
          // Voice is playing - trigger mouth animation
          console.log('🎵 Voice audio received - mouth should animate');
          console.log('🎵 startSpeaking function available:', !!startSpeaking);
          if (startSpeaking) {
            console.log('🎵 Calling startSpeaking()...');
            startSpeaking(); // This will set voiceState and start mouth animation
            console.log('🎵 startSpeaking() called successfully');
          } else {
            console.log('🎵 startSpeaking not available, using fallback setVoiceState');
            setVoiceState('speaking'); // Fallback if startSpeaking not provided
          }
        });
      
      session.on('audio_done' as any, () => {
        // Voice stopped - stop mouth animation
        console.log('🔇 Voice audio done - mouth should stop animating');
        if (stopSpeaking) {
          stopSpeaking(); // This will set voiceState and stop mouth animation
        } else {
          setVoiceState('idle'); // Fallback if stopSpeaking not provided
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
        
                 // Set up remote track handling to get the actual audio stream
         session.on('remote_track' as any, async (event: any) => {
           console.log('🎵 Remote track received:', event);
           
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
        
        // Alternative: Check if session already has a stream after connection
        // Some implementations might set the stream directly
        setTimeout(() => {
          if (!audioEl.srcObject) {
            console.log('🔍 Checking for existing session stream...');
            // Try to get stream from session if available
            if ((session as any).stream) {
              console.log('🎵 Found session stream, attaching to audio element');
              audioEl.srcObject = (session as any).stream;
              audioEl.play().catch((error: any) => {
                console.warn('⚠️ Failed to autoplay audio:', error);
              });
            }
          }
        }, 1000); // Wait 1 second after connection
        
         // Fallback: ensure analyser is running even if remote_track isn't emitted
         audioEl.addEventListener('playing', async () => {
           console.log('🎵 Audio playing - ensuring analyser is running');
           if (!analysisStarted) {
             await startAnalysisWithNodes((ctx) => ctx.createMediaElementSource(audioEl));
           }
           if (startSpeaking) startSpeaking();
         });
        
        ['pause', 'ended', 'emptied'].forEach(ev => {
          audioEl.addEventListener(ev, () => {
            console.log(`🔇 Audio ${ev} - stopping speech and mouth animation`);
            if (setSpeechIntensity) setSpeechIntensity(0);
            if (stopSpeaking) stopSpeaking();
          });
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
