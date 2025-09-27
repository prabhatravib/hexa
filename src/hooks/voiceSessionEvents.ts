import { registerVoiceSessionPlaybackHandlers } from './voiceSessionPlaybackHandlers';
import { registerVoiceSessionTranscriptHandlers } from './voiceSessionTranscriptHandlers';
import {
  createDebugSetVoiceState,
  type SessionEventHandlersOptions,
  type VoiceSessionRuntimeState,
} from './voiceSessionShared';

export const setupSessionEventHandlers = (session: any, options: SessionEventHandlersOptions) => {
  const runtimeState: VoiceSessionRuntimeState = {
    isCurrentlySpeaking: false,
    awaitingMicResponse: false,
    lastResponseText: null,
    lastTranscriptText: null,
  };

  const debugSetVoiceState = createDebugSetVoiceState(options.setVoiceState);

  registerVoiceSessionPlaybackHandlers(session, {
    ...options,
    debugSetVoiceState,
    runtimeState,
  });

  registerVoiceSessionTranscriptHandlers(session, {
    ...options,
    debugSetVoiceState,
    runtimeState,
  });
};
