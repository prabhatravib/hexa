// Lightweight utilities to interact with RealtimeSession variants safely

export type SessionLike = any;

// Returns a callable send-like function across SDK variants or null
export function getSessionSend(session: SessionLike): ((evt: any) => any) | null {
  if (!session) return null;

  const transport = (session as any).transport;
  if (transport && typeof transport.sendEvent === 'function') {
    return transport.sendEvent.bind(transport);
  }

  if (typeof (session as any).sendEvent === 'function') {
    return (session as any).sendEvent.bind(session);
  }

  if (typeof session.send === 'function') {
    return session.send.bind(session);
  }

  return null;
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

// Sends a session.update with new instructions and waits (best-effort) for ack
export async function updateSessionInstructions(
  session: SessionLike,
  instructions: string
): Promise<boolean> {
  if (!session || !isRealtimeReady(session)) return false;
  const send = getSessionSend(session);
  if (!send) return false;

  try {
    // Attach a short-lived listener for confirmation if available
    const s: any = session as any;
    const ackPromise: Promise<boolean> = new Promise((resolve) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        resolve(false);
      }, 3000);

      const onEvent = (ev: any) => {
        if (ev?.type === 'session.updated') {
          if (done) return;
          done = true;
          cleanup();
          resolve(true);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        s.off?.('event', onEvent);
        s.off?.('session.updated', onEvent);
      };

      s.on?.('event', onEvent);
      s.on?.('session.updated', onEvent);
    });

    await Promise.resolve(
      send({ type: 'session.update', session: { instructions } })
    );
    return await ackPromise;
  } catch {
    return false;
  }
}

