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
  if (ac.state === "suspended") ac.resume();
  return silentStream;
}

async function swapToSilentAndRelease(pc: RTCPeerConnection) {
  const sender = pc.getSenders().find(s => s.track?.kind === "audio");
  if (!sender) return;
  const prev = sender.track || null;
  const silentTrack = getSilentStream().getAudioTracks()[0];
  await sender.replaceTrack(silentTrack);   // no renegotiation
  // releasing the device is what clears the red dot
  if (prev && prev.readyState === "live") prev.stop();
  console.log('🔇 Swapped to silent track and released microphone');
}

async function swapBackToMic(pc: RTCPeerConnection) {
  const sender = pc.getSenders().find(s => s.track?.kind === "audio");
  if (!sender) return;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  await sender.replaceTrack(mic.getAudioTracks()[0]);
  // keep a ref to mic so you can stop it when toggling off again
  micStream = mic;
  console.log('🔊 Swapped to microphone track');
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
            const pc = (window as any).activeSession?._pc;
            if (pc) {
              await swapToSilentAndRelease(pc);
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
        // Red dot hiding functionality (if enabled)
        if (RED_DOT_HIDING_ENABLED) {
          try {
            const pc = (window as any).activeSession?._pc;
            if (pc) {
              await swapBackToMic(pc);
            }
          } catch (error) {
            console.warn('Failed to swap back to microphone track:', error);
          }
        }

        try {
          const original = (window as any).__originalGetUserMedia;

          if (original && navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia = original;
          }
        } catch (error) {
          console.error('Failed to restore microphone access:', error);
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
