# ARENA: Chaos System, Auth, Credits & Voice Challenge

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform ARENA's viewer interaction from anonymous fire-and-forget into an authenticated, credit-gated, turn-aware chaos system. Rules have durations, topics queue properly, Voice Challenges address viewers by name, and all active chaos is visible globally.

**Deadline:** June 15, 2026 (Napster Hackathon)

**Guiding Principle:** The debate is GLOBAL. One debate, one state, one queue. Every viewer sees the same thing. The server is the single source of truth.

---

## Architecture Overview

```
Viewer (client)                          Server                              Napster Agents
  |                                        |                                      |
  |-- chaos_inject (rule, duration) ------>|                                      |
  |-- topic_change (topic) --------------->|                                      |
  |-- quick_chaos (preset key) ----------->|                                      |
  |-- challenge_start (agentId, name) ---->|                                      |
  |                                        |                                      |
  |                                        |-- [turn_start] build prompt -------->|
  |                                        |   includes:                          |
  |                                        |     - agent persona + COMMON_RULES   |
  |                                        |     - ACTIVE chaos rules (w/ turns)  |
  |                                        |     - voice challenge (if active)    |
  |                                        |     - previous speaker's text        |
  |                                        |     - topic                          |
  |                                        |                                      |
  |<-- chaos_status (active rules) --------|                                      |
  |<-- challenge_status (if active) -------|                                      |
  |<-- transcript (response) --------------|<-- agent response -------------------|
```

---

## Current State (what already exists)

| Component | Status | Notes |
|-----------|--------|-------|
| `InjectionQueue` | Basic | Timer-based (30s), no turn awareness, no duration |
| `ChaosPanel.tsx` | Working | Rule/topic input + submit |
| `QuickInjects.tsx` | Working | 8 preset buttons, fire as rules |
| `VoiceChallenger.tsx` | Working | Mic access, waveform, agent selector, 60s timer |
| Server challenger handlers | Working | Pauses TurnManager, injects system messages |
| `TranscriptRelay.injectSystem()` | Working | Sends system messages to all/specific agents |
| Auth | None | No user accounts |
| Credits | None | No payment system |

---

## Phase 1: Turn-Aware Chaos Queue (Server)

Rewrite `server/src/sessions/injection-queue.ts` from timer-based to turn-based.

### Task 1.1: New ChaosQueue class

Replace `InjectionQueue` with a turn-aware `ChaosQueue`.

**File:** `server/src/sessions/chaos-queue.ts` (new)

```typescript
interface ChaosRule {
  id: string;
  text: string;
  turnsRemaining: number;
  maxTurns: number;
  source: 'rule' | 'quick_chaos' | 'voice_challenge';
  viewerId: string;
  viewerName: string | null;        // For voice challenges
  targetAgentId: string | null;     // For voice challenges (null = all agents)
  activatedAt: number;
}

interface QueuedItem {
  id: string;
  text: string;
  type: 'rule' | 'topic' | 'voice_challenge';
  duration: number;                 // turns (1-4 for rules, 1 for challenges)
  viewerId: string;
  viewerName: string | null;
  targetAgentId: string | null;
  enqueuedAt: number;
}

class ChaosQueue {
  private active: ChaosRule[];      // Currently active rules (max 3)
  private queue: QueuedItem[];      // Waiting to activate
  private topicQueue: string[];     // Next topics (FIFO)

  // Called by TurnManager on every turn_start
  onTurnStart(): {
    expired: ChaosRule[];           // Rules that just expired (for UI notification)
    activated: ChaosRule[];         // Rules that just activated
    active: ChaosRule[];            // All currently active rules
  }

  // Called by SessionManager to build turn prompt
  getActiveRulesPrompt(): string    // Formatted for agent prompt injection

  // Public API
  enqueueRule(viewerId, viewerName, text, duration): Result
  enqueueQuickChaos(viewerId, presetKey): Result
  enqueueVoiceChallenge(viewerId, viewerName, targetAgentId, text): Result
  enqueueTopic(viewerId, topic): Result
  popNextTopic(): string | null
  getStatus(): ChaosStatus          // For broadcasting to all viewers
}
```

