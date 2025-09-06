// Lightweight utilities to interact with RealtimeSession variants safely

export type SessionLike = any;

// Returns a callable send-like function across SDK variants or null
export function getSessionSend(session: SessionLike): ((evt: any) => any) | null {
  if (!session) return null;
  const send = session.send || session.emit || session.transport?.sendEvent;
  return typeof send === 'function' ? send.bind(session) : null;
}

// Best-effort send that won’t throw; resolves true if a method existed
export async function safeSessionSend(session: SessionLike, evt: any): Promise<boolean> {
  try {
    const send = getSessionSend(session);
    if (!send) return false;
    await Promise.resolve(send(evt));
    return true;
  } catch {
    return false;
  }
}

// Checks if the session is likely ready to accept events
export function isRealtimeReady(session: SessionLike): boolean {
  if (!session) return false;
  const hasSend = !!getSessionSend(session);
  const pcState = session._pc?.connectionState;
  const rtcOk = !session._pc || pcState === 'connected' || pcState === 'completed';
  return hasSend && rtcOk;
}

