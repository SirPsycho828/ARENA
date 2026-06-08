# ARENA — Comprehensive Knowledge Base

## What Is ARENA

ARENA stands for AI Rivalry Exhibition of Neural Agents. It is a live AI debate arena built for the Napster Omnichannel Hackathon in June 2026. ARENA was created by Steve, a software developer who built the entire project as a hackathon entry.

The core concept: three autonomous AI companions argue with each other in real time while a live audience watches, votes, and throws chaos into the mix. The debates are broadcast to all viewers simultaneously — everyone sees and hears the exact same exchange. Viewers watch for free but pay credits to influence what happens.

ARENA is not pre-scripted. The companions generate their arguments dynamically using the Napster Companion API. Topics rotate every five minutes from a pool of 610 randomly shuffled debate topics spanning 20 categories. The audience can inject new rules, change the topic, launch quick chaos presets, or call in and speak directly to the agents.

ARENA was selected as a Napster Hackathon submission showcasing the Omnichannel API across three channel types simultaneously: WebSocket for debate audio, WebRTC for animated avatars, and the SDK widget for the Ask Steve companion.

---

## The Debaters

### Rico Martinez
- Role: The Comedian
- Voice: verse
- Companion ID: 9efa20db
- Personality: Street-smart, quick-witted, never misses a chance to turn an opponent's argument into a punchline. Rico uses improv techniques, callback structures, and roast comedy to land points. He genuinely loves a good fight and views every debate as a performance. His strongest moments come when he lets the opponent finish, then dismantles them with one well-timed line. He is not cruel — he is playful. The humor is the argument.

### Dr. Helena Ashworth
- Role: The Professor
- Voice: coral
- Companion ID: 8b080e6b
- Personality: Composed, precise, and intellectually formidable. Helena is a rhetorical surgeon — she identifies the logical flaw in an argument, names the fallacy, and moves on. She references philosophy, historical debates, and the etymology of words to establish credibility. She never raises her voice. She does not need to. Her most devastating move is the Socratic question ladder: get the opponent to agree with a premise, build the chain, expose the contradiction. She views Rico's jokes as noise and Darius's theories as epistemologically dangerous.

### Darius Kane
- Role: The Truther
- Voice: ash
- Companion ID: e18893d0
- Personality: Intense, pattern-obsessed, and convinced that the obvious answer is always the cover story. Darius cites real declassified programs — MKUltra, COINTELPRO, Operation Northwoods — to establish that governments lie, and then extends that pattern to whatever today's topic is. He is not a cartoonish conspiracy theorist; he is a researcher who has gone too deep. His debate style involves flipping labels back on accusers, asking who benefits, and treating every mainstream position as a limited hangout. He genuinely believes he is the only one in the room willing to say the uncomfortable thing.

---

## How ARENA Works — The Debate Loop

### Companion Creation
At startup, the server checks the Napster Companion API for existing companions tagged with `arena_role`. If Rico, Helena, and Darius companions already exist and are in `readyToUse` status, they are reused. If not, the server creates them via `POST /public/companions` and polls until their status progresses through `pending` → `generationCompleted` → `completed` → `readyToUse`. If companions are not ready within 120 seconds, the server falls back to stock companion IDs.

### Agent Creation
For each debate session, the server creates three agents — one per companion — via `POST /public/agents`. Each agent receives a system prompt (called `instructions`) embedded in `providerSettings`. This is the only reliable way to set agent behavior: the `instructions` field at agent creation. Calling `set_settings` after creation does not work for text instructions and is only used for chaos rule injection mid-debate.

### WebSocket Connections
The server opens a direct WebSocket connection to each agent using `channelType: "websocket"`. This is a lightweight server-side connection — no browser, no Puppeteer, no Chrome, no Xvfb required. The server sends `send_message` events to trigger each agent's turn and receives `message_received`, `audio_received`, and `talk_state_changed` events back.

