import { EventEmitter } from 'events';
import { OmniagentManager } from '../omniagent/manager.js';
import type { TranscriptMessage } from '../../../shared/types.js';

interface RelayConfig {
  maxTranscriptLength: number;
}

const DEFAULT_CONFIG: RelayConfig = {
  maxTranscriptLength: 500,
};

export class TranscriptRelay extends EventEmitter {
  private manager: OmniagentManager;
  private config: RelayConfig;
  private lastSentTo: Map<string, string> = new Map(); // agentId -> last message hash

  constructor(manager: OmniagentManager, config: Partial<RelayConfig> = {}) {
    super();
    this.manager = manager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Relay a completed transcript from one agent to all others.
   * Format: "[Agent Name] said: "transcript text""
   */
  broadcast(speakingAgentId: string, speakingAgentName: string, transcript: string) {
    // Truncate if too long
    let text = transcript;
    if (text.length > this.config.maxTranscriptLength) {
      text = text.substring(0, this.config.maxTranscriptLength) + '...';
    }

    const formatted = `[${speakingAgentName}] said: "${text}"`;
    const hash = simpleHash(formatted);

    // Send to all non-speaking agents
    const agents = this.manager.getAll();
    for (const agent of agents) {
      if (agent.id === speakingAgentId) continue;

      // Anti-echo: don't send if we just sent this exact message
      if (this.lastSentTo.get(agent.id) === hash) continue;

      this.lastSentTo.set(agent.id, hash);
      agent.sendMessage('user', formatted, false);
    }

    // Emit for logging/UI
    const msg: TranscriptMessage = {
      agentId: speakingAgentId,
      agentName: speakingAgentName,
      text: transcript,
      timestamp: Date.now(),
    };
    this.emit('relayed', msg);
  }

  /**
   * Inject a system message to all agents (for chaos injection, vote updates, etc.)
   */
  injectSystem(text: string, targetAgentId?: string) {
    if (targetAgentId) {
      this.manager.sendMessage(targetAgentId, 'system', text, false);
    } else {
      const agents = this.manager.getAll();
      for (const agent of agents) {
        agent.sendMessage('system', text, false);
      }
    }
    this.emit('system_injected', { text, targetAgentId });
  }

  /**
   * Check if a received message is an echo of what we just sent.
   */
  isEcho(agentId: string, text: string): boolean {
    const hash = simpleHash(text);
    return this.lastSentTo.get(agentId) === hash;
  }

  clear() {
    this.lastSentTo.clear();
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
