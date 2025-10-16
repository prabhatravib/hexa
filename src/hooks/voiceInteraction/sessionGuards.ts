import { MutableRefObject } from 'react';
import { extractTranscript } from '../voiceSessionShared';

export const collectUserItemIds = (history: any): Set<string> => {
  const ids = new Set<string>();
  if (!Array.isArray(history)) return ids;
  history.forEach(item => {
    if (item?.role !== 'user') return;
    const id = item?.itemId ?? item?.id;
    if (id) ids.add(id);
  });
  return ids;
};

export const collectAssistantSnapshot = (history: any): Map<string, string | null> => {
  const snapshot = new Map<string, string | null>();
  if (!Array.isArray(history)) return snapshot;
  history.forEach(item => {
    if (item?.role !== 'assistant') return;
    const id = item?.itemId ?? item?.id;
    if (!id) return;
    const text = extractTranscript(item?.content);
    const normalized = typeof text === 'string' ? text.trim() : null;
    snapshot.set(String(id), normalized && normalized.length > 0 ? normalized : null);
  });
  return snapshot;
};

export const waitForConversationAck = async (
  session: any,
  text: string,
  previousUserIds: Set<string>
): Promise<boolean> => {
  if (!session?.on) return true;

  const normalize = (value: unknown) =>
    typeof value === 'string' ? value.trim() : undefined;

  const target = normalize(text);

  return await new Promise<boolean>(resolve => {
    let settled = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;

    const cleanup = (result: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      session.off?.('conversation.item.created', onCreated);
      session.off?.('error', onError);
      if (intervalId !== null) window.clearInterval(intervalId);
      resolve(result);
    };

    const onCreated = (item: any) => {
      try {
        if (item?.role !== 'user') return;
        const id = item?.itemId ?? item?.id;
        if (id && previousUserIds.has(id)) return;
        const content = Array.isArray(item?.content) ? item.content : [];
        const matches = target
          ? content.some((part: any) => normalize(part?.text ?? part?.transcript) === target)
          : true;
        if (!matches) return;
        if (id) previousUserIds.add(id);
      } catch {
        return;
      }
      cleanup(true);
    };

    const onError = () => {
      cleanup(false);
    };

    const pollHistory = () => {
      try {
        const history = Array.isArray(session?.history) ? session.history : [];
        for (const item of history) {
          if (item?.role !== 'user') continue;
          const id = item?.itemId ?? item?.id;
          if (id && !previousUserIds.has(id)) {
            previousUserIds.add(id);
            cleanup(true);
            return;
          }
          if (target) {
            const textMatch = normalize(extractTranscript(item?.content)) === target;
            if (textMatch && (!id || !previousUserIds.has(id))) {
              if (id) previousUserIds.add(id);
              cleanup(true);
              return;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to inspect session history for ack:', error);
      }
    };

    pollHistory();
    if (!settled) {
      intervalId = window.setInterval(pollHistory, 120);
    }

    timeoutId = window.setTimeout(() => {
      pollHistory();
      cleanup(false);
    }, 2000);

    session.on?.('conversation.item.created', onCreated);
    session.on?.('error', onError);
  });
};

export const waitForAssistantResponse = async (
  session: any,
  _previousAssistantSnapshot: Map<string, string | null>,
  currentResponseIdRef: MutableRefObject<string | null>
): Promise<boolean> => {
  if (!session?.on) return false;

  console.log('🎵 waitForAssistantResponse: Starting to wait for assistant response');

  return await new Promise<boolean>(resolve => {
    let settled = false;
    let timeoutId: number | null = null;
    let responseId: string | null = currentResponseIdRef.current ?? null;
    let audioDetected = false;
    let textDetected = false;

    const cleanup = (result: boolean, reason: string) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      session.off?.('response.created', onResponseCreated);
      session.off?.('response.output_text.delta', onOutputTextDelta);
      session.off?.('response.output_text.done', onOutputTextDone);
      session.off?.('response.audio', markAudioDetected);
      session.off?.('response.audio.delta', markAudioDetected);
      session.off?.('response.audio.start', markAudioDetected);
      session.off?.('response.audio_transcript.delta', onTranscriptDelta);
      session.off?.('response.audio_transcript.done', onTranscriptDone);
      session.off?.('agent_end', onAgentEnd);
      session.off?.('response.completed', onResponseCompleted);
      session.off?.('response.failed', onResponseFailed);
      session.off?.('response.canceled', onResponseFailed);
      session.off?.('transport_event', onTransportEvent);

      console.log('🎵 waitForAssistantResponse: Cleanup called with result:', result, 'reason:', reason);
      resolve(result);
    };

    const updateResponseId = (id: string | null | undefined) => {
      if (!id) return;
      responseId = String(id);
      currentResponseIdRef.current = responseId;
      (window as any).__currentResponseId = responseId;
    };

    const matchesCurrentResponse = (payload: any): boolean => {
      if (!payload || typeof payload !== 'object') return true;
      const candidate =
        payload?.response_id ??
        payload?.responseId ??
        payload?.responseID ??
        payload?.response?.id ??
        payload?.response?.response_id ??
        payload?.id;

      if (candidate) {
        updateResponseId(candidate);
      }

      if (!responseId) return true;
      if (!candidate) return true;
      return String(candidate) === responseId;
    };

    const markSuccess = (reason: string) => {
      cleanup(true, reason);
    };

    const markAudioDetected = (...args: any[]) => {
      if (settled) return;
      const payload = args?.[0];
      if (!matchesCurrentResponse(payload)) return;
      audioDetected = true;
      markSuccess('audio-event');
    };

    const onOutputTextDelta = (payload: any) => {
      if (settled) return;
      if (!matchesCurrentResponse(payload)) return;
      textDetected = true;
      markSuccess('text-delta');
    };

    const onOutputTextDone = (payload: any) => {
      if (settled) return;
      if (!matchesCurrentResponse(payload)) return;
      textDetected = true;
      markSuccess('text-done');
    };

    const onTranscriptDelta = (payload: any) => {
      if (settled) return;
      if (!matchesCurrentResponse(payload)) return;
      const text =
        typeof payload === 'string'
          ? payload.trim()
          : typeof payload?.delta === 'string'
            ? payload.delta.trim()
            : '';
      if (text) {
        textDetected = true;
        markSuccess('transcript-delta');
      }
    };

    const onTranscriptDone = (payload: any) => {
      if (settled) return;
      if (!matchesCurrentResponse(payload)) return;
      const text =
        typeof payload === 'string'
          ? payload.trim()
          : typeof payload?.transcript === 'string'
            ? payload.transcript.trim()
            : '';
      if (text) {
        textDetected = true;
        markSuccess('transcript-done');
      }
    };

    const onAgentEnd = (...args: any[]) => {
      if (settled) return;
      const payload = args?.[0];
      if (!matchesCurrentResponse(payload)) return;
      const message = args?.[2];
      if (typeof message === 'string' && message.trim().length > 0) {
        markSuccess('agent-end-message');
        return;
      }
      // Only mark success if we actually received audio or text content
      // This prevents premature exit when agent_end fires before audio events arrive (race condition)
      if (audioDetected || textDetected) {
        markSuccess('agent-end');
      } else {
        console.warn('⚠️ agent_end received but no audio/text detected - continuing to wait for content');
        // Don't exit - audio events may still be arriving
        // The 15s timeout (line 349-355) will eventually handle truly empty responses
      }
    };

    const onResponseCompleted = (payload: any) => {
      if (settled) return;
      if (!matchesCurrentResponse(payload)) return;
      if (audioDetected || textDetected) {
        markSuccess('response-completed');
      }
    };

    const onResponseFailed = (payload: any) => {
      if (settled) return;
      if (!matchesCurrentResponse(payload)) return;
      console.warn('🎵 waitForAssistantResponse: response failure detected:', payload);
      cleanup(false, 'response-failed');
    };

    const onResponseCreated = (payload: any) => {
      if (settled) return;
      updateResponseId(payload?.id);
    };

    const onTransportEvent = (rawEvent: any) => {
      if (settled) return;
      const events = Array.isArray(rawEvent) ? rawEvent : [rawEvent];
      for (const event of events) {
        if (!event) continue;
        if (!matchesCurrentResponse(event)) continue;

        switch (event.type) {
          case 'response.created':
            updateResponseId(event.response?.id ?? event.id);
            break;
          case 'response.output_item.added':
          case 'response.content_part.added': {
            const item = event.item ?? event.output_item ?? event;
            if (item?.content) {
              const contents = Array.isArray(item.content) ? item.content : [item.content];
              for (const part of contents) {
                if (typeof part?.text === 'string' && part.text.trim().length > 0) {
                  textDetected = true;
                  markSuccess('content-part-text');
                  return;
                }
                if (part?.type === 'audio' || part?.modality === 'audio' || part?.audio) {
                  audioDetected = true;
                  markSuccess('content-part-audio');
                  return;
                }
              }
            }
            break;
          }
          case 'response.audio_transcript.delta':
            onTranscriptDelta(event);
            break;
          case 'response.audio_transcript.done':
            onTranscriptDone(event);
            break;
          case 'response.audio.delta':
          case 'output_audio_buffer.started':
          case 'output_audio_buffer.chunk':
            audioDetected = true;
            markSuccess('transport-audio');
            return;
          case 'response.done':
            // Only mark success if we actually received audio or text content
            // This prevents premature exit when response.done arrives before audio events (race condition)
            if (audioDetected || textDetected) {
              markSuccess('response-done');
            } else {
              console.warn('⚠️ response.done received but no audio/text detected - continuing to wait for content');
              // Don't exit - keep waiting for audio events to arrive
              // The 15s timeout (line 341-347) will eventually handle truly empty responses
            }
            return;
          case 'response.failed':
          case 'response.canceled':
            onResponseFailed(event);
            return;
        }
      }
    };

    session.on?.('response.created', onResponseCreated);
    session.on?.('response.output_text.delta', onOutputTextDelta);
    session.on?.('response.output_text.done', onOutputTextDone);
    session.on?.('response.audio', markAudioDetected);
    session.on?.('response.audio.delta', markAudioDetected);
    session.on?.('response.audio.start', markAudioDetected);
    session.on?.('response.audio_transcript.delta', onTranscriptDelta);
    session.on?.('response.audio_transcript.done', onTranscriptDone);
    session.on?.('agent_end', onAgentEnd);
    session.on?.('response.completed', onResponseCompleted);
    session.on?.('response.failed', onResponseFailed);
    session.on?.('response.canceled', onResponseFailed);
    session.on?.('transport_event', onTransportEvent);

    timeoutId = window.setTimeout(() => {
      if (audioDetected || textDetected) {
        markSuccess('timeout-after-media');
      } else {
        cleanup(false, 'timeout');
      }
    }, 15000);
  });
};
