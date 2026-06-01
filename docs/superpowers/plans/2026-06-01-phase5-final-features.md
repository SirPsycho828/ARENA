# ARENA Phase 5: Final Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all remaining features for ARENA hackathon submission — real API integration, WebRTC video, auto-start, visual polish, Judge Mode, mobile layout, deployment, and production hardening.

**Architecture:** 17 tasks across 5 batches. Batch 1 establishes infrastructure (git, auto-start, sound toggle, resilience). Batch 2 integrates real Napster API with WebRTC video widgets. Batch 3 adds visual spectacle (entrance animations, crowd momentum, victory ceremony, topic rotation). Batch 4 adds Judge Mode, agent stats, and mobile layout. Batch 5 polishes for production (sharing, ambient audio, final deploy).

**Tech Stack:** React 19, Vite, Tailwind v4, Zustand, Framer Motion, Socket.io, Express, SQLite, Napster Omniagent API, Web Audio API, @touchcastllc/napster-companion-api (WebRTC SDK)

---

## File Map

### New Files
```
client/src/components/SoundToggle.tsx          — Mute/unmute button (Task 3)
client/src/components/AgentEntrance.tsx         — "Player entering" animation overlay (Task 7)
client/src/components/VictoryScreen.tsx         — End-of-debate winner reveal (Task 9)
client/src/components/JudgePanel.tsx            — Debug panel for hackathon judges (Task 11)
client/src/components/AgentStats.tsx            — Stats page/modal for individual agents (Task 12)
client/src/components/ShareButton.tsx           — Share URL + OG meta (Task 14)
client/src/components/AgentVideo.tsx            — WebRTC SDK video widget wrapper (Task 6)
client/src/lib/ambient.ts                       — Ambient crowd atmosphere audio (Task 15)
server/src/sessions/auto-start.ts               — Auto-start logic + topic pool (Task 2)
```

### Modified Files
```
client/src/App.tsx                              — Wire new components, auto-start, mobile
client/src/store/arena.ts                       — New state: sound, judge mode, stats, auto-reconnect
client/src/index.css                            — New animations, mobile breakpoints
client/src/lib/sounds.ts                        — Add mute support
client/src/components/AgentPanel.tsx             — WebRTC video, entrance, momentum glow
client/src/components/TopicBanner.tsx            — Sound toggle, share button, judge toggle
client/src/components/SpectatorBar.tsx           — Mobile layout tweaks
client/src/components/ChaosPanel.tsx             — Mobile drawer
client/src/components/TranscriptFeed.tsx         — Judge Mode annotations
client/src/components/SplashScreen.tsx           — Auto-enter option
client/index.html                               — OG meta tags
server/src/index.ts                             — Auto-start endpoint, stats API, connection tokens
server/src/sessions/manager.ts                  — Auto-start, topic rotation, stats tracking, WebRTC tokens
server/src/socket/handlers.ts                   — Judge mode events, stats queries
server/src/db/index.ts                          — Stats schema additions
server/src/orchestration/turn-manager.ts        — Topic rotation timer
shared/types.ts                                 — New event types, stats interfaces
server/package.json                             — Add @touchcastllc/napster-companion-api (if needed server-side)
client/package.json                             — Add @touchcastllc/napster-companion-api, @reduxjs/toolkit
Dockerfile                                      — Verify build works with new deps
.gitignore                                      — Ensure complete
```

---

## Batch 1: Foundation & Infrastructure

### Task 1: Git Init + GitHub Push

**Files:**
- Modify: `.gitignore`
- Create: git repository

- [ ] **Step 1: Verify .gitignore is complete**

Read `.gitignore` and ensure it includes:
```
node_modules/
dist/
.env
*.db
*.sqlite
.DS_Store
poc/node_modules/
poc/.env
*.log
.playwright-mcp/
```

- [ ] **Step 2: Initialize git repo**

```bash
cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA"
git init
git add -A
git status  # Review — no .env, no node_modules, no .db files
```

- [ ] **Step 3: Create initial commit**

