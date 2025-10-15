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
  previousAssistantSnapshot: Map<string, string | null>,
  currentResponseIdRef: MutableRefObject<string | null>
): Promise<boolean> => {
  if (!session?.on) return false;

  console.log('🎵 waitForAssistantResponse: Starting to wait for assistant response');

  return await new Promise<boolean>(resolve => {
    let settled = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;
    const audioListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
    let audioDetected = false;
    let textDetected = false;

    const normalize = (value: unknown) =>
      typeof value === 'string' ? value.trim() : undefined;

    const getAssistantId = (item: any): string | null => {
      const raw =
        item?.itemId ??
        item?.id ??
        item?.item_id ??
        item?.response_id ??
        null;
      return raw ? String(raw) : null;
    };

    const markAssistant = (item: any) => {
      if (!item || item.role !== 'assistant') return false;
      const id = getAssistantId(item);
      const text = normalize(extractTranscript(item?.content));

      if (id) {
        const previous = previousAssistantSnapshot.get(id);
        if (previous === undefined) {
          previousAssistantSnapshot.set(id, text ?? null);
          if (text) {
            textDetected = true;
            cleanup(true);
            return true;
          }
          return false;
        }

        if (previous === null && text) {
          previousAssistantSnapshot.set(id, text);
          textDetected = true;
          cleanup(true);
          return true;
        }

        if (previous !== null && text && previous !== text) {
          previousAssistantSnapshot.set(id, text);
          textDetected = true;
          cleanup(true);
          return true;
        }

        return false;
      }

      if (text) {
        textDetected = true;
        cleanup(true);
        return true;
      }

      return false;
    };

    const resolveResponseId = (payload: any): string | null => {
      if (!payload || typeof payload !== 'object') return null;
      const candidate =
        payload?.id ??
        payload?.response_id ??
        payload?.responseId ??
        (typeof payload?.response === 'object'
          ? (payload.response as any)?.id ?? (payload.response as any)?.response_id
          : undefined);
      return candidate ? String(candidate) : null;
    };

    const hasAudioPayload = (payload: any): boolean => {
      if (!payload) return false;
      if (typeof payload !== 'object') return false;

      const type = payload?.type ?? payload?.content_type ?? payload?.modality;
      if (typeof type === 'string' && type.toLowerCase() === 'audio') {
        console.log('🎵 hasAudioPayload: Found audio type:', type);
        return true;
      }

      if (payload?.audio || payload?.audio_data || payload?.audio_url) {
        console.log('🎵 hasAudioPayload: Found audio field');
        return true;
      }

      if (Array.isArray(payload?.content)) {
        const hasAudioContent = payload.content.some((part: any) => hasAudioPayload(part));
        if (hasAudioContent) {
          console.log('🎵 hasAudioPayload: Found audio in content array');
        }
        return hasAudioContent;
      }

      if (Array.isArray(payload)) {
        const hasAudioInArray = payload.some(part => hasAudioPayload(part));
        if (hasAudioInArray) {
          console.log('🎵 hasAudioPayload: Found audio in array');
        }
        return hasAudioInArray;
      }

      return false;
    };

    const checkHistory = () => {
      try {
        const history = Array.isArray(session?.history) ? session.history : [];
        for (const item of history) {
          if (markAssistant(item)) {
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to inspect history for assistant response:', error);
      }
    };

    const cleanup = (result: boolean) => {
      if (settled) return;
      console.log(`🎵 waitForAssistantResponse: Cleanup called with result: ${result}`);
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
      session.off?.('history_added', onHistoryAdded);
      session.off?.('history_updated', onHistoryUpdated);
      session.off?.('response.output_item.added', onOutputItemAdded);
      session.off?.('response.completed', onResponseCompleted);
      audioListeners.forEach(({ event, handler }) => {
        session.off?.(event, handler);
      });
      resolve(result);
    };

    const onHistoryAdded = (item: any) => {
      try {
        markAssistant(item);
      } catch (error) {
        console.warn('Failed to inspect history_added item for assistant response:', error);
      }
    };

    const onHistoryUpdated = (history: any) => {
      try {
        if (!history) return;
        if (Array.isArray(history)) {
          for (const item of history) {
            if (markAssistant(item)) return;
          }
        } else {
          markAssistant(history);
        }
      } catch (error) {
        console.warn('Failed to inspect history_updated payload for assistant response:', error);
      }
    };

    const onOutputItemAdded = (item: any) => {
      try {
        const candidate = item?.item ?? item;
        console.log('🎵 waitForAssistantResponse: onOutputItemAdded called with:', candidate);

        if (markAssistant(candidate)) return;

        const hasAudio = hasAudioPayload(candidate);
        console.log('🎵 waitForAssistantResponse: hasAudioPayload result:', hasAudio);

        if (hasAudio) {
          console.log('🎵 waitForAssistantResponse: Audio detected, cleaning up');
          audioDetected = true;
          cleanup(true);
        }
      } catch (error) {
        console.warn('Failed to inspect response output item:', error);
      }
    };

    const onResponseCompleted = (payload: any) => {
      try {
        const completedId = resolveResponseId(payload);
        if (
          completedId &&
          currentResponseIdRef.current &&
          completedId === currentResponseIdRef.current
        ) {
          console.log(
            '🎵 waitForAssistantResponse: response.completed matched active response - marking success'
          );
          currentResponseIdRef.current = null;
          (window as any).__currentResponseId = null;
          cleanup(true);
          return;
        }
      } catch (error) {
        console.warn('Failed to evaluate response.completed payload:', error);
      }

      checkHistory();
    };

    timeoutId = window.setTimeout(() => {
      checkHistory();
      cleanup(false);
    }, 4000);

    session.on?.('history_added', onHistoryAdded);
    session.on?.('history_updated', onHistoryUpdated);
    session.on?.('response.output_item.added', onOutputItemAdded);
    session.on?.('response.completed', onResponseCompleted);

    const attachAudioListener = (event: string) => {
      const handler = (...args: any[]) => {
        console.log(`🎵 waitForAssistantResponse: Audio event ${event} triggered with:`, args);

        if (event === 'agent_start') {
          console.log('🎵 waitForAssistantResponse: agent_start detected - waiting for actual content');
          return;
        }

        if (event === 'agent_end') {
          console.log('🎵 waitForAssistantResponse: agent_end detected - checking for content');
          const hasResponse = args && args.length > 2 && args[2] && args[2].trim() !== '';
          if (hasResponse) {
            console.log('🎵 waitForAssistantResponse: Valid response found in agent_end');
            currentResponseIdRef.current = null;
            (window as any).__currentResponseId = null;
            cleanup(true);
          } else {
            console.log('🎵 waitForAssistantResponse: Empty response in agent_end - continuing to wait');
            if (audioDetected || textDetected) {
              console.log(
                '🎵 waitForAssistantResponse: Treating agent_end with empty payload as success due to prior audio/text'
              );
              currentResponseIdRef.current = null;
              (window as any).__currentResponseId = null;
              cleanup(true);
              return;
            }
            return;
          }
        }

        if (event.startsWith('response.output_text')) {
          const payload = args?.[0];
          const deltaText =
            typeof payload === 'string'
              ? payload.trim()
              : typeof payload?.delta === 'string'
                ? payload.delta.trim()
                : typeof payload?.text === 'string'
                  ? payload.text.trim()
                  : '';
          if (deltaText) {
            textDetected = true;
          }
          cleanup(true);
          return;
        }

        audioDetected = true;
        cleanup(true);
      };
      audioListeners.push({ event, handler });
      session.on?.(event as any, handler as any);
    };

    session.on?.('response.created', (response: any) => {
      console.log('🎵 waitForAssistantResponse: Response created with ID:', response?.id);
      if (response?.id) {
        currentResponseIdRef.current = response.id;
        (window as any).__currentResponseId = response.id;
      }
    });

    const audioEvents = [
      'response.audio.delta',
      'response.audio',
      'response.audio.start',
      'response.audio_transcript.done',
      'response.output_text.delta',
      'response.output_text.done',
      'audio',
      'remote_track',
      'agent_start',
      'agent_end',
    ];

    audioEvents.forEach(eventName => {
      attachAudioListener(eventName);
    });

    checkHistory();
    if (!settled) {
      intervalId = window.setInterval(checkHistory, 200);
    }

    timeoutId = window.setTimeout(() => {
      checkHistory();
      cleanup(false);
    }, 4000);
  });
};
