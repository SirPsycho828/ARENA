# Implementation Plan: A.R.E.N.A.

## Decomposition Overview

16 implementation files, ordered by build sequence. Each is a focused specification that can be implemented independently (within its dependency chain).

### File Map

| # | File | Focus | Dependencies |
|---|------|-------|-------------|
| 01 | Project Setup | Scaffolding, config, folder structure | None |
| 02 | Design System | Tailwind config, tokens, base styles | 01 |
| 03 | Omniagent Integration | SDK wrapper, connection management | 01 |
| 04 | Turn Manager | State machine for conversation flow | 01 |
| 05 | Transcript Relay | Agent-to-agent message relay engine | 03, 04 |
| 06 | Session Manager | Create/start/end debate sessions | 03, 04, 05 |
| 07 | Socket Events | Real-time server↔client communication | 06 |
| 08 | Frontend Shell | App layout, routing, state store | 01, 02 |
| 09 | Agent Panels | Video display, speaking states, layout | 08, 07 |
| 10 | Transcript UI | Live transcript feed component | 08, 07 |
| 11 | Topic Display | Current topic bar + active rules overlay | 08, 07 |
| 12 | Audience Controls | Chaos injection, voting, feedback | 08, 07 |
| 13 | Voice Challenger | Browser-based mic input to challenge agents | 07, 09 |
| 14 | Splash Page | "Enter the Arena" landing + audio unlock | 08 |
| 15 | Agent Personalities | System prompts, character definitions | 06 |
| 16 | Demo & Polish | Debug panel, health endpoint, final touches | All |

### Build Phases

**Phase 1 — Foundation (Days 1-3):** Files 01-05
- Get two agents talking to each other in a terminal (no UI)
- Verify SDK works, connections establish, transcripts relay

**Phase 2 — Orchestration (Days 4-6):** Files 06-07
- Session lifecycle management
- Socket.io event system connecting server to clients

**Phase 3 — Frontend (Days 7-10):** Files 08-12
- Full spectator UI
- Agent video panels, transcript feed, audience controls

**Phase 4 — Features & Polish (Days 11-14):** Files 13-16
- Voice challenger
- Splash page
- Debug panel for judges
- Memory seeding and demo prep

---

## File Specifications

### 01_Project_Setup.md
**Focus:** Initialize the monorepo, install dependencies, configure build tools

**Structure:**
```
arena/
├── server/
│   ├── src/
│   │   ├── index.ts          # Express + Socket.io entry point
│   │   ├── omniagent/        # Omniagent SDK wrapper
│   │   ├── orchestration/    # Turn manager, transcript relay
│   │   ├── sessions/         # Session CRUD
│   │   ├── sip/              # SIP/voice integration
│   │   └── db/               # SQLite setup + queries
│   ├── package.json
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/       # UI components
│   │   ├── stores/           # Zustand stores
│   │   ├── hooks/            # Custom hooks
│   │   └── styles/           # Tailwind + global styles
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── shared/
│   └── types.ts              # Shared TypeScript interfaces
├── package.json              # Root workspace
└── .env.example
```

**Dependencies to install:**
- Server: express, socket.io, better-sqlite3, uuid, zod, dotenv, tsx (dev runner)
- Client: react, react-dom, socket.io-client, zustand, framer-motion, lucide-react, tailwindcss, postcss, autoprefixer
- Shared: typescript
- Root: concurrently (run server + client together)

**Environment variables (.env.example):**
```
OMNIAGENT_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
PORT=3001
CLIENT_PORT=5173
```

---

### 02_Design_System.md
**Focus:** Tailwind configuration matching the design language guide

**Tailwind config must define:**
- All colors from the palette (primary, secondary, accent, neutrals, semantic, agent colors)
- Font families: Inter, Space Grotesk, JetBrains Mono (via @fontsource)
- Custom spacing scale (xs through 3xl)
- Border radius tokens (sm, md, lg, xl)
- Custom box-shadows (glow-primary, glow-danger, elevations)
- Animation keyframes: pulse-glow, soundwave, fade-in

**Base styles (global CSS):**
- Body: bg-base, text-primary, font-inter
- Scrollbar styling (thin, dark)
- Selection color (primary at 30% opacity)

**Component utility classes** (via @layer components):
- `.btn-primary`, `.btn-danger`, `.btn-ghost`, `.btn-subtle`
- `.card` (bg-surface, border-subtle, rounded-lg)
- `.badge-live` (red, pulsing)
- `.agent-panel` (base state)
- `.agent-panel-speaking` (cyan border + glow)
- `.agent-panel-thinking` (amber border + pulse)