```bash
git commit -m "feat: ARENA Phase 1-4 complete — full-stack AI debate arena

Server: Express + Socket.io + SQLite with Omniagent API integration
Client: React + Vite + Tailwind with cinematic UI and real-time features
5 agent personalities, chaos injection, voice challenger, audience reactions"
```

- [ ] **Step 4: Push to GitHub (private)**

```bash
gh repo create ARENA --private --source=. --push
```

- [ ] **Step 5: Verify**

```bash
gh repo view --web  # Opens browser to confirm
```

---

### Task 2: Auto-Start Debate on Page Load

**Files:**
- Create: `server/src/sessions/auto-start.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/sessions/manager.ts`
- Modify: `client/src/components/SplashScreen.tsx`

The goal: When a viewer opens the URL, a debate is already in progress. No curl needed. Server auto-starts a debate on boot (or when the last one ends) using a rotating topic pool.

- [ ] **Step 1: Create topic pool and auto-start module**

Create `server/src/sessions/auto-start.ts`:
```ts
const TOPIC_POOL = [
  'Is pineapple on pizza a crime against humanity?',
  'Should AI replace human politicians?',
  'Are cats secretly smarter than dogs?',
  'Is social media making us dumber or smarter?',
  'Would you rather fight 100 duck-sized horses or 1 horse-sized duck?',
  'Is it better to be feared or loved?',
  'Should homework be abolished?',
  'Are video games art?',
  'Is time travel possible — and should we do it?',
  'Would you take a one-way ticket to Mars?',
  'Is breakfast really the most important meal?',
  'Should billionaires exist?',
  'Are we living in a simulation?',
  'Is the internet a net positive for humanity?',
  'Should voting be mandatory?',
];

let topicIndex = 0;

export function getNextTopic(): string {
  const topic = TOPIC_POOL[topicIndex % TOPIC_POOL.length];
  topicIndex++;
  return topic;
}

export function getTopicPool(): string[] {
  return [...TOPIC_POOL];
}
```

- [ ] **Step 2: Add auto-start to server index.ts**

After server starts listening, auto-launch a debate:
```ts
import { getNextTopic } from './sessions/auto-start.js';

// After httpServer.listen callback:
// Auto-start first debate
setTimeout(async () => {
  try {
    const topic = getNextTopic();
    await sessionManager.createSession(topic, 3);
    await sessionManager.startDebate();
    console.log('  Auto-started debate:', topic);
  } catch (err) {
    console.error('  Auto-start failed:', (err as Error).message);
  }
}, 2000);
```

- [ ] **Step 3: Add auto-restart when debate ends**

In `SessionManager.endDebate()`, after cleanup, schedule a new debate:
```ts
// At end of endDebate():
if (reason !== 'shutdown') {
  setTimeout(async () => {
    try {
      const { getNextTopic } = await import('./auto-start.js');
      const topic = getNextTopic();
      await this.createSession(topic, 3);
      await this.startDebate();
      console.log('  Auto-restarted with:', topic);
    } catch (err) {
      console.error('  Auto-restart failed:', (err as Error).message);
    }
  }, 5000); // 5s gap between debates
}
```

- [ ] **Step 4: Update SplashScreen to auto-enter after animation**

Add auto-enter after the animation completes (no click required if debate is active):
```tsx
// In SplashScreen, after phase === 'ready':
useEffect(() => {
  if (phase === 'ready') {
    const timer = setTimeout(onEnter, 3000); // Auto-enter after 3s
    return () => clearTimeout(timer);
  }
}, [phase, onEnter]);
```
Keep the button for immediate entry — auto-enter is just a fallback.

- [ ] **Step 5: Add API endpoint for topic pool**

In `server/src/index.ts`:
```ts
import { getTopicPool } from './sessions/auto-start.js';

app.get('/api/topics', (_req, res) => {
  res.json({ topics: getTopicPool() });
});
```

- [ ] **Step 6: Verify**

```bash
cd server && USE_MOCK=true npx tsx src/index.ts
# Wait 3 seconds, then:
curl -s http://localhost:3001/health  # Should show activeSession
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: auto-start debate on server boot with topic rotation"
```

---

### Task 3: Sound Toggle (Mute/Unmute)

