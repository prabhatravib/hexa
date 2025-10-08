/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

// Language instructions for consistent behavior
const LANGUAGE_INSTRUCTIONS = `LANGUAGE POLICY:
- Your DEFAULT and PRIMARY language is ENGLISH
- Always start conversations in English
- Only switch to another language if the user explicitly requests it
- If asked to speak Spanish, French, German, or any other language, then switch to that language for the conversation
- When switching languages, acknowledge the language change and continue in the requested language
- If no language is specified, always use English

Remember: English first, other languages only when requested.`;

export class AgentManager {
  private openaiConnection: any;
  private broadcastToClients: (message: any) => void;
  private currentAgent: string = 'hexagon';
  // External data is now handled at the session level, not here

  constructor(openaiConnection: any, broadcastToClients: (message: any) => void) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }

  setOpenAIConnection(openaiConnection: any): void {
    this.openaiConnection = openaiConnection;
  }

  async switchAgent(agentId: string): Promise<void> {
    // Hexagon-only mode: coerce any request to 'hexagon'
    const coerced = 'hexagon';
    console.log('🔄 Switching to agent (coerced to hexagon):', agentId, '→', coerced);
    this.currentAgent = coerced;

    // Send agent switch notification to frontend for UI/state consistency
    this.broadcastToClients({
      type: 'agent_switched',
      agentId: coerced,
      instructions: this.getAgentInstructions()
    });

    console.log('✅ Agent switched (hexagon-only mode)');
  }

  getCurrentAgent(): string {
    return this.currentAgent;
  }

  getAgentInstructions(): string {
    let baseInstructions: string;
    
    switch (this.currentAgent) {
      case 'hexagon':
        baseInstructions = `You are Hexa, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help.

IMPORTANT: You have the ability to send emails to creator developer prabhat!

When someone asks you to send an email, contact the creator, or message prabhat:
1. Enthusiastically confirm: "I'd be happy to send a message to my creator developer prabhat! What would you like to tell them?"
2. After they give you their message, ask: "Would you like to include your email address so they can respond directly to you? You can just include your name instead, or say no if you'd like to remain anonymous."
3. Once they respond, say: "Perfect! I'll send that message right away."

The system will automatically detect and handle the email sending process in the background based on the conversation.

You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone. ${LANGUAGE_INSTRUCTIONS}`;
        break;
            
      default:
        baseInstructions = `You are a helpful AI assistant. You can assist with various tasks, answer questions, and engage in natural conversation. ${LANGUAGE_INSTRUCTIONS}`;
    }

    return baseInstructions;
  }

  // External data is now handled at the session level

  getAvailableAgents(): string[] {
    // Hexagon-only mode
    return ['hexagon'];
  }
}
