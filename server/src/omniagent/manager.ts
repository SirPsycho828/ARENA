import { MockOmniagentConnection } from './mock.js';
import type { AgentConfig } from '../../../shared/types.js';
import type { AvatarHost } from '../avatar-host/puppeteer.js';

const USE_MOCK = process.env.USE_MOCK === 'true';

export type AgentInstance = MockOmniagentConnection;

export class OmniagentManager {
  private mockAgents: Map<string, MockOmniagentConnection> = new Map();
  private avatarHost: AvatarHost | null = null;
  private agentIds: Set<string> = new Set();

  setAvatarHost(host: AvatarHost) {
    this.avatarHost = host;
  }

  getAvatarHost(): AvatarHost | null {
    return this.avatarHost;
  }

  async createAndConnect(config: AgentConfig): Promise<MockOmniagentConnection | null> {
    if (USE_MOCK) {
      const agent = new MockOmniagentConnection(config);
      await agent.connect();
      this.mockAgents.set(config.id, agent);
      return agent;
    }
    // In Puppeteer mode, agents are managed by AvatarHost — no individual connection
    this.agentIds.add(config.id);
    return null;
  }

  get(agentId: string): MockOmniagentConnection | undefined {
    return this.mockAgents.get(agentId);
  }

  getAll(): MockOmniagentConnection[] {
    return [...this.mockAgents.values()];
  }

  sendMessage(agentId: string, role: 'user' | 'system', text: string, triggerResponse = true) {
    if (USE_MOCK) {
      const agent = this.mockAgents.get(agentId);
      if (!agent) { console.warn(`Agent ${agentId} not found`); return; }
      agent.sendMessage(role, text, triggerResponse);
      return;
    }
    // Delegate to AvatarHost (Puppeteer)
    this.avatarHost?.sendMessage(agentId, role, text, triggerResponse).catch((err) => {
      console.error(`[OmniagentManager] sendMessage failed for ${agentId}:`, (err as Error).message);
    });
  }

  updateSettings(agentId: string, instructions: string) {
    // set_settings doesn't work on WebRTC connections — instructions are set at agent creation
    if (USE_MOCK) {
      this.mockAgents.get(agentId)?.updateSettings(instructions);
    }
  }

  disconnectAll() {
    for (const agent of this.mockAgents.values()) {
      agent.disconnect();
    }
    this.mockAgents.clear();
    this.agentIds.clear();
    // AvatarHost shutdown is handled by SessionManager/index.ts
  }

  disconnect(agentId: string) {
    this.mockAgents.get(agentId)?.disconnect();
    this.mockAgents.delete(agentId);
    this.agentIds.delete(agentId);
  }

  getAgentHealth(): Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> {
    const health: Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> = {};
    if (USE_MOCK) {
      for (const [id] of this.mockAgents) {
        health[id] = { alive: true, lastActivity: Date.now(), reconnectAttempts: 0 };
      }
    } else {
      const ready = this.avatarHost?.isReady() ?? false;
      for (const id of this.agentIds) {
        health[id] = { alive: ready, lastActivity: Date.now(), reconnectAttempts: 0 };
      }
    }
    return health;
  }
}

export const omniagentManager = new OmniagentManager();