**Files:**
- Create: `client/src/components/SoundToggle.tsx`
- Modify: `client/src/lib/sounds.ts`
- Modify: `client/src/store/arena.ts`
- Modify: `client/src/components/TopicBanner.tsx`

- [ ] **Step 1: Add mute state to Zustand store**

In `store/arena.ts`, add to state interface and initial state:
```ts
soundMuted: boolean;
toggleSound: () => void;
```
Implementation:
```ts
soundMuted: false,
toggleSound: () => set((s) => ({ soundMuted: !s.soundMuted })),
```

- [ ] **Step 2: Add mute check to SoundEngine**

In `lib/sounds.ts`, add a muted flag:
```ts
class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    // ... existing lazy init
  }
  // All methods already return early if getCtx returns null
  // Change getCtx to return null when muted
}
```
Update each sound method to check: `const ctx = this.getCtx(); if (!ctx) return;`

- [ ] **Step 3: Create SoundToggle component**

Create `client/src/components/SoundToggle.tsx`:
- Button with Volume2 / VolumeX icons from lucide-react
- Reads `soundMuted` from store, calls `toggleSound()`
- Updates `sounds.muted` in sync with store
- Small ghost-style button matching TopicBanner style

- [ ] **Step 4: Add SoundToggle to TopicBanner**

Place next to the connection status indicator in the header.

- [ ] **Step 5: Verify — click toggle, confirm sounds stop/resume**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add sound mute/unmute toggle"
```

---

### Task 4: Connection Resilience

**Files:**
- Modify: `client/src/store/arena.ts`
- Modify: `client/src/components/TopicBanner.tsx`

- [ ] **Step 1: Add auto-reconnect to Socket.io connection**

In `store/arena.ts`, update the `connect()` method:
```ts
const socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

socket.on('reconnect', () => {
  set({ connected: true });
});

socket.on('reconnect_attempt', (attempt) => {
  console.log(`Reconnecting... attempt ${attempt}`);
});

socket.on('reconnect_failed', () => {
  console.log('Reconnection failed');
});
```

- [ ] **Step 2: Add connection status to TopicBanner**

Show "Reconnecting..." state with amber color when disconnected but attempting reconnect.

- [ ] **Step 3: Verify — kill server, watch client reconnect when server restarts**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: auto-reconnect with visual feedback"
```

---

## Batch 2: Real Napster API & WebRTC Video

### Task 5: Real Napster API Integration Test

**Files:**
- Modify: `server/src/sessions/manager.ts`
- Modify: `server/src/omniagent/connection.ts`

This task validates the real API works end-to-end. No code changes needed if mock/real toggle already works — just test.

- [ ] **Step 1: Start server in REAL mode**

```bash
cd server && npx tsx src/index.ts  # No USE_MOCK — uses real API
```

- [ ] **Step 2: Create a session with real agents**

```bash
curl -s -X POST http://localhost:3001/api/sessions/launch \
  -H "Content-Type: application/json" \
  -d '{"topic": "Is AI art real art?", "agentCount": 2}'
```

Watch server logs for agent creation and WebSocket connection.

- [ ] **Step 3: Verify transcripts flow**

Open browser to http://localhost:5173 — agents should be debating with REAL AI responses (not canned mock text). Verify:
- Agents respond with unique, contextual text
- Turn manager advances correctly
- Transcripts appear in the feed

- [ ] **Step 4: Test chaos injection**

Type a rule in the chaos panel. Verify agents react to it.

- [ ] **Step 5: Fix any issues found**

Common issues to watch for:
- Token expiry: connections may expire after 30 min, need reconnection logic
- Response format differences between mock and real
- Rate limits on agent creation

- [ ] **Step 6: Commit any fixes**

```bash
git add -A && git commit -m "fix: real API integration adjustments"
```

---

### Task 6: WebRTC Video Widgets

**Files:**
- Create: `client/src/components/AgentVideo.tsx`
- Modify: `client/package.json` (add SDK deps)
- Modify: `server/src/index.ts` (add token endpoint)
- Modify: `server/src/sessions/manager.ts` (create WebRTC connections, return tokens)
- Modify: `client/src/store/arena.ts` (add video tokens state)
- Modify: `client/src/components/AgentPanel.tsx` (embed AgentVideo)
- Modify: `shared/types.ts` (add token types)

