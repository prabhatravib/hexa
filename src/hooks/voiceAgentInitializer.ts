import { getLanguageInstructions } from '@/lib/languageConfig';
import { initializeAudioAnalysis } from './voiceAudioAnalysis';
import { setupSessionEventHandlers } from './voiceSessionEvents';
import { setupAudioElementHandlers } from './voiceAudioElementManager';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceAgentInitializerOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

export const initializeOpenAIAgent = async (
  sessionData: any,
  options: VoiceAgentInitializerOptions
) => {
  const { setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef } = options;
  
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
};
