import { useEffect } from 'react';
import { safeSessionSend } from '@/lib/voiceSessionUtils';
import { RED_DOT_HIDING_ENABLED } from '@/lib/redDotHidingConfig';

type MaybeSession = any;

interface UseVoiceDisableEffectsOptions {
  isVoiceDisabled: boolean;
  stopRecording: () => void;
  interrupt?: () => void;
  flushPendingSessionInfo?: () => Promise<void>;
}

// Red dot hiding functionality
let micStream: MediaStream | null = null;
let ac: AudioContext | null = null;
let silentStream: MediaStream | null = null;
let silentTrack: MediaStreamTrack | null = null;

const isPeerConnection = (value: unknown): value is RTCPeerConnection => {
  return !!value && typeof (value as RTCPeerConnection).getSenders === 'function';
};

const getActivePeerConnection = (): RTCPeerConnection | null => {
  const session: any = (window as any).activeSession;
  if (!session) return null;

  const transport = session.transport as any;
  const candidates = [
    session._pc,
    transport?.connectionState?.peerConnection,
    transport?.peerConnection,
    transport?._pc,
  ];

  for (const candidate of candidates) {
    if (isPeerConnection(candidate)) {
      if (!session._pc) {
        (session as any)._pc = candidate;
      }
      return candidate;
    }
  }

  return null;
};

function getSilentStream(): MediaStream {
  if (!ac) ac = new AudioContext();
  if (!silentStream) {
    const dst = ac.createMediaStreamDestination();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(dst);
    osc.start();
    silentStream = dst.stream;
  }
  if (ac.state === "suspended") void ac.resume();
  return silentStream;
}

async function swapToSilentAndRelease(pc: RTCPeerConnection) {
  const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
  if (!sender) {
    console.warn('[red-dot] No audio sender found on peer connection');
    return;
  }

  if (!silentTrack || silentTrack.readyState !== 'live') {
    const track = getSilentStream().getAudioTracks()[0];
    if (!track) {
      console.warn('[red-dot] Unable to obtain silent audio track');
      return;
    }
    silentTrack = track;
  }

  const previousTrack = sender.track ?? null;
  await sender.replaceTrack(silentTrack);

  if (previousTrack && previousTrack.readyState === 'live') {
    previousTrack.stop();
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  console.log('[red-dot] Swapped to silent track and released microphone');
}

async function swapBackToMic(pc: RTCPeerConnection) {
  const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
  if (!sender) {
    console.warn('[red-dot] No audio sender found when restoring microphone');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('navigator.mediaDevices.getUserMedia is not available');
  }

  const liveMicTrack = micStream?.getAudioTracks().find(track => track.readyState === 'live');
  if (!liveMicTrack) {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  const micTrack = micStream?.getAudioTracks()[0];
  if (!micTrack) {
    throw new Error('Failed to acquire microphone track');
  }

  await sender.replaceTrack(micTrack);
  console.log('[red-dot] Swapped back to microphone track');
}

/**
 * Centralizes all side effects for toggling the voice system on/off.
 * - Blocks or restores mic access
 * - Releases active microphone streams to remove browser red dot
 * - Pauses/mutes audio elements
 * - Sends appropriate session control events (best-effort across SDK versions)
 * - Sets a global guard flag to prevent initialization while disabled
 */
export function useVoiceDisableEffects({
  isVoiceDisabled,
  stopRecording,
  interrupt,
  flushPendingSessionInfo,
}: UseVoiceDisableEffectsOptions) {
  useEffect(() => {
    const fireAndForget = (session: MaybeSession | undefined | null, evt: any) => {
      if (!session) return;

      void safeSessionSend(session, evt);
    };

    // Helper: mute/pause all audio elements
    const muteAllAudio = (mute: boolean) => {
      try {
        const els = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];

        els.forEach(el => {
          try {
            el.muted = mute;

            if (mute && !el.paused) el.pause();
          } catch {}
        });
      } catch {}
    };

    // Async function to handle the effects
    const handleEffects = async () => {
      // Guard flag used elsewhere to block initialization
      (window as any).__voiceSystemBlocked = !!isVoiceDisabled;

      if (isVoiceDisabled) {
        // Red dot hiding functionality (if enabled)
        if (RED_DOT_HIDING_ENABLED) {
          try {
            const pc = getActivePeerConnection();
            if (pc) {
              await swapToSilentAndRelease(pc);
            } else {
              if (micStream) {
                micStream.getTracks().forEach(track => track.stop());
                micStream = null;
              }
              console.warn('[red-dot] No peer connection found while disabling voice');
            }
          } catch (error) {
            console.warn('Failed to swap to silent track:', error);
          }
        }

        try {
          const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;

          if (originalGetUserMedia && !(window as any).__originalGetUserMedia) {
            (window as any).__originalGetUserMedia = originalGetUserMedia;
          }

          if (navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia = (async () => {
              console.log('Voice disabled: blocking microphone access');

              throw new Error('Microphone access blocked - voice is disabled');
            }) as any;
          }
        } catch (error) {
          console.error('Failed to block microphone access:', error);
        }

        try {
          stopRecording();
        } catch {}

        try {
          interrupt?.();
        } catch {}

        try {
          const s: MaybeSession = (window as any).activeSession;

          if (s) {
            const send = (evt: any) => fireAndForget(s, evt);

            // Cancel any active responses
            send({ type: 'response.cancel' });
            
            // Send fully-formed session.update with complete turn_detection config
            // This prevents OpenAI API from rejecting the update due to missing fields
            send({
              type: 'session.update',
              session: {
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                  create_response: false, // Disable auto-response when voice is off
                },
              },
            });

            try {
              (s as any).mute?.(true);
            } catch {}

            console.log('🔇 Audio buffers disabled - voice processing paused');
          }
        } catch (error) {
          console.error('Failed to disable voice processing:', error);
        }

        muteAllAudio(true);
      } else {
        try {
          const original = (window as any).__originalGetUserMedia;

          if (original && navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia = original;
            delete (window as any).__originalGetUserMedia;
          }
        } catch (error) {
          console.error('Failed to restore microphone access:', error);
        }

        // Red dot hiding functionality (if enabled)
        if (RED_DOT_HIDING_ENABLED) {
          try {
            const pc = getActivePeerConnection();
            if (pc) {
              await swapBackToMic(pc);
            } else {
              console.warn('[red-dot] No peer connection found while enabling voice');
            }
          } catch (error) {
            console.warn('Failed to swap back to microphone track:', error);
          }
        }

        // When re-enabling voice, restore audio processing
        // The existing WebRTC connection maintains its media stream
        console.log('🔄 Voice re-enabled - restoring audio processing');
        
        await flushPendingSessionInfo?.();

        try {
          const s: MaybeSession = (window as any).activeSession;
          
          if (s) {
            console.log('🔄 Session found, re-enabling audio buffers');
            
            // Send fully-formed session.update with complete turn_detection config
            // This prevents OpenAI API from rejecting the update due to missing fields
            fireAndForget(s, {
              type: 'session.update',
              session: {
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                  create_response: true, // Re-enable auto-response when voice is on
                },
              },
            });

            try {
              (s as any).mute?.(false);
            } catch {}

            console.log('✅ Audio buffers re-enabled - voice processing resumed');
          } else {
            console.warn('⚠️ No active session found after flushing pending info');
          }
        } catch (error) {
          console.error('Failed to enable voice processing:', error);
        }

        // Unmute audio elements
        muteAllAudio(false);
      }
    };

    // Call the async function
    void handleEffects();
  }, [isVoiceDisabled, stopRecording, interrupt, flushPendingSessionInfo]);
}
