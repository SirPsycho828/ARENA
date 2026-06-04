import { EventEmitter } from 'events';
import type { AgentConfig } from '../../../shared/types.js';

const MOCK_RESPONSES = [
  "That's an interesting point, but I think you're overlooking the obvious flaw in your logic.",
  "Oh please, that argument is older than the internet itself. Let me explain why you're wrong.",
  "I actually agree with part of that, but here's where it falls apart completely.",
  "You know what's funny? Every time someone makes that argument, they forget about the evidence.",
  "Let me put this in simple terms since my opponent seems confused.",
  "Fascinating perspective. Completely wrong, but fascinating nonetheless.",
];

export class MockOmniagentConnection extends EventEmitter {
  private config: AgentConfig;
  private connected = false;
  private responseDelay: number;
  public lastActivityAt: number = Date.now();

  constructor(config: AgentConfig, responseDelay = 300) {
    super();
    this.config = config;
    this.responseDelay = responseDelay;
  }

  get id() { return this.config.id; }
  get name() { return this.config.name; }

  isAlive(): boolean {
    return this.connected;
  }

  resetReconnectCounter() {
    // no-op for mock
  }

  async connect(): Promise<void> {
    // Simulate connection delay
    await new Promise((r) => setTimeout(r, 500));
    this.connected = true;
    this.lastActivityAt = Date.now();
    console.log(`  [MOCK ${this.config.name}] Connected`);
    this.emit('avatar_state', { state: 'ready' });
  }

  sendMessage(role: 'user' | 'system', text: string, triggerResponse = true) {
    if (!this.connected) return;
    this.lastActivityAt = Date.now();

    console.log(`  [MOCK ${this.config.name}] Received (${role}): ${text.substring(0, 60)}...`);

    if (!triggerResponse) return;

    // Simulate response after delay
    setTimeout(() => {
      const response = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
      const itemId = `mock_${Date.now()}`;

      this.emit('response_start', { itemId });

      // Stream word by word
      const words = response.split(' ');
      let accumulated = '';
      words.forEach((word, i) => {
        setTimeout(() => {
          const chunk = (i === 0 ? '' : ' ') + word;
          accumulated += chunk;
          this.emit('response_delta', { itemId, content: chunk });

          // Emit speech_end on last word, then talk_state ended
          if (i === words.length - 1) {
            this.emit('speech_end', {
              agentId: this.config.id,
              agentName: this.config.name,
              text: accumulated,
              timestamp: Date.now(),
            });
            // Simulate talk_state ended (triggers turnAudioDone in SessionManager)
            setTimeout(() => {
              this.emit('talk_state', { state: 'ended' });
            }, 100);
          }
        }, (i + 1) * 50);
      });
    }, this.responseDelay);
  }

  updateSettings(instructions: string) {
    console.log(`  [MOCK ${this.config.name}] Settings updated: ${instructions.substring(0, 60)}...`);
  }

  disconnect() {
    this.connected = false;
    console.log(`  [MOCK ${this.config.name}] Disconnected`);
  }
}
