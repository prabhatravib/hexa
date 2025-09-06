import { useEffect } from 'react';

type MaybeSession = any;

interface UseVoiceDisableEffectsOptions {
  isVoiceDisabled: boolean;
  stopRecording: () => void;
  interrupt?: () => void;
}

/**
 * Centralizes all side effects for toggling the voice system on/off.
 * - Blocks or restores mic access
 * - Pauses/mutes audio elements
 * - Sends appropriate session control events (best-effort across SDK versions)
 * - Sets a global guard flag to prevent initialization while disabled
 */
export function useVoiceDisableEffects({
  isVoiceDisabled,
  stopRecording,
  interrupt,
}: UseVoiceDisableEffectsOptions) {
  useEffect(() => {
    // Helper: best-effort send method across SDK variants
    const safeSessionSend = async (s: MaybeSession, evt: any) => {
      try {
        const send = s?.send || s?.emit || s?.transport?.sendEvent;
        if (send) {
          await send.call(s, evt);
        }
      } catch {}
    };

    // Helper: mute/pause all audio elements
    const muteAllAudio = (mute: boolean) => {
      try {
        const els = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
        els.forEach((el) => {
          try {
            el.muted = mute;
            if (mute && !el.paused) el.pause();
          } catch {}
        });
      } catch {}
    };

    // Guard flag used elsewhere to block initialization
    (window as any).__voiceSystemBlocked = !!isVoiceDisabled;

    if (isVoiceDisabled) {
      // 1) Block microphone access at the browser level
      try {
        const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
        if (originalGetUserMedia && !(window as any).__originalGetUserMedia) {
          (window as any).__originalGetUserMedia = originalGetUserMedia;
        }
        if (navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia = (async () => {
            console.log('🔇 Voice disabled: blocking microphone access');
            throw new Error('Microphone access blocked - voice is disabled');
          }) as any;
        }
      } catch (error) {
        console.error('Failed to block microphone access:', error);
      }

      // 2) Stop any active recording and interrupt ongoing responses
      try { stopRecording(); } catch {}
      try { interrupt?.(); } catch {}

      // 3) Disable AI processing via RealtimeSession if available
      try {
        const s: MaybeSession = (window as any).activeSession;
        if (s) {
          // Fire-and-forget to avoid awaiting inside non-async effect
          safeSessionSend(s, { type: 'response.cancel' });
          safeSessionSend(s, { type: 'response.cancel_all' });
          safeSessionSend(s, { type: 'input_audio_buffer.clear' });
          safeSessionSend(s, { type: 'output_audio_buffer.clear' });

          safeSessionSend(s, {
            type: 'session.update',
            session: {
              turn_detection: { create_response: false, threshold: 0, silence_duration_ms: 0 },
            },
          });

          safeSessionSend(s, { type: 'input_audio_buffer.disable' });
          safeSessionSend(s, { type: 'output_audio_buffer.disable' });

          // Defensive: block some internals if present
          try {
            if (s._inputAudioBuffer) {
              s._inputAudioBuffer.disable = () => console.log('🔇 Input audio buffer disabled');
              s._inputAudioBuffer.enable = () => console.log('🔇 Input audio buffer enable blocked');
            }
            if (s._audioProcessor) {
              s._audioProcessor.stop = () => console.log('🔇 Audio processor stopped');
              s._audioProcessor.start = () => console.log('🔇 Audio processor start blocked');
            }
          } catch {}
        }
      } catch (error) {
        console.error('Failed to disable voice processing:', error);
      }

      // 4) Mute all audio elements
      muteAllAudio(true);
    } else {
      // Re-enable path
      // 1) Restore getUserMedia if we replaced it
      try {
        const original = (window as any).__originalGetUserMedia;
        if (original && navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia = original;
        }
      } catch (error) {
        console.error('Failed to restore microphone access:', error);
      }

      // 2) Re-enable AI processing
      try {
        const s: MaybeSession = (window as any).activeSession;
        const send = s?.send || s?.emit || s?.transport?.sendEvent;
        if (send) {
          send.call(s, {
            type: 'session.update',
            session: {
              turn_detection: { create_response: true, threshold: 0.5, silence_duration_ms: 500 },
            },
          });
          send.call(s, { type: 'input_audio_buffer.enable' });
          send.call(s, { type: 'output_audio_buffer.enable' });
        }
      } catch (error) {
        console.error('Failed to enable voice processing:', error);
      }

      // 3) Force re-initialization (best-effort)
      try {
        if ((window as any).activeSession) {
          console.log('🔊 Voice enabled: clearing existing session for re-initialization');
          (window as any).activeSession = null;
        }
        if ((window as any).__hexaReset) {
          console.log('🔊 Voice enabled: triggering voice system reset');
          (window as any).__hexaReset();
        }
      } catch (error) {
        console.error('Failed to reset voice system:', error);
      }

      // 4) Unmute audio elements
      muteAllAudio(false);
    }
  }, [isVoiceDisabled, stopRecording, interrupt]);
}
