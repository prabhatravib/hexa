import { MutableRefObject } from 'react';
import { safeSessionSend, isRealtimeReady } from '@/lib/voiceSessionUtils';
import { getBaseInstructions } from '@/lib/externalContext';
import type { VoiceState } from '@/store/animationStore';
import {
  collectAssistantSnapshot,
  collectUserItemIds,
  waitForAssistantResponse,
  waitForConversationAck,
} from './sessionGuards';

interface SendTextHandlerConfig {
  isVoiceDisabled: boolean;
  setVoiceState: (state: VoiceState) => void;
  sendTextControl: (text: string) => Promise<boolean>;
  setTranscript: (text: string) => void;
  onError?: (message: string) => void;
  currentResponseIdRef: MutableRefObject<string | null>;
  audioContextRef?: MutableRefObject<AudioContext | null>;
}

export const createSendTextHandler = ({
  isVoiceDisabled,
  setVoiceState,
  sendTextControl,
  setTranscript,
  onError,
  currentResponseIdRef,
  audioContextRef,
}: SendTextHandlerConfig) => {
  return async (text: string) => {
    if (isVoiceDisabled) {
      console.log('dY"? Text sending blocked - voice is disabled');
      return false;
    }

    // Ensure shared AudioContext is running (user gesture)
    const ctx = audioContextRef?.current;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
        console.log('🎵 Resumed shared AudioContext before sending text');
      } catch (error) {
        console.warn('⚠️ Failed to resume AudioContext before sending text:', error);
      }
    }

    const session: any = (window as any).activeSession;
    if (session && isRealtimeReady(session)) {
      // MUTEX: Prevent concurrent text sends which cause duplicate event handlers
      if (session.__hexaTextHandlerInUse) {
        console.warn('⚠️ Text send already in progress, queuing this request');
        // Wait a bit and retry once
        await new Promise(resolve => setTimeout(resolve, 500));
        if (session.__hexaTextHandlerInUse) {
          console.error('❌ Text send still in progress after wait, falling back to HTTP');
          const success = await sendTextControl(text);
          if (success) {
            setTranscript(text);
            setVoiceState('thinking');
            return true;
          }
          return false;
        }
      }

      // Acquire the lock
      session.__hexaTextHandlerInUse = true;
      console.log('🔒 Acquired text handler lock');

      try {
        console.log('dY"? Sending text via Realtime session');

        console.log('🎵 Session state before response.create:', {
          state: session?.state,
          transportReadyState: session?.transport?.readyState,
          dataChannelState: session?.dataChannel?.readyState,
          currentResponseId: session?._currentResponseId,
          responseQueue: session?._responseQueue,
          historyLength: session?.history?.length,
          hasDataChannel: !!session?.dataChannel,
          transportState: session?.transport?.state,
          sessionId: session?.id || session?.__hexaSessionId,
        });

        // Initialize event handlers ONCE per session (not per function call)
        // This prevents duplicate event listeners which cause empty responses
        if (!session.__hexaTextHandlers) {
          session.__hexaTextHandlers = {
            timeout: null as ReturnType<typeof setTimeout> | null,
            sessionUpdateResolver: null as ((value: boolean) => void) | null,
            expectedVADState: undefined as boolean | null | undefined,
            error: (error: any) => {
              console.error('🚨 Session error during text send:', error);
              if (error?.type === 'response.create' || error?.code === 'response_create_failed') {
                console.error('❌ Response.create failed:', error);
              }
            },
            responseFailed: (error: any) => {
              console.error('❌ Response failed:', error);
              console.log('🔍 Response failed details:', {
                error,
                sessionState: session?.state,
                transportState: session?.transport?.state,
                dataChannelState: session?.dataChannel?.readyState,
              });
            },
            responseCanceled: (error: any) => {
              console.error('❌ Response canceled:', error);
              console.log('🔍 Response canceled details:', {
                error,
                sessionState: session?.state,
                transportState: session?.transport?.state,
                dataChannelState: session?.dataChannel?.readyState,
              });
            },
            transportEvent: (event: any) => {
              console.log('🚌 Transport event:', event);

              // Handle session.updated events (for VAD state change confirmation)
              if (event?.type === 'session.updated') {
                console.log('📋 session.updated detected via transport:', {
                  hasSession: !!event?.session,
                  turnDetection: event?.session?.turn_detection,
                });

                // Validate the state matches what we're expecting before resolving
                if (session.__hexaTextHandlers.sessionUpdateResolver) {
                  const expectedState = session.__hexaTextHandlers.expectedVADState;
                  const turnDetection = event?.session?.turn_detection;

                  // Handle both null (VAD disabled) and boolean create_response states
                  const actualState = turnDetection === null
                    ? null
                    : turnDetection?.create_response;

                  console.log('🔍 VAD state validation:', {
                    expectedState,
                    actualState,
                    turnDetection: turnDetection === null ? 'null (disabled)' : turnDetection,
                    matches: expectedState === undefined || actualState === expectedState,
                  });

                  if (expectedState === undefined || actualState === expectedState) {
                    session.__hexaTextHandlers.sessionUpdateResolver(true);
                    session.__hexaTextHandlers.sessionUpdateResolver = null;
                    session.__hexaTextHandlers.expectedVADState = undefined;
                    console.log('✅ Session update confirmed via transport - resolving promise');
                  } else {
                    console.log(`⚠️ Session update ignored - expected:${expectedState}, got:${actualState}`);
                  }
                }
              }

              if (event?.type === 'response.created' && session.__hexaTextHandlers.timeout) {
                clearTimeout(session.__hexaTextHandlers.timeout);
                session.__hexaTextHandlers.timeout = null;
                console.log('✅ Watchdog cleared - response.created via transport');
              }

              if (event?.type === 'agent_start' && session.__hexaTextHandlers.timeout) {
                clearTimeout(session.__hexaTextHandlers.timeout);
                session.__hexaTextHandlers.timeout = null;
                console.log('✅ Watchdog cleared - agent started responding');
              }

              if (event?.type === 'data_channel_state_change') {
                console.log('🔌 Data channel state changed:', event.state);
              }
              if (event?.type === 'error' || event?.type === 'close' || event?.type === 'disconnect') {
                console.error('🚨 Transport event indicating potential channel death:', event);
              }
            },
            responseCreated: (payload: any) => {
              console.log('🎵 response.created event received:', payload);
              if (session.__hexaTextHandlers.timeout) {
                clearTimeout(session.__hexaTextHandlers.timeout);
                session.__hexaTextHandlers.timeout = null;
                console.log('✅ response.created event received - clearing timeout');
              }
            },
          };

          // Register handlers ONCE for the lifetime of the session
          session.on('error', session.__hexaTextHandlers.error);
          session.on('response.failed', session.__hexaTextHandlers.responseFailed);
          session.on('response.canceled', session.__hexaTextHandlers.responseCanceled);
          session.on('transport_event', session.__hexaTextHandlers.transportEvent);
          session.on('response.created', session.__hexaTextHandlers.responseCreated);

          console.log('✅ Registered text handler event listeners (ONCE per session)');
        }

        if (session.dataChannel) {
          session.dataChannel.onerror = (error: any) => {
            console.error('🔌 DataChannel error:', error);
          };
        }

        try {
          setVoiceState('thinking');

          const previousUserIds = collectUserItemIds(session?.history);
          const previousAssistantSnapshot = collectAssistantSnapshot(session?.history);

          console.log('🎵 Using raw API calls (keeping working implementation)');

          // Suspend server VAD and flush any pending microphone audio before we enqueue text.
          // Without this, ambient mic samples captured between turns can keep the assistant
          // waiting for audio commit, which manifests as silent responses for text-only inputs.
          try {
            console.log('🔧 Prepping session for manual text: disabling turn_detection first...');

            session.__hexaTextHandlers.expectedVADState = null;

            const disablePromise = new Promise<boolean>((resolve) => {
              session.__hexaTextHandlers.sessionUpdateResolver = resolve;
              window.setTimeout(() => {
                if (session.__hexaTextHandlers.sessionUpdateResolver === resolve) {
                  console.warn('⚠️ Turn detection disable confirmation timeout');
                  resolve(false);
                  session.__hexaTextHandlers.sessionUpdateResolver = null;
                  session.__hexaTextHandlers.expectedVADState = undefined;
                }
              }, 2000);
            });

            await safeSessionSend(session, {
              type: 'session.update',
              session: { turn_detection: null },
            });

            const disabled = await disablePromise;
            if (disabled) {
              console.log('✅ Turn detection disabled before text injection');
            } else {
              console.warn('⚠️ Proceeding without confirmed turn detection disable');
            }
          } catch (disableError) {
            console.warn('⚠️ Failed to disable turn detection prior to text send:', disableError);
            session.__hexaTextHandlers.sessionUpdateResolver = null;
            session.__hexaTextHandlers.expectedVADState = undefined;
          }

          try {
            console.log('🔧 Clearing input audio buffer after turn detection disable...');
            await safeSessionSend(session, { type: 'input_audio_buffer.clear' });
            await new Promise(resolve => window.setTimeout(resolve, 150));
            console.log('✅ Mic buffer cleared before conversation item');
          } catch (preClearError) {
            console.warn('⚠️ Failed to clear mic buffer before text send:', preClearError);
          }

          const queued = await safeSessionSend(session, {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text }],
            },
          });

          console.log('🎵 conversation.item.create result:', queued);

          if (!queued) {
            throw new Error('Realtime conversation.item.create failed');
          }

          const acked = await waitForConversationAck(session, text, previousUserIds);
          console.log('dY"? Conversation item ack status:', acked);
          if (!acked) {
            console.warn('dY"? Conversation item create ack timed out, continuing anyway');
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          console.log('🎵 About to send response.create command');
          console.log('🎵 Session state before response.create:', {
            state: session?.state,
            readyState: session?.transport?.readyState,
            currentResponseId: session?._currentResponseId,
            responseQueue: session?._responseQueue,
            historyLength: session?.history?.length,
            dataChannelState: session?.dataChannel?.readyState,
          });

          let triggered = await safeSessionSend(session, {
            type: 'response.create',
            response: {
              modalities: ['audio', 'text'],
              instructions:
                getBaseInstructions() ||
                'You are Hexa, the Hexagon assistant. Respond aloud to the user.',
              output_audio_format: 'pcm16',
            },
          });

          console.log('🎵 response.create result:', triggered);

          session.__hexaTextHandlers.timeout = setTimeout(async () => {
            console.error('❌ response.created event never fired - session may be stuck');
            console.log('🎵 Session state after timeout:', {
              state: session?.state,
              currentResponseId: session?._currentResponseId,
              responseQueue: session?._responseQueue,
              historyLength: session?.history?.length,
            });

            if (triggered) {
              console.log('🔄 response.create succeeded but no response.created - triggering session recreation');
              try {
                const { triggerRecoveryIfNeeded } = await import('../../lib/voiceErrorRecovery');
                await triggerRecoveryIfNeeded();
              } catch (error) {
                console.error('❌ Failed to trigger session recreation:', error);
              }
            }
          }, 8000);

          if (!triggered) {
            console.error('❌ response.create command failed - session may be in invalid state');

            console.log('🔄 Attempting session recreation due to response.create failure');
            try {
              const recreationAttempted = (window as any).__recreationAttempted;
              if (recreationAttempted) {
                console.error('❌ Session recreation already attempted, giving up');
                throw new Error('Session recreation already attempted');
              }
              (window as any).__recreationAttempted = true;

              const { triggerRecoveryIfNeeded } = await import('../../lib/voiceErrorRecovery');
              await triggerRecoveryIfNeeded();

              await new Promise(resolve => setTimeout(resolve, 1000));

              const newSession: any = (window as any).activeSession;
              if (newSession && newSession !== session) {
                console.log('✅ Session recreated, retrying with new session');
                const retryTriggered = await safeSessionSend(newSession, {
                  type: 'response.create',
                  response: {
                    modalities: ['audio', 'text'],
                    instructions:
                      getBaseInstructions() ||
                      'You are Hexa, the Hexagon assistant. Respond aloud to the user.',
                    output_audio_format: 'pcm16',
                  },
                });

                if (retryTriggered) {
                  console.log('✅ Retry with new session succeeded');
                  triggered = true;
                } else {
                  throw new Error('Session recreation failed to fix response.create');
                }
              } else {
                throw new Error('Session recreation did not create new session');
              }
            } catch (recreationError) {
              console.error('❌ Session recreation failed:', recreationError);
              throw new Error('Realtime response.create failed after recreation');
            }
          }

          const assistantResponded = await waitForAssistantResponse(
            session,
            previousAssistantSnapshot,
            currentResponseIdRef
          );

          if (session.__hexaTextHandlers.timeout) {
            clearTimeout(session.__hexaTextHandlers.timeout);
            session.__hexaTextHandlers.timeout = null;
            console.log('✅ Clearing timeout - response received');
          }

          if (!assistantResponded) {
            console.warn('dY"? Assistant response detection failed, falling back to HTTP');
            const fallbackSuccess = await sendTextControl(text);
            if (!fallbackSuccess) {
              throw new Error('HTTP fallback send failed');
            }
            setTranscript(text);
            setVoiceState('thinking');
            return true;
          }

          console.log('dY"? Text sent and voice response requested');
          setTranscript(text);
          return true;
        } finally {
          // Clear timeout (handlers remain registered for session lifetime)
          if (session.__hexaTextHandlers.timeout) {
            clearTimeout(session.__hexaTextHandlers.timeout);
            session.__hexaTextHandlers.timeout = null;
          }

          // Release the mutex lock BEFORE re-enabling VAD
          // This ensures next text input can acquire lock immediately if needed
          session.__hexaTextHandlerInUse = false;
          console.log('🔓 Released text handler lock');

          // Re-enable VAD create_response LAST, after lock release
          // This prevents new text inputs from racing with this re-enable
          // If a new text input arrives, it will:
          // 1. Acquire lock (we just released it)
          // 2. Disable VAD again (might race with this enable, but lock ensures one at a time)
          // 3. Wait for confirmation before proceeding
          try {
            console.log('🔧 Re-enabling VAD create_response for voice inputs...');

            // Set expected state for re-enable
            session.__hexaTextHandlers.expectedVADState = true;

            // Set up promise to wait for session.updated event
            const reenablePromise = new Promise<boolean>((resolve) => {
              session.__hexaTextHandlers.sessionUpdateResolver = resolve;
              // Timeout after 2 seconds if no response
              setTimeout(() => {
                if (session.__hexaTextHandlers.sessionUpdateResolver === resolve) {
                  console.warn('⚠️ VAD re-enable confirmation timeout (non-critical)');
                  resolve(false);
                  session.__hexaTextHandlers.sessionUpdateResolver = null;
                  session.__hexaTextHandlers.expectedVADState = undefined;
                }
              }, 2000);
            });

            await safeSessionSend(session, {
              type: 'session.update',
              session: {
                turn_detection: {
                  type: 'server_vad',
                  create_response: true, // Re-enable auto-response for voice inputs
                  threshold: 0.3,
                  prefix_padding_ms: 500,
                  silence_duration_ms: 1000,
                },
              },
            });

            // Wait for confirmation
            const confirmed = await reenablePromise;
            if (confirmed) {
              console.log('✅ VAD create_response re-enabled and confirmed');

              // CRITICAL FIX: Clear audio buffer AGAIN after VAD re-enable
              // This prevents spurious audio captured between VAD re-enable and next text input
              // from polluting the conversation history and blocking subsequent text responses
              try {
                console.log('🔧 Clearing audio buffer after VAD re-enable to prevent spurious captures...');

                // Small delay to ensure VAD is fully active before clearing
                await new Promise(resolve => setTimeout(resolve, 100));

                // Clear any audio that may have been captured since VAD was re-enabled
                await safeSessionSend(session, { type: 'input_audio_buffer.clear' });
                console.log('✅ Audio buffer cleared after VAD re-enable');
              } catch (postClearError) {
                console.warn('⚠️ Failed to clear buffer after VAD re-enable (non-critical):', postClearError);
              }
            } else {
              console.warn('⚠️ VAD re-enable sent but confirmation timeout (non-critical)');
            }
          } catch (reenableError) {
            console.warn('⚠️ Failed to re-enable VAD (non-critical):', reenableError);
            // Clear any pending resolver
            session.__hexaTextHandlers.sessionUpdateResolver = null;
            session.__hexaTextHandlers.expectedVADState = undefined;
          }
        }
      } catch (error) {
        console.warn('Realtime text send failed, falling back to HTTP:', error);
        // Release lock on error
        if (session) {
          session.__hexaTextHandlerInUse = false;
          console.log('🔓 Released text handler lock (error path)');
        }
      }
    }

    try {
      console.log('dY"? Sending text via HTTP fallback');
      const success = await sendTextControl(text);
      if (success) {
        setTranscript(text);
        setVoiceState('thinking');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to send text:', error);
      onError?.('Failed to send message');
      return false;
    }
  };
};
