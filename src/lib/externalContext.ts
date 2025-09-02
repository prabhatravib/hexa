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

export function injectExternalContext(raw: string) {
  const text = stripCodeFences(raw);
  if (!text) {
    return;
  }

  // Store locally for reference
  (window as any).__pendingExternalContext = text;
  
  console.log('📝 External context stored locally. It will be sent with the next server request.');
  
  // The actual injection happens server-side via /api/external-data
  // No need to try client-side session manipulation
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
