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
  if (!activeSession || activeSession.state !== "open") {
    console.log('⏳ Session not ready, external data remains in Zustand store for later injection');
    return;
  }

  try {
    console.log('💉 Injecting external context into active session:', text.substring(0, 50) + '...');
    
    // Push as system item
    activeSession.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: `Context:\n${text}` }]
      }
    });

    // Optionally nudge a response
    activeSession.send({ type: "response.create" });
    
    console.log('✅ External context injected successfully');
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
  
  if (!activeSession || activeSession.state !== "open") {
    console.log('⏳ Session not ready for injection');
    return;
  }
  
  try {
    activeSession.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: formattedContext }]
      }
    });

    activeSession.send({ type: "response.create" });
    console.log('✅ External data from store injected successfully');
  } catch (error) {
    console.error('❌ Failed to inject external data from store:', error);
  }
}

// Global access for debugging
(window as any).__injectExternalContext = injectExternalContext;
(window as any).__setActiveSession = setActiveSession;
(window as any).__injectFromStore = injectExternalDataFromStore;
(window as any).__injectCurrentData = injectCurrentExternalData;
