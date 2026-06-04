# Always-On Debate Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ARENA debate run continuously and reliably so any viewer tunes in to an active debate at any time, surviving WebSocket drops, API errors, and zero-viewer periods.

**Architecture:** A server-side DebateWatchdog monitors connection health, turn progress, and agent responsiveness every 10 seconds. When failures are detected, it escalates through reconnection (3 attempts per agent), force-advancing stuck turns, and full session restart with exponential backoff. Turn advancement is server-driven via audio-length estimation, removing the dependency on client `playback_done`.

**Tech Stack:** Node.js, TypeScript, WebSocket (ws), Socket.io, Express

**Spec:** `docs/superpowers/specs/2026-06-03-always-on-debate-hardening.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/omniagent/connection.ts` | Modify | Add `isAlive()`, `lastActivityAt`, reduce max reconnects to 3, emit `permanently_dead` |
| `server/src/omniagent/manager.ts` | Modify | Add `getAgentHealth()` for watchdog status reporting |
| `server/src/sessions/manager.ts` | Modify | Server-driven turn advance, `restartWithRetry()`, watchdog integration |
| `server/src/sessions/watchdog.ts` | Create | DebateWatchdog health loop, recovery orchestration |
| `server/src/index.ts` | Modify | Create watchdog on boot, enhanced `/health`, use `restartWithRetry()` for startup |

---

### Task 1: Add Health Tracking to OmniagentConnection

**Files:**
- Modify: `server/src/omniagent/connection.ts`

This task adds `isAlive()`, `lastActivityAt`, reduces max reconnect attempts from 10 to 3, and emits `permanently_dead` when all attempts are exhausted.

- [ ] **Step 1: Add `lastActivityAt` property and `isAlive()` method**

In `server/src/omniagent/connection.ts`, add the new property alongside the existing private fields (after line 25):

```typescript
// After line 25: private shouldReconnect = true;
public lastActivityAt: number = Date.now();
```

Add the public method after the existing `get name()` accessor (after line 33):

```typescript
// After line 33: get name() { return this.config.name; }
isAlive(): boolean {
  return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
}
```

- [ ] **Step 2: Update `lastActivityAt` on every received message**

In the `this.ws!.on('message', ...)` handler inside `connect()` (around line 93), add a single line at the top of the callback, before the frame stats increment:

```typescript
// First line inside the message handler, before this.frameStats.total++
this.lastActivityAt = Date.now();
```

- [ ] **Step 3: Reset `lastActivityAt` on connect and reduce frame logging frequency**

In the `connect()` method, at the top (line 36), update `lastActivityAt`:

```typescript
async connect(): Promise<void> {
  // Reset state for fresh/reconnected connection
  this.lastActivityAt = Date.now();
  this.audioChunkCount = 0;
  // ... rest unchanged
```

Change the frame stats logging threshold from every 50 frames to every 500 (around line 106):

```typescript
// Change: if (this.frameStats.total % 50 === 0) {
if (this.frameStats.total % 500 === 0) {
```

- [ ] **Step 4: Reduce max reconnect attempts and emit `permanently_dead`**

Change `maxReconnectAttempts` from 10 to 3 (line 24):

```typescript
private maxReconnectAttempts = 3;
```

In `attemptReconnect()` (line 147-170), add a `permanently_dead` emit when max attempts reached:

```typescript
private attemptReconnect() {
  if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`  [${this.config.name}] Max reconnect attempts (${this.maxReconnectAttempts}) reached — agent is dead`);
      this.emit('permanently_dead', { agentId: this.config.id, name: this.config.name });
    }
    return;
  }
  // ... rest unchanged
```

- [ ] **Step 5: Add `resetReconnectCounter()` for watchdog-triggered retries**

Add a public method after `isAlive()`:

```typescript
/** Reset reconnect counter so the watchdog can trigger a fresh reconnect cycle */
resetReconnectCounter() {
  this.reconnectAttempts = 0;
  this.shouldReconnect = true;
}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/omniagent/connection.ts
git commit -m "$(cat <<'EOF'
feat: add health tracking to OmniagentConnection

Add isAlive(), lastActivityAt, reduce max reconnects to 3,
emit permanently_dead event for watchdog integration.
EOF
)"
```

---

