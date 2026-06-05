import { MockOmniagentConnection } from './mock.js';
import { WebSocketAgentConnection } from './websocket.js';
import type { AgentConfig } from '../../../shared/types.js';

const USE_MOCK = process.env.USE_MOCK === 'true';

export type AgentInstance = MockOmniagentConnection | WebSocketAgentConnection;

export class OmniagentManager {
  private agents: Map<string, AgentInstance> = new Map();

  async createAndConnect(config: AgentConfig): Promise<AgentInstance> {
    if (USE_MOCK) {
      const agent = new MockOmniagentConnection(config);
      await agent.connect();
      this.agents.set(config.id, agent);
      return agent;
    }

    // Real mode: direct WebSocket connection to Napster agent
    const apiKey = process.env.OMNIAGENT_API_KEY!;
    const agent = new WebSocketAgentConnection(config.id, config.name, apiKey);
    await agent.connect();
    this.agents.set(config.id, agent);
    return agent;
  }

  get(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  getAll(): AgentInstance[] {
    return [...this.agents.values()];
  }

  sendMessage(agentId: string, role: 'user' | 'system', text: string, triggerResponse = true) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`[OmniagentManager] Agent ${agentId} not found`);
      return;
    }
    agent.sendMessage(role, text, triggerResponse);
  }

  updateSettings(agentId: string, instructions: string) {
    this.agents.get(agentId)?.updateSettings(instructions);
  }

  disconnectAll() {
    for (const agent of this.agents.values()) {
      agent.disconnect();
    }
    this.agents.clear();
  }

  disconnect(agentId: string) {
    this.agents.get(agentId)?.disconnect();
    this.agents.delete(agentId);
  }

  getAgentHealth(): Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> {
    const health: Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> = {};
    for (const [id, agent] of this.agents) {
      health[id] = { alive: agent.isAlive(), lastActivity: agent.lastActivityAt, reconnectAttempts: 0 };
    }
    return health;
  }
}

export const omniagentManager = new OmniagentManager();
