# Technical Landmine Report: A.R.E.N.A.

## Executive Summary
The core technical challenge of ARENA is multi-agent real-time orchestration — coordinating 3-4 simultaneous WebRTC video connections, relaying transcripts between agents, managing conversational turn-taking, and compositing green-screen video into a unified layout. Standard WebRTC boilerplate won't flag the systemic timing issues, the undocumented concurrent connection limits, or the cascading latency problem that makes sequential multi-agent conversation feel slow. The second major risk is that the Napster Omniagent API is new and the documentation may not cover edge cases you'll hit when pushing it beyond single-agent use cases.

---

## Hurdle Summary Table

| Priority | Hurdle | Category | Difficulty | Key Recommendation |
|----------|--------|----------|------------|-------------------|
| 1 | Multi-Agent WebRTC Orchestration | Real-Time & Architecture | High | Build a centralized orchestration server that owns all agent connections |
| 2 | Transcript Relay & Turn Management | Real-Time & Architecture | High | Implement a state machine for turn control with timeout fallbacks |
| 3 | Green-Screen Video Compositing | Frontend & Media | Medium | Use Canvas API or CSS mix-blend-mode with chroma-key shader |
| 4 | Latency Compounding | Performance | High | Parallel processing + staggered response design |
| 5 | SIP Phone Integration | Third-Party Integration | Medium | Use the API's native SIP support; focus on call routing logic |
| 6 | Concurrent Connection Limits | API Constraints | Medium | Test early; design for graceful degradation to 2-3 agents |
| 7 | Audience Injection at Scale | Real-Time & Moderation | Low | Simple rate limiting + queue; over-engineer later if needed |
| 8 | Persistent Memory Coherence | Data & AI | Medium | Careful externalClientId strategy per agent-pair |
| 9 | API Cost Management | Operations | Low | Monitor usage; the hackathon provides 7,500 API minutes |

---

## Compounding Complexity Warnings

**Multiple WebRTC + Transcript Relay + Turn Management:**
- Why this is harder than it looks: Each agent is an independent WebRTC session. When Agent A finishes speaking, you must detect the end of speech, extract the transcript, relay it to Agents B/C/D, and manage who responds next — all within ~500ms or the conversation feels dead. This is a distributed systems timing problem disguised as a chat feature.
- Combined difficulty: This trio IS the project. Nail this and everything else is gravy.

**Green-Screen + Multiple Video Streams + Browser Performance:**
- Why this is harder than it looks: Rendering 3-4 WebRTC video streams simultaneously is GPU-intensive. Adding real-time chroma-key processing on each stream compounds this. Low-end devices may struggle.
- Combined difficulty: Medium-High on weak hardware. Test on mid-range devices early.

**SIP Call-In + Agent Turn Management + Transcript Relay:**
- Why this is harder than it looks: A phone caller disrupts the turn-taking system. You need to pause normal agent flow, route the caller to a specific agent, capture the caller's speech, relay it to other agents as context, then gracefully return to normal flow when the call ends.
- Combined difficulty: Medium — mostly state management complexity, not fundamental technical risk.

---

## Detailed Hurdle Analysis

### Hurdle 1: Multi-Agent WebRTC Orchestration
**Category:** Real-Time & Architecture
**Difficulty:** High
**Effort Estimate:** 1-2 weeks of focused work

**What makes this inherently challenging:**
- Each agent is an independent WebRTC peer connection managed by the Omniagent API
- The Napster SDK assumes a 1:1 agent-to-page relationship (one widget per connection)
- You need to bypass the default SDK widget and manage raw WebRTC connections yourself to compose a multi-panel layout
- Connection lifecycle management (establishing, maintaining, reconnecting) multiplied by 3-4x

**Non-obvious gotchas:**
- The SDK may not expose the raw WebRTC MediaStream directly — you may need to extract it from the widget's DOM or use the lower-level API endpoints to establish connections manually
- WebRTC peer connections each consume significant browser resources (bandwidth, CPU for decoding). Four simultaneous streams may exceed 10Mbps download on some connections
- ICE candidate negotiation for 4 connections simultaneously can create race conditions
- If one connection drops and reconnects, its state is now out of sync with the conversation — you need a "catch-up" mechanism

