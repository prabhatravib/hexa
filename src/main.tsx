import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { Toaster } from 'sonner';
import { useAnimationStore } from './store/animationStore';
import { safeSessionSend } from './lib/voiceSessionUtils';
import { silenceAudioEverywhere } from './lib/voiceDisableGuard';

// Force light mode by removing dark class and preventing it from being added
document.documentElement.classList.remove('dark');

// Override the system preference detection
const forceLightMode = () => {
  // Always set dark mode to false regardless of localStorage or system preference
  document.documentElement.classList.toggle('dark', false // Force to false instead of checking localStorage or system preference
  );
};

// Run immediately
forceLightMode();

// Also run when the DOM is loaded to ensure it applies
document.addEventListener('DOMContentLoaded', forceLightMode);

// Override system preference changes
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', forceLightMode);

const SESSION_CONTROL_MESSAGE_TYPES = new Set([
  'session.update',
  'response.cancel',
  'input_audio_buffer.clear',
  'output_audio_buffer.clear',
]);

const shouldProcessHostMessages = (() => {
  try {
    if (window.self !== window.top) {
      return true;
    }
  } catch {
    return true;
  }

  const params = new URLSearchParams(window.location.search);
  return ['sessionId', 'iframe', 'embed', 'widget'].some((key) => params.has(key));
})();

const handleHostControlMessage = (event: MessageEvent) => {
  if (!shouldProcessHostMessages) {
    return;
  }

  const payload = event.data;
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const { type } = payload as { type?: string };
  if (!type) {
    return;
  }

  if (type === 'muteAllAudio') {
    console.log('[Hexa] Received muteAllAudio control message:', payload);
    const muted = Boolean((payload as any).muted);
    try {
      const store = useAnimationStore.getState();
      store?.setVoiceDisabled?.(muted);
    } catch (error) {
      console.warn('[Hexa] Failed to update voice disabled state from host message:', error);
    }

    if (muted) {
      silenceAudioEverywhere();
      const session = (window as any).activeSession;
      if (session) {
        void safeSessionSend(session, { type: 'response.cancel' }).catch((error: unknown) => {
          console.warn('[Hexa] Failed to cancel response after mute:', error);
        });
        void safeSessionSend(session, { type: 'input_audio_buffer.clear' }).catch((error: unknown) => {
          console.warn('[Hexa] Failed to clear input buffer after mute:', error);
        });
        void safeSessionSend(session, { type: 'output_audio_buffer.clear' }).catch((error: unknown) => {
          console.warn('[Hexa] Failed to clear output buffer after mute:', error);
        });
      }
    }
    return;
  }

  if (SESSION_CONTROL_MESSAGE_TYPES.has(type)) {
    console.log('[Hexa] Forwarding session control message from host:', payload);
    const session = (window as any).activeSession;
    if (!session) {
      console.warn('[Hexa] Received session control message but no active session was found:', payload);
      return;
    }

    void safeSessionSend(session, payload).catch((error: unknown) => {
      console.warn('[Hexa] Failed to forward session control message:', error);
    });
  }
};

const previousHandler = (window as any).__hexaHostControlHandler;
if (previousHandler) {
  window.removeEventListener('message', previousHandler);
}
window.addEventListener('message', handleHostControlMessage);
(window as any).__hexaHostControlHandler = handleHostControlMessage;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="top-center" richColors closeButton />
  </StrictMode>
);
