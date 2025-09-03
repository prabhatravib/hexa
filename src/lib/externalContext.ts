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
let baseInstructions = '';
let lastInjectedHash = '';

export function setActiveSession(session: any) {
  activeSession = session;
  (window as any).activeSession = session; // ← important
  lastInjectedHash = '';
  const pending = (window as any).__pendingExternalContext;
  if (pending) {
    (window as any).__pendingExternalContext = null;
    injectExternalContext(pending); // fire-and-forget
  }
}

function isRealtimeReady() {
  const s = (window as any).activeSession || activeSession;
  const ready = !!s && s.state === 'open' && s.transport?.sendEvent;
  console.log('🔍 Realtime ready check:', { 
    hasSession: !!s, 
    state: s?.state, 
    hasTransport: !!s?.transport?.sendEvent,
    result: ready 
  });
  return ready;
}

export function setBaseInstructions(instr: string) {
  baseInstructions = instr || '';
}

// Store global external data that persists across sessions
let globalExternalData: string | null = null;

export function setGlobalExternalData(data: string) {
  globalExternalData = data;
  console.log('🌍 Global external data set:', data);
  
  // If there's an active session, inject immediately
  if (activeSession) {
    console.log('🔄 Active session found, injecting immediately');
    injectExternalContext({ text: data }); // fire-and-forget
  } else {
    console.log('ℹ️ No active session, will inject when session becomes available');
  }
}

export function getGlobalExternalData(): string | null {
  return globalExternalData;
}

// Automatically inject global external data when session becomes active
export async function injectGlobalExternalData() {
  if (globalExternalData && activeSession) {
    console.log('🔄 Injecting global external data into new session:', globalExternalData);
    await injectExternalContext({ text: globalExternalData });
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
  
  injectExternalContext({ text: currentData.text }); // fire-and-forget
}

export async function injectExternalContext(data: { text: string } | string): Promise<boolean> {
  // Handle both object and string formats for backward compatibility
  const text = typeof data === 'string' ? data : data?.text;
  if (!text) {
    console.log('❌ No text to inject');
    return false;
  }
  
  const stripped = stripCodeFences(text);
  if (!stripped) {
    console.log('❌ Text became empty after stripping');
    return false;
  }

  if (!isRealtimeReady()) {
    console.log('⏳ Session not ready, queuing external context for later injection');
    (window as any).__pendingExternalContext = stripped;
    return false;
  }

  const s = (window as any).activeSession || activeSession;
  
  if (!s) {
    console.log('❌ No active session found');
    (window as any).__pendingExternalContext = stripped;
    return false;
  }

  // de-dupe (optional)
  const hash = await cryptoDigest(stripped);
  if (hash === lastInjectedHash) {
    console.log('⏭️ Skipping duplicate injection (same content already injected)');
    return true;
  }
  lastInjectedHash = hash;

  // Silent system context. No response.create here.
  try {
    console.log('📤 Injecting external context via transport.sendEvent...');
    s.transport.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: stripped }]
      }
    });
    console.log('✅ External context successfully injected into voice session!');
    console.log('📝 Injected text:', stripped.substring(0, 200) + '...');
    return true;
  } catch (e) {
    console.error('❌ Failed to inject external context:', e);
    // Fallback to queue
    (window as any).__pendingExternalContext = stripped;
    return false;
  }
}

// Simple browser crypto hash
async function cryptoDigest(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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
  injectExternalContext({ text: formattedContext }); // fire-and-forget
}

// Global access for debugging
(window as any).__injectExternalContext = injectExternalContext;
(window as any).__setActiveSession = setActiveSession;
(window as any).__injectFromStore = injectExternalDataFromStore;
(window as any).__injectCurrentData = injectCurrentExternalData;
