import { initializeAudioAnalysis } from './voiceAudioAnalysis';
import { setupAudioElementHandlers } from './voiceAudioElementManager';

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
