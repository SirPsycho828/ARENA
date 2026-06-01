import { OmniagentConnection } from './connection.js';
import { MockOmniagentConnection } from './mock.js';
import type { AgentConfig } from '../../../shared/types.js';

const USE_MOCK = process.env.USE_MOCK === 'true';

export type AgentInstance = OmniagentConnection | MockOmniagentConnection;

export class OmniagentManager {
  private agents: Map<string, AgentInstance> = new Map();

  async createAndConnect(config: AgentConfig): Promise<AgentInstance> {
    const agent = USE_MOCK
      ? new MockOmniagentConnection(config)
      : new OmniagentConnection(config);

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
      console.warn(`Agent ${agentId} not found`);
      return;
    }
    agent.sendMessage(role, text, triggerResponse);
  }

  broadcastExcept(excludeId: string, role: 'user' | 'system', text: string, triggerResponse = true) {
    for (const [id, agent] of this.agents) {
      if (id !== excludeId) {
        agent.sendMessage(role, text, triggerResponse);
      }
    }
  }

  updateSettings(agentId: string, instructions: string) {
    const agent = this.agents.get(agentId);
    if (agent) agent.updateSettings(instructions);
  }

  disconnectAll() {
    for (const agent of this.agents.values()) {
      agent.disconnect();
    }
    this.agents.clear();
  }

  disconnect(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.disconnect();
      this.agents.delete(agentId);
    }
  }
}

export const omniagentManager = new OmniagentManager();
