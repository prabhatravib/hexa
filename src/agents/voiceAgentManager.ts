import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { VoiceAgentConfig, hexagonVoiceAgent, customerSupportAgent, languageTutorAgent } from './voiceAgentConfig';

export class VoiceAgentManager {
  private agents: Map<string, RealtimeAgent> = new Map();
  private currentAgent: RealtimeAgent | null = null;
  private agentConfigs: Map<string, VoiceAgentConfig> = new Map();

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents() {
    // Initialize agent configurations
    this.agentConfigs.set('hexagon', hexagonVoiceAgent);
    this.agentConfigs.set('customer-support', customerSupportAgent);
    this.agentConfigs.set('language-tutor', languageTutorAgent);

    // Create specialized tools
    const transferAgentTool = tool({
      name: 'transferAgent',
      description: 'Transfer the user to a more specialized agent for better assistance.',
      parameters: z.object({
        rationaleForTransfer: z.string().describe('The reasoning why this transfer is needed.'),
        conversationContext: z.string().describe('Relevant context from the conversation that will help the recipient perform the correct action.'),
        destinationAgent: z.enum(['hexagon', 'customer-support', 'language-tutor']).describe('The specialized agent that should handle the user\'s request.')
      }),
      execute: async ({ rationaleForTransfer, conversationContext, destinationAgent }, details) => {
        console.log(`Transferring to ${destinationAgent}: ${rationaleForTransfer}`);
        return `Transferring you to our ${destinationAgent} agent. ${conversationContext}`;
      }
    });

    const supervisorTool = tool({
      name: 'supervisorApproval',
      description: 'Request supervisor approval for complex decisions or exceptions.',
      parameters: z.object({
        caseDetails: z.string().describe('Details of the case requiring approval.'),
        requestType: z.enum(['refund', 'discount', 'policy-exception', 'other']).describe('Type of approval request.')
      }),
      execute: async ({ caseDetails, requestType }, details) => {
        console.log(`Supervisor approval requested for ${requestType}: ${caseDetails}`);
        return `I\'ve submitted your ${requestType} request for supervisor approval. You should receive a response within 24 hours.`;
      }
    });

    const languageAssessmentTool = tool({
      name: 'assessLanguageLevel',
      description: 'Assess the student\'s current language proficiency level.',
      parameters: z.object({
        language: z.string().describe('The language being assessed.'),
        skillArea: z.enum(['speaking', 'listening', 'reading', 'writing', 'grammar', 'vocabulary']).describe('The specific skill area to assess.')
      }),
      execute: async ({ language, skillArea }, details) => {
        console.log(`Assessing ${skillArea} in ${language}`);
        return `I\'ll assess your ${skillArea} skills in ${language}. Please respond to a few questions so I can determine your current level.`;
      }
    });

    // Create agents with tools
    const hexagonAgent = new RealtimeAgent({
      name: hexagonVoiceAgent.name,
      instructions: this.buildInstructions(hexagonVoiceAgent),
      tools: [transferAgentTool, supervisorTool]
    });

    const customerSupportAgentInstance = new RealtimeAgent({
      name: customerSupportAgent.name,
      instructions: this.buildInstructions(customerSupportAgent),
      tools: [transferAgentTool, supervisorTool]
    });

    const languageTutorAgentInstance = new RealtimeAgent({
      name: languageTutorAgent.name,
      instructions: this.buildInstructions(languageTutorAgent),
      tools: [transferAgentTool, languageAssessmentTool]
    });

    // Store agents
    this.agents.set('hexagon', hexagonAgent);
    this.agents.set('customer-support', customerSupportAgentInstance);
    this.agents.set('language-tutor', languageTutorAgentInstance);

    // Set default agent
    this.currentAgent = hexagonAgent;
  }

  private buildInstructions(config: VoiceAgentConfig): string {
    let instructions = `# ${config.name}\n\n`;
    
    // Personality section
    instructions += `## Personality and Tone\n`;
    instructions += `**Identity**: ${config.personality.identity}\n`;
    instructions += `**Task**: ${config.personality.task}\n`;
    instructions += `**Demeanor**: ${config.personality.demeanor}\n`;
    instructions += `**Tone**: ${config.personality.tone}\n`;
    instructions += `**Level of Enthusiasm**: ${config.personality.levelOfEnthusiasm}\n`;
    instructions += `**Level of Formality**: ${config.personality.levelOfFormality}\n`;
    instructions += `**Level of Emotion**: ${config.personality.levelOfEmotion}\n`;
    instructions += `**Filler Words**: ${config.personality.fillerWords}\n`;
    instructions += `**Pacing**: ${config.personality.pacing}\n`;
    
    if (config.personality.otherDetails) {
      instructions += `**Other Details**:\n`;
      config.personality.otherDetails.forEach(detail => {
        instructions += `- ${detail}\n`;
      });
    }

    // Instructions section
    instructions += `\n## Instructions\n`;
    config.instructions.forEach(instruction => {
      instructions += `- ${instruction}\n`;
    });

    // Conversation states if available
    if (config.conversationStates) {
      instructions += `\n## Conversation States\n`;
      instructions += JSON.stringify(config.conversationStates, null, 2);
    }

    return instructions;
  }

  public getCurrentAgent(): RealtimeAgent | null {
    return this.currentAgent;
  }

  public switchAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.currentAgent = agent;
      console.log(`Switched to agent: ${agentId}`);
      return true;
    }
    console.error(`Agent not found: ${agentId}`);
    return false;
  }

  public getAvailableAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  public getAgentConfig(agentId: string): VoiceAgentConfig | undefined {
    return this.agentConfigs.get(agentId);
  }

  public createCustomAgent(config: VoiceAgentConfig): RealtimeAgent {
    const customAgent = new RealtimeAgent({
      name: config.name,
      instructions: this.buildInstructions(config)
    });
    
    this.agents.set(config.name.toLowerCase().replace(/\s+/g, '-'), customAgent);
    this.agentConfigs.set(config.name.toLowerCase().replace(/\s+/g, '-'), config);
    
    return customAgent;
  }

  public getAgentSummary(): Record<string, string> {
    const summary: Record<string, string> = {};
    this.agents.forEach((agent, id) => {
      summary[id] = agent.name;
    });
    return summary;
  }
}

// Export singleton instance
export const voiceAgentManager = new VoiceAgentManager();