**Key behaviors:**
- `onTurnStart()` is called at the beginning of every turn. It:
  1. Decrements `turnsRemaining` on all active rules
  2. Removes expired rules (turnsRemaining <= 0)
  3. Promotes from queue if active.length < MAX_ACTIVE (3)
  4. Returns what changed (for UI notifications)
- `getActiveRulesPrompt()` formats active rules for injection into agent prompts:
  ```
  ACTIVE CHAOS RULES (you MUST follow these):
  1. "Everyone must speak in rhymes" (2 turns remaining)
  2. "VIEWER CHALLENGE from Steve targeting Rico Martinez: 'Your argument about...' — Address Steve by name." (this turn only)
  ```
- Topic queue is separate. `popNextTopic()` is called by topic rotation timer or when current topic expires. Topics don't have "turns remaining" — they last until the next rotation (5 min).

### Task 1.2: Wire ChaosQueue into SessionManager

**File:** `server/src/sessions/manager.ts` (modify)

- [ ] Replace `InjectionQueue` with `ChaosQueue`
- [ ] In `wireTurnManagerEvents` → `turn_start` handler:
  1. Call `chaosQueue.onTurnStart()`
  2. Broadcast `chaos_status` to all viewers with active/expired/activated
  3. Include `chaosQueue.getActiveRulesPrompt()` in the turn prompt sent to agents
- [ ] In `rotateTopic()`: check `chaosQueue.popNextTopic()` first (viewer-submitted topics take priority over random pool)
- [ ] Update `handleChaosInject()` to accept `duration` parameter
- [ ] Add `handleQuickChaos(viewerId, presetKey)` method
- [ ] Update `handleChallengerAudio()` to create a voice challenge queue item with viewer name

### Task 1.3: Update turn prompt construction

**File:** `server/src/sessions/manager.ts` (modify `wireTurnManagerEvents`)

Current prompt (line ~807-816):
```
[Previous debater said]: "text"
Respond to this.
```

New prompt:
```
[ACTIVE CHAOS RULES — you MUST follow these:]
1. "Everyone must speak in rhymes" (2 turns remaining)
2. "VIEWER CHALLENGE from Steve: 'Your argument is weak because...' — Address Steve by name in your response." (this turn only)

[The previous debater said]: "text"

Respond. Follow all active chaos rules.
```

When no chaos is active, the rules section is omitted entirely (keep prompts lean).

---

## Phase 2: Auth (Firebase)

### Task 2.1: Firebase Auth setup

- [ ] Add Firebase to client: `firebase`, `@firebase/auth`
- [ ] Create `client/src/lib/firebase.ts` — init Firebase app + auth
- [ ] Firebase Auth providers: **Google**, **GitHub**, **Email/Password**
- [ ] Create Firebase project config (or reuse existing ARENA project)

### Task 2.2: Auth context & onboarding

**File:** `client/src/contexts/AuthContext.tsx` (new)

- [ ] `AuthProvider` wrapping app
- [ ] States: `loading`, `unauthenticated`, `needs_onboarding`, `authenticated`
- [ ] On first sign-in (no display name): redirect to onboarding
- [ ] Onboarding: collect **first name** (required) — stored in Firebase user profile (`displayName`) and Firestore `users/{uid}`

### Task 2.3: Sign-in UI

**File:** `client/src/components/AuthModal.tsx` (new)