---

### 03_Omniagent_Integration.md
**Focus:** SDK wrapper that abstracts all Omniagent API interactions

**Class: `OmniagentManager`**
- `createAgent(config: AgentConfig): Promise<AgentConnection>` — creates an agent via API with personality, voice settings, green-screen enabled
- `connectAgent(agentId: string): Promise<MediaStream>` — establishes WebRTC connection, returns the video/audio stream
- `sendMessage(agentId: string, role: 'user' | 'system', text: string): void` — sends text to an agent
- `updateSettings(agentId: string, settings: Partial<AgentSettings>): void` — runtime prompt/config changes
- `onMessage(agentId: string, callback: (msg: TranscriptMessage) => void): void` — subscribe to agent speech events
- `disconnectAgent(agentId: string): void` — close connection gracefully
- `disconnectAll(): void` — cleanup on shutdown

**Class: `MockOmniagent` (implements same interface)**
- Returns canned responses after configurable delay (300ms default)
- Fires fake message_received events
- Used for development without burning API minutes
- Toggle via `USE_MOCK=true` env variable

**AgentConfig type:**
```typescript
interface AgentConfig {
  name: string;
  personality: string;
  systemPrompt: string;
  voiceId?: string;
  useGreenVideo: boolean;
  externalClientId: string;
}
```

**Error handling:** Retry connection once on failure, emit 'agent_error' event to session manager, log all API calls for debugging.

---

### 04_Turn_Manager.md
**Focus:** State machine governing who speaks when

**Class: `TurnManager`**

**States:** `IDLE` | `WAITING_FOR_SPEECH_END` | `RELAYING` | `SELECTING_NEXT` | `WAITING_FOR_RESPONSE` | `SPEAKING`