Architecture: Server creates WebRTC connections for each agent, returns tokens to client via new API endpoint. Client mounts Napster SDK widgets using those tokens.

- [ ] **Step 1: Install SDK in client**

```bash
cd client && npm install @touchcastllc/napster-companion-api @reduxjs/toolkit
```

- [ ] **Step 2: Add WebRTC connection creation to SessionManager**

In `server/src/sessions/manager.ts`, after agent creation in `createSession()`, also create WebRTC connections:

```ts
private videoTokens: Map<string, string> = new Map();

// In createSession(), after creating each agent:
if (process.env.USE_MOCK !== 'true') {
  try {
    const tokenRes = await fetch(
      `https://companion-api.napster.com/public/agents/${agentId}/connections`,
      {
        method: 'POST',
        headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelType: 'webrtc' }),
      }
    );
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json() as { token: string };
      this.videoTokens.set(agentId, tokenData.token);
    }
  } catch (err) {
    console.warn(`  WebRTC token failed for ${config.name}:`, (err as Error).message);
  }
}
```

- [ ] **Step 3: Add token API endpoint**

In `server/src/index.ts`:
```ts
app.get('/api/sessions/tokens', (_req, res) => {
  const tokens: Record<string, string> = {};
  // sessionManager needs a getVideoTokens() method
  const tokenMap = sessionManager.getVideoTokens();
  tokenMap.forEach((token, agentId) => { tokens[agentId] = token; });
  res.json({ tokens });
});
```

Add `getVideoTokens()` to SessionManager.

- [ ] **Step 4: Add video tokens to Zustand store**

In `store/arena.ts`:
```ts
videoTokens: Record<string, string>;

// On session_state, also fetch tokens:
// After receiving session_state, call /api/sessions/tokens
```

- [ ] **Step 5: Create AgentVideo component**

Create `client/src/components/AgentVideo.tsx`:
```tsx
import { useEffect, useRef } from 'react';

interface AgentVideoProps {
  token: string | null;
  agentName: string;
  color: string;
}

export function AgentVideo({ token, agentName, color }: AgentVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!token || !containerRef.current) return;

    const initSDK = async () => {
      try {
        // Dynamic import to avoid issues in mock mode
        const { NapsterCompanionApiSdk } = await import(
          '@touchcastllc/napster-companion-api'
        );
        instanceRef.current = await NapsterCompanionApiSdk.init(token, {
          mountContainer: containerRef.current!,
        });
      } catch (err) {
        console.warn(`Video init failed for ${agentName}:`, err);
      }
    };

    initSDK();

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [token]);

  // If no token (mock mode), show placeholder
  if (!token) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
          style={{ backgroundColor: color + '20', color, border: `2px solid ${color}40` }}
        >
          {agentName.split(' ').pop()?.[0] || agentName[0]}
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
```

- [ ] **Step 6: Integrate AgentVideo into AgentPanel**

Replace the placeholder circle in `AgentPanel.tsx` with:
```tsx
<div className="aspect-video bg-arena-elevated relative overflow-hidden">
  <AgentVideo token={videoTokens[id] || null} agentName={name} color={color} />
</div>
```

- [ ] **Step 7: Import SDK CSS**

In `client/src/main.tsx`:
```ts
import '@touchcastllc/napster-companion-api/lib/index.css';
```
(Or load via CDN link tag in index.html as fallback)

- [ ] **Step 8: Verify in real mode**

Start server without USE_MOCK. Open browser. Agents should show video avatars.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: WebRTC video widgets for agent panels"
```

---

## Batch 3: Visual Spectacle

### Task 7: Agent Entrance Animations

**Files:**
- Create: `client/src/components/AgentEntrance.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/store/arena.ts`

When agents first appear, show a dramatic "player entering the arena" animation — like a fighting game character select.

- [ ] **Step 1: Create AgentEntrance overlay component**

A full-screen overlay that shows each agent's name, personality, and color with dramatic entrance animation. Plays sequentially for each agent (1.5s per agent), then dismisses.