- [ ] Modal overlay (not a separate page — don't break the "tune in" experience)
- [ ] Google sign-in button (primary, one-tap)
- [ ] GitHub sign-in button
- [ ] Email/password form (expandable)
- [ ] Shown when user tries to: submit a rule, use Quick Chaos, start a Voice Challenge, or change topic
- [ ] Anonymous viewers can still WATCH and VOTE without signing in

### Task 2.4: Send auth token to server

- [ ] On Socket.io connect, send Firebase ID token in `auth` handshake
- [ ] Server validates token (optional — trust client for hackathon, validate later)
- [ ] Server associates `socket.id` with `{ uid, displayName }`
- [ ] `viewerName` available for chaos queue items and voice challenges

---

## Phase 3: Client UI — Global Chaos Status

### Task 3.1: Chaos status banner

**File:** `client/src/components/ChaosStatusBar.tsx` (new)

Visible to ALL viewers above the transcript. Shows:
```
⚡ ACTIVE: "Rhyme Time" (2 turns left) · "Roast Battle" (1 turn left)
```

- [ ] Animated entry when a rule activates (slide in, glow)
- [ ] Fade out when a rule expires
- [ ] Magenta/cyan accent colors matching the chaos theme
- [ ] If a Voice Challenge is active, show: `🎤 Steve challenged Rico Martinez!`

### Task 3.2: Update ChaosPanel for duration

**File:** `client/src/components/ChaosPanel.tsx` (modify)

- [ ] Add duration selector for rules: 1-4 turns (visual toggle buttons)
- [ ] Show credit cost: `{duration} credits` (placeholder until credits are live)
- [ ] Require auth for submission (show AuthModal if not signed in)
- [ ] Quick Chaos buttons: default to 3 turns duration

### Task 3.3: Update QuickInjects for auth gating

**File:** `client/src/components/QuickInjects.tsx` (modify)

- [ ] On click: check auth. If not signed in, show AuthModal.
- [ ] If signed in: send `quick_chaos` event with preset key
- [ ] Presets still fire as rules (3 turns default) through same pipeline

### Task 3.4: Voice Challenge transcript entry & badge

**File:** `client/src/components/TranscriptView.tsx` (modify)

- [ ] Voice Challenge entries styled differently:
  - Microphone icon
  - Viewer's name in bold
  - Different background color (magenta tint)
  - e.g.: `🎤 Steve: "Rico, your argument is completely wrong because..."`
- [ ] Badge on challenged agent's video panel during response:
  - `"Responding to Steve's Challenge"` overlay
  - Appears during the turn where the challenge is active
  - Fades after that turn

### Task 3.5: Update VoiceChallenger for auth

**File:** `client/src/components/VoiceChallenger.tsx` (modify)

- [ ] Require auth to start challenge
- [ ] Send viewer's `displayName` with `challenge_start` event
- [ ] Server uses name in prompt: "A viewer named Steve has challenged you..."

---

## Phase 4: Socket Events Update

### Task 4.1: New/updated events

**File:** `shared/types.ts` (modify)

```typescript
// Server → Client (new)
chaos_status: (data: {
  active: Array<{
    id: string;
    text: string;
    turnsRemaining: number;
    maxTurns: number;
    source: 'rule' | 'quick_chaos' | 'voice_challenge';
    viewerName: string | null;
    targetAgentId: string | null;
  }>;
  justActivated: string[];    // IDs of rules that just became active
  justExpired: string[];      // IDs of rules that just expired
}) => void;

challenge_banner: (data: {
  viewerName: string;
  agentId: string;
  agentName: string;
  text: string;              // Transcribed challenge text
  active: boolean;           // true when challenge turn starts, false when done
}) => void;

// Client → Server (updated)
chaos_inject: (data: {
  text: string;
  type: 'rule';
  duration: number;           // 1-4 turns
}) => void;

quick_chaos: (data: {
  preset: string;             // preset key like 'rhyme_time'
}) => void;

challenge_start: (data: {
  agentId: string;
  viewerName: string;         // From auth
}) => void;
```

---

## Phase 5: Credits System (Design Only — Implement Post-Hackathon)

For the hackathon demo, all chaos features are FREE. But design the system so credits can be bolted on.

### Credit pricing (planned)

| Action | Credits | Cost at $0.50/credit |
|--------|---------|---------------------|
| Rule (per turn of duration) | 1 | $0.50-$2.00 |
| Quick Chaos (3 turns) | 3 | $1.50 |
| Voice Challenge | 2 | $1.00 |
| New Topic | 5 | $2.50 |

### Firestore schema (planned)

```
users/{uid}:
  displayName: string
  credits: number
  createdAt: timestamp

transactions/{id}:
  uid: string
  type: 'purchase' | 'spend'
  amount: number
  action: 'rule' | 'quick_chaos' | 'voice_challenge' | 'topic'
  timestamp: timestamp
```

### Hackathon approach
- All features free (no credit checks)
- UI shows "X credits" placeholder text where costs would appear
- Server accepts all requests without credit validation
- Firestore user doc created on first auth (credits: 100 free starter credits)
- Credit deduction logic added post-hackathon

---

## Phase 6: Lip-Sync Simplification

Already in progress (separate from this plan). The video avatars use a simplified trigger:
- `speak-text` (no payload) on turn start → avatar starts talking (muted)
- `stop-speaking` on turn end → `stopAvatarTalking()`
- System prime on avatar ready sets "lip-sync mode"
- No transcript text dependency, no text dedup issues

---

## Implementation Order

| Batch | Tasks | Rationale |
|-------|-------|-----------|
| **Batch 1** | 1.1, 1.2, 1.3 | Server-side chaos queue — foundation for everything |
| **Batch 2** | 2.1, 2.2, 2.3, 2.4 | Auth — needed before chaos features require it |
| **Batch 3** | 4.1, 3.1, 3.2, 3.3 | Socket events + client UI for chaos status |
| **Batch 4** | 3.4, 3.5 | Voice Challenge polish (transcript entry, badge, auth) |
| **Batch 5** | 5.x (post-hackathon) | Credits, payments, Firestore transactions |

**Batch 1 can start immediately.** It's all server-side and doesn't break existing functionality.

**Batch 2 is independent of Batch 1** and can be worked in parallel.

---

## File Map

### New Files
```
server/src/sessions/chaos-queue.ts        — Turn-aware chaos queue (Task 1.1)
client/src/lib/firebase.ts                — Firebase app + auth init (Task 2.1)
client/src/contexts/AuthContext.tsx        — Auth provider + state machine (Task 2.2)
client/src/components/AuthModal.tsx        — Sign-in modal (Task 2.3)
client/src/components/ChaosStatusBar.tsx   — Global chaos status banner (Task 3.1)
```

### Modified Files
```
server/src/sessions/manager.ts            — Wire ChaosQueue, update prompts (Task 1.2, 1.3)
server/src/socket/handlers.ts             — New events, auth handshake (Task 2.4, 4.1)
shared/types.ts                           — New socket event types (Task 4.1)
client/src/components/ChaosPanel.tsx       — Duration selector, auth gate (Task 3.2)
client/src/components/QuickInjects.tsx     — Auth gate (Task 3.3)
client/src/components/VoiceChallenger.tsx  — Auth gate, send viewerName (Task 3.5)
client/src/components/TranscriptView.tsx   — Challenge transcript entry + badge (Task 3.4)
client/src/store/arena.ts                 — Chaos status state, auth state (Task 3.1)
client/src/App.tsx                        — AuthProvider wrapper (Task 2.2)
```

### Deleted Files
```
server/src/sessions/injection-queue.ts    — Replaced by chaos-queue.ts
```

---

## Quick Chaos Presets (Updated)

Move preset definitions to server-side (shared config) so server controls what's available:

```typescript
const QUICK_CHAOS_PRESETS: Record<string, { label: string; text: string; duration: number }> = {
  rhyme_time:     { label: 'Rhyme Time',     text: 'All debaters must speak entirely in rhymes.',                    duration: 3 },
  pirate_mode:    { label: 'Pirate Mode',    text: 'Everyone must argue like pirates. Arrr!',                        duration: 3 },
  opposite_day:   { label: 'Opposite Day',   text: 'Each debater must argue the OPPOSITE of their position.',        duration: 3 },
  shakespeare:    { label: 'Shakespeare',    text: 'All arguments must be in Shakespearean English.',                 duration: 3 },
  eli5:           { label: 'ELI5',           text: 'Explain your position as if talking to a 5-year-old.',            duration: 3 },
  roast_battle:   { label: 'Roast Battle',   text: 'Forget the topic. Roast the person who spoke before you.',       duration: 3 },
  hot_takes:      { label: 'Hot Takes Only', text: 'Only the most controversial, spicy hot takes allowed.',           duration: 3 },
  one_word:       { label: 'One Sentence',   text: 'Each debater gets only ONE sentence for their entire argument.', duration: 3 },
};
```