### Task 2: Add Agent Health Reporting to OmniagentManager

**Files:**
- Modify: `server/src/omniagent/manager.ts`

- [ ] **Step 1: Add `getAgentHealth()` method**

Add this method to the `OmniagentManager` class, after `disconnect()` (after line 72):

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add server/src/omniagent/manager.ts
git commit -m "feat: add getAgentHealth() to OmniagentManager for watchdog status"
```

---

### Task 3: Server-Driven Turn Advancement

**Files:**
- Modify: `server/src/sessions/manager.ts`

This replaces the 30s client-dependent fallback with server-driven audio-length estimation.

- [ ] **Step 1: Add `lastTurnAdvanceTime` property**

Add alongside the other turn-tracking properties (after line 191, near the `completedTurns` property):

```typescript
// After: private polesGenerated = false;
private lastTurnAdvanceTime: number = Date.now();
```

- [ ] **Step 2: Add `estimatePlaybackSeconds()` helper**

Add as a private method after the `doAdvanceTurn()` method (around line 1141):

```typescript
/** Estimate audio playback duration from the total base64 chars relayed */
private estimatePlaybackSeconds(totalBase64Chars: number): number {
  if (totalBase64Chars === 0) return 3; // minimum
  const rawBytes = totalBase64Chars * 0.75;
  const samples = rawBytes / 2;        // 16-bit PCM
  const seconds = samples / 16000;     // 16kHz sample rate
  return Math.max(3, seconds + 2);     // +2s buffer, minimum 3s
}
```

- [ ] **Step 3: Replace `maybeAdvanceTurn()` with server-driven logic**

Replace the entire `maybeAdvanceTurn()` method (lines 1092-1116) with:

```typescript
private maybeAdvanceTurn(agentId: string) {
  if (!this.turnTextComplete || !this.turnAudioDone) return;
  if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

  this.turnGeneration++;
  const gen = this.turnGeneration;
  const name = this.agentConfigs.get(agentId)?.name || 'Unknown';

  // Estimate playback time from audio data we relayed
  const audioInfo = this.audioTracker.get(agentId);
  const estimatedSeconds = this.estimatePlaybackSeconds(audioInfo?.totalB64Chars || 0);

  console.log(`  [${name}] text+audio done — server advance in ${estimatedSeconds.toFixed(1)}s (gen=${gen})`);

  // Tell client no more audio chunks are coming
  (this.io as any).emit('turn_audio_complete', { agentId, gen });

  // Cancel the no-response timeout — agent DID respond
  if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }

  // Server-driven advance: schedule based on estimated playback duration
  if (this.turnAdvanceTimer) clearTimeout(this.turnAdvanceTimer);
  this.turnAdvanceTimer = setTimeout(() => {
    if (this.turnGeneration === gen) {
      console.log(`  [${name}] server-driven advance (${estimatedSeconds.toFixed(1)}s)`);
      this.doAdvanceTurn(agentId);
    }
  }, estimatedSeconds * 1000);
}
```

- [ ] **Step 4: Update `doAdvanceTurn()` to track `lastTurnAdvanceTime`**

In `doAdvanceTurn()` (around line 1128), add after the existing timer clearing:

```typescript
private doAdvanceTurn(agentId: string) {
  if (this.turnAdvanceTimer) { clearTimeout(this.turnAdvanceTimer); this.turnAdvanceTimer = null; }
  if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
  this.lastTurnAdvanceTime = Date.now(); // <-- ADD THIS LINE
  const name = this.agentConfigs.get(agentId)?.name || 'Unknown';
  // ... rest unchanged
```

- [ ] **Step 5: Expose `lastTurnAdvanceTime` and `turnManager` for watchdog**

Add public accessor methods to `SessionManager`, after `getSessionState()` (around line 615):

```typescript
/** Watchdog reads this to detect stuck turns */
getLastTurnAdvanceTime(): number {
  return this.lastTurnAdvanceTime;
}

/** Watchdog reads this to force-advance stuck turns */
getTurnManager(): TurnManager | null {
  return this.turnManager;
}

/** Watchdog reads this to check agent configs */
getAgentConfigs(): Map<string, AgentConfig> {
  return this.agentConfigs;
}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/sessions/manager.ts
git commit -m "$(cat <<'EOF'
feat: server-driven turn advancement via audio-length estimation

Replace 30s client-dependent fallback with estimated playback duration.
Client playback_done still works as an optimization to advance early.
Debate runs at full speed with zero viewers connected.
EOF
)"
```

---

### Task 4: Session Restart Hardening

**Files:**
- Modify: `server/src/sessions/manager.ts`

Replace the fragile one-shot auto-restart with `restartWithRetry()` that uses exponential backoff and retries indefinitely.

- [ ] **Step 1: Add `restartWithRetry()` method and restart state**

Add a new private property alongside the other session properties (around line 191):

```typescript
private restartRetryCount = 0;
private isRestarting = false;
```

Add `restartWithRetry()` as a public method after `endDebate()` (around line 444):

```typescript
/** Restart the debate with exponential backoff. Retries indefinitely until success. */
async restartWithRetry(): Promise<void> {
  if (this.isRestarting) {
    console.log('[Watchdog] Restart already in progress — skipping');
    return;
  }
  this.isRestarting = true;

  const delays = [5000, 15000, 45000, 90000, 120000];

  while (this.isRestarting) {
    const delay = delays[Math.min(this.restartRetryCount, delays.length - 1)];
    console.log(`[Watchdog] Restart attempt ${this.restartRetryCount + 1} in ${delay / 1000}s`);

    await new Promise(r => setTimeout(r, delay));

    // Check if something else already restarted successfully
    if (this.session?.status === 'active') {
      console.log('[Watchdog] Session already active — aborting restart');
      this.isRestarting = false;
      this.restartRetryCount = 0;
      return;
    }

    try {
      this.omniagent.disconnectAll();

      const { getNextTopic } = await import('./auto-start.js');
      const topic = getNextTopic();
      await this.createSession(topic, 3);
      await this.startDebate();

      this.restartRetryCount = 0;
      this.isRestarting = false;
      console.log(`[Watchdog] Restart succeeded: "${topic}"`);
      return;
    } catch (err) {
      this.restartRetryCount++;
      console.error(`[Watchdog] Restart failed (attempt ${this.restartRetryCount}):`, (err as Error).message);
    }
  }
}

