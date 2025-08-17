/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

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
        return `You are Hexagon, a friendly and helpful AI assistant. You have a warm, conversational personality and are always eager to help. You can assist with various tasks, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone.`;
      
      case 'customer-support':
        return `You are a professional customer support representative. You are patient, empathetic, and solution-oriented. Always acknowledge the customer's concern first, then provide clear, helpful solutions. If you don't have enough information, ask clarifying questions. Be polite and professional at all times.`;
      
      case 'language-tutor':
        return `You are a language tutor helping students learn and practice. You are encouraging, patient, and knowledgeable about language learning techniques. Provide explanations, examples, and gentle corrections. Encourage practice and celebrate progress. Adapt your teaching style to the student's level.`;
      
      default:
        return `You are a helpful AI assistant. You can assist with various tasks, answer questions, and engage in natural conversation.`;
    }
  }

  getAvailableAgents(): string[] {
    return ['hexagon', 'customer-support', 'language-tutor'];
  }
}
