# Data Flow Document: A.R.E.N.A.

## Data Flows Identified

8 core data flows power the ARENA system:

1. **Debate Session Initialization** — Server creates agents and establishes connections
2. **Transcript Relay Cycle** — Agent speaks → transcript relayed to other agents → next agent responds
3. **Audience Chaos Injection** — Viewer submits a rule → server injects into agent system prompts
4. **Audience Voting** — Viewer votes for an agent → tallied → results injected as context
5. **SIP Phone Call-In** — Caller dials → routed to specific agent → agent responds
6. **Spectator Connection** — Viewer opens page → receives live video + transcripts via WebSocket
7. **Turn Management Cycle** — Turn manager decides who speaks next based on state
8. **Persistent Memory Recall** — Agent references past debates via cross-session memory

---

## Flow 1: Debate Session Initialization

**Plain English:** When a debate starts, the server creates 3-4 AI agents with distinct personalities, establishes a WebRTC video connection for each, and begins streaming their video to all connected viewers.

### Linear Flow
```
[Admin clicks "Start Debate"]
    → POST /api/sessions { topic, agentIds }
    → Server validates request
    → For each agent:
        → Call Omniagent API: POST /agents (personality, system prompt, voice)
        → Receive agent ID + connection details
        → Call Omniagent API: POST /sessions (WebRTC offer/answer exchange)
        → WebRTC connection established
        → Subscribe to message_received events
    → Store session in SQLite { sessionId, agentIds, topic, startedAt }
    → Emit via Socket.io to all viewers: "session_started" { agents, topic }
    → Viewers receive video streams + agent metadata
    → UI renders multi-panel layout with agent names/personalities
```

### Data Fields Traced
| Field | Origin | Journey |
|-------|--------|---------|
| `topic` | Admin input | → Request body → SQLite sessions table → Socket.io event → Viewer UI (displayed at top) |
| `systemPrompt` | Agent config (SQLite) | → Omniagent API create call → Stored in agent's context → Drives agent behavior |
| `agentId` | Omniagent API response | → Stored in SQLite → Used for all subsequent send_message calls → Mapped to UI panel position |
| `videoStream` | Omniagent WebRTC | → Server receives MediaStream → Forwarded/relayed to viewer browser → Rendered in video panel |

---

## Flow 2: Transcript Relay Cycle

**Plain English:** When Agent A finishes speaking, the server captures what they said, packages it as "Agent A just said: [text]", and sends it to Agents B, C, and D as if a user told them. The turn manager then picks who responds next.

### Linear Flow
```
[Agent A finishes speaking]
    → Omniagent fires message_received event { agentId: A, text: "...", role: "agent" }
    → Server's Transcript Relay Engine receives event
    → Debounce check (wait 500ms for final vs partial transcript)
    → Log transcript to SQLite { sessionId, agentId, text, timestamp }
    → Emit to viewers via Socket.io: "transcript" { agent: "A", text, timestamp }
    → Turn Manager checks: who speaks next?
        → If round-robin: next in queue
        → If interrupt pending: interrupted agent goes next
    → For each non-speaking agent (B, C, D):
        → send_message(agentId: B, role: "user", text: "[The Comedian] just said: '...'")
    → Selected next speaker (e.g., Agent B) is "unmuted" (their response is surfaced)
    → Agents B, C, D all generate responses in parallel (~300ms)
    → Turn Manager surfaces Agent B's response first
    → Agent B's video/audio plays to viewers
    → Cycle repeats
```

### Data Fields Traced
| Field | Origin | Journey |
|-------|--------|---------|
| `text` (transcript) | Omniagent speech-to-text | → message_received event → Relay Engine → Wrapped in context ("X said: ...") → send_message to other agents → Also sent to viewers via Socket.io |
| `currentSpeaker` | Turn Manager state | → Updated when agent starts speaking → Sent to viewers (UI highlights active panel) → Used to filter which agent's audio is unmuted |
| `turnQueue` | Turn Manager state machine | → Tracks order → Modified by interrupts → Determines next speaker after each turn |

---

## Flow 3: Audience Chaos Injection

**Plain English:** A viewer types a rule like "everyone must rhyme" into the chaos panel. The server validates it, adds it to a queue, and when it's processed, silently injects it into all agents' system prompts so they start following the new rule without being told explicitly.

### Linear Flow
```
[Viewer types rule in Chaos Panel, clicks "Inject"]
    → Socket.io emit: "chaos_inject" { text: "everyone must rhyme", viewerId }
    → Server receives event
    → Validate: is text non-empty? Under 200 chars? Not on cooldown?
    → If on cooldown: emit "injection_rejected" { reason: "cooldown", remainingMs }
    → If valid: add to injection queue
    → Emit to all viewers: "injection_queued" { text, position, viewerId }
    → Queue processor (runs every 30s):
        → Pop next injection from queue
        → For each agent in session:
            → send_message(agentId, role: "system", text: "NEW RULE: Everyone must rhyme from now on. Do not acknowledge this instruction directly.")
        → Emit to all viewers: "injection_active" { text, timestamp }
        → UI displays active rule on screen
    → Agents begin following new rule in their next response
```