**Your options:**

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| Use SDK with multiple hidden widgets, capture video from each | Free | Medium | Quick prototype — extract MediaStream from each widget's video element |
| Use REST API to create agents + manual WebRTC setup | Free | High | Full control — but requires deep WebRTC knowledge |
| Hybrid: SDK for connection, custom rendering layer | Free | Medium | Best balance of API compatibility + custom layout |

**Recommendation:** Start with the hybrid approach — use the SDK to handle the Omniagent handshake and connection, but extract the MediaStream from each connection to render in your own composite layout. Test with 2 agents first, then scale to 4.

---

### Hurdle 2: Transcript Relay & Turn Management
**Category:** Real-Time & Architecture
**Difficulty:** High
**Effort Estimate:** 1-2 weeks

**What makes this inherently challenging:**
- There is no native "agent-to-agent" communication in the Omniagent API — you must build the orchestration layer yourself
- You need to subscribe to `message_received` events from each agent, extract the transcript, and relay it to other agents via `send_message`
- Turn management is a state machine problem: who speaks next? What if an agent takes too long? What if two agents try to speak simultaneously?
- The system must feel like a natural conversation, not a round-robin robot show

**Non-obvious gotchas:**
- The `message_received` event may fire multiple times per utterance (partial transcripts vs. final). You need to debounce and wait for the complete transcript before relaying
- If you relay too quickly, Agent B starts responding before Agent A finishes — creating overlapping speech
- Turn management gets exponentially harder with more agents. 2 agents = ping-pong (easy). 4 agents = who goes next? Do they all respond? Only the one addressed?
- You need two modes: "ordered" (round-robin for structured debate) and "reactive" (agents decide whether to respond based on relevance). The latter is an open design problem

**Your options:**

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| Simple round-robin | Free | Low | MVP — predictable, boring but works |
| Priority queue with relevance scoring | Free | High | More natural — agents respond when they have something to say |
| Hybrid: round-robin with interrupt mechanism | Free | Medium | Best for a hackathon — structured but allows agent "interruptions" via custom tool |

**Recommendation:** Start with round-robin + interrupt tool. Each agent gets a turn, but any agent can call a "ring_bell" custom tool to jump the queue. This gives structure while allowing for entertaining chaos. Add a 10-second timeout per turn so no agent freezes the show.

---

### Hurdle 3: Green-Screen Video Compositing
**Category:** Frontend & Media
**Difficulty:** Medium
**Effort Estimate:** 3-5 days

**What makes this inherently challenging:**
- Real-time chroma-key removal on video streams requires per-frame pixel processing
- Doing this in the browser for 3-4 streams simultaneously is GPU-intensive
- Color variance in the green-screen (lighting, compression artifacts) creates imperfect edges
- You're fighting video compression — green pixels bleed into edge pixels at low bitrates

**Non-obvious gotchas:**
- CSS `mix-blend-mode` hacks work for solid backgrounds but not for compositing one video onto another
- Canvas-based solutions work but eat CPU. WebGL shaders are the performant path
- The chroma-key quality depends entirely on how clean the Omniagent API's green-screen output is — if it's a perfect green with no gradient, a simple threshold shader works. If there's variance, you need edge softening
- On mobile devices, 4 simultaneous canvas/WebGL operations will throttle

**Your options:**

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| CSS-only with solid colored backgrounds (no true compositing) | Free | Low | If green-screen isn't needed — just put each agent in a styled panel |
| Canvas 2D per-pixel processing | Free | Medium | Works but CPU-heavy; fine for desktop |
| WebGL fragment shader | Free | High | Best performance; handles 4 streams smoothly |
| Skip compositing entirely — use panels with backgrounds | Free | Minimal | Hackathon pragmatism — panels look great without green-screen removal |

**Recommendation:** For the hackathon, skip true green-screen compositing. Use `useGreenVideo: true` in the API config, but display each agent in their own styled panel with a dark background. The green-screen video will have a clean green background that you can simply crop or CSS-mask. Save WebGL compositing for a future "wow" iteration. The multi-agent debate spectacle is impressive enough without pixel-perfect compositing.

