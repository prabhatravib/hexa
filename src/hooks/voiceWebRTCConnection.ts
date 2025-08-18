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
  
  return true; // Connection successful
};
