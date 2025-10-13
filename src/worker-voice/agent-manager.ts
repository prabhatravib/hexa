/// <reference types="@cloudflare/workers-types" />

import { getHexaInstructions, getDefaultInstructions } from '../lib/agentInstructions';

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

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
    switch (this.currentAgent) {
      case 'hexagon':
        return getHexaInstructions();
            
      default:
        return getDefaultInstructions();
    }
  }

  // External data is now handled at the session level

  getAvailableAgents(): string[] {
    // Hexagon-only mode
    return ['hexagon'];
  }
}