Uses framer-motion with staggered entrance: slide in from side, glow flash, name reveal, then slide out.

- [ ] **Step 2: Add entrance state to store**

```ts
showEntrance: boolean;
entranceAgents: AgentInfo[];
dismissEntrance: () => void;
```

Trigger entrance when `session_state` arrives with agents for the first time.

- [ ] **Step 3: Wire into App.tsx**

Show `<AgentEntrance>` overlay between splash exit and main arena reveal.

- [ ] **Step 4: Verify — reload page, see entrance sequence before debate**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: dramatic agent entrance animations"
```

---

### Task 8: Crowd Momentum — Leading Agent Visual Boost

**Files:**
- Modify: `client/src/components/AgentPanel.tsx`
- Modify: `client/src/index.css`

When an agent is leading in votes, their panel gets progressively more dramatic visual effects.

- [ ] **Step 1: Add momentum tiers to AgentPanel**

Calculate vote percentage and apply tiers:
- **0-30%**: Normal appearance
- **30-50%**: Subtle golden border glow
- **50-70%**: Brighter glow + "CROWD FAVORITE" badge
- **70%+**: Full golden aura + animated particle effects + "DOMINATING" badge

```tsx
const totalVotes = Object.values(voteTallies).reduce((a, b) => a + b, 0);
const votePercent = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
const momentum = votePercent > 70 ? 'dominating' : votePercent > 50 ? 'favorite' : votePercent > 30 ? 'rising' : 'normal';
```

- [ ] **Step 2: Add momentum CSS animations**

```css
@keyframes golden-aura {
  0%, 100% { box-shadow: 0 0 20px rgba(255, 170, 0, 0.3); }
  50% { box-shadow: 0 0 50px rgba(255, 170, 0, 0.6), 0 0 80px rgba(255, 170, 0, 0.2); }
}
```

- [ ] **Step 3: Verify — vote for one agent many times, watch visual escalation**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: crowd momentum visual effects on leading agent"
```

---

### Task 9: Victory Ceremony

**Files:**
- Create: `client/src/components/VictoryScreen.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/store/arena.ts`
- Modify: `server/src/sessions/manager.ts`

When a debate ends, show a dramatic winner reveal with vote breakdown.

- [ ] **Step 1: Add debate end data to server response**

In `SessionManager.endDebate()`, emit final results:
```ts
this.io.emit('session_ended', {
  reason,
  results: {
    winner: this.getWinner(),
    voteTallies: this.voteTallies,
    totalMessages: this.recentTranscripts.length,
    duration: Date.now() - (this.session?.startedAt || 0),
    highlights: this.getHighlights(), // top 3 longest/most engaged transcripts
  },
});
```

Add `getWinner()` and `getHighlights()` private methods.

- [ ] **Step 2: Create VictoryScreen component**

Full-screen overlay with:
- Dark backdrop with spotlight effect
- Winner's name + color in huge text with glow
- "WINNER" badge with confetti animation (CSS-based confetti using multiple small divs)
- Vote breakdown bar chart (horizontal bars per agent)
- Stats: debate duration, total messages, total votes
- "NEXT DEBATE IN..." countdown (5 seconds)
- Auto-dismisses when next debate starts

- [ ] **Step 3: Add victory state to store**

```ts
victoryData: VictoryData | null;
```

Listen for `session_ended` with results, set victoryData. Clear when new `session_state` arrives.

- [ ] **Step 4: Wire into App.tsx**

```tsx
{victoryData && <VictoryScreen data={victoryData} />}
```

- [ ] **Step 5: Verify — end debate via API, see victory screen, see auto-restart**

```bash
curl -X POST http://localhost:3001/api/sessions/end
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: victory ceremony with vote breakdown and countdown"
```

---

### Task 10: Topic Auto-Rotation

**Files:**
- Modify: `server/src/sessions/manager.ts`
- Modify: `server/src/orchestration/turn-manager.ts`
- Modify: `client/src/store/arena.ts`
- Modify: `shared/types.ts`

Auto-change the debate topic every 5 minutes. Agents get a system prompt with the new topic and pivot.

- [ ] **Step 1: Add rotation timer to SessionManager**