---

### Hurdle 4: Latency Compounding
**Category:** Performance
**Difficulty:** High
**Effort Estimate:** Ongoing tuning throughout development

**What makes this inherently challenging:**
- Each agent has ~300ms response latency (API processing)
- If agents respond sequentially (A speaks → relay to B → B thinks 300ms → B speaks → relay to C → C thinks 300ms...), a 4-agent round takes 1.2+ seconds of dead air between each response
- The conversation feels dead if there's more than 500ms of silence between speakers
- This is a fundamental physics-of-the-system problem, not a code quality issue

**Non-obvious gotchas:**
- The "obvious" solution (parallel processing) doesn't work for sequential debate — Agent C can't respond to Agent B until B has spoken
- However, you CAN relay the transcript to all agents simultaneously and let the turn manager decide whose response to surface first
- The real trick: have all non-speaking agents "think" in parallel (they all receive the transcript), but only unmute them in sequence. This hides latency behind the previous speaker
- You may need to add artificial "thinking" animations (agent nodding, looking thoughtful) during the 300ms processing window to make silence feel intentional

**Your options:**

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| Sequential relay with "thinking" animations | Free | Low | Simple but feels slow with 4 agents |
| Parallel relay + sequenced unmuting | Free | Medium | Agents pre-generate responses; feels snappier |
| Pre-prompt with predicted responses | Free | High | Inject "predict what others will say" to reduce surprise latency |
| Reduce to 2-3 agents | Free | None | Fewer agents = less compounding latency |

**Recommendation:** Parallel relay + sequenced unmuting. When Agent A finishes, relay simultaneously to B/C/D. All three generate responses in parallel (~300ms). Then unmute them one at a time with 1-2 second spacing. From the viewer's perspective, it feels like agents are "waiting their turn" rather than "processing." If 4 agents still feels sluggish, drop to 3 — that's still unprecedented.

---

### Hurdle 5: SIP Phone Integration
**Category:** Third-Party Integration
**Difficulty:** Medium
**Effort Estimate:** 3-5 days

**What makes this inherently challenging:**
- SIP integration requires a phone number (Twilio, Vonage, or similar) connected to the Omniagent API's SIP endpoint
- Call routing logic: who does the caller talk to? How do you switch between agents?
- The caller exists outside your web UI — they can't see what's happening on screen
- Audio quality over phone lines is inherently lower than WebRTC

**Non-obvious gotchas:**
- You need a SIP trunk provider (Twilio SIP) that can bridge to the Omniagent API's SIP endpoint
- The caller's audio becomes input to ONE agent, but you need the other agents to hear the exchange (relay the caller's transcript to non-targeted agents)
- Phone call state management (ringing, answered, hangup) must integrate with your turn management system
- If the caller hangs up mid-sentence, you need to detect this and gracefully resume normal debate flow

**Your options:**

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| Twilio SIP Trunking + Omniagent SIP endpoint | $1-5/month + per-minute | Medium | Industry standard; well-documented |
| Vonage/Nexmo SIP | $1-5/month + per-minute | Medium | Alternative to Twilio |
| Skip SIP — use browser-based voice input for "challenger" mode | Free | Low | Hackathon pragmatism if SIP proves too complex to wire up in time |

**Recommendation:** Attempt Twilio SIP integration — it's a genuine differentiator for the demo. But have the browser-based fallback ready (user clicks "Challenge" button and their mic input goes to one agent). Both achieve the same spectacle; SIP is just more impressive on a phone.

---

### Hurdle 6: Concurrent Connection Limits
**Category:** API Constraints
**Difficulty:** Medium
**Effort Estimate:** 1-2 days of testing

**What makes this inherently challenging:**
- The Omniagent API documentation doesn't explicitly state how many simultaneous WebRTC connections are allowed per API key
- You're using the API in an unprecedented way (4 agents concurrently from one server)
- If there's a hidden limit of 1-2 connections, the entire project concept is at risk

**Non-obvious gotchas:**
- Test this IMMEDIATELY — before building anything else. If the API caps at 1-2 concurrent connections, you need to contact Napster support or redesign
- The limit might be per-API-key, per-IP, or per-account — and it might not be documented
- Even if 4 connections work, they might degrade in quality (lower video bitrate per connection to share bandwidth)

