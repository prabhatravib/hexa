import type { MutableRefObject } from 'react';
import { initializeAudioAnalysis, stopAudioAnalysis } from './voiceAudioAnalysis';
import { setupAudioElementHandlers } from './voiceAudioElementManager';
import { useAnimationStore, VoiceState } from '@/store/animationStore';
import { isConnectionHealthCheckEnabled } from '../lib/connectionHealthConfig';



interface WebRTCConnectionOptions {
  audioEl: HTMLAudioElement;
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: MutableRefObject<AudioContext | null>;
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
    apiKey: sessionData.clientSecret
  };
  
  console.log('🔧 Connecting with client secret options:', connectionOptions);
  
  try {
    await session.connect(connectionOptions);
    console.log('✅ WebRTC connection successful with client secret');
    console.log('✅ SDP answer starts with: v='); // Log SDP sanity success
    
    // Set session state to 'open' after successful connection
    session.state = 'open';
    console.log('🔧 Session state set to open');
  } catch (error) {
    console.error('❌ WebRTC connection failed:', error);

    // Check if it's a session description parsing error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('setRemoteDescription') || errorMessage.includes('SessionDescription')) {
      console.log('🔧 Session description error detected - triggering auto-recovery');
      
      // SDP sanity check: log what we're trying to parse
      if (errorMessage.includes('Expect line: v=')) {
        console.error('🚨 SDP sanity check failed: Received non-SDP data for setRemoteDescription');
        console.error('🚨 This usually means the client secret is being used as apiKey, causing wrong endpoint');
        console.error('🚨 Or the worker is returning JSON/HTML instead of raw SDP');
      }

      // Use the centralized auto-recovery system instead of inline reset
      const { autoRecoverVoiceConnection } = await import('../lib/voiceErrorRecovery');
      const recovered = await autoRecoverVoiceConnection();

      if (recovered) {
        console.log('✅ Connection recovered - session will reinitialize automatically');
        // Return false to indicate this session failed but recovery was triggered
        // The parent will handle reinitializing with the new session
        return false;
      } else {
        console.error('❌ Auto-recovery failed after all attempts');
        throw error; // Re-throw if recovery failed
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
      
      // CRITICAL FIX: Clear old stream first to release dead track
      audioEl.srcObject = null;
      
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
  
  // NEW: Add markSpeaking functionality to response.audio.start handler
  session.on('response.audio.start' as any, () => {
    console.log('🔊 Text-triggered audio response starting - calling markSpeaking()');
    try {
      // Ensure audio playing directly (markSpeaking equivalent)
      if (audioEl.muted) audioEl.muted = false;
      if (audioEl.volume === 0) audioEl.volume = 1;
      if (audioEl.paused) {
        audioEl.play().then(() => {
          console.log('✅ Audio playback resumed successfully');
        }).catch((playError) => {
          console.warn('Failed to resume audio playback:', playError);
        });
      }
      
      // Set speaking state
      if (startSpeaking) {
        startSpeaking();
      } else {
        setVoiceState('speaking');
      }
      console.log('✅ markSpeaking() equivalent called successfully');
    } catch (error) {
      console.warn('Failed to call markSpeaking equivalent:', error);
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
  
  // Set up periodic connection health check (only if enabled)
  if (isConnectionHealthCheckEnabled()) {
    const healthCheckInterval = setInterval(async () => {
      try {
        // Check if WebRTC connection is still healthy
        const pc = (session as any)._pc;

        if (!pc) {
          console.warn('⚠️ No peer connection found during health check');
          return;
        }

        const connectionState = pc.connectionState;
        const iceConnectionState = pc.iceConnectionState;

        // Trigger auto-recovery on failed connections
        if (connectionState === 'failed' || iceConnectionState === 'failed') {
          console.warn('⚠️ WebRTC connection failed, triggering auto-recovery...');

          // Use centralized auto-recovery
          const { autoRecoverVoiceConnection } = await import('../lib/voiceErrorRecovery');
          await autoRecoverVoiceConnection();

          // Clear this interval since a new one will be created on reconnection
          clearInterval(healthCheckInterval);
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
  } else {
    console.log('🔇 Connection health checks disabled - skipping WebRTC monitoring');
  }
  
  // Set up audio element event handlers
  setupAudioElementHandlers(audioEl, {
    setVoiceState,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity,
    audioContextRef
  });
  
  return true; // Connection successful
};

