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
  const pending = (window as any).__pendingExternalContext;
  if (pending) {
    (window as any).__pendingExternalContext = null;
    injectExternalContext(pending); // fire-and-forget
  }
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
    injectExternalContext(data); // fire-and-forget
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
    await injectExternalContext(globalExternalData);
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
  
  injectExternalContext(currentData.text); // fire-and-forget
}

export async function injectExternalContext(text: string): Promise<boolean> {
  const stripped = stripCodeFences(text);
  if (!stripped) return false;

  const s: any = activeSession;
  const sendFn = s?.send || s?.emit || s?.transport?.sendEvent;
  const rtcOk = !s?._pc || ['connected','completed'].includes(s._pc?.connectionState);

  // Queue if not ready
  if (!sendFn || !rtcOk) {
    (window as any).__pendingExternalContext = stripped;
    return false;
  }

  // Dedupe
  const hash = await cryptoDigest(stripped);
  if (hash === lastInjectedHash) return true;
  lastInjectedHash = hash;

  // Size cap (adjust if your model allows more)
  const MAX = 8000;
  const body = stripped.length > MAX ? stripped.slice(0, MAX) : stripped;

  const updated =
    (baseInstructions ? baseInstructions + '\n\n' : '') +
    'CRITICAL CONTEXT UPDATE:\n' +
    'Use when relevant. Do not announce it.\n\n' +
    body;

  try {
    // Fire-and-forget: do not wait for session.updated
    sendFn.call(s, { type: 'session.update', session: { instructions: updated } });
    return true;
  } catch (e) {
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
  injectExternalContext(formattedContext); // fire-and-forget
}

// Global access for debugging
(window as any).__injectExternalContext = injectExternalContext;
(window as any).__setActiveSession = setActiveSession;
(window as any).__injectFromStore = injectExternalDataFromStore;
(window as any).__injectCurrentData = injectCurrentExternalData;
