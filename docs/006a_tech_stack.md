# Tech Stack for A.R.E.N.A.

## Executive Summary
A.R.E.N.A. is a real-time multi-agent debate platform requiring persistent WebRTC connections, server-side orchestration, and a reactive spectator UI. This stack is optimized for AI-assisted development with maximum ecosystem coverage, fast iteration speed, and minimal DevOps overhead. Every choice below is final and ready to build on.

---

## 1. Mandatory Stack (MVP Requirements)

### Frontend (What Users See & Interact With)
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18+ | UI framework — builds the spectator interface, panels, and controls |
| Vite | 5+ | Build tool — instant dev server, fast hot reload for rapid iteration |
| Tailwind CSS | 3+ | Styling — utility-first CSS matching our design language tokens exactly |
| Socket.io Client | 4+ | Real-time connection — receives live transcript updates, audience events, and agent status from server |
| Zustand | 4+ | State management — lightweight store for agent states, transcripts, audience queue, voting |

### Backend (The Engine Behind the Scenes)
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20 LTS | Runtime — matches the Omniagent SDK's JavaScript requirement |
| Express | 4+ | HTTP framework — serves the API for session management, agent configuration |
| Socket.io Server | 4+ | Real-time — pushes live transcripts, agent events, and audience interactions to all connected viewers |
| Napster Omniagent SDK | Latest | AI agent management — creates agents, establishes WebRTC connections, handles messaging |

### Database & Storage (Where Data Lives)
| Technology | Purpose |
|------------|---------|
| SQLite (via better-sqlite3) | Local persistent storage — agent configs, debate history, session logs. Zero infrastructure needed |
| Environment variables (.env) | API keys and secrets — Omniagent API key, Twilio credentials |

### Infrastructure & Services (Hosting & Third-Party Tools)
| Technology | Purpose |
|------------|---------|
| Railway | Deployment — always-on Node.js server with WebSocket support, auto-deploy from Git |
| Twilio SIP Trunking | Phone integration — provides a real phone number for audience call-ins |
| Napster Omniagent API | Core AI service — the agents themselves (video avatars, speech, memory) |
| Cloudflare Pages | Frontend hosting — serves the React app globally with CDN (or bundle with Express) |

### Key Libraries & Tools (Pre-Built Components)
| Technology | Purpose |
|------------|---------|
| uuid | Unique session/agent identifiers |
| zod | Input validation — validates audience injections and API requests |
| dotenv | Environment variable loading |
| concurrently | Dev tooling — runs frontend and backend simultaneously in development |
| lucide-react | Icons — matches design language specification |
| @fontsource/inter + @fontsource/space-grotesk + @fontsource/jetbrains-mono | Typography — self-hosted fonts matching design language |
| framer-motion | Animations — agent panel transitions, glow effects, speaking indicators |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPECTATOR BROWSER                         │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │  │ Agent D  │       │
│  │ (Video)  │  │ (Video)  │  │ (Video)  │  │ (Video)  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │              │              │
│       └──────────────┴──────────────┴──────────────┘              │
│                              │                                    │
│  ┌───────────────────────────┴────────────────────────────────┐  │
│  │              Socket.io Client (Real-time Events)            │  │
│  │  - Receives transcripts, speaking state, agent status      │  │
│  │  - Sends audience injections, votes, topic changes         │  │
│  └───────────────────────────┬────────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────┘
                               │ WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION SERVER (Node.js)                 │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Turn Manager (State Machine)              │  │
│  │  - Tracks who is speaking                                   │  │
│  │  - Manages round-robin + interrupt queue                    │  │
│  │  - Enforces timeouts                                        │  │
│  └──────────────┬─────────────────────────────┬───────────────┘  │
│                 │                             │                    │
│  ┌──────────────▼──────────────┐  ┌──────────▼───────────────┐  │
│  │    Transcript Relay Engine   │  │   Audience Injection Mgr  │  │
│  │  - Subscribes to all agents  │  │  - Rate limiting          │  │
│  │  - Relays A→B,C,D           │  │  - Queue processing       │  │
│  │  - Debounces partial msgs   │  │  - System prompt inject    │  │
│  └──────────────┬──────────────┘  └──────────┬───────────────┘  │
│                 │                             │                    │
│  ┌──────────────▼─────────────────────────────▼───────────────┐  │
│  │              Omniagent Connection Manager                    │  │
│  │  - Creates agents via API                                   │  │
│  │  - Manages WebRTC sessions                                  │  │
│  │  - Handles send_message / set_settings                      │  │
│  │  - Listens for message_received events                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌────────────────┐     ┌────────────────────────────────────┐   │
│  │  SQLite Store   │     │  Twilio SIP Bridge                 │   │
│  │  - Sessions     │     │  - Incoming call → agent routing   │   │
│  │  - Agent configs│     │  - Call lifecycle management        │   │
│  │  - Debate logs  │     └────────────────────────────────────┘   │
│  └────────────────┘                                               │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     NAPSTER OMNIAGENT API                          │
│  - Agent creation + configuration                                 │
│  - WebRTC video/audio streaming                                   │
│  - Speech-to-text transcription                                   │
│  - Persistent memory (externalClientId)                           │
│  - Custom tool execution                                          │
│  - SIP endpoint for phone integration                             │
└──────────────────────────────────────────────────────────────────┘
```

**How it connects:**
1. The Orchestration Server creates and manages all AI agents via the Omniagent API
2. Each agent's WebRTC video stream is forwarded to the spectator browser for display
3. When an agent speaks, the server receives the transcript and relays it to other agents
4. The Turn Manager decides who responds next and unmutes them in sequence
5. Audience members interact via Socket.io — their injections go to the server, which applies them as system prompt updates to the relevant agents
6. SIP calls come through Twilio, which bridges to the Omniagent API's SIP endpoint
7. SQLite stores agent configurations and debate history locally on the server
