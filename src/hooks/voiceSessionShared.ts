import type React from 'react';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface SessionEventHandlersOptions {
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  audioEl: HTMLAudioElement;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
  setSpeechIntensity?: (intensity: number) => void;
}

export interface VoiceSessionRuntimeState {
  isCurrentlySpeaking: boolean;
  awaitingMicResponse: boolean;
  lastResponseText: string | null;
  lastTranscriptText: string | null;
}

export type DebugSetVoiceState = (state: VoiceState) => void;

export const createDebugSetVoiceState = (
  setVoiceState: (state: VoiceState) => void
): DebugSetVoiceState => {
  return (state: VoiceState) => {
    console.log(
      `dYZ\u000f Voice state changing from ${(window as any).__currentVoiceState} to ${state}`
    );
    setVoiceState(state);
  };
};

export const extractTranscript = (content: any): string | null => {
  if (!content) return null;
  if (typeof content === 'string') return content.trim() || null;

  if (Array.isArray(content)) {
    for (const part of content) {
      const transcript = extractTranscript(part);
      if (transcript) return transcript;
    }
    return null;
  }

  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim() || null;
    if (typeof content.transcript === 'string') return content.transcript.trim() || null;
    if (content.content) return extractTranscript(content.content);
  }

  return null;
};