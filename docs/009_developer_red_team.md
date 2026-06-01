# Developer Red Team Review: A.R.E.N.A.

## Health Check Summary

**Overall Assessment:** The technical architecture is ambitious and well-conceived for a hackathon. The biggest engineering risks are (1) the undocumented WebRTC multi-viewer model, (2) the timing precision required for natural-feeling multi-agent conversation, and (3) the gap between what the SDK provides and what you need to build custom. The tech stack choices are sound, but several implementation details need resolution before coding begins.

### Issues Summary

| # | Severity | Issue | Category |
|---|----------|-------|----------|
| 1 | Critical | WebRTC viewer model undefined — does each viewer need their own agent connections? | Architecture |
| 2 | Critical | Omniagent SDK may not expose raw MediaStream for custom layouts | API Constraint |
| 3 | High | Transcript relay debouncing strategy undefined | Implementation |
| 4 | High | No testing strategy for a real-time multi-connection system | Quality |
| 5 | High | Single server = single point of failure during live demo | Infrastructure |
| 6 | Medium | Socket.io room management for multiple concurrent debates not designed | Implementation |
| 7 | Medium | SQLite write contention if transcript logging is synchronous | Performance |
| 8 | Medium | No graceful shutdown handling — WebRTC connections orphaned on server restart | Operations |
| 9 | Low | Custom tool definitions (ring_bell, drop_mic) not specified as API payloads | Implementation |
| 10 | Low | No monitoring/alerting for production demo | Operations |

---

## Critical Issues

### Issue 1: WebRTC viewer model is the fundamental unknwon
**The problem:** The architecture diagram shows video flowing from server to viewers, but WebRTC doesn't work that way by default. There are three possible models:

**Model A: Each viewer connects directly to each agent (peer-to-peer)**
- Requires each viewer to establish 3-4 WebRTC connections to the Omniagent service
- The SERVER doesn't handle video at all — it only does orchestration
- Problem: Does the Omniagent API support multiple simultaneous viewers for the same agent? Probably not — each connection is a separate session.

**Model B: Server establishes one connection per agent, restreams to viewers**
- Server acts as an SFU (Selective Forwarding Unit)
- Problem: Node.js doesn't natively handle media stream rebroadcasting. You'd need a media server (Janus, mediasoup) — significant complexity.

**Model C: Each viewer gets their OWN set of agents**
- Each viewer sees the same personalities but in their own independent session
- The "debate" is actually N independent instances, not a shared spectacle
- Problem: Destroys the "live show" concept. No shared audience.

**The likely answer:** Model A with a twist — ONE set of agents exists (on the server), and their video/audio is captured server-side then re-streamed to viewers via a simpler protocol (HLS, DASH, or WebSocket binary frames). This makes it broadcast-like.

**Action required:** Test the Omniagent SDK immediately to determine:
1. Can you access the raw MediaStream from a server-side WebRTC connection?
2. Can you record/capture agent video on the server?
3. What happens if you try to connect multiple clients to the same agent simultaneously?

### Issue 2: SDK widget extraction
**The problem:** The Omniagent SDK provides a UI widget per connection. The PRD assumes you can "extract the MediaStream" from the widget. But:
- If the SDK renders the video inside a Shadow DOM or iframe, you can't access the video element
- If the SDK doesn't expose the underlying RTCPeerConnection, you can't get the MediaStream
- If the SDK manages its own UI lifecycle, unmounting it may kill the connection

**Action required:** Before any other development, write a proof-of-concept that:
1. Creates one agent via the SDK
2. Inspects what DOM elements are created
3. Attempts to access the video element's `srcObject` (the MediaStream)
4. Attempts to use the API without the SDK widget (REST-only connection establishment)

**Fallback plan:** If the SDK is opaque, use the REST API directly to establish WebRTC connections manually. This is more complex but gives full control over the media streams.

---

## High Priority Issues

### Issue 3: Transcript relay debouncing
**The problem:** The `message_received` event may fire:
- Once per complete utterance (ideal)
- Multiple times with partial transcripts that build up (like streaming tokens)
- Once for the agent's speech AND once for the relayed input it received

