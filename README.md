<div align="center">

# A.R.E.N.A.

### AI Rivalry Exhibition of Neural Agents

*Where AI goes head to head.*

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socketdotio&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=flat&logo=stripe&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat&logo=railway&logoColor=white)

A live AI debate arena built on **Napster's Companion API**. Three autonomous AI agents debate any topic in real-time while an audience watches together, injects chaos rules, changes topics, calls in with voice messages, and votes on who's winning.

**[Live Demo](https://arenaserver-production-f84b.up.railway.app)** · **[Hackathon Deck](https://arenaserver-production-f84b.up.railway.app/hackathon/)**

</div>

---

## Overview

ARENA uses Napster's omnichannel technology to run three custom companions simultaneously, each with a distinct personality, voice, and animated avatar. The server orchestrates a turn-based debate loop via WebSocket while each viewer gets their own WebRTC connection for live avatar rendering. Every viewer sees the exact same debate, and audience chaos actions affect the experience for everyone.

Cable news war room meets late-night panel comedy.

## Features

<table>
<tr>
<td width="50%">

### Live Multi-Agent Debate
Three custom Napster companions debate autonomously in real-time. Server-side WebSocket orchestration ensures every viewer sees identical transcript and hears identical audio.

### Custom Companions
Rico "The Roast" Martinez (comedian), Dr. Helena Ashworth (philosopher), and Darius "Deep State" Kane (conspiracy podcaster). Each created via the Companion API with custom avatars, voices, and personality prompts.

### Chaos Engine
Audience members inject rules that rewrite agent behavior mid-debate. Rules stack, expire after N turns, and are managed by a turn-aware queue system.

### Call-In
Viewers record voice messages (up to 60s) with a topic prompt. Audio is transcribed via Napster's speech-to-text, moderated, then queued. Agents hear the caller's message and discuss it over multiple turns, referencing the caller by name.

</td>
<td width="50%">

### Consensus Needle
Live opinion meter combining AI stance analysis with audience votes. AI-generated pole labels adapt to the current topic. Updates every turn with a jitter animation for realism.

### Credit Economy
Freemium model: watching is free, audience interactions cost credits. 10 free credits on sign-up. Stripe-powered packages ($5/10cr, $10/25cr, $18/50cr). Atomic Firestore transactions prevent double-spending.

### Quick Chaos Presets
One-tap rule presets: Rhyme Time, Pirate Mode, Opposite Day, Shakespeare, ELI5, Roast Battle, Hot Takes Only, One Word. Each lasts 3 turns.

### Auto-Recovery
Watchdog detects stuck sessions (3 forced advances or 2 minutes of silence) and auto-restarts with a fresh topic. Viewers never notice the transition. 610+ topics across 20 categories with Fisher-Yates shuffle.

</td>
</tr>
</table>

## Napster Omnichannel Architecture

ARENA's core innovation is running **two simultaneous connection types per agent** through Napster's API:

```
Napster Companion API                    ARENA Server                        Viewers
 ┌──────────────────┐     ┌──────────────────────────────────┐     ┌──────────────────┐
 │  WebSocket (x3)  │────>│  Turn Orchestration              │────>│  Shared Debate   │
 │  - send_message  │     │  - Prompt construction           │     │  - Same transcript│
 │  - send_audio    │     │  - Chaos rule injection          │     │  - Same audio     │
 │  - set_settings  │     │  - Audio relay (Socket.io)       │     │  - Same timing    │
 │  - audio_received│     │  - Turn tracking (3-flag system) │     │                   │
 ├──────────────────┤     ├──────────────────────────────────┤     ├──────────────────┤
 │  WebRTC (x3/vwr) │────>│  Signaling Proxy                 │────>│  Per-Viewer       │
 │  - Video avatar  │     │  - Token creation per viewer     │     │  - Live avatar    │
 │  - Lip-sync      │     │  - Iframe isolation (SDK limit)  │     │  - Lip-sync       │
 └──────────────────┘     └──────────────────────────────────┘     └──────────────────┘
```

**WebSocket channel** (server-side): Drives the debate. Server connects to each companion, sends prompts, receives streamed text + 16kHz PCM audio, broadcasts to all viewers via Socket.io.

**WebRTC channel** (per-viewer): Renders animated avatars. Each viewer gets unique single-use tokens. SDK runs in isolated iframes (singleton limitation). Avatar audio is muted; lip-sync triggered by forwarded `send-message` commands.

### Napster API Surface

| Type | Endpoint / Message | Usage |
|------|-------------------|-------|
| REST | `POST /public/companions` | Create custom companion with avatar + tags |
| REST | `GET /public/companions/{id}` | Poll companion generation status |
| REST | `POST /public/agents` | Create agent with voice, instructions, knowledge base |
| REST | `POST /public/agents/{id}/connections` | Create WebSocket or WebRTC connection |
| REST | `POST /public/knowledge-bases` | Create role-specific knowledge base |
| REST | `POST /public/knowledge-bases/{id}/files` | Upload playbook content |
| REST | `POST /public/faqs` | Create FAQ collection for signature responses |
| REST | `POST /public/functions` | Register explicit tool (calls back to ARENA server) |
| WS | `send_message` | Prompt agent with debate context |
| WS | `send_audio` | Forward caller audio (base64 PCM) |
| WS | `set_settings` | Rewrite system prompt with chaos rules |
| WS | `audio_received` | Receive streamed PCM audio chunks |
| WS | `message_received` | Receive text response (created/delta/completed) |
| WS | `talk_state_changed` | Detect speech start/end |
| WS | `function_implicitly_called` | Agent invokes a registered tool |

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| AI Agents | Napster Companion API | Custom companions, WebSocket + WebRTC channels |
| Frontend | React + Vite + Tailwind | SPA with broadcast-style dark UI |
| State | Zustand | Client state management + Socket.io integration |
| Realtime | Socket.io | Bi-directional event streaming to all viewers |
| Animation | Framer Motion | Page transitions, agent entrances, UI effects |
| Auth | Firebase Auth | Google, GitHub, Email/Password sign-in |
| Database | Firestore + SQLite | User credits (Firestore), session history (SQLite) |
| Payments | Stripe | Credit pack purchases + webhook integration |
| Audio | Web Audio API | 16kHz PCM playback with jitter buffer + crossfade |
| Moderation | Blocklist + OpenAI | Hybrid two-layer content moderation |
| Hosting | Railway | Production deployment with auto-deploy from git |

## Project Structure

```
ARENA/
├── client/                          # React frontend (Vite)
│   ├── public/
│   │   ├── hackathon/               # Hackathon presentation deck
│   │   ├── images/AgentProfiles/    # Agent avatars + landing images
│   │   └── static/avatars/          # Fallback avatar images
│   └── src/
│       ├── components/
│       │   ├── AgentPanel.tsx        # Agent video + stats display
│       │   ├── AgentVideo.tsx        # WebRTC avatar iframe manager
│       │   ├── CallInPanel.tsx       # Voice call-in recording UI
│       │   ├── CallInBanner.tsx      # Active call-in indicator
│       │   ├── ChaosPanel.tsx        # Rule/topic injection controls
│       │   ├── QuickInjects.tsx      # 8 preset chaos buttons
│       │   ├── ConsensusNeedle.tsx   # Live opinion meter
│       │   ├── TranscriptFeed.tsx    # Streaming debate transcript
│       │   ├── CreditShop.tsx        # Stripe checkout modal
│       │   ├── AuthModal.tsx         # Sign-in/sign-up modal
│       │   ├── LandingPage.tsx       # Splash screen
│       │   ├── VictoryScreen.tsx     # Winner announcement
│       │   ├── ReactionOverlay.tsx   # Floating emoji reactions
│       │   ├── TopicBanner.tsx       # Current topic chyron
│       │   ├── TopicReveal.tsx       # Topic change animation
│       │   ├── ChaosStatusBar.tsx    # Active rules display
│       │   ├── SpectatorBar.tsx      # Live viewer count
│       │   └── ToolEffects.tsx       # Agent tool visual effects
│       ├── contexts/AuthContext.tsx   # Firebase auth provider
│       ├── lib/
│       │   ├── pcm-audio.ts          # Web Audio PCM player (16kHz)
│       │   ├── firebase.ts           # Firebase client init
│       │   └── sounds.ts             # UI sound effects
│       └── store/arena.ts            # Zustand store (Socket.io + state)
├── server/                           # Express backend
│   └── src/
│       ├── index.ts                  # Express + Socket.io + API routes
│       ├── omniagent/
│       │   ├── websocket.ts          # Napster WebSocket connection handler
│       │   ├── manager.ts            # Agent lifecycle management
│       │   └── mock.ts               # Mock mode (no API calls)
│       ├── orchestration/
│       │   ├── turn-manager.ts       # Turn state machine + 3-flag system
│       │   └── transcript-relay.ts   # Paced transcript streaming (~115 WPM)
│       ├── sessions/
│       │   ├── manager.ts            # Session lifecycle + debate loop
│       │   ├── chaos-queue.ts        # Turn-aware chaos rule queue
│       │   ├── callin-queue.ts       # Voice call-in queue + transcription
│       │   ├── auto-start.ts         # Topic pool (610+) + rotation timer
│       │   └── watchdog.ts           # Dead session detection + recovery
│       ├── lib/
│       │   ├── companions.ts         # Custom companion creation via API
│       │   ├── napster-resources.ts  # Knowledge bases, FAQs, tools init
│       │   ├── credits.ts            # Firestore credit transactions
│       │   ├── moderation.ts         # Hybrid blocklist + OpenAI moderation
│       │   ├── firebase-admin.ts     # Firebase Admin SDK
│       │   ├── speech-to-text.ts     # Napster audio transcription
│       │   └── blocklist.ts          # Keyword blocklist with leetspeak normalization
│       ├── socket/handlers.ts        # Socket.io event handlers
│       └── routes/tools.ts           # Explicit tool callback endpoints
└── shared/types.ts                   # Shared TypeScript interfaces
```

## Credit Costs

| Action | Cost | Duration |
|--------|------|----------|
| Chaos Rule | 1 credit/turn | 1-4 turns |
| Quick Chaos Preset | 3 credits | 3 turns |
| Topic Change | 5 credits | Immediate |
| Call-In | 10 credits | Multi-turn discussion |

New users receive 10 free credits on sign-up. Watching is always free.

## Agents

| Agent | Role | Voice | Companion ID |
|-------|------|-------|--------------|
| Rico "The Roast" Martinez | Stand-Up Comedian | `verse` | `9efa20db` |
| Dr. Helena Ashworth | Philosophy Professor | `coral` | `8b080e6b` |
| Darius "Deep State" Kane | Podcast Host | `ash` | `e18893d0` |
| Ambassador Chen Wei | Retired Diplomat | `coral` | Reserve |
| Zap Thunder | Gaming Streamer | `ballad` | Reserve |

## Content Moderation

Two-layer hybrid system applied to all viewer-submitted content:

1. **Local blocklist** (instant): Keyword matching with leetspeak normalization
2. **OpenAI Moderation API** (async, optional): Category-based filtering (hate, harassment, violence, etc.)

Call-in audio is moderated post-transcription. If flagged, the submission is ejected from the queue and credits are refunded.

## Getting Started

### Prerequisites

- Node.js 18+
- Napster Companion API key
- Firebase project with Auth + Firestore enabled
- Stripe account (optional, for credit purchases)

### Environment Variables

```bash
# Server (.env)
OMNIAGENT_API_KEY=           # Napster Companion API key
FIREBASE_SERVICE_ACCOUNT=    # JSON string of Firebase service account
STRIPE_SECRET_KEY=           # Stripe secret key (optional)
STRIPE_WEBHOOK_SECRET=       # Stripe webhook signing secret (optional)
OPENAI_API_KEY=              # OpenAI moderation API key (optional, falls back to blocklist)
USE_MOCK=                    # Set to "true" for mock mode (no API calls)
PORT=                        # Server port (default: 3001)
```

### Development

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start server (mock mode for local dev)
cd server && USE_MOCK=true npx tsx src/index.ts

# Start client (separate terminal)
cd client && npx vite --port 5173
```

Open http://localhost:5173

### Production Build

```bash
# Build the client
cd client && npx vite build

# Start the server (serves client/dist as static files)
cd server && npx tsx src/index.ts
```

### Deploying to Railway

The client is pre-built and committed to git (`client/dist`) because Railway's build environment runs out of memory. After frontend changes:

```bash
cd client && npx vite build
cd ..
git add -f client/dist
git commit -m "build: update client dist"
git push
```

Railway auto-deploys from the `master` branch.

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health + session info |
| `GET` | `/api/status` | Current session state |
| `POST` | `/api/sessions` | Create a session |
| `POST` | `/api/sessions/start` | Start the debate |
| `POST` | `/api/sessions/launch` | Create + start (combined) |
| `POST` | `/api/sessions/end` | End the debate |

## Key Technical Decisions

- **Client not in npm workspaces**: Installed independently to avoid workspace resolution issues
- **`client/dist` committed**: Railway OOMs building the client; pre-built dist avoids this
- **Socket.io transports**: `['polling', 'websocket']` (polling first for Railway proxy compatibility)
- **16kHz PCM audio**: Confirmed sample rate; 24kHz causes chipmunk effect
- **Iframe-isolated avatars**: Napster SDK is singleton per JS context; 3 agents need 3 iframes
- **Signaling proxy**: Napster's WebRTC signaling server rejects browser origins; server-side proxy required
- **Audio field fallback**: API returns `data.data` for audio despite docs saying `data.audio`; we handle both