```ts
private topicRotationTimer: ReturnType<typeof setInterval> | null = null;

// In startDebate(), after turn cycle starts:
this.topicRotationTimer = setInterval(() => {
  this.rotateTopic();
}, 5 * 60 * 1000); // 5 minutes
```

- [ ] **Step 2: Implement rotateTopic()**

```ts
private rotateTopic() {
  if (!this.session || this.session.status !== 'active') return;

  const { getNextTopic } = require('./auto-start.js');
  const newTopic = getNextTopic();
  this.session.topic = newTopic;

  // Notify all agents
  for (const agentId of this.session.agentIds) {
    this.omniagent.sendMessage(
      agentId, 'system',
      `TOPIC CHANGE! The new debate topic is: "${newTopic}". Pivot your arguments immediately. Make a bold opening statement on the new topic.`,
      false
    );
  }

  // Notify viewers
  this.io.emit('topic_changed' as any, { topic: newTopic, timestamp: Date.now() });
  this.io.emit('session_state', this.getSessionState());

  console.log(`  [Topic Rotation] New topic: ${newTopic}`);
}
```

- [ ] **Step 3: Handle on client side**

In `store/arena.ts`, listen for `topic_changed`:
```ts
socket.on('topic_changed', ({ topic }) => {
  set((s) => ({
    session: s.session ? { ...s.session, topic } : null,
  }));
});
```

- [ ] **Step 4: Clean up timer on debate end**

In `endDebate()`: `clearInterval(this.topicRotationTimer);`

- [ ] **Step 5: Verify — start debate, wait 5 min or temporarily reduce to 30s for testing**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: auto-rotate debate topic every 5 minutes"
```

---

## Batch 4: Advanced Features

### Task 11: Judge Mode Debug Panel

**Files:**
- Create: `client/src/components/JudgePanel.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/store/arena.ts`
- Modify: `server/src/socket/handlers.ts`
- Modify: `server/src/sessions/manager.ts`

Toggle-able panel that shows real-time orchestration for hackathon judges.

- [ ] **Step 1: Add judge_mode events on server**

In `SessionManager.wireAgentEvents()`, emit debug events:
```ts
// On every speech_end, also emit debug info:
this.io.emit('debug_event' as any, {
  type: 'speech_end',
  agentId,
  agentName: data.agentName,
  textLength: data.text.length,
  timestamp: Date.now(),
});
```

Similarly emit `debug_event` for: turn_start, injection_processed, relay_sent, challenger events.

- [ ] **Step 2: Add judge mode state to store**

```ts
judgeMode: boolean;
debugEvents: DebugEvent[];
toggleJudgeMode: () => void;
```

Listen for `debug_event` when judge mode is on.

- [ ] **Step 3: Create JudgePanel component**

Collapsible panel (or overlay) showing:
- Real-time event log with timestamps (colored by event type)
- Current turn state machine state
- Agent system prompts (truncated)
- Latency metrics (time between turn_start and speech_end)
- Active rules / injection queue
- Spectator count and Socket.io connection info
- Architecture diagram link

Style: monospace font, dark terminal aesthetic, color-coded events.

- [ ] **Step 4: Add Judge Mode toggle to TopicBanner**

Small "Judge" button/toggle, only shown when `?judge=true` query param is present (or always shown as a discreet icon).

- [ ] **Step 5: Wire into App.tsx**

Show JudgePanel as a bottom drawer or right panel when active.

- [ ] **Step 6: Verify — enable judge mode, watch events flow**

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: Judge Mode debug panel for hackathon evaluators"
```

---

### Task 12: Agent Stats Page

**Files:**
- Create: `client/src/components/AgentStats.tsx`
- Modify: `server/src/sessions/manager.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/db/index.ts`
- Modify: `client/src/components/AgentPanel.tsx`

Click an agent's name to see their stats — wins, debate history, memorable quotes.

- [ ] **Step 1: Add stats tracking to server**

In `SessionManager`, track per-session stats:
```ts
private agentStats: Map<string, {
  totalDebates: number;
  wins: number;
  totalVotes: number;
  totalMessages: number;
  bestQuote: string;
}> = new Map();
```