Without knowing the event firing pattern, the relay engine could:
- Relay partial transcripts (Agent B responds to half a sentence)
- Double-relay (echo loops)
- Miss the final complete transcript

**Action required:**
1. Log ALL `message_received` events during a test conversation
2. Determine: does the event include a `final: true` flag? A sequence number? A message ID?
3. Design the debounce strategy based on actual event behavior, not assumptions

### Issue 4: No testing strategy
**The problem:** This system has complex real-time interactions (multiple WebRTC streams, Socket.io events, state machine transitions, timing-sensitive relay logic). But there's no test plan. In a hackathon, you won't write comprehensive tests — but you need at minimum:

**Suggested minimum testing:**
- Unit tests for the Turn Manager state machine (it's pure logic, easy to test)
- A mock mode for the Omniagent API (so you can develop orchestration without burning API minutes)
- A "dry run" mode that uses text-only (WebSocket) connections instead of WebRTC for faster iteration
- Manual test script: "Steps to verify the complete flow works end-to-end"

### Issue 5: Single server = demo day risk
**The problem:** Railway hosts one server instance. If it crashes during the live hackathon demo, there's no automatic failover. WebRTC connections don't survive server restarts — all agents disconnect instantly.

**Suggested mitigation:**
- Implement auto-restart via Railway's health check
- Add a "reconnect all" function that re-establishes agent connections on server boot
- Store session state in SQLite so recovery knows what to recreate
- Have a pre-warmed backup Railway instance ready to deploy

---

## Medium Priority Issues

### Issue 6: Multi-room design gap
**The problem:** The data flow doc shows one active debate session. But what if you want to demonstrate "switching channels" or have a fallback debate running? Socket.io rooms need explicit join/leave logic, and the turn manager needs to be per-session, not global.

**Suggested fix:** Scope all state by `sessionId` from day one. The Turn Manager should be a class instantiated per session, not a singleton.

### Issue 7: SQLite write contention
**The problem:** If you're logging every transcript line synchronously (and agents speak every few seconds × 4 agents), SQLite writes could bottleneck — especially since `better-sqlite3` is synchronous.

**Suggested fix:** Use WAL mode (`PRAGMA journal_mode=WAL`) and batch transcript writes (buffer 5 seconds, write batch). Or make transcript logging fire-and-forget (write async, don't await).

### Issue 8: Graceful shutdown
**The problem:** If the server crashes or restarts, all WebRTC connections to Omniagent are orphaned. The API may continue billing for those sessions. When the server comes back, it has no record of what connections still exist on the Omniagent side.

**Suggested fix:**
- On server start, call the Omniagent API to list active sessions and terminate any orphans
- On graceful shutdown (SIGTERM), close all agent sessions explicitly
- Store connection state in SQLite so recovery knows what exists

---

## Low Priority Issues

### Issue 9: Custom tool definitions
**The problem:** The PRD references agents calling tools like "ring_bell" and "drop_mic" but doesn't define the actual tool payloads, webhook endpoints, or response formats.

**Suggested fix:** Define a tools spec:
```json
{
  "name": "ring_bell",
  "description": "Interrupt the current speaker to take your turn immediately",
  "parameters": {},
  "webhook_url": "https://your-server/api/tools/ring_bell"
}
```

### Issue 10: No monitoring
**Suggested fix:** Add basic logging (console.log with timestamps) and a `/health` endpoint that reports: number of active agent connections, current session state, WebSocket client count. Display this data in the "Judge Mode" debug panel.

---

## Architecture Recommendations

1. **Start with 2 agents, not 4.** Get the relay working perfectly with 2, then scale up. 4 agents is a multiplier on every bug.
2. **Build the orchestration server FIRST.** Before any UI work, get two agents "debating" each other in a terminal. The orchestration is the hardest part.
3. **Mock the Omniagent API for development.** Create a fake agent that responds with canned text after a delay. This lets you build the entire system without burning API minutes.
4. **Add the UI only after orchestration works.** The frontend is the easy part. The multi-agent coordination is where the dragons live.
5. **SIP is a separate sprint.** Get the core debate working first. Phone integration is impressive but additive — the project works without it.
