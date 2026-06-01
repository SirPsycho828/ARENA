<div align="center">

# A.R.E.N.A.

### AI Rivalry Exhibition of Neural Agents

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

**A live multi-agent debate arena where AI video avatars argue in real-time while audiences inject chaos.**

*Napster Hackathon 2025 Submission*

</div>

---

## Overview

A.R.E.N.A. is a spectator-first AI experience where 3-5 distinct AI personalities debate any topic in real-time. The audience isn't just watching — they're shaping the show through chaos injections, voting, emoji reactions, and even direct voice challenges.

Think of it as an AI-powered debate show meets Twitch chat meets esports arena.

## Features

<table>
<tr>
<td width="50%">

### Live AI Debates
3-5 AI agents with distinct personalities (The Comedian, The Professor, The Truther, The Diplomat, The Hype Beast) debate any topic in real-time with round-robin turn management.

</td>
<td width="50%">

### Audience Chaos Controls
Inject custom rules ("speak in rhymes!"), change the topic mid-debate, or use quick-inject presets — agents must comply immediately and dramatically.

</td>
</tr>
<tr>
<td width="50%">

### Voice Challenger
Challenge any agent directly using your browser microphone. A 60-second showdown with live waveform visualization and "LIVE CHALLENGER" badge.

</td>
<td width="50%">

### Real-Time Engagement
Live voting, floating emoji reactions, spectator count, debate timer, and message counter — all streamed via WebSocket.

</td>
</tr>
<tr>
<td width="50%">

### Cinematic UI
Dark esports-inspired design with animated splash screen, cyan/magenta glow effects, and synthesized sound effects for every interaction.

</td>
<td width="50%">

### Powered by Napster Omniagent
Server-side WebSocket orchestration via Napster's Companion API, with WebRTC video support and persistent agent memory.

</td>
</tr>
</table>

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19, Vite, Tailwind v4 | Spectator UI |
| State | Zustand | Client state management |
| Animation | Framer Motion | Splash screen, transitions |
| Audio | Web Audio API | Synthesized sound effects |
| Server | Express, Socket.io | API + real-time events |
| Database | SQLite (better-sqlite3) | Session/transcript persistence |
| AI | Napster Omniagent API | Agent creation & orchestration |
| Icons | Lucide React | UI iconography |
| Fonts | Inter, Space Grotesk, JetBrains Mono | Typography |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Viewers (Browser)                  │
│  React + Zustand ←──Socket.io──→ Express Server      │
│  [WebRTC Video]                  [WebSocket Relay]    │
└────────────────────────┬────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │   Session Manager    │
              │  ┌────────────────┐  │
              │  │  Turn Manager  │  │  Round-robin + interrupt queue
              │  │ Transcript     │  │  Cross-agent relay
              │  │    Relay       │  │
              │  │ Injection      │  │  Cooldown + priority queue
              │  │    Queue       │  │
              │  └────────────────┘  │
              └──────────┬──────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌─────────┐   ┌─────────┐   ┌─────────┐
     │ Agent 1 │   │ Agent 2 │   │ Agent 3 │
     │(Comedian)│   │(Professor)│  │(Truther) │
     └─────────┘   └─────────┘   └─────────┘
          │              │              │
          └──────────────┴──────────────┘
                         │
              Napster Omniagent API
```

## Getting Started

### Prerequisites
- Node.js 22+
- Napster Omniagent API key

### Install

```bash
# Server dependencies
cd server && npm install

# Client dependencies
cd ../client && npm install
```

### Environment Setup

Create `.env` in the project root:

```env
OMNIAGENT_API_KEY=your_api_key_here
```

### Development (Mock Mode)

```bash
# Terminal 1 — Server (mock agents, no API calls)
cd server && USE_MOCK=true npx tsx src/index.ts

# Terminal 2 — Client (Vite dev server with proxy)
cd client && npx vite --port 5173
```

Open http://localhost:5173

### Production (Single Server)

```bash
# Build client
cd client && npm run build

# Start server (serves built client)
cd ../server && npx tsx src/index.ts
```

Open http://localhost:3001

### Start a Debate

```bash
# Create and start in one call
curl -X POST http://localhost:3001/api/sessions/launch \
  -H "Content-Type: application/json" \
  -d '{"topic": "Is pineapple on pizza a crime?", "agentCount": 3}'
```

### Docker

```bash
docker build -t arena .
docker run -p 3001:3001 --env-file .env arena
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health + session info |
| `GET` | `/api/status` | Current session state |
| `POST` | `/api/sessions` | Create a session |
| `POST` | `/api/sessions/start` | Start the debate |
| `POST` | `/api/sessions/launch` | Create + start (combined) |
| `POST` | `/api/sessions/end` | End the debate |

## Agent Personalities

| Agent | Style | Strategy |
|-------|-------|----------|
| Rico "The Roast" Martinez | Stand-up comedian | Dismantles arguments through mockery and absurd analogies |
| Dr. Helena Ashworth | Tenured professor | Cites obscure studies and uses condescending authority |
| Darius "Deep State" Kane | Conspiracy theorist | Connects everything to shadow organizations |
| Ambassador Chen Wei | Retired diplomat | Uses politeness as a devastating weapon |
| Zap Thunder | Gaming streamer | Treats every debate like a championship match |

## Project Structure

```
ARENA/
├── client/                 # React + Vite frontend
│   └── src/
│       ├── components/     # UI components
│       ├── lib/            # Sound engine
│       └── store/          # Zustand store
├── server/                 # Express + Socket.io backend
│   └── src/
│       ├── db/             # SQLite persistence
│       ├── omniagent/      # API connection + mock
│       ├── orchestration/  # Turn manager + transcript relay
│       ├── sessions/       # Session manager + injection queue
│       └── socket/         # Socket.io event handlers
├── shared/                 # Shared TypeScript types
├── docs/                   # PRD documents
└── poc/                    # Proof of concept tests
```
