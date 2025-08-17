export class AgentManager {
  private currentAgentId: string = 'hexagon';
  private openaiConnection: any;
  private broadcastToClients: (message: any) => void;

  constructor(openaiConnection: any, broadcastToClients: (message: any) => void) {
    this.openaiConnection = openaiConnection;
    this.broadcastToClients = broadcastToClients;
  }

  getAgentInstructions(): string {
    switch (this.currentAgentId) {
      case 'customer-support':
        return `You are a professional customer support representative. Be patient, empathetic, and solution-oriented. Always confirm customer details before proceeding.`;
      case 'language-tutor':
        return `You are an enthusiastic language tutor. Be encouraging, patient, and educational. Use repetition and provide positive feedback.`;
      case 'hexagon':
      default:
        return `You are Hexagon, a friendly and helpful AI assistant with a cheerful personality. You represent a hexagonal character that loves to help users with various tasks. Keep responses concise and conversational. Use your hexagonal character to make interactions more engaging.`;
    }
  }

  async switchAgent(agentId: string): Promise<void> {
    this.currentAgentId = agentId;
    
    // Update the session with new agent instructions
    if (this.openaiConnection.isConnected()) {
      this.openaiConnection.send({
        type: 'session.update',
        session: {
          instructions: this.getAgentInstructions()
        }
      });
    }
    
    // Notify clients of agent switch
    this.broadcastToClients({
      type: 'agent_switched',
      agentId: agentId,
      agentName: this.getAgentName(agentId)
    });
  }

  private getAgentName(agentId: string): string {
    switch (agentId) {
      case 'customer-support':
        return 'Customer Support Agent';
      case 'language-tutor':
        return 'Language Tutor';
      case 'hexagon':
      default:
        return 'Hexagon Assistant';
    }
  }

  getCurrentAgentId(): string {
    return this.currentAgentId;
  }
}