Update in `endDebate()` based on vote tallies.

- [ ] **Step 2: Add stats API endpoint**

```ts
app.get('/api/agents/:id/stats', (req, res) => {
  const stats = sessionManager.getAgentStats(req.params.id);
  res.json(stats || { error: 'Agent not found' });
});

app.get('/api/agents/stats', (_req, res) => {
  res.json(sessionManager.getAllAgentStats());
});
```

- [ ] **Step 3: Create AgentStats modal component**

Modal overlay showing:
- Agent name, color, personality
- Win/loss record
- Total votes received
- Total messages sent
- Top 3 memorable quotes (longest or most voted-during)
- Debate history list

- [ ] **Step 4: Add click handler to AgentPanel name**

Click agent name → open stats modal.

- [ ] **Step 5: Verify — click agent name, see stats modal**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: agent stats modal with win/loss record and quotes"
```

---

### Task 13: Mobile Responsive Layout

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/index.css`
- Modify: `client/src/components/ChaosPanel.tsx`
- Modify: `client/src/components/AgentPanel.tsx`
- Modify: `client/src/components/TopicBanner.tsx`
- Modify: `client/src/components/SpectatorBar.tsx`
- Modify: `client/src/components/ReactionOverlay.tsx`

- [ ] **Step 1: Stack agent panels vertically on mobile**

```tsx
// In App.tsx agent grid:
<div className={`grid gap-3 ${
  agents.length <= 2
    ? 'grid-cols-1 sm:grid-cols-2'
    : agents.length === 3
    ? 'grid-cols-1 sm:grid-cols-3'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
}`}>
```

- [ ] **Step 2: Convert sidebar to bottom sheet on mobile**

Hide sidebar on mobile (`hidden lg:flex`). Add a floating "Chaos" button that opens a bottom drawer (slide-up panel with framer-motion) containing ChaosPanel.

- [ ] **Step 3: Compact TopicBanner for mobile**

- Truncate long topics with ellipsis
- Hide "Connected" text, show only icon
- Reduce padding

- [ ] **Step 4: Compact SpectatorBar**

Reduce to 2 items on mobile (viewers + timer), hide others.

- [ ] **Step 5: Move reaction bar to be touch-friendly**

Increase button size on mobile (48px min touch target).

- [ ] **Step 6: Verify with Playwright at mobile viewport**

```
mcp__playwright__browser_resize({ width: 375, height: 812 })
mcp__playwright__browser_take_screenshot()
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: mobile-responsive layout with bottom sheet controls"
```

---

## Batch 5: Production & Polish

### Task 14: Share Button + OG Meta Tags

**Files:**
- Create: `client/src/components/ShareButton.tsx`
- Modify: `client/index.html`
- Modify: `client/src/components/TopicBanner.tsx`

- [ ] **Step 1: Add OG meta tags to index.html**

```html
<meta property="og:title" content="A.R.E.N.A. — AI Debate Arena" />
<meta property="og:description" content="Watch AI personalities clash in real-time. Vote, inject chaos, and challenge them directly." />
<meta property="og:image" content="/og-image.png" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

- [ ] **Step 2: Create OG image**

Create a simple SVG or use a screenshot as `client/public/og-image.png` (1200x630px).

- [ ] **Step 3: Create ShareButton component**

Button with Share2 icon from lucide-react. On click:
- Uses `navigator.share()` API if available (mobile)
- Falls back to copying URL to clipboard with toast notification

- [ ] **Step 4: Add to TopicBanner**

Place next to sound toggle.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: share button + OG meta tags for social sharing"
```

---

### Task 15: Ambient Crowd Atmosphere

**Files:**
- Create: `client/src/lib/ambient.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/lib/sounds.ts`

Subtle background ambience that reacts to debate intensity.

- [ ] **Step 1: Create ambient audio engine**

`client/src/lib/ambient.ts`:
- Uses Web Audio API to generate low ambient "crowd murmur" using filtered noise
- Creates a continuous low-frequency rumble with occasional "crowd reaction" swells
- Methods: `start()`, `stop()`, `setIntensity(level: 0-1)` — adjusts volume/frequency based on debate activity
- Respects the global mute state from SoundEngine