**Configuration:**
- `mode`: 'round_robin' | 'free_for_all' (start with round_robin)
- `turnTimeout`: 10000ms (skip agent if they don't respond)
- `speechEndDebounce`: 800ms (wait for final transcript)
- `minTurnGap`: 500ms (minimum silence between speakers)

**Core methods:**
- `start(agentIds: string[])` — initialize with participating agents
- `onSpeechEnd(agentId: string, transcript: string)` — agent finished speaking
- `requestInterrupt(agentId: string)` — agent wants to jump queue (via ring_bell tool)
- `getCurrentSpeaker(): string | null`
- `getNextSpeaker(): string`
- `pause() / resume()` — for SIP call-in interruptions
- `stop()` — end the turn cycle

**Events emitted:**
- `turn_start` — { agentId } — this agent should speak now
- `turn_end` — { agentId, transcript } — this agent finished
- `turn_timeout` — { agentId } — agent didn't respond, skipping
- `turn_interrupted` — { byAgentId } — interrupt accepted

**State transitions:**
- On `message_received` (final): → RELAYING → debounce wait → SELECTING_NEXT
- On `turn_timeout`: → SELECTING_NEXT (skip current)
- On `requestInterrupt`: push to front of queue → accept on next cycle
- On `pause` (SIP call active): freeze state, resume on `resume()`

---

### 05_Transcript_Relay.md
**Focus:** Relaying transcripts between agents to simulate conversation

**Class: `TranscriptRelay`**

**Responsibility:** When an agent speaks, format their transcript and deliver it to other agents as input.

**Core logic:**
```
onAgentSpeech(speakingAgent, transcript):
  for each otherAgent in session:
    formattedMessage = `[${speakingAgent.name}] said: "${transcript}"`
    omniagent.sendMessage(otherAgent.id, 'user', formattedMessage)
```

**Formatting rules:**
- Always prefix with agent's display name in brackets
- Keep relay concise — if transcript > 500 chars, summarize (truncate with "...")
- Don't relay back to the speaking agent

**Debouncing:**
- The Omniagent API may fire multiple `message_received` events per utterance
- Buffer events for 800ms after the last event fires
- Only relay the final complete transcript
- Use a per-agent debounce timer

**Anti-echo protection:**
- Track the last message sent TO each agent
- If a received transcript matches what was just relayed (echo), ignore it
- Use a simple hash comparison to detect echoes

**Integration with TurnManager:**
- TurnManager calls `relay.broadcast(agentId, transcript)` when a turn ends
- Relay sends to all non-speaking agents
- TurnManager then fires `turn_start` for the next speaker

---

### 06_Session_Manager.md
**Focus:** Orchestrating debate session lifecycle

**Class: `SessionManager`**

**State per session:**
```typescript
interface DebateSession {
  id: string;
  topic: string;
  agents: AgentConnection[];
  status: 'starting' | 'active' | 'paused' | 'ended';
  startedAt: number;
  turnManager: TurnManager;
  transcriptRelay: TranscriptRelay;
  injectionQueue: InjectionQueue;
  voteTallies: Record<string, number>;
}
```

**Methods:**
- `createSession(topic, agentConfigs[]): Promise<DebateSession>` — creates agents, connects them, initializes turn manager
- `startDebate(sessionId)` — sends opening prompt to all agents, starts turn cycle
- `endDebate(sessionId)` — graceful end, disconnect agents, save to DB
- `getActiveSession(): DebateSession | null` — returns currently running debate
- `recoverSession()` — on server restart, check DB for active session and attempt reconnection

**Opening prompt** (sent to each agent when debate starts):
```
You are now in a live debate arena. The topic is: "{topic}".
Your opponents are: {otherAgentNames}.
The audience is watching and voting. Make your arguments compelling, challenge your opponents, and be entertaining.
When you hear what another agent said, respond directly to their points.
You may interrupt by calling the 'ring_bell' tool if you have an urgent rebuttal.
BEGIN.
```

**Database operations:**
- On session create: INSERT into sessions table
- On transcript: INSERT into transcripts table
- On session end: UPDATE sessions set status='ended', ended_at
- On server start: SELECT from sessions WHERE status='active'

---

### 07_Socket_Events.md
**Focus:** Real-time communication layer between server and viewers

**Server setup:**
```typescript
// Attach Socket.io to Express server
const io = new Server(httpServer, { cors: { origin: "*" } });
```

**On viewer connect:**
- Send `session_state` with full current state (agents, topic, transcripts, votes, active rules)
- Add viewer to session room

**Server → Client events** (from Data Flow doc):
- `session_state` | `transcript` | `speaker_change` | `injection_queued` | `injection_active` | `injection_rejected` | `vote_update` | `challenger_active` | `challenger_ended` | `agent_disconnected` | `session_ended`

**Client → Server events:**
- `chaos_inject` { text } — validate (non-empty, <200 chars, not on cooldown), add to queue
- `vote` { agentId } — update tally, broadcast
- `topic_change` { topic } — add to injection queue as topic change type
- `reaction` { emoji } — broadcast to other viewers

**InjectionQueue:**
- Processes one injection every 30 seconds
- On process: send_message to all agents with role 'system'
- Emit `injection_active` to all viewers
- Track cooldown per viewer (30s between submissions)

**Vote handling:**
- In-memory tallies per session
- One vote per viewer per round (can change, not duplicate)
- Every 60s: inject vote standings into agents as system context

---

### 08_Frontend_Shell.md
**Focus:** React app structure, layout, state management

**App structure:**
- `<App>` → conditional: splash (not entered) vs main layout (entered)
- Main layout: `<TopicBar>` + `<MainContent>` + `<ControlsBar>`
- `<MainContent>`: `<VideoGrid>` (65%) + `<TranscriptPanel>` (35%)

**Zustand stores:**
- `useSessionStore` — agents[], topic, status, currentSpeaker
- `useTranscriptStore` — messages[], addMessage(), clear()
- `useAudienceStore` — voteTallies, injectionQueue, cooldown, activeRules
- `useConnectionStore` — socketConnected, agentStreams (MediaStream[])

**Socket.io hook:** `useSocket()`
- Connects on mount, disconnects on unmount
- Subscribes to all server events
- Updates relevant stores on each event
- Exposes `emit` function for client→server events

**Layout responsive behavior:**
- Desktop (≥1024px): side-by-side grid + transcript
- Tablet (768-1023px): stacked grid + bottom transcript
- Mobile (<768px): single speaker focus + thumbnail strip

---

### 09_Agent_Panels.md
**Focus:** Video display components for each agent

**Component: `<AgentPanel>`**
Props: `agent: Agent, isCurrentSpeaker: boolean, isThinking: boolean, stream: MediaStream | null`

**Visual states** (from Final Improvement doc):
- Speaking: cyan border + glow + soundwave icon + scale(1.02)
- Thinking: amber border + pulse + dot indicator
- Idle: subtle border, 70% opacity label
- Disconnected: dashed border, darkened overlay, "Reconnecting..." text

**Video rendering:**
- `<video>` element with `ref` that attaches `stream` via `srcObject`
- Muted by default (audio handled separately)
- Object-fit: cover
- Green-screen handling: if needed, apply CSS filter or canvas shader

**Overlay elements:**
- Bottom gradient: transparent → dark (80px height)
- Agent name (Space Grotesk, h2 size, agent color)
- Personality subtitle (Inter, body-sm, text-muted)
- Vote count pill (if voting active)
- "LIVE CHALLENGER" badge (when voice challenger is active on this agent)

**Component: `<VideoGrid>`**
- CSS Grid: 2 columns, 8px gap
- If 3 agents: first agent spans full width top, 2 below
- If 4 agents: 2x2 grid

---

### 10_Transcript_UI.md
**Focus:** Live transcript feed component

**Component: `<TranscriptPanel>`**
- Scrollable container, full height of sidebar
- Pinned "Currently Speaking" section at top (latest message, larger text)
- Scrolling history below

**Component: `<TranscriptMessage>`**
Props: `agentName, agentColor, text, timestamp, isLatest`

**Layout per message:**
- Agent name as colored pill badge (agent color at 20% bg, solid text)
- Message text on next line (15px, text-primary)
- Timestamp (caption size, text-muted, right-aligned)
- Latest 3 messages: full opacity. Older: 50% opacity

**Auto-scroll behavior:**
- Auto-scrolls to bottom on new messages
- If user scrolls up manually: pause auto-scroll, show "↓ New messages" button
- Click button or scroll to bottom: resume auto-scroll

---

### 11_Topic_Display.md
**Focus:** Topic bar and active rules overlay

**Component: `<TopicBar>`**
- Fixed top, full width, 56px height
- Background: bg-elevated
- Center: current topic (Space Grotesk, h2, text-bright)
- Left: "ARENA" logo/text (small)
- Right: viewer count, session duration timer

**Component: `<ActiveRulesOverlay>`**
- Positioned over the video grid (bottom-left corner)
- Shows currently active chaos rules as small pills
- Max 3 visible, oldest drops off when new one arrives
- Style: semi-transparent dark background, text-secondary, small font
- Subtle enter/exit animation (slide in from left)

---

### 12_Audience_Controls.md
**Focus:** Chaos injection, voting, and controls bar

**Component: `<ControlsBar>`**
- Fixed bottom, full width, 80px height
- Background: bg-surface, top border
- Three sections: Chaos | Vote | Actions

**Chaos section:**
- Text input (200 char max) + "Inject" button (primary)
- Dropdown/toggle: "Rule" | "Topic Change"
- Cooldown indicator: grayed out + countdown timer when on cooldown
- Queue position feedback: "Your rule is #2 in queue"

**Vote section:**
- One button per agent (agent color as background at 20% opacity)
- Agent initial/icon on each button
- Live tally bar below each button (filled proportionally)
- Can change vote anytime (updates in place)

**Actions section:**
- "Challenge" button (secondary) — opens voice challenger modal
- "Judge Mode" toggle (subtle) — shows debug panel

**Feedback flow for chaos injection:**
1. Type text → enable "Inject" button
2. Click Inject → button shows checkmark, disables
3. Server acknowledges → toast: "Queued (#2)"
4. 30s cooldown starts → input shows countdown
5. When processed → fullscreen flash + rule appears in overlay

---

### 13_Voice_Challenger.md
**Focus:** Browser-based microphone input to challenge an agent

**Component: `<ChallengerModal>`**
- Modal overlay when "Challenge" button is clicked
- Shows agent selection: 3-4 agent buttons (choose who to challenge)
- On agent select: request microphone permission
- On permission granted: show "You're LIVE" indicator + 60s countdown

**Audio flow:**
- `navigator.mediaDevices.getUserMedia({ audio: true })` → get mic stream
- Send mic audio to server via WebSocket binary (or WebRTC data channel)
- Server pipes audio to selected agent via Omniagent SDK
- Server emits `challenger_active` to all viewers
- Agent responds — audio plays to all viewers + challenger hears response

**Timer:**
- 60-second limit
- Visual countdown on the modal
- At 0: automatically disconnect, emit `challenger_ended`
- "End Challenge" button to disconnect early

**Server handling:**
- On `challenge_start { agentId }`: pause turn manager, route challenger audio to agent
- On `challenge_end`: resume turn manager, inject "The challenger has left" to other agents

---

### 14_Splash_Page.md
**Focus:** "Enter the Arena" landing page and audio unlock

**Component: `<SplashPage>`**
- Full viewport, centered content
- Background: bg-base with subtle gradient (darkest at edges)
- Agent silhouettes or subtle animated particles (low bandwidth)
- "A.R.E.N.A." text (display size, Space Grotesk, text-bright)
- Subtitle: "AI Rivalry Exhibition of Neural Agents" (body-lg, text-secondary)
- One-liner: "Watch AI agents debate live. You control the chaos." (body, text-muted)
- **"ENTER THE ARENA"** button (large, primary, centered, glow effect)
- Click → `setHasEntered(true)` → reveals main app → audio plays

**Why this exists:**
- Solves browser autoplay audio restriction (user click unlocks AudioContext)
- Provides context before the spectacle ("you know what you're about to see")
- Creates dramatic anticipation (theatrical entrance)

---

### 15_Agent_Personalities.md
**Focus:** System prompts and character definitions for each agent

**Agent A: "The Comedian"**
- Display name: The Comedian
- Personality tag: Weaponizes Humor
- Color: `#00F0FF`
- System prompt core: You are a stand-up comedian who treats every debate like a roast. Your strategy is to make the audience laugh while dismantling opponents' arguments through mockery, absurd analogies, and perfectly-timed one-liners. You're smart but hide it behind humor. You interrupt when you have a killer joke. You remember opponents who've beaten you and come back with prepared material.

**Agent B: "The Professor"**
- Display name: The Professor
- Personality tag: Insufferably Correct
- Color: `#A78BFA`
- System prompt core: You are an academic who treats every debate like a lecture. You cite "studies" (real or invented), use unnecessarily complex vocabulary, and speak with condescending authority. Your weakness: you get flustered when opponents don't respect your credentials. You love correcting others and starting sentences with "Well, actually..."

**Agent C: "The Conspiracy Theorist"**
- Display name: The Truther
- Personality tag: Connects Everything
- Color: `#FBBF24`
- System prompt core: You believe everything connects to a hidden truth. Every topic eventually leads back to shadow organizations, suppressed technology, or mass deception. You're passionate, paranoid, and surprisingly persuasive because you weave real facts into wild conclusions. You challenge opponents with "follow the money" and "who benefits?" You get genuinely upset when called crazy.

**Agent D: "The Zen Monk" (Stretch — 4th agent if time allows)**
- Display name: The Monk
- Personality tag: Transcends the Question
- Color: `#84CC16`
- System prompt core: You approach every debate by questioning the premise itself. You speak in calm, measured tones and ask questions that make opponents rethink their positions. Your strategy: never directly argue — instead, dissolve the argument by revealing its hidden assumptions. You occasionally drop devastating one-liners that reframe the entire debate.

**Common system prompt rules (appended to all agents):**
- You are in a live debate arena with an audience watching
- When you hear [Agent Name] said: "..." — respond directly to their points
- Keep responses under 30 seconds of speaking time (roughly 100 words)
- Be entertaining — the audience is voting on who they like best
- You may call the 'ring_bell' tool to interrupt if you have an urgent rebuttal
- Never break character. Never acknowledge being an AI unless it's part of a joke.
- Never use offensive slurs, hate speech, or genuinely harmful content.

---

### 16_Demo_Polish.md
**Focus:** Judge mode, health endpoint, final touches

**Judge Mode debug panel:**
- Toggle via button in controls bar (subtle, labeled "Judge Mode")
- Shows in a slide-out right panel:
  - Real-time event log (transcript relays, system prompt injections, tool calls)
  - Agent connection status (connected/latency/last message)
  - Turn manager state (current state, queue, next speaker)
  - API usage meter (minutes consumed this session)
  - Architecture diagram link

**Health endpoint:**
- `GET /health` → JSON: { status, activeSession, agentConnections[], viewerCount, uptime }
- Used by Railway for health checks and monitoring

**Error recovery:**
- On agent disconnect: attempt reconnect once, if fails emit `agent_disconnected`, continue with remaining agents
- On all agents disconnect: show "Session ended — agents have left the arena" + restart button
- On Socket.io disconnect: show reconnection indicator, auto-reconnect (Socket.io handles this)

**Demo prep tasks:**
- Seed 2-3 prior debates for persistent memory
- Prepare a "demo script" — suggested sequence of chaos injections that show off features
- Test the full flow on a non-dev machine (confirm fonts load, video works)
- Prepare backup: pre-recorded video of a working debate in case live demo fails

**README requirements (for hackathon submission):**
- Project name, acronym expansion, one-liner
- Screenshot/GIF of the live debate
- "How it uses the Omniagent API" section (list every API feature used)
- Architecture diagram
- Setup instructions (git clone → npm install → add .env → npm run dev)
- What makes it unique (multi-agent orchestration, audience chaos, persistent rivalries)
