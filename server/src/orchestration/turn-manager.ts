import { EventEmitter } from 'events';
import type { TurnState, TurnMode, TurnManagerConfig } from '../../../shared/types.js';

const DEFAULT_CONFIG: TurnManagerConfig = {
  mode: 'round_robin',
  turnTimeout: 10000,
  speechEndDebounce: 800,
  minTurnGap: 500,
};

export class TurnManager extends EventEmitter {
  private state: TurnState = 'IDLE';
  private config: TurnManagerConfig;
  private agentIds: string[] = [];
  private currentIndex = -1;
  private currentSpeaker: string | null = null;
  private interruptQueue: string[] = [];
  private turnTimer: NodeJS.Timeout | null = null;
  private gapTimer: NodeJS.Timeout | null = null;
  private paused = false;

  constructor(config: Partial<TurnManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): TurnState { return this.state; }
  getCurrentSpeaker(): string | null { return this.currentSpeaker; }
  isPaused(): boolean { return this.paused; }

  start(agentIds: string[]) {
    this.agentIds = agentIds;
    this.currentIndex = -1;
    this.state = 'SELECTING_NEXT';
    console.log(`  [TurnManager] Started with ${agentIds.length} agents`);
    this.selectNext();
  }

  stop() {
    this.clearTimers();
    this.state = 'IDLE';
    this.currentSpeaker = null;
    this.emit('stopped');
  }

  pause() {
    this.paused = true;
    this.clearTimers();
    this.emit('paused');
  }

  resume() {
    this.paused = false;
    this.emit('resumed');
    if (this.state === 'SELECTING_NEXT' || this.state === 'IDLE') {
      this.selectNext();
    }
  }

  /**
   * Called when an agent finishes speaking (from TranscriptRelay).
   */
  onSpeechEnd(agentId: string, transcript: string) {
    if (this.paused) return;
    if (agentId !== this.currentSpeaker) return;

    this.clearTimers();
    this.state = 'RELAYING';
    this.emit('turn_end', { agentId, transcript });

    // Wait min gap, then select next
    this.gapTimer = setTimeout(() => {
      this.state = 'SELECTING_NEXT';
      this.selectNext();
    }, this.config.minTurnGap);
  }

  /**
   * Called when an agent wants to interrupt (via ring_bell tool).
   */
  requestInterrupt(agentId: string) {
    if (agentId === this.currentSpeaker) return;
    if (!this.interruptQueue.includes(agentId)) {
      this.interruptQueue.push(agentId);
      this.emit('interrupt_requested', { agentId });
    }
  }

  private selectNext() {
    if (this.paused) return;

    let nextId: string;

    if (this.interruptQueue.length > 0) {
      nextId = this.interruptQueue.shift()!;
      this.emit('turn_interrupted', { byAgentId: nextId });
    } else if (this.config.mode === 'round_robin') {
      this.currentIndex = (this.currentIndex + 1) % this.agentIds.length;
      nextId = this.agentIds[this.currentIndex];
    } else {
      // free_for_all: pick random non-current agent
      const candidates = this.agentIds.filter(id => id !== this.currentSpeaker);
      nextId = candidates[Math.floor(Math.random() * candidates.length)];
    }

    this.currentSpeaker = nextId;
    this.state = 'WAITING_FOR_RESPONSE';
    this.emit('turn_start', { agentId: nextId });

    // Start timeout
    this.turnTimer = setTimeout(() => {
      console.log(`  [TurnManager] Timeout: ${nextId} didn't respond`);
      this.emit('turn_timeout', { agentId: nextId });
      this.state = 'SELECTING_NEXT';
      this.selectNext();
    }, this.config.turnTimeout);
  }

  /**
   * Called when we detect the current agent has started responding.
   * Clears the timeout since they're actively speaking.
   */
  onResponseStarted(agentId: string) {
    if (agentId === this.currentSpeaker && this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
      this.state = 'SPEAKING';
    }
  }

  private clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    if (this.gapTimer) { clearTimeout(this.gapTimer); this.gapTimer = null; }
  }
}
