import { OmniagentConnection } from './connection.js';
import { MockOmniagentConnection } from './mock.js';
import { WebRTCConnection } from './webrtc-connection.js';
import type { AgentConfig } from '../../../shared/types.js';

const USE_MOCK = process.env.USE_MOCK === 'true';
const USE_WEBRTC = process.env.USE_WEBRTC === 'true'; // default false — debate uses WebSocket; video uses client-side WebRTC

export type AgentInstance = OmniagentConnection | WebRTCConnection | MockOmniagentConnection;

export class OmniagentManager {
  private agents: Map<string, AgentInstance> = new Map();

  async createAndConnect(config: AgentConfig): Promise<AgentInstance> {
    let agent: AgentInstance;
    if (USE_MOCK) {
      agent = new MockOmniagentConnection(config);
    } else if (USE_WEBRTC) {
      agent = new WebRTCConnection(config);
    } else {
      agent = new OmniagentConnection(config);
    }

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

  getAgentHealth(): Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> {
    const health: Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> = {};
    for (const [id, agent] of this.agents) {
      if ('isAlive' in agent && typeof agent.isAlive === 'function') {
        health[id] = {
          alive: agent.isAlive(),
          lastActivity: (agent as any).lastActivityAt || 0,
          reconnectAttempts: (agent as any).reconnectAttempts || 0,
        };
      } else {
        // Mock connections are always "alive"
        health[id] = { alive: true, lastActivity: Date.now(), reconnectAttempts: 0 };
      }
    }
    return health;
  }
}

export const omniagentManager = new OmniagentManager();
