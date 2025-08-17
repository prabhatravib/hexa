/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
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

  constructor(openaiConnection: any, broadcastToClients: (message: any) => void) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }

  setOpenAIConnection(openaiConnection: any): void {
    this.openaiConnection = openaiConnection;
  }

  async switchAgent(agentId: string): Promise<void> {
    console.log('🔄 Switching to agent:', agentId);
    this.currentAgent = agentId;
    
    // Send agent switch notification to frontend
    this.broadcastToClients({
      type: 'agent_switched',
      agentId: agentId,
      instructions: this.getAgentInstructions()
    });
    
    console.log('✅ Agent switched successfully');
  }

  getCurrentAgent(): string {
    return this.currentAgent;
  }

  getAgentInstructions(): string {
    switch (this.currentAgent) {
      case 'hexagon':
        return `You are Hexa, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help. You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone. ${LANGUAGE_INSTRUCTIONS}`;
            
      default:
        return `You are a helpful AI assistant. You can assist with various tasks, answer questions, and engage in natural conversation. ${LANGUAGE_INSTRUCTIONS}`;
    }
  }

  getAvailableAgents(): string[] {
    return ['hexagon', 'customer-support', 'language-tutor'];
  }
}
