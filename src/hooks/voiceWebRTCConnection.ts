import { initializeAudioAnalysis, stopAudioAnalysis } from './voiceAudioAnalysis';
import { setupAudioElementHandlers } from './voiceAudioElementManager';
import { useAnimationStore } from '@/store/animationStore';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface WebRTCConnectionOptions {
  audioEl: HTMLAudioElement;
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

export const initializeWebRTCConnection = async (
  session: any,
  sessionData: any,
  options: WebRTCConnectionOptions
) => {
  const { audioEl, setVoiceState, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef } = options;
  
  // Check if voice is disabled before establishing connection
  try {
    // Check global flag first (set by AnimatedHexagon)
    if ((window as any).__voiceSystemBlocked) {
      console.log('🔇 Voice system blocked globally - blocking WebRTC connection');
      return false; // Don't establish connection
    }
    
    const disabled = useAnimationStore.getState().isVoiceDisabled;
    if (disabled) {
      console.log('🔇 Voice disabled: blocking WebRTC connection');
      return false; // Don't establish connection
    }
  } catch (error) {
    console.error('Failed to check voice disabled state:', error);
  }
  
  // Use the working method: WebRTC with client secret
  if (!sessionData.clientSecret) {
    throw new Error('Client secret not available for WebRTC connection');
  }
  
  console.log('🔧 Connecting with client secret...');
  const connectionOptions = {
    apiKey: sessionData.clientSecret,
    useInsecureApiKey: true,
    transport: 'webrtc' as const
  };
  
  console.log('🔧 Connecting with client secret options:', connectionOptions);
  
  try {
    await session.connect(connectionOptions);
    console.log('✅ WebRTC connection successful with client secret');
    
    // Set session state to 'open' after successful connection
    session.state = 'open';
    console.log('🔧 Session state set to open');
  } catch (error) {
    console.error('❌ WebRTC connection failed:', error);
    
    // Check if it's a session description parsing error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('setRemoteDescription') || errorMessage.includes('SessionDescription')) {
      console.log('🔧 Session description error detected. This usually means:');
      console.log('1. Previous session is still active');
      console.log('2. Worker needs to be restarted');
      console.log('3. OpenAI session is stale');
      
      // Try to reset the session
      try {
        const resetResponse = await fetch('/voice/reset', { method: 'POST' });
        if (resetResponse.ok) {
          console.log('✅ Session reset successful, retrying connection...');
          // Wait a moment for cleanup
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Try connecting again
          await session.connect(connectionOptions);
          console.log('✅ WebRTC connection successful after reset');
        } else {
          throw new Error('Failed to reset session');
        }
      } catch (resetError) {
        console.error('❌ Failed to reset and retry:', resetError);
        throw error; // Re-throw original error
      }
    } else {
      throw error; // Re-throw if it's not a session description error
    }
  }
  
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
    
    // Check if voice is disabled before processing audio
    try {
      const disabled = useAnimationStore.getState().isVoiceDisabled;
      if (disabled) {
        console.log('🔇 Voice disabled: blocking remote audio track processing');
        return; // Block all audio processing when voice is disabled
      }
    } catch (error) {
      console.error('Failed to check voice disabled state:', error);
    }
    
    if (event.track && event.track.kind === 'audio') {
      console.log('dY"? Audio track received, attaching to audio element');
      
      const stream = new MediaStream([event.track]);
      audioEl.srcObject = stream;
      audioEl.autoplay = true;
      audioEl.volume = 1;

      try {
        const disabled = useAnimationStore.getState().isVoiceDisabled;
        if (disabled) {
          console.log('dY"? Voice disabled: muting and pausing remote audio track');
          try { (audioEl as any).muted = true; if (!audioEl.paused) audioEl.pause(); } catch {}
          return;
        }
      } catch {}

      try {
        await audioEl.play();
        console.log('dY"? Audio playback started');
      } catch (error) {
        console.warn('dY"? Failed to autoplay audio:', error);
      }

      await initializeAudioAnalysis(stream, audioEl, {
        audioContextRef,
        setSpeechIntensity,
        startSpeaking,
        stopSpeaking,
        setVoiceState
      });

      event.track.addEventListener('ended', () => {
        console.log('dY"? Audio track ended - stopping speech and mouth animation');
        if (setSpeechIntensity) setSpeechIntensity(0);
        
        // Stop the audio analyzer
        stopAudioAnalysis();
        
        if (stopSpeaking) {
          stopSpeaking();
        } else {
          setVoiceState('idle');
        }
        (window as any).__currentVoiceState = 'idle';
      });
    }
  });
  
  session.on('response.audio.start' as any, () => {
    console.log('dYZ Text-triggered audio response starting');
    if (!audioEl.srcObject) {
      console.warn('No audio stream available when response audio started');
    }
  });

  // Debug: Monitor all session events (excluding transport events)
  const sessionEvents = ['track', 'stream', 'connectionstatechange', 'iceconnectionstatechange', 'signalingstatechange'];
  sessionEvents.forEach(eventName => {
    session.on(eventName as any, (event: any) => {
      // Filter out repetitive transport events to reduce console noise
      if (eventName !== 'transport_event') {
        console.log(`🔍 Session event: ${eventName}`, event);
      }
    });
  });
  
  // Audio stream detection is handled by the remote_track event listener above
  // No need for polling - the WebRTC connection will fire remote_track when audio is available
  
  // Set up periodic connection health check
  const healthCheckInterval = setInterval(async () => {
    try {
      // Check if WebRTC connection is still healthy
      const pc = (session as any)._pc;
      if (pc && (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed')) {
        console.warn('⚠️ WebRTC connection unhealthy, attempting recovery...');
        
        // Try to reset and reconnect
        try {
          const resetResponse = await fetch('/voice/reset', { method: 'POST' });
          if (resetResponse.ok) {
            console.log('✅ Health check: Session reset successful');
            // The page will reload after reset, so clear the interval
            clearInterval(healthCheckInterval);
          }
        } catch (resetError) {
          console.error('❌ Health check: Failed to reset session:', resetError);
        }
      }
    } catch (error) {
      console.warn('⚠️ Health check error:', error);
    }
  }, 30000); // Check every 30 seconds
  
  // Clean up interval when connection is lost
  const cleanup = () => {
    clearInterval(healthCheckInterval);
  };
  
  // Set up cleanup on session events
  session.on('disconnected' as any, cleanup);
  session.on('error' as any, cleanup);
  
  // Set up audio element event handlers
  setupAudioElementHandlers(audioEl, {
    setVoiceState,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity
  });
  
  return true; // Connection successful
};

