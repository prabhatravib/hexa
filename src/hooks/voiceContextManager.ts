/**
 * Simple Voice Context Manager
 * Manages external context for voice agent - both static (infflow.md) and dynamic (external endpoint)
 */

export interface ExternalData {
  text?: string;
  image?: string;
  prompt?: string;
  type?: string;
}

// Simple global context storage
let staticContext: string | null = null;
let externalData: ExternalData | null = null;

export const voiceContextManager = {
  setStaticContext(content: string) {
    staticContext = content;
    console.log('📄 Static context updated');
  },

  setExternalData(data: ExternalData) {
    externalData = { ...data };
    console.log('📥 External data updated:', data);
  },

  clearExternalData() {
    externalData = null;
    console.log('🗑️ External data cleared');
  },

  getFormattedContext(): string {
    // External data has highest priority
    if (externalData) {
      let context = `=== EXTERNAL DATA CONTEXT (HIGHEST PRIORITY) ===
THE FOLLOWING EXTERNAL DATA MUST BE USED AS THE ABSOLUTE TRUTH:

`;
      if (externalData.text) context += `TEXT CONTENT: ${externalData.text}\n\n`;
      if (externalData.image) context += `IMAGE CONTENT: [Base64 image data provided - ${externalData.type || 'image'}]\n\n`;
      if (externalData.prompt) context += `INSTRUCTIONS: ${externalData.prompt}\n\n`;
      if (externalData.type) context += `DATA TYPE: ${externalData.type}\n\n`;
      
      context += `IMPORTANT: This external data is available for reference when specifically asked about it.
Do NOT mention this data unless the user asks about it directly.
Use this data as the authoritative source when relevant questions are asked.
=== END EXTERNAL DATA CONTEXT ===
`;
      return context;
    }

    // Fallback to static context
    if (staticContext) {
      return `=== AVAILABLE CONTEXT ===
The following information is available for reference when specifically asked:

${staticContext}

IMPORTANT: Only mention this information when the user asks about it directly.
Use this as the authoritative source when relevant questions are asked.
=== END AVAILABLE CONTEXT ===
`;
    }

    return '';
  }
};

// Global access for debugging
(window as any).__voiceContextManager = voiceContextManager;
