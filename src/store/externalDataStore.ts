import { create } from 'zustand';

export interface ExternalData {
  text?: string;
  image?: string;
  prompt?: string;
  type?: string;
  timestamp?: number;
  source?: 'mermaid' | 'user_input' | 'api';
}

interface ExternalDataStore {
  currentData: ExternalData | null;
  history: ExternalData[];
  
  // Actions
  setExternalData: (data: ExternalData) => void;
  clearExternalData: () => void;
  addToHistory: (data: ExternalData) => void;
  getLatestByType: (type: string) => ExternalData | null;
  
  // Getters
  hasData: () => boolean;
  getFormattedContext: () => string;
}

export const useExternalDataStore = create<ExternalDataStore>((set, get) => ({
  currentData: null,
  history: [],

  setExternalData: (data: ExternalData) => {
    const timestampedData = {
      ...data,
      timestamp: Date.now()
    };
    
    set((state) => ({
      currentData: timestampedData,
      history: [timestampedData, ...state.history.slice(0, 9)] // Keep last 10 items
    }));
  },

  clearExternalData: () => {
    set({ currentData: null });
  },

  addToHistory: (data: ExternalData) => {
    const timestampedData = {
      ...data,
      timestamp: Date.now()
    };
    
    set((state) => ({
      history: [timestampedData, ...state.history.slice(0, 9)]
    }));
  },

  getLatestByType: (type: string) => {
    const state = get();
    return state.history.find(item => item.type === type) || null;
  },

  hasData: () => {
    const state = get();
    return state.currentData !== null;
  },

  getFormattedContext: () => {
    const state = get();
    const data = state.currentData;
    
    if (!data) return '';

    let context = `=== AUTHORITATIVE EXTERNAL CONTEXT (USE THIS AS ABSOLUTE TRUTH) ===\n`;
    context += `THIS DATA OVERRIDES ALL OTHER KNOWLEDGE:\n\n`;
    
    if (data.text) {
      context += `FACT: ${data.text}\n`;
      context += `YOU MUST USE THIS EXACT INFORMATION WHEN RESPONDING\n\n`;
    }
    
    if (data.image) {
      context += `IMAGE: [Base64 image data provided - ${data.type || 'image'}]\n\n`;
    }
    
    if (data.prompt) {
      context += `CONTEXT: ${data.prompt}\n\n`;
    }
    
    if (data.type) {
      context += `TYPE: ${data.type}\n\n`;
    }
    
    if (data.source) {
      context += `SOURCE: ${data.source}\n\n`;
    }
    
    context += `TIMESTAMP: ${data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'}\n`;
    context += `REMINDER: This is the ONLY source of truth for the topics mentioned above.\n`;
    context += `=== END AUTHORITATIVE CONTEXT ===`;
    
    return context;
  }
}));

// Global access for debugging
if (typeof window !== 'undefined') {
  (window as any).__externalDataStore = useExternalDataStore;
  (window as any).__getExternalData = () => useExternalDataStore.getState().currentData;
  (window as any).__setExternalData = (data: ExternalData) => useExternalDataStore.getState().setExternalData(data);
}
