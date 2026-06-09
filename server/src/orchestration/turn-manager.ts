import { EventEmitter } from 'events';
import type { TurnState, TurnMode, TurnManagerConfig } from '../../../shared/types.js';

const DEFAULT_CONFIG: TurnManagerConfig = {
  mode: 'dynamic',
  turnTimeout: 20000,
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
  private recentSpeakers: string[] = [];
  private forcedNext: string | null = null;
  private callInTurnsRemaining = 0;
  private callInCallId: string | null = null;

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
    this.recentSpeakers = [];
    this.state = 'SELECTING_NEXT';
    console.log(`  [TurnManager] Started with ${agentIds.length} agents (mode: ${this.config.mode})`);
    this.selectNext();
  }

  stop() {
    this.clearTimers();
    this.state = 'IDLE';
    this.currentSpeaker = null;
    this.callInCallId = null;
    this.callInTurnsRemaining = 0;
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

    // If in call-in mode, decrement counter
    if (this.callInCallId) {
      this.callInTurnsRemaining--;
      console.log(`  [TurnManager] Call-in turns remaining: ${this.callInTurnsRemaining}`);
      if (this.callInTurnsRemaining <= 0) {
        const callId = this.callInCallId;
        this.callInCallId = null;
        this.gapTimer = setTimeout(() => {
          this.state = 'SELECTING_NEXT';
          this.emit('callin_complete', { callId });
          this.selectNext();
        }, this.config.minTurnGap);
        return;
      }
    }

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

  /** Peek at who would speak next without advancing state. */
  peekNextSpeaker(): string | null {
    if (this.agentIds.length === 0) return null;
    if (this.interruptQueue.length > 0) return this.interruptQueue[0];
    if (this.config.mode === 'dynamic') return this.selectDynamic();
    if (this.config.mode === 'round_robin') return this.agentIds[(this.currentIndex + 1) % this.agentIds.length];
    const candidates = this.agentIds.filter(id => id !== this.currentSpeaker);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /** Force a specific agent as the next speaker (used for pre-prompting). */
  forceNext(agentId: string) { this.forcedNext = agentId; }

  /** Enter call-in mode: run exactly N turns of discussion, then emit 'callin_complete'. */
  enterCallIn(callId: string, turns: number) {
    this.callInCallId = callId;
    this.callInTurnsRemaining = turns;
    // Set state so that resume() will call selectNext() — without this,
    // state stays 'RELAYING' from the intro turn and resume() does nothing.
    this.state = 'SELECTING_NEXT';
    console.log(`  [TurnManager] Entered call-in mode: ${turns} turns for ${callId}`);
  }

  /** Exit call-in mode early (e.g., watchdog recovery). */
  exitCallIn() {
    const wasActive = this.callInCallId !== null;
    this.callInCallId = null;
    this.callInTurnsRemaining = 0;
    if (wasActive) {
      console.log('  [TurnManager] Exited call-in mode');
      this.emit('callin_complete', {});
    }
  }

  isInCallIn(): boolean { return this.callInCallId !== null; }
  getCallInCallId(): string | null { return this.callInCallId; }
  getCallInTurnsRemaining(): number { return this.callInTurnsRemaining; }

  private selectNext() {
    if (this.paused) return;

    let nextId: string;

    if (this.forcedNext) {
      nextId = this.forcedNext;
      this.forcedNext = null;
    } else if (this.interruptQueue.length > 0) {
      nextId = this.interruptQueue.shift()!;
      this.emit('turn_interrupted', { byAgentId: nextId });
    } else if (this.config.mode === 'dynamic') {
      nextId = this.selectDynamic();
    } else if (this.config.mode === 'round_robin') {
      this.currentIndex = (this.currentIndex + 1) % this.agentIds.length;
      nextId = this.agentIds[this.currentIndex];
    } else {
      // free_for_all: pick random non-current agent
      const candidates = this.agentIds.filter(id => id !== this.currentSpeaker);
      nextId = candidates[Math.floor(Math.random() * candidates.length)];
    }

    this.recentSpeakers.push(nextId);
    if (this.recentSpeakers.length > 12) this.recentSpeakers.shift();

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
   * Dynamic turn selection: creates natural back-and-forth exchanges
   * between agents rather than strict round-robin.
   *
   * - Never the same agent twice in a row
   * - ~35% chance of continuing a direct exchange (A-B-A-B pattern)
   * - Exchanges capped at 4 turns before forcing the third agent
   * - Otherwise weighted random favoring less-recent speakers
   */
  private selectDynamic(): string {
    const others = this.agentIds.filter(id => id !== this.currentSpeaker);
    if (others.length === 0) return this.agentIds[0]; // shouldn't happen

    const pairTurns = this.consecutivePairTurns();

    // Force the third agent after 4+ turns between the same pair
    if (pairTurns >= 4) {
      const recentPair = new Set(this.recentSpeakers.slice(-2));
      const fresh = this.agentIds.filter(id => !recentPair.has(id));
      if (fresh.length > 0) {
        return fresh[Math.floor(Math.random() * fresh.length)];
      }
    }

    // 35% chance: continue or start a direct exchange (pick who spoke 2 turns ago)
    if (this.recentSpeakers.length >= 2 && Math.random() < 0.35) {
      const twoBack = this.recentSpeakers[this.recentSpeakers.length - 2];
      if (twoBack && twoBack !== this.currentSpeaker && others.includes(twoBack)) {
        return twoBack;
      }
    }

    // Weighted random: agents who haven't spoken recently get higher weight
    return this.weightedRandom(others);
  }

  /**
   * Count consecutive turns from the end that involve only 2 agents.
   */
  private consecutivePairTurns(): number {
    if (this.recentSpeakers.length < 2) return 0;
    const pair = new Set<string>();
    let count = 0;
    for (let i = this.recentSpeakers.length - 1; i >= 0; i--) {
      pair.add(this.recentSpeakers[i]);
      if (pair.size > 2) break;
      count++;
    }
    return count;
  }

  /**
   * Weighted random selection favoring agents who haven't spoken recently.
   */
  private weightedRandom(candidates: string[]): string {
    const weights = candidates.map(id => {
      const lastIndex = this.recentSpeakers.lastIndexOf(id);
      if (lastIndex === -1) return 10; // never spoke — highest weight
      return Math.max(1, this.recentSpeakers.length - lastIndex);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
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
