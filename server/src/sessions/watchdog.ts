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
const SILENT_THRESHOLD = 45_000;     // 45s no activity = zombie connection
const STUCK_TURN_THRESHOLD = 60_000; // 60s no turn advance = stuck
const MAX_RECONNECT_PER_AGENT = 3;

export class DebateWatchdog {
  private sessionManager: SessionManager;
  private omniagent: OmniagentManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheckTime = 0;
  private watchdogStatus: 'healthy' | 'recovering' | 'restarting' = 'healthy';
  private paused = false;
  private reconnectCounts: Map<string, number> = new Map();
  private permanentlyDead: Set<string> = new Set();

  constructor(sessionManager: SessionManager, omniagent: OmniagentManager) {
    this.sessionManager = sessionManager;
    this.omniagent = omniagent;
  }

  start() {
    if (this.timer) return;
    console.log('[Watchdog] Started — checking every 10s');
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
    this.reconnectCounts.clear();
    this.permanentlyDead.clear();
    this.watchdogStatus = 'healthy';
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
    const agentHealth = this.omniagent.getAgentHealth();

    // 1. Check each agent's connection
    let deadCount = 0;
    for (const agentId of session.agentIds) {
      const health = agentHealth[agentId];
      if (!health) continue;

      const isDead = !health.alive;
      const isZombie = health.alive && (now - health.lastActivity > SILENT_THRESHOLD);

      if (isDead || isZombie) {
        if (this.permanentlyDead.has(agentId)) {
          deadCount++;
          continue;
        }

        const attempts = this.reconnectCounts.get(agentId) || 0;
        const agentName = this.sessionManager.getAgentConfigs().get(agentId)?.name || agentId;

        if (attempts >= MAX_RECONNECT_PER_AGENT) {
          console.log(`[Watchdog] ${agentName} permanently dead after ${MAX_RECONNECT_PER_AGENT} reconnect attempts`);
          this.permanentlyDead.add(agentId);
          deadCount++;
          continue;
        }

        this.watchdogStatus = 'recovering';
        this.reconnectCounts.set(agentId, attempts + 1);
        console.log(`[Watchdog] ${agentName} ${isDead ? 'dead' : 'zombie'} — reconnecting (${attempts + 1}/${MAX_RECONNECT_PER_AGENT})`);

        try {
          const agent = this.omniagent.get(agentId);
          if (agent && 'resetReconnectCounter' in agent) {
            (agent as any).resetReconnectCounter();
          }
          // Disconnect and reconnect
          this.omniagent.disconnect(agentId);
          const config = this.sessionManager.getAgentConfigs().get(agentId);
          if (config) {
            const newAgent = await this.omniagent.createAndConnect(config);
            // Re-wire events — SessionManager needs to know about the new agent instance
            if (newAgent) this.sessionManager.rewireAgentEvents(newAgent, agentId);
            console.log(`[Watchdog] ${agentName} reconnected successfully`);
            this.reconnectCounts.set(agentId, 0);
          }
        } catch (err) {
          console.error(`[Watchdog] ${agentName} reconnect failed:`, (err as Error).message);
        }
      }
    }

    // 2. Check if session is unrecoverable (2+ agents permanently dead)
    if (this.permanentlyDead.size >= 2) {
      console.log(`[Watchdog] ${this.permanentlyDead.size} agents permanently dead — restarting session`);
      this.watchdogStatus = 'restarting';
      this.paused = true; // Pause during restart
      try {
        await this.sessionManager.endDebate('watchdog_restart');
        // endDebate calls restartWithRetry() which will resume the watchdog
      } catch (err) {
        console.error('[Watchdog] Session restart failed:', (err as Error).message);
        // restartWithRetry will keep trying
      }
      return;
    }

    // 3. Check for stuck turns
    const timeSinceLastAdvance = now - this.sessionManager.getLastTurnAdvanceTime();
    if (timeSinceLastAdvance > STUCK_TURN_THRESHOLD) {
      const turnManager = this.sessionManager.getTurnManager();
      const currentSpeaker = turnManager?.getCurrentSpeaker();
      if (currentSpeaker) {
        const name = this.sessionManager.getAgentConfigs().get(currentSpeaker)?.name || 'Unknown';
        console.log(`[Watchdog] Turn stuck for ${(timeSinceLastAdvance / 1000).toFixed(0)}s — force-advancing past ${name}`);
        turnManager?.onSpeechEnd(currentSpeaker, '');
      }
    }

    // Reset status if everything looks good
    if (deadCount === 0 && timeSinceLastAdvance < STUCK_TURN_THRESHOLD) {
      this.watchdogStatus = 'healthy';
    }
  }
}