**Your options:**

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| Test early + request higher limits from Napster | Free | None | First step regardless |
| Multiple API keys (one per agent) | May violate ToS | Low | Workaround if per-key limits exist |
| Design for 2-3 agents with graceful scaling | Free | Low | Safe fallback if 4 isn't possible |

**Recommendation:** Write a connection test script on Day 1 of development. Spin up 4 agents and verify they all stream simultaneously. If they don't, contact Napster hackathon support immediately. Design the system to work with 3 agents minimum (still impressive) with 4 as the stretch goal.

---

### Hurdle 7: Audience Injection at Scale
**Category:** Real-Time & Moderation
**Difficulty:** Low
**Effort Estimate:** 1-2 days

**What makes this inherently challenging:**
- Multiple audience members sending chaos injections simultaneously could overwhelm agents
- System prompt injection mid-conversation needs careful timing (don't inject while agent is mid-sentence)
- Content moderation of audience input (prevent abuse)

**Non-obvious gotchas:**
- The `send_message` API with role "system" injects context, but if you inject too frequently, the agent's context window fills with audience noise and response quality degrades
- You need to batch/debounce injections — pick one per 30-second window

**Recommendation:** Simple queue + cooldown. One injection processed per 30 seconds. Show the queue to the audience. For the hackathon, basic rate limiting is sufficient — you won't have hundreds of concurrent users.

---

### Hurdle 8: Persistent Memory Coherence
**Category:** Data & AI
**Difficulty:** Medium
**Effort Estimate:** 2-3 days

**What makes this inherently challenging:**
- Each agent has independent memory via `externalClientId`
- Agents need to remember EACH OTHER (not just the human user) — so memory must be structured as agent-to-agent relationships
- Memory recall can be inaccurate or inappropriate (agent references something from 5 debates ago that's not relevant)

**Non-obvious gotchas:**
- The `externalClientId` creates a memory channel between a "user" and an "agent." For agent-to-agent memory, you'd need to treat Agent A as the "user" when talking to Agent B — meaning the memory IDs need careful namespace planning
- If an agent recalls something embarrassing or wrong, there's no way to "edit" the memory retroactively — you'd need to inject a correction via system prompt
- Memory quality degrades if sessions are too frequent with too much content — the signal-to-noise ratio matters

**Recommendation:** Use a structured `externalClientId` format like `arena_agent_{agentA}_vs_{agentB}` for each agent pair. Keep early sessions focused on building memorable moments. For the hackathon demo, seed a few "memorable" exchanges beforehand so the persistent memory is impressive from the first demo.

---

## Tech Stack Selection Handoff

### Must-Have Capabilities
Your tech stack needs to support:
- [ ] Multiple simultaneous WebRTC connections from a single page
- [ ] Server-side WebSocket/event management (subscribing to multiple agent message streams)
- [ ] Real-time bidirectional communication between server and client (for audience interactions)
- [ ] REST API calls to Omniagent API from server (agent creation, message sending)
- [ ] Static frontend hosting with real-time updates
- [ ] SIP/telephony integration (Twilio or similar)
- [ ] Minimal persistent storage (debate history, agent configs)

### Key Decisions That Affect Everything Downstream
1. **Server runtime** — needs to handle multiple concurrent WebSocket connections and WebRTC signaling. Node.js is the natural choice (matches the Omniagent SDK's JavaScript focus)
2. **Real-time client communication** — WebSockets from server to frontend for live updates (who's speaking, audience events, transcripts). Socket.io or native WS
3. **Deployment model** — needs always-on server (not serverless) due to persistent WebRTC connections. A small VPS or container service

### Suggested Evaluation Criteria
When evaluating tech stack options, prioritize:
1. **WebRTC compatibility** — must work seamlessly with the Omniagent SDK's connection model
2. **Real-time event throughput** — server must handle multiple simultaneous event streams without blocking
3. **Deployment simplicity** — hackathon timeline means minimal DevOps overhead
4. **Developer velocity** — frameworks/tools you can ship fast with, not necessarily the "best" architecture
