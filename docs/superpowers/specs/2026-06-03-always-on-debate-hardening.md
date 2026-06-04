# Always-On Debate Hardening

**Date:** 2026-06-03
**Status:** Approved
**Goal:** Make the ARENA debate system run continuously and reliably so any user "tunes in" to an active debate at any time.

## Problem

After ~60 minutes of runtime, the debate system goes dead. Topics keep rotating (simple `setInterval`), but agents stop responding, audio stops, transcripts freeze. Root causes:

1. **Napster WebSocket connections die silently** after ~60 minutes (server-side timeout). The existing 10-attempt reconnect logic in `OmniagentConnection` exhausts attempts, declares the agent dead, but `SessionManager` never notices.
2. **Turn advancement depends on client `playback_done`**. The 30s fallback timer is too slow, and if no viewers are connected, the debate effectively stalls.
3. **Auto-restart is fragile** — one failed attempt and the system is dead forever with no retry.
4. **No health monitoring** — nothing checks whether the debate is actually making progress.

## Design

Five components, all server-side. No client changes required (client `playback_done` becomes an optimization, not a requirement).

### 1. DebateWatchdog

**New file:** `server/src/sessions/watchdog.ts`

A class that runs a health check loop every 10 seconds. It receives references to `SessionManager`, `OmniagentManager`, and `TurnManager`.

**Health checks (every 10s):**

| Check | Condition | Action |
|-------|-----------|--------|
| Connection liveness | `agent.isAlive() === false` | Trigger reconnect (up to 3 attempts) |
| Silent connection | `agent.lastActivityAt` > 45s ago but `isAlive()` is true | Trigger reconnect (connection is zombie) |
| Stuck turn | `lastTurnAdvanceTime` > 60s ago | Force-advance to next speaker |
| Agent permanently dead | 3 reconnect attempts exhausted | Mark agent dead, skip in rotation |
| Session unrecoverable | 2+ agents permanently dead | Tear down session, call `restartWithRetry()` |

**Recovery escalation:**
```
Dead connection detected
  -> Reconnect attempt 1/3
  -> Reconnect attempt 2/3
  -> Reconnect attempt 3/3
  -> Mark permanently_dead
  -> If 2+ agents dead: full session restart with retry
```

**Interface:**
```typescript
class DebateWatchdog {
  constructor(sessionManager: SessionManager, omniagent: OmniagentManager)
  start(): void           // Begin 10s health check loop
  stop(): void            // Stop loop (called on shutdown)
  getStatus(): WatchdogStatus  // For /health endpoint
  onTurnAdvanced(): void  // Called by SessionManager to reset progress tracker
}

interface WatchdogStatus {
  status: 'healthy' | 'recovering' | 'restarting'
  lastCheck: number
  lastTurnAdvance: number
  agentHealth: Record<string, {
    alive: boolean
    lastActivity: number
    reconnectAttempts: number
  }>
}
```

**Lifecycle:**
- Created and started in `index.ts` after server boots
- Stopped on graceful shutdown
- Paused during intentional session transitions (endDebate -> restart gap)

### 2. Connection Health Improvements

**File:** `server/src/omniagent/connection.ts`

**New properties:**
- `lastActivityAt: number` — updated on every received WebSocket message (text or binary frame). Initialized to `Date.now()` on connect.
- `isAlive(): boolean` — returns `this.ws !== null && this.ws.readyState === WebSocket.OPEN`

**Changed behavior:**
- `maxReconnectAttempts`: reduced from 10 to 3. The watchdog manages retry cycles, not the connection itself.
- New event: `permanently_dead` — emitted when 3 reconnect attempts exhausted. SessionManager listens for immediate reaction (the "touch of B" — event-driven for fast response).
- On successful reconnect: re-prime audio channel, re-send `set_settings` with system prompt, reset `reconnectAttempts` to 0, emit `reconnected`.

**What stays the same:**
- WebSocket protocol, message format, all event handling logic
- The `connect()` method itself
- `sendMessage()`, `updateSettings()`, `disconnect()`

### 3. Server-Driven Turn Advancement

**File:** `server/src/sessions/manager.ts` — changes to `maybeAdvanceTurn()` and related methods.

**Current flow (broken when no viewers):**
```
turnTextComplete + turnAudioDone
  -> emit turn_audio_complete to clients
  -> wait for client playback_done (30s fallback)
  -> advance turn
```