Implementation: OscillatorNode with low frequency (40-80Hz) + BiquadFilterNode (lowpass) + GainNode at very low volume (0.02-0.05). When intensity increases (more messages, votes), slightly increase gain and add a mid-frequency hum.

- [ ] **Step 2: Wire intensity to debate activity**

In App.tsx, calculate intensity based on transcript frequency:
```ts
const transcriptRate = transcripts.filter(t => t.timestamp > Date.now() - 10000).length;
const intensity = Math.min(transcriptRate / 5, 1); // 5 messages in 10s = max
ambient.setIntensity(intensity);
```

- [ ] **Step 3: Start/stop with debate lifecycle**

Start ambient when entering arena (splash exit). Stop on mute or page leave.

- [ ] **Step 4: Verify — should be barely noticeable, just adds atmosphere**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ambient crowd atmosphere audio"
```

---

### Task 16: Final Polish Pass

**Files:** Multiple — this is a sweep across all components.

- [ ] **Step 1: Error states**

- Add error boundary around App
- Show "Connection Lost" overlay when disconnected for >5s
- Show "No agents available" state if session creation fails
- Handle WebRTC video init failures gracefully (fall back to placeholder)

- [ ] **Step 2: Loading states**

- Add skeleton loading to AgentPanel while connecting
- Add "Warming up..." state to transcript feed before first message
- Add loading spinner to chaos injection submit

- [ ] **Step 3: Edge cases**

- Handle 0 agents gracefully
- Handle very long agent names (truncate)
- Handle very long transcript messages (word-break)
- Ensure reaction overlay doesn't block chaos panel interaction
- Test with 4-5 agents (grid layout)

- [ ] **Step 4: Performance**

- Add `React.memo` to TranscriptFeed message items
- Limit floating reaction emojis to max 20 simultaneous
- Clean up Web Audio nodes properly on unmount

- [ ] **Step 5: Verify with Playwright — full flow screenshot**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "polish: error states, loading states, edge cases, performance"
```

---

### Task 17: Deploy to Cloud

**Files:**
- Modify: `Dockerfile` (verify)
- Modify: `railway.json` (verify)

- [ ] **Step 1: Install Railway CLI**

```bash
npm i -g @railway/cli
railway login
```

- [ ] **Step 2: Create Railway project**

```bash
cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA"
railway init
```

- [ ] **Step 3: Set environment variables**

```bash
railway variables set OMNIAGENT_API_KEY=<key>
railway variables set PORT=3001
railway variables set NODE_ENV=production
```

- [ ] **Step 4: Deploy**

```bash
railway up
```

- [ ] **Step 5: Verify deployment**

```bash
railway open  # Opens deployed URL
```

Verify: splash screen loads, debate auto-starts, transcripts flow, chaos injection works.

- [ ] **Step 6: Test with real Napster API on deployed instance**

The deployed version should use real API (no USE_MOCK). Verify video avatars appear.

- [ ] **Step 7: Share the URL**

Copy the Railway URL — this is the hackathon submission link.

- [ ] **Step 8: Final commit + push**

```bash
git add -A && git commit -m "chore: deployment config and final adjustments"
git push
```

---

## Execution Order Summary

| Batch | Tasks | Dependencies | Estimated Effort |
|-------|-------|-------------|-----------------|
| 1: Foundation | 1-4 (Git, Auto-start, Sound Toggle, Resilience) | None | 4 tasks |
| 2: Real API | 5-6 (API Test, WebRTC Video) | Batch 1 | 2 tasks |
| 3: Visual | 7-10 (Entrance, Momentum, Victory, Rotation) | Batch 1 | 4 tasks |
| 4: Features | 11-13 (Judge Mode, Stats, Mobile) | Batch 1 | 3 tasks |
| 5: Polish | 14-17 (Share, Ambient, Polish, Deploy) | All above | 4 tasks |

**Batches 2, 3, and 4 can run in parallel** after Batch 1 completes. Batch 5 is the final sweep.

Within each batch, tasks are independent unless noted — they can be dispatched to parallel agents.
