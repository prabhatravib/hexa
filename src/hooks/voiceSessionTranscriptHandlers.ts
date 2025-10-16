import { isVoiceDisabledNow } from '@/lib/voiceDisableGuard';
import { getBaseInstructions } from '@/lib/externalContext';
import { safeSessionSend } from '@/lib/voiceSessionUtils';
import {
  extractTranscript,
  type DebugSetVoiceState,
  type SessionEventHandlersOptions,
  type VoiceSessionRuntimeState,
} from './voiceSessionShared';

interface VoiceSessionTranscriptContext extends SessionEventHandlersOptions {
  debugSetVoiceState: DebugSetVoiceState;
  runtimeState: VoiceSessionRuntimeState;
}

type HistoryEntry = {
  role?: string;
  content?: any;
};

export const registerVoiceSessionTranscriptHandlers = (
  session: any,
  context: VoiceSessionTranscriptContext
) => {
  const { debugSetVoiceState, runtimeState } = context;

  const getHistory = (): HistoryEntry[] => {
    try {
      const entries = session.history || [];
      console.log('dY"s Full session history snapshot:', entries);
      return Array.isArray(entries) ? entries : [];
    } catch (error) {
      console.log('dYO? Failed to access session history:', error);
      return [];
    }
  };

  const findLatestAssistantText = (history: HistoryEntry[]): string | null => {
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item?.role === 'assistant') {
        const text = extractTranscript(item.content);
        if (text) {
          console.log('dYO? Latest assistant transcript from history:', text);
          return text;
        }
      }
    }
    return null;
  };

  const findLatestUserText = (history: HistoryEntry[]): string | null => {
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item?.role === 'user') {
        const text = extractTranscript(item.content);
        if (text) {
          console.log('dYO? Latest user transcript from history:', text);
          return text;
        }
      }
    }
    return null;
  };

  const commitResponseText = (text: unknown, source: string): boolean => {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    const normalized = trimmed.toLowerCase();
    if (normalized === 'message') {
      console.log(`dYO? Ignoring placeholder response from ${source}:`, trimmed);
      return false;
    }
    if (runtimeState.lastResponseText === trimmed) {
      console.log(`dYO? Duplicate response ignored from ${source}:`, trimmed);
      return true;
    }
    runtimeState.lastResponseText = trimmed;
    console.log(`dYO? Setting response text from ${source}:`, trimmed);
    if (typeof window !== 'undefined' && (window as any).__hexaSetResponse) {
      (window as any).__hexaSetResponse(trimmed);
    }
    return true;
  };

  const commitTranscriptText = (text: unknown, source: string): boolean => {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (runtimeState.lastTranscriptText === trimmed) {
      console.log(`dYO? Duplicate transcript ignored from ${source}:`, trimmed);
      return true;
    }
    runtimeState.lastTranscriptText = trimmed;
    console.log(`dYO? Setting transcript text from ${source}:`, trimmed);
    if (typeof window !== 'undefined' && (window as any).__hexaSetTranscript) {
      (window as any).__hexaSetTranscript(trimmed);
    }
    return true;
  };

  const scheduleHistorySync = (reason: string, delayMs = 60) => {
    setTimeout(() => {
      const history = getHistory();
      const assistantText = findLatestAssistantText(history);
      if (!commitResponseText(assistantText, `${reason} history`)) {
        console.log(`dYO? No assistant text found during ${reason} history sync.`);
      }
      const userText = findLatestUserText(history);
      if (userText) {
        commitTranscriptText(userText, `${reason} history user`);
      }
    }, delayMs);
  };

  const extractFirstString = (value: any): string | null => {
    const seen = new Set<any>();
    const visit = (current: any, depth: number): string | null => {
      if (typeof current === 'string') {
        const trimmed = current.trim();
        if (!trimmed) return null;

        const ignorePatterns = [/^item_[A-Za-z0-9-]+$/i, /^resp_[A-Za-z0-9-]+$/i, /^response_[A-Za-z0-9-]+$/i];
        if (ignorePatterns.some(pattern => pattern.test(trimmed))) {
          return null;
        }

        const looksLikeSentence = trimmed.includes(' ') || /[.,!?]/.test(trimmed);
        if (!looksLikeSentence && trimmed.length < 4) {
          return null;
        }
        return trimmed;
      }
      if (!current || typeof current !== 'object' || depth > 4) {
        return null;
      }
      if (seen.has(current)) return null;
      seen.add(current);
      if (Array.isArray(current)) {
        for (const item of current) {
          const found = visit(item, depth + 1);
          if (found) return found;
        }
        return null;
      }
      for (const key of Object.keys(current)) {
        const valueAtKey = (current as Record<string, unknown>)[key];
        if (typeof valueAtKey === 'function') continue;
        const found = visit(valueAtKey, depth + 1);
        if (found) return found;
      }
      return null;
    };

    return visit(value, 0);
  };

  const responseTextBuffers = new Map<string, { text: string; sawDelta: boolean }>();
  let activeResponseId: string | null = null;

  const resolveResponseId = (payload: any): string | null => {
    if (!payload || typeof payload !== 'object') return null;
    const candidate =
      payload.response_id ||
      payload.responseId ||
      payload.id ||
      payload.response?.id ||
      (typeof payload.response === 'object' ? (payload.response as any).response_id : undefined);
    return candidate ? String(candidate) : null;
  };

  const ensureBuffer = (id: string | null) => {
    if (!id) return null;
    let buffer = responseTextBuffers.get(id);
    if (!buffer) {
      buffer = { text: '', sawDelta: false };
      responseTextBuffers.set(id, buffer);
    }
    return buffer;
  };

  const clearBuffer = (id: string | null) => {
    if (!id) return;
    responseTextBuffers.delete(id);
    if (activeResponseId === id) {
      activeResponseId = null;
    }
  };

  const flushBuffer = (id: string | null, source: string): boolean => {
    if (!id) return false;
    const buffer = responseTextBuffers.get(id);
    if (!buffer) return false;
    const text = buffer.text.trim();
    clearBuffer(id);
    if (!text) return false;
    return commitResponseText(text, source);
  };

  const readDeltaText = (payload: any): string => {
    if (typeof payload === 'string') return payload;
    if (!payload || typeof payload !== 'object') return '';
    if (typeof payload.delta === 'string') return payload.delta;
    if (typeof payload.text === 'string') return payload.text;
    if (Array.isArray(payload.delta)) {
      return payload.delta.map((part: any) => readDeltaText(part)).join('');
    }
    if (Array.isArray(payload.text)) {
      return payload.text.map((part: any) => readDeltaText(part)).join('');
    }
    return '';
  };

  const noteActiveResponse = (id: string | null) => {
    if (!id) return;
    activeResponseId = id;
    ensureBuffer(id);
  };

  session.on('response.created' as any, (payload: any) => {
    const id = resolveResponseId(payload);
    if (id) {
      console.log('dYO? response.created detected for', id);
    }
    noteActiveResponse(id);
  });

  session.on('response.output_item.added' as any, (event: any) => {
    const id = resolveResponseId(event) ?? activeResponseId;
    const candidate = extractFirstString(event?.item ?? event);
    if (candidate && commitResponseText(candidate, 'response.output_item.added')) {
      clearBuffer(id ?? activeResponseId);
    }
  });

  session.on('response.output_text.delta' as any, (payload: any) => {
    const id = resolveResponseId(payload) ?? activeResponseId;
    const delta = readDeltaText(payload);
    if (!id || !delta) return;
    const buffer = ensureBuffer(id);
    if (!buffer) return;
    buffer.text += delta;
    buffer.sawDelta = true;
  });

  session.on('response.output_text.done' as any, (payload: any) => {
    const id = resolveResponseId(payload) ?? activeResponseId;
    if (flushBuffer(id, 'response.output_text stream')) {
      return;
    }
    scheduleHistorySync('response.output_text.done', 90);
  });

  session.on('response.completed' as any, (payload: any) => {
    const id = resolveResponseId(payload) ?? activeResponseId;
    if (flushBuffer(id, 'response.completed stream')) {
      return;
    }

    const textFromPayload = extractFirstString(payload);
    if (commitResponseText(textFromPayload, 'response.completed payload')) {
      clearBuffer(id);
      return;
    }

    scheduleHistorySync('response.completed', 120);
  });

  session.on('agent_end' as any, (...args: any[]) => {
    console.log('dYO? agent_end received with args:', args);

    if (flushBuffer(activeResponseId, 'agent_end stream flush')) {
      return;
    }

    const textFromArgs = extractFirstString(args);
    if (!commitResponseText(textFromArgs, 'agent_end args')) {
      console.log('dYO? agent_end args did not contain response text, will rely on history.');
    }

    scheduleHistorySync('agent_end', 120);
  });

  session.on('*' as any, (eventName: string, data: any) => {
    if (eventName.includes('transcription') || eventName.includes('conversation')) {
      console.log(`dYO? Session event: ${eventName}`, data);
    }
  });

  session.on('conversation.item.input_audio_transcription.completed' as any, (event: any) => {
    console.log('dYO? User transcription completed:', event);
    const transcript = event?.transcript || event?.text || event?.content;
    
    if (!commitTranscriptText(transcript, 'transcription.completed')) {
      console.log('dYO? No usable transcript in transcription.completed event.');
    }
  });

  session.on('conversation.item.created' as any, (item: any) => {
    if (
      item?.role === 'user' &&
      Array.isArray(item?.content) &&
      item.content.some((part: any) => part?.type === 'input_text')
    ) {
      console.log('dYO? User text item created, preparing for response.');
      if (!runtimeState.isCurrentlySpeaking) {
        debugSetVoiceState('thinking');
      }
    }
  });

  session.on('input_audio_buffer.speech_started' as any, () => {
    console.log('dYO? Speech started - user is speaking');
    runtimeState.awaitingMicResponse = true;
  });

  session.on('input_audio_buffer.speech_stopped' as any, () => {
    console.log('dYO? Speech stopped - user finished speaking');

    if (runtimeState.awaitingMicResponse) {
      runtimeState.awaitingMicResponse = false;

      if (isVoiceDisabledNow()) {
        console.log('dYO? Voice disabled: skipping response.create after speech stop');
      } else {
        console.log('dYO? Speech stopped - requesting response from model');
        debugSetVoiceState('thinking');
        void safeSessionSend(session, {
          type: 'response.create',
          response: {
            modalities: ['audio', 'text'],
            instructions:
              getBaseInstructions() ||
              'You are Hexa, the Hexagon assistant. Respond aloud to the user.',
          },
        });
      }
    }

    scheduleHistorySync('speech_stopped');
  });

  const transcriptEvents = [
    'conversation.item.input_audio_transcription',
    'input_audio_buffer.transcription',
    'transcription',
    'conversation.item.input_audio_transcription.done',
    'input_audio_buffer.speech_stopped',
    'conversation.item.input_audio_transcription.completed',
  ];

  transcriptEvents.forEach(eventName => {
    session.on(eventName as any, (data: any) => {
      console.log(`dYO? Transcript event ${eventName}:`, data);
      if (!commitTranscriptText(data, eventName)) {
        if (typeof data === 'object' && data) {
          if (!commitTranscriptText(data.text, `${eventName}.text`)) {
            commitTranscriptText(data.transcript, `${eventName}.transcript`);
          }
        }
      }
    });
  });
};
