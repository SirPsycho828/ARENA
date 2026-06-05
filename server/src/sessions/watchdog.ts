import type { OmniagentManager } from '../omniagent/manager.js';
import type { SessionManager } from './manager.js';

export interface WatchdogStatus {
  status: 'healthy' | 'recovering' | 'restarting';
  lastCheck: number;
  lastTurnAdvance: number;
  agentHealth: Record<string, {
    alive: boolean;
    lastActivity: number;
    reconnectAttempts: number;
  }>;
}

const CHECK_INTERVAL = 10_000;       // 10s between health checks
const STUCK_TURN_THRESHOLD = 30_000; // 30s no turn advance = stuck
const MAX_FORCE_ADVANCES = 3;        // 3 consecutive force-advances = dead session
const SESSION_DEAD_THRESHOLD = 120_000; // 2min no real response = dead

export class DebateWatchdog {
  private sessionManager: SessionManager;
  private omniagent: OmniagentManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheckTime = 0;
  private watchdogStatus: 'healthy' | 'recovering' | 'restarting' = 'healthy';
  private paused = false;
  private consecutiveForceAdvances = 0;
  private lastRealResponseTime = Date.now();

  constructor(sessionManager: SessionManager, omniagent: OmniagentManager) {
    this.sessionManager = sessionManager;
    this.omniagent = omniagent;
  }

  start() {
    if (this.timer) return;
    console.log('[Watchdog] Started — checking every 10s');
    this.lastRealResponseTime = Date.now();
    this.consecutiveForceAdvances = 0;
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Watchdog] Stopped');
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.consecutiveForceAdvances = 0;
    this.lastRealResponseTime = Date.now();
    this.watchdogStatus = 'healthy';
  }

  /** Called by SessionManager when a real agent response comes in */
  markRealResponse() {
    this.consecutiveForceAdvances = 0;
    this.lastRealResponseTime = Date.now();
  }

  getStatus(): WatchdogStatus {
    return {
      status: this.watchdogStatus,
      lastCheck: this.lastCheckTime,
      lastTurnAdvance: this.sessionManager.getLastTurnAdvanceTime(),
      agentHealth: this.omniagent.getAgentHealth(),
    };
  }

  private async check() {
    if (this.paused) return;

    const session = this.sessionManager.getActiveSession();
    if (!session || session.status !== 'active') return;

    this.lastCheckTime = Date.now();
    const now = Date.now();

    // 1. Check if session is dead: too many force-advances or too long without real response
    const timeSinceRealResponse = now - this.lastRealResponseTime;
    if (this.consecutiveForceAdvances >= MAX_FORCE_ADVANCES || timeSinceRealResponse > SESSION_DEAD_THRESHOLD) {
      const reason = this.consecutiveForceAdvances >= MAX_FORCE_ADVANCES
        ? `${this.consecutiveForceAdvances} consecutive force-advances`
        : `no real response for ${(timeSinceRealResponse / 1000).toFixed(0)}s`;
      console.log(`[Watchdog] Session dead (${reason}) — restarting`);
      this.watchdogStatus = 'restarting';
      this.paused = true;
      try {
        await this.sessionManager.endDebate('watchdog_restart');
      } catch (err) {
        console.error('[Watchdog] Session restart failed:', (err as Error).message);
      }
      return;
    }

    // 2. Check for stuck turns — force-advance if needed
    const timeSinceLastAdvance = now - this.sessionManager.getLastTurnAdvanceTime();
    if (timeSinceLastAdvance > STUCK_TURN_THRESHOLD) {
      const turnManager = this.sessionManager.getTurnManager();
      const currentSpeaker = turnManager?.getCurrentSpeaker();
      if (currentSpeaker) {
        this.consecutiveForceAdvances++;
        const name = this.sessionManager.getAgentConfigs().get(currentSpeaker)?.name || 'Unknown';
        console.log(`[Watchdog] Turn stuck for ${(timeSinceLastAdvance / 1000).toFixed(0)}s — force-advancing past ${name} (${this.consecutiveForceAdvances}/${MAX_FORCE_ADVANCES})`);
        turnManager?.onSpeechEnd(currentSpeaker, '');
      }
    }

    if (this.consecutiveForceAdvances === 0 && timeSinceLastAdvance < STUCK_TURN_THRESHOLD) {
      this.watchdogStatus = 'healthy';
    }
  }
}