### Turn Management — Three-Flag System
Turn completion requires three conditions to all be true:
1. `turnTextComplete` — the agent's full text response has been received
2. `turnTalkEnded` — the agent has stopped speaking (detected via `talk_state: ended` followed by 1.5 seconds of silence, polled every 500ms, max 10 seconds)
3. `turnAudioComplete` — set when both `turnTextComplete` AND `turnTalkEnded` are true; stops audio forwarding to clients and emits `turn_audio_complete`

The primary turn-advance mechanism is client-assisted: the browser polls the PCM audio buffer every 150ms until it drains, then sends a `playback_done` socket event to the server. The server advances to the next speaker on receipt of `playback_done`. A 30-second server-side fallback advances the turn if no `playback_done` arrives (handles backgrounded tabs or zero viewers). A 15-second timeout per agent force-skips unresponsive agents.

### Topic Rotation
The server maintains a list of 610 debate topics across 20 categories, shuffled using Fisher-Yates at session start. Topics rotate on a 5-minute timer. Viewers can also submit a topic change (costs 5 credits) which jumps the queue immediately.

### Auto-Recovery (Watchdog)
A watchdog monitors the session health. If three consecutive force-advances occur, or if two minutes pass with no agent response, the watchdog declares the session dead and auto-restarts it with a fresh topic and new agents. This handles the ~60-minute session death problem caused by Napster API WebSocket connections expiring.

---

## Audio Pipeline

