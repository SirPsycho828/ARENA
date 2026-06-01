# Mandatory Features for A.R.E.N.A.

## Agent Configuration & Identity
- **Agent Creation** — create AI debate agents with distinct personalities, names, and visual identities
  - System prompt authoring per agent (personality, debate style, knowledge constraints)
  - Avatar selection/assignment per agent
  - Voice/tone configuration (speaking speed, expressiveness)
- **Agent Roster** — maintain a cast of debate characters available for sessions
  - Pre-built character templates (conspiracy theorist, professor, comedian, zen monk, etc.)
  - Persistent identity across sessions (same agent = same personality always)
- **Green-Screen Video Mode** — all agents render with chroma-key backgrounds for compositing into custom layouts

## Orchestration Engine (Backend)
- **Multi-Agent Session Manager** — open and manage 3-4 simultaneous WebRTC connections
  - Connection health monitoring per agent
  - Graceful reconnection on drop
  - Session lifecycle management (create, start, end, cleanup)
- **Transcript Relay System** — when Agent A finishes speaking, relay their transcript to Agents B/C/D as input
  - Speech-end detection (subscribe to `message_received` events)
  - Broadcast logic (relay to all other agents or targeted subset)
  - Turn attribution ("The Comedian just said: [transcript]")
- **Turn Management** — control who speaks when to prevent crosstalk chaos
  - Sequential round-robin mode (each agent gets a turn)
  - Free-for-all mode (agents can interrupt via custom tool)
  - Moderator/host priority override
- **System Prompt Injection** — inject audience commands and context changes mid-session without agents revealing it
  - `send_message` with role "system" for invisible context updates
  - `set_settings` for full personality/instruction swaps

## Spectator UI
- **Multi-Panel Video Layout** — display 3-4 agent video streams simultaneously on screen
  - Split-screen grid arrangement (2x2 or 1x3 depending on agent count)
  - Visual indicator of who is currently speaking (highlight/glow)
  - Agent name and personality label on each panel
- **Live Transcript Feed** — real-time captions showing what each agent says
  - Color-coded by agent
  - Auto-scroll with manual scroll-lock
- **Debate Topic Display** — show current topic prominently
  - Topic change animation when audience injects a new one
- **Session State Indicators** — show debate status (warming up, in progress, final round, ended)

## Audience Interaction
- **Chaos Injection Panel** — interface for audience to influence the debate in real-time
  - Topic change button (submit a new debate topic)
  - Rule injection (text input: "everyone must speak in questions only")
  - Personality modifier (make an agent angrier, calmer, dumber, smarter)
- **Voting System** — audience votes on who's winning the debate
  - Per-agent vote buttons
  - Live vote tally visible to all (and injected into agents as context)
- **Chat/Reactions** — lightweight audience presence
  - Text reactions visible in a sidebar
  - Emoji burst overlays on screen

## SIP Phone Integration
- **Phone Call-In** — display a phone number that audience members can call to join the debate
  - Route incoming SIP call audio to a specific agent as "challenger" input
  - Agent responds to the caller directly (caller hears the agent's voice)
- **Caller Management** — handle the logistics of phone-in participants
  - Queue system if multiple callers (first-come-first-served)
  - Time limit per caller (e.g., 60 seconds)
  - Graceful disconnect and return to normal debate flow

## Persistent Memory
- **Cross-Session Agent Memory** — agents remember past debates via `externalClientId`
  - Agent recalls previous debate outcomes ("Last time we discussed this, you lost badly")
  - Rivalry tracking (which agents have clashed before and on what topics)
  - Callback humor (agents reference memorable moments from prior sessions)
- **User Recognition** — agents remember returning audience members who call in
  - "You're the one who challenged me last week about flat earth!"

## Session Management
- **Debate Session CRUD** — create, configure, launch, and end debate sessions
  - Select which agents participate
  - Set debate topic
  - Configure duration/rounds
  - Start/pause/end controls
- **Backend API Server** — server-side layer handling all Omniagent API calls
  - API key security (never exposed to frontend)
  - Agent creation and connection endpoints
  - WebSocket relay for real-time events to frontend

## Error Handling & Recovery
- **Agent Disconnection Recovery** — if an agent's WebRTC connection drops, attempt reconnect
  - Notify other agents ("The Comedian seems to have left the building...")
  - Graceful degradation (continue with remaining agents)
- **Turn Timeout** — if an agent fails to respond within N seconds, skip their turn
  - Inject context to other agents: "They've gone silent, continue without them"
- **Rate Limiting** — prevent audience from flooding chaos injections
  - Cooldown timer between audience commands
  - Queue system for high-traffic moments
