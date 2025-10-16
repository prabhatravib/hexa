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
}

export const createSendTextHandler = ({
  isVoiceDisabled,
  setVoiceState,
  sendTextControl,
  setTranscript,
  onError,
  currentResponseIdRef,
}: SendTextHandlerConfig) => {
  return async (text: string) => {
    if (isVoiceDisabled) {
      console.log('dY"? Text sending blocked - voice is disabled');
      return false;
    }

    const session: any = (window as any).activeSession;
    if (session && isRealtimeReady(session)) {
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

        let responseCreatedTimeout: ReturnType<typeof setTimeout> | null = null;

        const errorHandler = (error: any) => {
          console.error('🚨 Session error during text send:', error);
          if (error?.type === 'response.create' || error?.code === 'response_create_failed') {
            console.error('❌ Response.create failed:', error);
          }
        };

        const responseFailedHandler = (error: any) => {
          console.error('❌ Response failed:', error);
          console.log('🔍 Response failed details:', {
            error,
            sessionState: session?.state,
            transportState: session?.transport?.state,
            dataChannelState: session?.dataChannel?.readyState,
          });
        };

        const responseCanceledHandler = (error: any) => {
          console.error('❌ Response canceled:', error);
          console.log('🔍 Response canceled details:', {
            error,
            sessionState: session?.state,
            transportState: session?.transport?.state,
            dataChannelState: session?.dataChannel?.readyState,
          });
        };

        const transportEventHandler = (event: any) => {
          console.log('🚌 Transport event:', event);

          if (event?.type === 'response.created' && responseCreatedTimeout) {
            clearTimeout(responseCreatedTimeout);
            responseCreatedTimeout = null;
            console.log('✅ Watchdog cleared - response.created via transport');
          }

          if (event?.type === 'agent_start' && responseCreatedTimeout) {
            clearTimeout(responseCreatedTimeout);
            responseCreatedTimeout = null;
            console.log('✅ Watchdog cleared - agent started responding');
          }

          if (event?.type === 'data_channel_state_change') {
            console.log('🔌 Data channel state changed:', event.state);
          }
          if (event?.type === 'error' || event?.type === 'close' || event?.type === 'disconnect') {
            console.error('🚨 Transport event indicating potential channel death:', event);
          }
        };

        const responseCreatedHandler = (payload: any) => {
          console.log('🎵 response.created event received:', payload);
          if (responseCreatedTimeout) {
            clearTimeout(responseCreatedTimeout);
            responseCreatedTimeout = null;
            console.log('✅ response.created event received - clearing timeout');
          }
        };

        session.on('error', errorHandler);
        session.on('response.failed', responseFailedHandler);
        session.on('response.canceled', responseCanceledHandler);
        session.on('transport_event', transportEventHandler);
        session.on('response.created', responseCreatedHandler);

        if (session.dataChannel) {
          session.dataChannel.onerror = (error: any) => {
            console.error('🔌 DataChannel error:', error);
          };
        }

        setVoiceState('thinking');

        const previousUserIds = collectUserItemIds(session?.history);
        const previousAssistantSnapshot = collectAssistantSnapshot(session?.history);

        console.log('🎵 Using raw API calls (keeping working implementation)');

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
            voice: 'marin',
            output_audio_format: 'pcm16',
          },
        });

        console.log('🎵 response.create result:', triggered);

        responseCreatedTimeout = setTimeout(async () => {
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
            session.off('error', errorHandler);
            session.off('response.failed', responseFailedHandler);
            session.off('response.canceled', responseCanceledHandler);
            session.off('transport_event', transportEventHandler);
            session.off('response.created', responseCreatedHandler);

            if (responseCreatedTimeout) {
              clearTimeout(responseCreatedTimeout);
              responseCreatedTimeout = null;
            }

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
                  voice: 'marin',
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

        session.off('error', errorHandler);
        session.off('response.failed', responseFailedHandler);
        session.off('response.canceled', responseCanceledHandler);
        session.off('transport_event', transportEventHandler);
        session.off('response.created', responseCreatedHandler);

        const assistantResponded = await waitForAssistantResponse(
          session,
          previousAssistantSnapshot,
          currentResponseIdRef
        );

        if (responseCreatedTimeout) {
          clearTimeout(responseCreatedTimeout);
          responseCreatedTimeout = null;
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
      } catch (error) {
        console.warn('Realtime text send failed, falling back to HTTP:', error);
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
