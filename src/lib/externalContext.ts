/**
 * External Context Utilities
 * Handles injection of external context into active Realtime sessions using Zustand store
 */

import { useExternalDataStore } from '../store/externalDataStore';

export function stripCodeFences(raw: string): string {
  // Remove ```xxx fences and trim
  let text = raw
    .replace(/^```[\w]*\s*/, '')    // Remove opening fence (```mermaid or ```)
    .replace(/```\s*$/, '')         // Remove closing fence
    .trim();
  
  // If we still have content, return it
  if (text) {
    return text;
  }
  
  // Fallback: if stripping removed everything, return original
  console.log('⚠️ Code fence stripping removed all content, using original text');
  return raw.trim();
}

// Global reference to the active session
let activeSession: any = null;

// Base instructions holder and setter
let baseInstructions: string | null = null;
export function setBaseInstructions(instructions: string) {
  baseInstructions = instructions || '';
}

export function setActiveSession(session: any) {
  console.log('🔗 Setting active session:', session);
  activeSession = session;
  
  // Wait for session to be fully ready, then inject external data
  setTimeout(() => {
    console.log('⏰ Timeout reached, injecting external data...');
    // Inject global external data first (persistent across sessions)
    injectGlobalExternalData();
  }, 2000); // Wait for session to be ready
}

// Store global external data that persists across sessions
let globalExternalData: string | null = null;

export function setGlobalExternalData(data: string) {
  globalExternalData = data;
  console.log('🌍 Global external data set:', data);
  
  // If there's an active session, inject immediately
  if (activeSession) {
    console.log('🔄 Active session found, injecting immediately');
    injectExternalContext(data);
  } else {
    console.log('ℹ️ No active session, will inject when session becomes available');
  }
}

export function getGlobalExternalData(): string | null {
  return globalExternalData;
}

// Automatically inject global external data when session becomes active
export function injectGlobalExternalData() {
  if (globalExternalData && activeSession) {
    console.log('🔄 Injecting global external data into new session:', globalExternalData);
    injectExternalContext(globalExternalData);
  } else {
    console.log('ℹ️ No global external data or no active session:', { 
      hasGlobalData: !!globalExternalData, 
      hasActiveSession: !!activeSession 
    });
  }
}

export function clearActiveSession() {
  activeSession = null;
}

export function injectCurrentExternalData() {
  const store = useExternalDataStore.getState();
  const currentData = store.currentData;
  
  if (!currentData || !currentData.text) {
    return;
  }
  
  injectExternalContext(currentData.text);
}

export async function injectExternalContext(raw: string) {
  const text = stripCodeFences(raw);
  if (!text) return;

  if (!activeSession) {
    (window as any).__pendingExternalContext = text;
    return;
  }

  const prefix = baseInstructions ? `${baseInstructions}\n\n` : '';
  const updated = `${prefix}CRITICAL CONTEXT UPDATE:
The following information is now part of your knowledge. Use it when relevant but DO NOT announce it:

${text}

This is authoritative and overrides previous knowledge on these topics.`;

  try {
    // Verify session state is open
    if ((activeSession as any).state !== 'open') {
      throw new Error('Session not in open state');
    }

    // Feature-detect the send method: send → emit → transport.sendEvent
    const sendMethod = (activeSession as any).send || (activeSession as any).emit || (activeSession as any).transport?.sendEvent;
    if (!sendMethod) {
      throw new Error('No send method available on session');
    }

    // Attach ACK listener before sending
    const ackPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('update timeout'));
      }, 3000);

      const onEvent = (e: any) => {
        if (e?.type === 'session.updated') {
          cleanup();
          resolve(true);
        } else if (e?.type === 'error') {
          cleanup();
          reject(new Error(e?.error?.message || 'update failed'));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        // Remove all listeners on success, error, and timeout
        (activeSession as any).off?.('event', onEvent);
        (activeSession as any).off?.('session.updated', onEvent);
        (activeSession as any).off?.('error', onEvent);
      };

      // Listen on the generic "event" stream if SDK uses single event bus
      (activeSession as any).on?.('event', onEvent);
      (activeSession as any).on?.('session.updated', onEvent);
      (activeSession as any).on?.('error', onEvent);
    });

    // Send session.update over the existing WebRTC transport
    await sendMethod.call(activeSession, {
      type: 'session.update',
      session: { instructions: updated }
    });

    // Wait for ack
    await ackPromise;
    console.log('✅ External context injected into session');
  } catch (err) {
    console.error('❌ Failed to inject external context:', err);
    (window as any).__pendingExternalContext = text;
  }
}

// Function to inject external data from Zustand store on demand
export function injectExternalDataFromStore() {
  const store = useExternalDataStore.getState();
  const formattedContext = store.getFormattedContext();
  
  if (!formattedContext) {
    return;
  }
  
  if (!activeSession) {
    return;
  }
  
  // Use the same injection method as injectExternalContext
  injectExternalContext(formattedContext);
}

// Global access for debugging
(window as any).__injectExternalContext = injectExternalContext;
(window as any).__setActiveSession = setActiveSession;
(window as any).__injectFromStore = injectExternalDataFromStore;
(window as any).__injectCurrentData = injectCurrentExternalData;