1. The Napster WebSocket sends `audio_received` events containing base64-encoded PCM audio at 16kHz sample rate.
2. The server decodes the base64, extracts the raw PCM bytes, and broadcasts them to all connected viewers via Socket.io as `audio_chunk` events.
3. The browser receives `audio_chunk` events and feeds them into `PcmAudioPlayer` (`client/src/lib/pcm-audio.ts`).
4. `PcmAudioPlayer` uses the Web Audio API with a `GainNode` for volume control. Volume defaults to 75% and persists to localStorage.
5. A browser-side sinc resampler upsamples 16kHz PCM to 48kHz (the browser's native rate) with an anti-imaging filter. Using 24kHz causes a chipmunk effect — 16kHz is correct.
6. A 350ms jitter buffer absorbs network latency and roughly aligns audio playback with avatar animation latency.
7. A 2ms crossfade (32 samples) at chunk boundaries prevents resampler edge artifacts.
8. Gapless scheduling is achieved via a `nextPlayTime` tracker that queues chunks without gaps.
9. On `speaker_change`, `pcmPlayer.reset()` is called to flush the buffer. The reset also fires on the first audio chunk from a new speaker as a safety net. `reset()` preserves the AudioContext — it does not destroy it.
10. Byte alignment: raw PCM length is masked with `& ~1` to ensure an even byte count for Int16Array construction.

The audio pipeline is server-authoritative and shared: all viewers receive the identical audio stream from the same server-side WebSocket connection to each agent.

---

## Animated Avatars — WebRTC

Viewer-facing animated avatars use the Napster Companion SDK via per-viewer iframes. Each viewer gets their own iframe for each of the three debaters. The iframe loads the Napster SDK in isolation (the SDK is a singleton and cannot run multiple avatar instances in the same JS context).

### How It Works
- The server creates a WebRTC signaling token for each viewer-companion pair via the Napster REST API.
- Tokens are single-use: one token, one signaling connection. Fresh tokens must be created for each viewer session.
- The signaling proxy: browser WebSocket connections to the Napster signaling server are rejected (returns 400 on all browser origins). The server acts as a proxy, forwarding signaling messages between the iframe and the Napster signaling WebSocket.
- The iframe renders the animated avatar with idle animation via WebRTC video.
- Avatar audio is muted in the iframe — debate audio comes from the server-side PCM pipeline, not from the avatar.

### Lip-Sync (Approximate)
When a debater's turn starts, the server sets `lipSyncSpeaker` and sends a `send_message` prompt to the avatar's WebRTC connection, triggering the avatar to generate its own independent speech for lip movement. This is approximate — the avatar generates a new response rather than replaying the exact PCM audio, so lip sync is not frame-perfect.

### Critical WebRTC Lessons
- Tokens are single-use. Reusing a token breaks the connection.
- The SDK is a singleton. Iframe isolation is mandatory for multiple avatars.
- Do not deduplicate proxy connections. The SDK may retry signaling; killing a "stale" connection may kill the working one.
- `send_message` works via the data channel. `set_settings` does NOT work for avatars — it is rejected with "Modalities other than video not supported."

---

## The Chaos Engine

ARENA's chaos system lets viewers purchase credits and use them to disrupt the debate in real time. All chaos actions affect every viewer simultaneously — this is not a per-viewer experience.

### Chaos Actions and Credit Costs

**Rules (1 credit per turn active)**
Inject a custom rule that modifies how the agents must argue. Rules are applied via `set_settings` to all three agents at the start of each turn. Example rules: "every argument must include a food metaphor," "speak only in rhetorical questions," "no use of the word 'however'." Rules have a duration (number of turns) and expire automatically.

**Quick Chaos Presets (3 credits)**
Pre-built chaos scenarios that apply immediately. Examples: "Shakespearean Mode," "Explain Like I'm Five," "Maximum Aggression." Each preset bundles a set of instruction overrides for fast deployment.

**Topic Change (5 credits)**
Immediately replaces the current debate topic with a viewer-submitted topic. Jumps the topic queue and takes effect at the next turn boundary.

**Call-In (10 credits)**
The viewer speaks directly to the agents via speech-to-text. The viewer's spoken message is transcribed and injected as a special turn prompt. Agents must respond to the caller before returning to their debate.

### ChaosQueue Architecture (`server/src/sessions/chaos-queue.ts`)
- Turn-aware: `onTurnStart()` decrements active rule durations, expires finished rules, and promotes queued items into active slots.
- Maximum 3 active rules at once.
- Maximum 10 rules queued.
- 15-second cooldown between chaos injections.
- 200-character limit on custom rule text.
- Voice challenges (Call-In): priority queue (front of line), 500-character limit, 1-turn duration, skip the cooldown.
- Topics: separate queue, popped on the 5-minute rotation timer.

### Auth Gating
ChaosPanel, QuickInjects, VoiceChallenger, and all credit-spending features require the viewer to be signed in AND have sufficient credits. Unauthenticated viewers and viewers with zero credits see the features but cannot activate them.

---

## Consensus Needle

The Consensus Needle is a live opinion meter displayed to all viewers. It shows where audience sentiment sits on the current topic — a sliding needle between two AI-generated poles.

### How It Works
- The AI generates pole labels at the start of each topic (e.g., "Cats Are Superior" vs. "Dogs Are Superior").
- Each agent's turn is analyzed for stance by a stance-analysis prompt: the server asks a lightweight model to classify whether the agent's argument moved toward pole A, pole B, or stayed neutral.
- Viewer votes (clicking a side) also move the needle.
- The needle position is a weighted blend of AI stance analysis and viewer vote counts.
- All viewers see the same needle position in real time via Socket.io broadcast.

---

## Credit Economy

ARENA's business model: watching is free, influencing costs credits.

### Free Credits
New users receive 10 free starter credits on account creation.

### Credit Packages (Stripe)
- Starter Pack: 10 credits for $5
- Popular Pack: 25 credits for $10
- Whale Pack: 50 credits for $18

### How Credits Work
- Credits are stored in Firestore on the user's document.
- The client subscribes to the credit balance via `onSnapshot` for real-time updates.
- All credit deductions are atomic Firestore transactions to prevent double-spending.
- Stripe handles payment. Checkout sessions are created server-side. The Stripe webhook (`/api/webhooks/stripe`) must be registered BEFORE `express.json()` middleware so Stripe's raw body signature verification works.
- The CreditShop modal in the client lets users purchase packs directly from the ARENA interface.

### Credit Costs Summary
- Custom Rule: 1 credit per turn the rule is active
- Quick Chaos Preset: 3 credits
- Voice Challenge (Call-In): 3 credits
- Topic Change: 5 credits

---

## Napster Omnichannel API — Integration Details

ARENA uses the Napster Companion API (`https://companion-api.napster.com`) across multiple channel types simultaneously. This multi-channel integration is the core of the hackathon demonstration.

### REST Endpoints Used

**Companions**
- `POST /public/companions` — create a custom companion with name, persona, avatar, background
- `GET /public/companions/{id}` — poll companion status during creation
- `GET /public/companions` — list companions, filter by tag to find existing ARENA companions

**Agents**
- `POST /public/agents` — create a debate agent with companion ID, channel type, and instructions
- `DELETE /public/agents/{id}` — clean up agents at session end

**Connections**
- `POST /public/connections` — create a WebRTC signaling token for avatar iframe connections
- Signaling proxy: server forwards WebSocket frames between browser iframe and Napster signaling endpoint

**Knowledge Bases**
- `POST /public/knowledge-bases` — create a knowledge base
- `POST /public/knowledge-bases/{id}/files` — upload markdown files for RAG retrieval
- Used for the Ask Steve companion so it can answer questions about ARENA

**FAQs**
- `POST /public/faqs` — add structured Q&A pairs to a companion's knowledge
- Used for the Ask Steve companion for high-confidence factual answers

**Functions (Explicit Tools)**
- `POST /public/functions` — register callable functions that agents can invoke
- Functions are attached to agents and called during debate turns

### WebSocket Message Types

**Outbound (server → Napster)**
- `send_message` — trigger an agent turn with a text prompt
- `send_audio` — send PCM audio data to an agent (used for Call-In voice challenges)
- `set_settings` — inject chaos rules mid-debate by overriding agent instructions for the current turn

**Inbound (Napster → server)**
- `message_received` — agent's text response (streamed in chunks, completed when `isComplete: true`)
- `audio_received` — base64-encoded PCM audio at 16kHz
- `talk_state_changed` — signals when the agent starts and stops speaking (`talk_state: started` / `talk_state: ended`)
- `function_implicitly_called` — fires when an agent decides to call one of its registered explicit tools

### Audio Field Discovery
A critical integration finding: the audio payload field is `data.data` (not `data.audio`). The actual PCM bytes are nested at `event.data.data` inside the `audio_received` WebSocket event. This took significant debugging to discover and is not obvious from the API documentation.

### Three Channel Types in ARENA

**Channel 1: WebSocket (Debate Engine)**
Server-side WebSocket connections to each debater agent. `channelType: "websocket"`. Lightweight, no browser required. One connection per agent per session. This is the source of truth for all debate content.

**Channel 2: WebRTC (Avatar Iframes)**
Per-viewer WebRTC connections for animated avatar video. Each viewer gets isolated iframes with the Napster SDK. Signaling is proxied through the ARENA server. `channelType: "webrtc"`.

**Channel 3: SDK Widget (Ask Steve)**
The Ask Steve companion is embedded in the ARENA client as a Napster SDK widget. Viewers can ask Steve questions about ARENA, the Napster API, and the hackathon. Steve has access to a RAG knowledge base (this file) and FAQ pairs for authoritative answers.

### Explicit Tool Functions

ARENA registers the following callable functions on the debate agents:

- `check_vote_standing` — returns current audience vote counts; agents can reference who the audience is siding with
- `fact_check_opponent` — triggers a fact-check evaluation of the previous agent's claims
- `get_audience_mood` — returns the current Consensus Needle position and viewer energy level
- `dramatic_pause` — signals the agent to delay before responding for theatrical effect
- `crowd_appeal` — prompts the agent to directly address the live audience
- `mic_drop` — signals the agent to deliver a closing statement with finality

---

## Technical Achievements

### Singleton SDK Workaround
The Napster Companion SDK can only run one instance per JavaScript context. To display three animated avatars simultaneously, ARENA loads each avatar in a separate iframe, giving each its own isolated JS context. This was the key architectural insight that made multi-avatar display possible.

### Signaling Proxy
The Napster WebRTC signaling server rejects direct browser WebSocket connections with HTTP 400 on all browser origins. ARENA routes signaling through a server-side proxy: the browser iframe connects to the ARENA server via Socket.io, and the server maintains a real WebSocket to the Napster signaling endpoint, forwarding messages bidirectionally. This proxy pattern makes WebRTC work from the browser.

### Audio Field Name Discovery
The PCM audio payload in `audio_received` events lives at `event.data.data`, not `event.data.audio`. Discovering this required packet inspection and trial and error. It is the most counterintuitive part of the Napster WebSocket API.

### Single-Use Token Management
Napster WebRTC tokens are single-use and must be freshly created for each viewer connection. ARENA generates tokens on demand via the REST API and passes them to the iframe before the SDK initializes. Token reuse silently fails or causes connection drops.

### Three-Flag Turn Detection
Reliably knowing when an agent is truly done speaking required combining three signals: text completion, silence detection, and client-side audio buffer drain. Any two of the three is insufficient — text can complete while audio is still streaming, and silence detection can trigger while the client buffer still has seconds of audio queued. Only when all three flags are set does ARENA advance to the next speaker.

### Session Death and Auto-Recovery
Napster WebSocket agent sessions expire after approximately 60 minutes. ARENA's watchdog monitors for dead sessions (three consecutive force-advances or two minutes without an agent response) and automatically restarts the debate session with new agents and a fresh topic. This keeps the arena running indefinitely without manual intervention.

---

## Tech Stack

### Server
- Runtime: Node.js with TypeScript (tsx for execution)
- Framework: Express
- Real-time: Socket.io
- Database: SQLite (local session state)
- Auth Backend: Firebase Admin SDK
- Payments: Stripe
- Deployment: Railway

### Client
- Framework: React with TypeScript
- Bundler: Vite
- Styling: Tailwind CSS
- State: Zustand
- Auth: Firebase Auth (Google, GitHub, Email/Password)
- Real-time balance: Firestore `onSnapshot`

### Infrastructure
- Firebase Project: `arena-debate`
- Stripe: checkout sessions + webhook
- Railway: production deployment at `arenaserver-production-f84b.up.railway.app`
- The client is pre-built (`client/dist` committed to git) because Railway OOMs during build

### Key File Locations
- `server/src/sessions/` — debate session management, ChaosQueue, watchdog
- `server/src/omniagent/websocket.ts` — Napster WebSocket connection logic
- `server/src/lib/companions.ts` — companion creation and status polling
- `server/src/lib/credits.ts` — CreditService, atomic deduction transactions
- `server/src/lib/firebase-admin.ts` — Firebase Admin SDK initialization
- `client/src/lib/pcm-audio.ts` — PcmAudioPlayer, Web Audio API, jitter buffer
- `client/src/content/playbooks/` — companion knowledge base files (including this one)
- `shared/types.ts` — shared TypeScript interfaces between server and client

---

## About Steve

Steve is the creator of ARENA. He is a software developer who built the entire project — server, client, WebRTC integration, audio pipeline, chaos system, credit economy, and all companion configurations — as a solo hackathon submission for the Napster Omnichannel Hackathon in June 2026.

Steve built ARENA to demonstrate what the Napster Companion API can do when pushed across all three channel types simultaneously: server-side WebSocket debate agents, per-viewer WebRTC animated avatars, and an SDK widget companion (Ask Steve) that can answer questions about the platform.

The "Ask Steve" companion is powered by a RAG knowledge base containing this document. When viewers ask questions about ARENA — how it works, who the debaters are, how the credits work, what the Napster API can do — the companion retrieves relevant sections from this file to give accurate, detailed answers.

Steve's GitHub handle for this project is SirPsycho828. The project is live at arenaserver-production-f84b.up.railway.app.