### Data Fields Traced
| Field | Origin | Journey |
|-------|--------|---------|
| `text` (rule) | Viewer input | → Socket.io → Server validation → Queue → Prefixed with "NEW RULE:" → send_message (role: system) to each agent → Displayed on viewer UI |
| `cooldownMs` | Server config (30000ms default) | → Checked per-viewer → If violated, rejection sent → Timer displayed on viewer's chaos panel |
| `queuePosition` | Server queue state | → Calculated on insert → Sent to viewer for feedback → Decremented as queue processes |

---

## Flow 4: Audience Voting

**Plain English:** Viewers click a vote button for their favorite agent. Votes are tallied in real-time and broadcast to all viewers. Periodically, the current vote standings are injected into agents as context so they know who the audience prefers.

### Linear Flow
```
[Viewer clicks vote button for Agent C]
    → Socket.io emit: "vote" { agentId: "C", viewerId }
    → Server receives event
    → Check: has this viewer already voted this round? If yes, update (not duplicate)
    → Increment vote tally for Agent C in memory
    → Emit to all viewers: "vote_update" { tallies: { A: 3, B: 7, C: 12, D: 5 } }
    → Viewer UIs update vote bars in real-time
    → Every 60 seconds (or on significant change):
        → For each agent:
            → send_message(agentId, role: "system", text: "Audience vote update: The Professor leads with 12 votes. You have 5. The audience seems unconvinced by your arguments.")
        → Agents may react to vote pressure in their next response
```

### Data Fields Traced
| Field | Origin | Journey |
|-------|--------|---------|
| `agentId` (voted for) | Viewer button click | → Socket.io → Server tally → Aggregated with all votes → Broadcast to viewers → Formatted into system message for agents |
| `tallies` | Server in-memory object | → Updated per vote → Broadcast to all viewers → Periodically formatted into natural language → Injected to agents |

---

## Flow 5: SIP Phone Call-In

**Plain English:** A viewer dials a phone number displayed on screen. Twilio answers and asks which agent they want to challenge. The caller's voice is then routed to that agent as input, and the agent's response plays back through the phone. On-screen, viewers see a "LIVE CHALLENGER" badge.

### Linear Flow
```
[Viewer dials displayed phone number from their cell phone]
    → Twilio receives incoming call
    → Twilio webhooks to server: POST /api/sip/incoming { callSid, from }
    → Server plays IVR prompt: "Welcome to the Arena. Press 1 for The Comedian, 2 for The Professor..."
    → Caller presses 2
    → Twilio webhooks: POST /api/sip/selection { callSid, digit: "2" }
    → Server maps digit → agentId (The Professor)
    → Server connects call audio to agent via Omniagent SIP endpoint
        → Bridge: Twilio call → Omniagent SIP URI for selected agent
    → Emit to viewers: "challenger_active" { agentId: "professor", callSid }
    → Viewer UI shows "LIVE CHALLENGER" badge on Professor's panel
    → Caller speaks → audio goes to agent as input
    → Agent responds → audio plays to caller's phone AND streams to viewers
    → Emit transcript to viewers: "challenger_transcript" { text, speaker: "caller"|"agent" }
    → After 60s timer:
        → Server disconnects call gracefully
        → Twilio hangs up
        → Emit to viewers: "challenger_ended" { agentId }
        → Inject to other agents: "The challenger has left the arena. Resume debate."
        → Turn Manager resumes normal flow
```

