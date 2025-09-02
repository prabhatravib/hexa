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
  console.log('🔗 Active session set for external context injection');
  
  // Immediately inject any current external data from Zustand store
  injectCurrentExternalData();
}

export function clearActiveSession() {
  activeSession = null;
  console.log('🔗 Active session cleared');
}

export function injectCurrentExternalData() {
  const store = useExternalDataStore.getState();
  const currentData = store.currentData;
  
  if (!currentData || !currentData.text) {
    console.log('ℹ️ No current external data to inject');
    return;
  }
  
  console.log('📊 Injecting current external data from Zustand store');
  injectExternalContext(currentData.text);
}

export function injectExternalContext(raw: string) {
  const text = stripCodeFences(raw);
  if (!text) {
    console.log('⚠️ No text content after stripping code fences');
    return;
  }

  // If session not ready, log and return (data is still in Zustand for later)
  if (!activeSession) {
    console.log('⏳ No active session, external data remains in Zustand store for later injection');
    return;
  }

  try {
    console.log('💉 Injecting external context into active session:', text.substring(0, 50) + '...');
    
    // For OpenAI Realtime sessions, we need to update the agent's context differently
    // The session might have a different API or we need to use events
    
    // Method 1: Try using emit if available (for event-based communication)
    if (activeSession.emit && typeof activeSession.emit === 'function') {
      console.log('📤 Using emit method to inject context');
      activeSession.emit('conversation.item.create', {
        type: "message",
        role: "system",
        content: [{ 
          type: "input_text", 
          text: `IMPORTANT CONTEXT UPDATE: ${text}\n\nPlease acknowledge and use this information in our conversation.`
        }]
      });
      console.log('✅ Context injected via emit');
      return;
    }
    
    // Method 2: Try updating through the session's agent if available
    if (activeSession.agent && activeSession.agent.instructions) {
      console.log('📤 Updating agent instructions with context');
      const currentInstructions = activeSession.agent.instructions || '';
      const contextSection = `\n\n=== CURRENT EXTERNAL CONTEXT ===\n${text}\n=== END EXTERNAL CONTEXT ===\n`;
      
      // Remove old context section if exists
      const cleanedInstructions = currentInstructions.replace(/\n\n=== CURRENT EXTERNAL CONTEXT ===[\s\S]*?=== END EXTERNAL CONTEXT ===\n/g, '');
      
      // Add new context
      activeSession.agent.instructions = cleanedInstructions + contextSection;
      console.log('✅ Context injected via agent instructions');
      return;
    }
    
    // Method 3: Store in session metadata if available
    if (activeSession.metadata || activeSession.data) {
      console.log('📤 Storing context in session metadata');
      const storage = activeSession.metadata || activeSession.data || {};
      storage.externalContext = text;
      storage.externalContextTimestamp = Date.now();
      console.log('✅ Context stored in session metadata');
      return;
    }
    
    console.warn('⚠️ Session object does not have expected methods for context injection');
    console.log('Session object properties:', Object.keys(activeSession));
    
    // Fallback: Store for manual retrieval
    (window as any).__pendingExternalContext = text;
    console.log('💾 Context stored in __pendingExternalContext for manual injection');
    
  } catch (error) {
    console.error('❌ Failed to inject external context:', error);
  }
}

// Function to inject external data from Zustand store on demand
export function injectExternalDataFromStore() {
  const store = useExternalDataStore.getState();
  const formattedContext = store.getFormattedContext();
  
  if (!formattedContext) {
    console.log('ℹ️ No external data in store to inject');
    return;
  }
  
  console.log('📊 Injecting formatted context from Zustand store');
  
  if (!activeSession) {
    console.log('⏳ No active session for injection');
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