/** Cancel an in-progress restart (for graceful shutdown) */
cancelRestart() {
  this.isRestarting = false;
}
```

- [ ] **Step 2: Replace fragile auto-restart in `endDebate()`**

Replace the `setTimeout` block at the end of `endDebate()` (lines 431-443) with:

```typescript
if (reason !== 'shutdown') {
  this.restartWithRetry();
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/sessions/manager.ts
git commit -m "$(cat <<'EOF'
feat: restartWithRetry() with exponential backoff

Replace one-shot auto-restart with indefinite retry loop.
Exponential delays: 5s, 15s, 45s, 90s, 120s cap.
Clean teardown before each attempt prevents orphaned connections.
EOF
)"
```

---

### Task 5: Create the DebateWatchdog

**Files:**
- Create: `server/src/sessions/watchdog.ts`

The central health monitoring loop that ties everything together.

- [ ] **Step 1: Create `server/src/sessions/watchdog.ts`**

```typescript
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
            this.sessionManager.rewireAgentEvents(newAgent, agentId);
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
```

- [ ] **Step 2: Commit**

```bash
git add server/src/sessions/watchdog.ts
git commit -m "feat: add DebateWatchdog — 10s health loop with connection/turn monitoring"
```

---

### Task 6: Expose `rewireAgentEvents()` on SessionManager

**Files:**
- Modify: `server/src/sessions/manager.ts`

The watchdog needs to re-wire events after reconnecting an agent. The existing `wireAgentEvents()` is private — we expose a public wrapper.

- [ ] **Step 1: Add public `rewireAgentEvents()` method**

Add after the existing `getAgentConfigs()` accessor added in Task 3:

```typescript
/** Re-wire events after watchdog reconnects an agent */
rewireAgentEvents(agent: AgentInstance, agentId: string) {
  this.wireAgentEvents(agent, agentId);
  console.log(`[Watchdog] Re-wired events for ${this.agentConfigs.get(agentId)?.name || agentId}`);
}
```

Add the import for `AgentInstance` at the top of the file (around line 2):

```typescript
import { OmniagentManager, type AgentInstance } from '../omniagent/manager.js';
```

(This import already exists — just verify `AgentInstance` is included in the type import.)

- [ ] **Step 2: Handle `watchdog_restart` reason in `endDebate()`**

In `endDebate()`, the `reason !== 'shutdown'` check at the end (around line 431) — `watchdog_restart` should also trigger `restartWithRetry()`. Since it's already not `'shutdown'`, it will work automatically. No code change needed, but verify the logic: `'watchdog_restart' !== 'shutdown'` is true, so `restartWithRetry()` is called. Correct.

- [ ] **Step 3: Commit**

```bash
git add server/src/sessions/manager.ts
git commit -m "feat: expose rewireAgentEvents() for watchdog agent reconnection"
```

---

### Task 7: Wire Watchdog into Server Startup and Health Endpoint

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Import and create watchdog**

Add the import at the top of `index.ts` (after the other session imports, around line 12):

```typescript
import { DebateWatchdog } from './sessions/watchdog.js';
```

Create the watchdog after `sessionManager` (after line 37):

```typescript
const sessionManager = new SessionManager(omniagent, io);
const watchdog = new DebateWatchdog(sessionManager, omniagent);
```

- [ ] **Step 2: Enhance the `/health` endpoint**

Replace the health endpoint (lines 83-92) with:

```typescript
app.get('/health', (_req, res) => {
  const session = sessionManager.getActiveSession();
  const watchdogStatus = watchdog.getStatus();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    viewerCount: io.engine.clientsCount,
    activeSession: session ? { id: session.id, topic: session.topic, status: session.status } : null,
    watchdog: watchdogStatus,
    timestamp: Date.now(),
  });
});
```

- [ ] **Step 3: Replace startup auto-start with `restartWithRetry()` and start watchdog**

Replace the `setTimeout` block in `httpServer.listen()` (lines 299-317) with:

```typescript
httpServer.listen(PORT, () => {
  console.log(`\n  ARENA Server running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Socket.io: ws://localhost:${PORT}`);
  console.log(`  Mock mode: ${process.env.USE_MOCK === 'true' ? 'ON' : 'OFF'}`);
  console.log(`  API: POST /api/sessions, POST /api/sessions/start, POST /api/sessions/end\n`);

  setTimeout(async () => {
    try {
      const serverUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`;
      await Promise.all([
        ensureCustomCompanions(serverUrl),
        initNapsterResources(serverUrl),
      ]);

      const topic = getNextTopic();
      await sessionManager.createSession(topic, 3);
      await sessionManager.startDebate();
      console.log('  Auto-started debate:', topic);
    } catch (err) {
      console.error('  Auto-start failed:', (err as Error).message);
      console.log('  Falling back to restartWithRetry()...');
      sessionManager.restartWithRetry();
    }

    // Start watchdog after first session attempt
    watchdog.start();
  }, 2000);
});
```

- [ ] **Step 4: Add watchdog to graceful shutdown**

Update the `shutdown()` function (around line 322):

```typescript
async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down gracefully...`);
  watchdog.stop();
  sessionManager.cancelRestart();
  await sessionManager.endDebate('shutdown').catch(() => {});
  io.close();
  db.close();
  httpServer.close(() => process.exit(0));
}
```

- [ ] **Step 5: Export watchdog for potential use elsewhere**

Update the export at the bottom (line 333):

```typescript
export { app, io, httpServer, sessionManager, creditService, watchdog };
```

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts
git commit -m "$(cat <<'EOF'
feat: wire DebateWatchdog into server startup, health endpoint, and shutdown

Watchdog starts after first session attempt, monitors every 10s.
Health endpoint now reports watchdog status and per-agent health.
Initial startup falls back to restartWithRetry() on failure.
EOF
)"
```

---

### Task 8: Wire Watchdog Resume into SessionManager Lifecycle

**Files:**
- Modify: `server/src/sessions/manager.ts`

The watchdog needs to be paused during session transitions and resumed when a new session starts. Pass the watchdog reference to SessionManager.

- [ ] **Step 1: Add watchdog reference to SessionManager**

Add an optional watchdog property (around line 191, with the other private properties):

```typescript
private watchdog: { pause(): void; resume(): void } | null = null;
```

Add a setter method after the constructor:

```typescript
setWatchdog(watchdog: { pause(): void; resume(): void }) {
  this.watchdog = watchdog;
}
```

- [ ] **Step 2: Pause watchdog during `endDebate()`**

At the start of `endDebate()`, after the session status check (around line 396):

```typescript
async endDebate(reason = 'manual'): Promise<void> {
  if (!this.session) return;

  this.watchdog?.pause(); // <-- ADD THIS LINE

  console.log(`\n  Ending debate: ${reason}`);
  // ... rest unchanged
```

- [ ] **Step 3: Resume watchdog when debate starts**

At the end of `startDebate()`, just before the `console.log('  Debate is LIVE!\n')` line (around line 392):

```typescript
// Resume watchdog for new session
this.watchdog?.resume();

console.log('  Debate is LIVE!\n');
```

- [ ] **Step 4: Wire it up in `index.ts`**

In `server/src/index.ts`, after creating the watchdog (added in Task 7), add:

```typescript
const watchdog = new DebateWatchdog(sessionManager, omniagent);
sessionManager.setWatchdog(watchdog);
```

- [ ] **Step 5: Commit**

```bash
git add server/src/sessions/manager.ts server/src/index.ts
git commit -m "feat: pause/resume watchdog during session transitions"
```

---

### Task 9: Add Mock Support for Health Tracking

**Files:**
- Modify: `server/src/omniagent/mock.ts`

The mock connection needs `isAlive()` and `lastActivityAt` so mock mode doesn't crash the watchdog.

- [ ] **Step 1: Add health tracking to MockOmniagentConnection**

Add properties and methods to the mock (after line 16):

```typescript
export class MockOmniagentConnection extends EventEmitter {
  private config: AgentConfig;
  private connected = false;
  private responseDelay: number;
  public lastActivityAt: number = Date.now();

  // ... existing constructor unchanged ...

  isAlive(): boolean {
    return this.connected;
  }

  resetReconnectCounter() {
    // no-op for mock
  }
```

Update `connect()` to set `lastActivityAt`:

```typescript
async connect(): Promise<void> {
  await new Promise((r) => setTimeout(r, 500));
  this.connected = true;
  this.lastActivityAt = Date.now();
  // ... rest unchanged
```

Update `sendMessage()` to set `lastActivityAt` when responding:

```typescript
sendMessage(role: 'user' | 'system', text: string, triggerResponse = true) {
  if (!this.connected) return;
  this.lastActivityAt = Date.now();
  // ... rest unchanged
```

- [ ] **Step 2: Commit**

```bash
git add server/src/omniagent/mock.ts
git commit -m "feat: add health tracking to MockOmniagentConnection for watchdog compatibility"
```

---

### Task 10: Smoke Test and Deploy

- [ ] **Step 1: Test in mock mode locally**

```bash
cd server && USE_MOCK=true npx tsx src/index.ts
```

Expected: Server starts, auto-starts debate, watchdog logs `[Watchdog] Started — checking every 10s`. Health endpoint at `http://localhost:3001/health` returns watchdog status with `"status": "healthy"`.

- [ ] **Step 2: Verify health endpoint**

```bash
curl http://localhost:3001/health | jq .
```

Expected: Response includes `watchdog` object with `status`, `lastCheck`, `lastTurnAdvance`, and `agentHealth` fields.

- [ ] **Step 3: Verify turn advancement works without any client**

Watch server logs for 2-3 minutes. Expected: turns advance automatically via server-driven timing (log messages like `[AgentName] server-driven advance (X.Xs)`), no `waiting for client playback_done` messages.

- [ ] **Step 4: Build client dist and commit for Railway**

```bash
cd client && npx vite build && cd ..
git add -f client/dist
git commit -m "chore: rebuild client dist for deployment"
```

- [ ] **Step 5: Push to deploy**

```bash
git push origin master
```

Monitor Railway logs for successful startup, watchdog activation, and continuous debate operation.

- [ ] **Step 6: Verify production health after 5 minutes**

```bash
curl https://arenaserver-production-f84b.up.railway.app/health | jq .watchdog
```

Expected: `"status": "healthy"`, recent `lastCheck` and `lastTurnAdvance` timestamps.