**New flow (server is authority):**
```
turnTextComplete + turnAudioDone
  -> estimate playback duration from audio data
  -> schedule server advance timer (estimated duration + 2s buffer)
  -> emit turn_audio_complete to clients
  -> if client playback_done arrives before timer: advance early (cancel timer)
  -> if timer fires first: advance (server-driven)
```

**Playback estimation:**
```typescript
function estimatePlaybackSeconds(totalBase64Chars: number): number {
  const rawBytes = totalBase64Chars * 0.75;
  const samples = rawBytes / 2;        // 16-bit PCM
  const seconds = samples / 16000;     // 16kHz sample rate
  return seconds;
}
```

The server adds a 2s buffer to the estimate to account for network delay. Minimum advance time is 3s (for very short responses).

**Key change:** The 30s fallback timer is replaced by the accurate audio-length estimate. Typical advance time: 5-15s depending on response length (vs 30s worst case before).

**Zero-viewer mode:** With no viewers connected, no `playback_done` arrives, and the server-driven timer handles everything. The debate runs at natural speed.

### 4. Session Restart Hardening

**File:** `server/src/sessions/manager.ts` — new method `restartWithRetry()`.

```typescript
private restartRetryCount = 0;

async restartWithRetry(): Promise<void> {
  const delays = [5000, 15000, 45000, 90000, 120000]; // exponential, cap at 2min

  while (true) {
    const delay = delays[Math.min(this.restartRetryCount, delays.length - 1)];
    console.log(`[Watchdog] Restart attempt ${this.restartRetryCount + 1} in ${delay/1000}s`);

    await sleep(delay);

    try {
      // Clean teardown of any orphaned connections
      this.omniagent.disconnectAll();

      const topic = getNextTopic();
      await this.createSession(topic, 3);
      await this.startDebate();

      // Success — reset counter
      this.restartRetryCount = 0;
      console.log(`[Watchdog] Restart succeeded: "${topic}"`);
      return;
    } catch (err) {
      this.restartRetryCount++;
      console.error(`[Watchdog] Restart failed (attempt ${this.restartRetryCount}):`, err.message);
      // Loop continues — try again with longer delay
    }
  }
}
```

**Where it's called:**
- `endDebate()` auto-restart (replaces current one-shot `setTimeout`)
- Watchdog unrecoverable state detection
- Initial startup in `index.ts` (replaces current single attempt)

### 5. Health Endpoint & Logging

**File:** `server/src/index.ts` — enhanced `/health` response.

**New response shape:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "viewerCount": 2,
  "activeSession": { "id": "...", "topic": "...", "status": "active" },
  "watchdog": {
    "status": "healthy",
    "lastCheck": 1717372800000,
    "lastTurnAdvance": 1717372795000,
    "agentHealth": {
      "agent_id_1": { "alive": true, "lastActivity": 1717372798000, "reconnectAttempts": 0 },
      "agent_id_2": { "alive": true, "lastActivity": 1717372796000, "reconnectAttempts": 0 },
      "agent_id_3": { "alive": true, "lastActivity": 1717372799000, "reconnectAttempts": 0 }
    }
  }
}
```

**Logging changes:**
- All watchdog actions prefixed with `[Watchdog]`
- Recovery actions logged clearly: `[Watchdog] Rico dead, reconnecting (1/3)`
- Session restarts: `[Watchdog] 2 agents dead, restarting session`
- Reduce per-frame logging from every 50 frames to every 500 after initial connection

## Files Changed

| File | Change |
|------|--------|
| `server/src/sessions/watchdog.ts` | **NEW** — DebateWatchdog class |
| `server/src/omniagent/connection.ts` | Add `isAlive()`, `lastActivityAt`, reduce max reconnects to 3, emit `permanently_dead` |
| `server/src/sessions/manager.ts` | Server-driven turn advance, `restartWithRetry()`, watchdog integration, expose internals for watchdog |
| `server/src/omniagent/manager.ts` | Add `getAgentHealth()` method for watchdog status reporting |
| `server/src/index.ts` | Create watchdog on boot, enhanced `/health`, use `restartWithRetry()` for initial startup |

## Out of Scope

- Client-side changes (none needed)
- Napster API changes or workarounds for their 60-min timeout (we work around it with reconnection)
- Multi-instance / horizontal scaling
- Persistent session state across server restarts (Railway container restarts get a fresh session)