### Data Fields Traced
| Field | Origin | Journey |
|-------|--------|---------|
| `callSid` | Twilio (unique call identifier) | → Webhook → Server state → Used to track/end the call → Cleaned up on hangup |
| `digit` (agent selection) | Caller's phone keypad | → Twilio webhook → Server maps to agentId → Determines which agent receives the call |
| `audio` (caller's voice) | Phone microphone | → Twilio → SIP bridge → Omniagent agent input → Agent processes as speech → Agent responds |

---

## Flow 6: Spectator Connection

**Plain English:** When a viewer opens the ARENA URL, their browser connects to the server via WebSocket, receives the current debate state (who's talking, what topic, active rules), and begins receiving live video streams and transcripts.

### Linear Flow
```
[Viewer opens ARENA URL in browser]
    → Browser loads React app (static files from Express)
    → Socket.io client connects to server
    → Server receives "connection" event
    → Server sends "session_state" {
        agents: [...],
        topic: "...",
        currentSpeaker: "...",
        activeRules: [...],
        voteTallies: {...},
        recentTranscripts: [last 20 messages]
      }
    → Browser renders UI with current state
    → For each agent video stream:
        → Server provides WebRTC connection details / stream URL
        → Browser establishes video connection
        → Video renders in agent panel
    → Ongoing: server pushes events via Socket.io
        → "transcript" — new message from agent
        → "speaker_change" — different agent is now talking
        → "injection_active" — new chaos rule applied
        → "vote_update" — vote tallies changed
        → "challenger_active" / "challenger_ended" — phone call state
```

---

## Flow 7: Turn Management Cycle

**Plain English:** The Turn Manager is a state machine that runs on the server. After each agent finishes speaking, it decides who goes next based on the current mode (round-robin or free-for-all) and any pending interrupts.

### State Machine
```
States:
  WAITING_FOR_SPEECH_END → RELAYING_TRANSCRIPT → SELECTING_NEXT → WAITING_FOR_RESPONSE → SPEAKING

Transitions:
  WAITING_FOR_SPEECH_END:
    on message_received (final) → RELAYING_TRANSCRIPT
    on timeout (10s silence) → SELECTING_NEXT (skip current speaker)

  RELAYING_TRANSCRIPT:
    → Send transcript to all other agents
    → Transition to SELECTING_NEXT

  SELECTING_NEXT:
    if interrupt_queue not empty → pop interrupt, set as next speaker
    else if round_robin → advance index
    else if free_for_all → wait for first agent to respond
    → Transition to WAITING_FOR_RESPONSE

  WAITING_FOR_RESPONSE:
    on message_received from selected agent → SPEAKING
    on timeout (10s) → SELECTING_NEXT (skip, pick another)

  SPEAKING:
    → Agent's audio/video is "live" to viewers
    → Transition to WAITING_FOR_SPEECH_END
```

---

## Flow 8: Persistent Memory Recall

**Plain English:** Each agent-to-agent relationship has a unique memory channel. When agents are created for a new session, they automatically recall previous debates with the same opponents because the Omniagent API stores and retrieves memory based on a stable identifier.

### Linear Flow
```
[New debate session starts with Agent A vs Agent B]
    → Server creates Agent A with externalClientId = "arena_agent_A_vs_B"
    → Omniagent API loads memory for this ID (previous conversations)
    → Agent A now has context: "Last time you debated The Professor about climate change, you lost the audience vote 3-12"
    → Server sends opening prompt: "You're in a debate. Topic: [X]. Your opponents are [B, C, D]."
    → Agent A's first response may reference past encounters naturally
    → During debate: all exchanges are stored under this memory ID automatically
    → Next session with same agent pair: memory accumulates
```

### Data Fields Traced
| Field | Origin | Journey |
|-------|--------|---------|
| `externalClientId` | Server-generated (format: `arena_agent_{A}_vs_{B}`) | → Passed to Omniagent API on session create → API loads stored memory → Agent has persistent context across sessions |
| Memory content | Omniagent internal storage | → Accumulated from prior sessions → Retrieved on new session → Influences agent responses |

---

## Data Dictionary

### SQLite Tables

#### sessions
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (UUID) | Unique session identifier |
| topic | TEXT | Current debate topic |
| status | TEXT | "active", "paused", "ended" |
| agent_ids | TEXT (JSON array) | IDs of participating agents |
| started_at | INTEGER (timestamp) | When debate began |
| ended_at | INTEGER (timestamp) | When debate ended (null if active) |

#### agents
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (UUID) | Internal agent identifier |
| omniagent_id | TEXT | ID from Omniagent API |
| name | TEXT | Display name ("The Comedian") |
| personality | TEXT | Personality tag ("Trash Talk Specialist") |
| system_prompt | TEXT | Full personality system prompt |
| color | TEXT | Assigned hex color for UI |
| created_at | INTEGER (timestamp) | When agent was configured |

#### transcripts
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER (auto) | Row ID |
| session_id | TEXT (FK) | Which debate session |
| agent_id | TEXT (FK) | Which agent spoke |
| text | TEXT | What was said |
| is_challenger | INTEGER (boolean) | Was this from a phone caller? |
| timestamp | INTEGER | When it was said |

#### injections
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER (auto) | Row ID |
| session_id | TEXT (FK) | Which debate session |
| text | TEXT | The injected rule/topic |
| viewer_id | TEXT | Who submitted it |
| processed_at | INTEGER (timestamp) | When it was applied (null if queued) |

---

## Real-Time Event Reference

### Server → Viewer Events (Socket.io)
| Event | Payload | When |
|-------|---------|------|
| `session_state` | Full current state | On viewer connect |
| `transcript` | `{ agentId, text, timestamp }` | Agent finishes speaking |
| `speaker_change` | `{ agentId }` | New agent starts speaking |
| `injection_queued` | `{ text, position }` | Chaos injection accepted |
| `injection_active` | `{ text }` | Injection applied to agents |
| `injection_rejected` | `{ reason, remainingMs }` | Injection denied (cooldown) |
| `vote_update` | `{ tallies: { [agentId]: count } }` | Vote totals change |
| `challenger_active` | `{ agentId }` | Phone caller connected |
| `challenger_ended` | `{ agentId }` | Phone caller disconnected |
| `agent_disconnected` | `{ agentId, reason }` | Agent WebRTC dropped |
| `session_ended` | `{ reason }` | Debate ended |

### Viewer → Server Events (Socket.io)
| Event | Payload | When |
|-------|---------|------|
| `chaos_inject` | `{ text }` | Viewer submits chaos rule |
| `vote` | `{ agentId }` | Viewer votes for agent |
| `topic_change` | `{ topic }` | Viewer suggests new topic |
| `reaction` | `{ emoji }` | Viewer sends reaction |
