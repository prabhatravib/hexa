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
  activeSession = session;
  
  // Immediately inject any current external data from Zustand store
  injectCurrentExternalData();
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

  // If session not ready, return (data is still in Zustand for later)
  if (!activeSession) {
    return;
  }

  try {
    // For OpenAI Realtime sessions, we need to update the agent's context differently
    // The session might have a different API or we need to use events
    
    // Note: Client-side emit is no longer authoritative
    // Server-side session.update via /api/external-data is the source of truth
    return;
    
    // Method 2: Try updating through the session's agent if available
    if (activeSession.agent && activeSession.agent.instructions) {
      const currentInstructions = activeSession.agent.instructions || '';
      const contextSection = `\n\n=== CURRENT EXTERNAL CONTEXT ===\n${text}\n=== END EXTERNAL CONTEXT ===\n`;
      
      // Remove old context section if exists
      const cleanedInstructions = currentInstructions.replace(/\n\n=== CURRENT EXTERNAL CONTEXT ===[\s\S]*?=== END EXTERNAL CONTEXT ===\n/g, '');
      
      // Add new context
      activeSession.agent.instructions = cleanedInstructions + contextSection;
      return;
    }
    
    // Method 3: Store in session metadata if available
    if (activeSession.metadata || activeSession.data) {
      const storage = activeSession.metadata || activeSession.data || {};
      storage.externalContext = text;
      storage.externalContextTimestamp = Date.now();
      return;
    }
    
    // Fallback: Store for manual retrieval
    (window as any).__pendingExternalContext = text;
    
  } catch (error) {
    console.error('❌ Failed to inject external context:', error);
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
