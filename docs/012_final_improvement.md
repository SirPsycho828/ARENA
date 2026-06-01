# PRD Final Improvement: A.R.E.N.A.

## Summary of Changes

This document consolidates findings from the three Red Team reviews (User, Developer, Designer) and resolves each critical/high issue with a final decision. These decisions amend and override the earlier PRD documents where they conflict.

---

## Critical Resolutions

### Resolution 1: Video Delivery Model (Developer #1, User #2)
**Issue:** The architecture was ambiguous about how viewers receive video streams from agents.

**Final Decision: Each viewer opens the ARENA page, the server mediates all connections.**

The actual model:
1. The **server** maintains WebRTC connections to each agent (3-4 connections)
2. The server captures agent video/audio streams
3. The server rebroadcasts to viewers via **WebSocket binary frames** (low-latency, simpler than WebRTC relay)
4. Alternatively, if the Omniagent SDK supports it: the server provides viewers with connection tokens, and viewers establish their own WebRTC connections directly to the Omniagent service

**Action:** The SDK PoC (Manual Work #2) determines which model is feasible. Design for Model B (server captures + rebroadcasts) as the primary plan, with Model A (direct viewer connections) as the simpler fallback if the API supports multiple viewers per agent.

**Impact on Architecture:** Add a potential media relay layer to the server. If using WebSocket binary frames, viewers receive video as a canvas render (lower quality but universal). If direct WebRTC, viewers need the Omniagent SDK loaded client-side.

### Resolution 2: SDK Widget Extraction (Developer #2)
**Issue:** The SDK may not expose raw MediaStream for custom multi-panel layouts.

**Final Decision: Two-track approach.**

- **Track A (attempt first):** Use the SDK's widget, inspect the rendered DOM, and extract the video element's `srcObject`. If accessible, clone the stream into our custom layout.
- **Track B (fallback):** Use the REST API directly to establish WebRTC connections without the SDK widget. This requires manual SDP offer/answer exchange but gives full control.
- **Track C (last resort):** Use the SDK widgets as-is, position them with CSS Grid in our layout, and style around them (less control but zero DOM hacking needed).

Track C is the "get it working fast" option. Track A is ideal. Track B is for maximum control.

### Resolution 3: First-Time User Confusion (User #3, #4)
**Issue:** Users may not understand what they're watching, especially with muted audio.

**Final Decision: "Enter the Arena" splash screen.**

Instead of auto-loading into a muted silent video, the landing experience is:
1. Dark background with subtle agent silhouettes (low bandwidth)
2. Centered text: "A.R.E.N.A." + "AI agents debating live. You decide the rules."
3. A single button: **"ENTER THE ARENA"** (large, primary cyan, centered)
4. Clicking this button: unmutes audio, starts video streams, reveals full UI
5. This solves both the "what is this?" problem AND the browser audio autoplay restriction (user click enables audio)

---

## High Priority Resolutions

### Resolution 4: Phone Privacy (User #5)
**Final Decision: Browser-based voice challenger is the primary mode. SIP is a bonus.**

- **Primary:** "Challenge" button in the UI → user grants microphone → audio sent to selected agent via WebRTC (no phone number needed)
- **Secondary:** Phone number displayed as "Or call from your phone: [number]" for the impressive demo factor
- This means SIP integration is a stretch goal, not a blocker. The browser-based challenge achieves the same spectacle.

### Resolution 5: Testing Strategy (Developer #4)
**Final Decision: Three-tier testing approach.**

1. **Mock Mode:** A `MockOmniagent` class that simulates agent behavior (responds with canned text after 300ms delay, fires fake `message_received` events). Used for ALL development except final integration testing.
2. **Turn Manager Unit Tests:** The state machine is pure logic — test all transitions, timeouts, and interrupt handling with Jest/Vitest.
3. **Integration Test Script:** A step-by-step manual checklist for verifying the full flow works end-to-end with real agents. Run this before each demo.

### Resolution 6: Single Server Resilience (Developer #5)
**Final Decision: Auto-recovery on restart.**

- SQLite stores `active_session` state (which agents were connected, what topic)
- On server start: check for active session in DB → if found, attempt to reconnect all agents
- On SIGTERM: gracefully close all Omniagent sessions before exit
- Railway health check endpoint: `GET /health` returns agent connection statuses
- Backup plan: keep a second Railway service with the same code ready to deploy in 60 seconds

### Resolution 7: Page Layout (Designer #1)
**Final Decision: Codified layout specification.**

```
Desktop (1024px+):
- Video Grid: 65% width, left-aligned, 2x2 agent panels
- Transcript Panel: 35% width, right sidebar, full height
- Topic Bar: 100% width, 56px height, fixed top
- Controls Bar: 100% width, 80px height, fixed bottom
- Video panels: 8px gap, equal sizing

Tablet (768px-1023px):
- Video Grid: 100% width, 2x2 panels (smaller)
- Transcript: collapsed to bottom 25% height
- Controls: overlay at bottom

Mobile (< 768px):
- Single active speaker: full width, 60% height
- Thumbnail strip: 4 small panels at top (tap to switch focus)
- Transcript: 20% height below video
- Controls: bottom sheet (swipe up to reveal)
```

### Resolution 8: Agent Panel States (Designer #2)
**Final Decision: Four visual states per agent panel.**

| State | Border | Background | Label | Indicator |
|-------|--------|------------|-------|-----------|
| Speaking | 2px `#00F0FF` + glow | Normal | Full bright | Animated soundwave icon |
| Thinking | 2px `#FFAA00` (amber) | Normal | 90% opacity | Pulsing dot |
| Idle | 1px `#2A2A3E` | Normal | 70% opacity | None |
| Disconnected | 1px `#3D3D5C` dashed | Darkened overlay | 50% opacity | "Reconnecting..." text |

The soundwave icon (not just glow) ensures accessibility for color-blind users.

---

## Medium Priority Resolutions

### Resolution 9: Chaos Injection Feedback (User #7, Designer #3)
**Final Decision: Explicit 4-state feedback chain.**

1. **Submitted** — Button disables, shows checkmark
2. **Queued** — Toast: "Your rule is #2 in queue"
3. **Applying** — Fullscreen flash effect (50ms), on-screen overlay appears
4. **Active** — Rule text displayed as overlay "bug" on video grid (like a sports score ticker)

The controls bar uses subdued styling (ghost buttons) until hovered. Active rules display ON the video grid as overlays, not in the controls.

### Resolution 10: Transcript Readability (Designer #6)
**Final Decision:**
- Font size: 15px (not 14px)
- Line spacing: 12px between messages
- Agent name as colored pill badge (4px padding, rounded, agent color at 20% opacity background with solid text)
- Latest 3 messages at full opacity, older messages fade to 50%
- Auto-scroll with "scroll lock" on manual scroll-up (show "↓ New messages" button to resume)
- "Currently Speaking" highlight at top of transcript panel (larger text, stays pinned)

### Resolution 11: Mobile Experience (Designer #4)
**Final Decision: Single-speaker focus mode on mobile.**
- Default view: active speaker fills the viewport
- Top strip: 4 small circular agent thumbnails (active has cyan ring)
- Tap a thumbnail to switch focus to that agent
- Swipe left on video to open transcript overlay
- Swipe up from bottom to open controls
- No 2x2 grid on mobile — it's a different experience, optimized for the device

### Resolution 12: Agent Color Palette (Designer #5)
**Final Decision:** Locked agent colors:
- Agent A: `#00F0FF` (Electric Cyan)
- Agent B: `#A78BFA` (Violet)
- Agent C: `#FBBF24` (Amber)
- Agent D: `#84CC16` (Lime)

These are used for: transcript name badges, panel border accents (speaking state), vote buttons, and avatar background tints.

---

## Scope Adjustment: What's MVP vs. Post-Hackathon

Based on the Red Team findings, here's the final scope decision:

### MVP (Must ship for hackathon demo):
- 3 agents debating (not 4 — reduces complexity, still unprecedented)
- Transcript relay + turn management (round-robin + interrupt tool)
- Audience chaos injection (topic change + rule injection)
- Audience voting (simple tallies)
- Spectator UI (multi-panel video, transcript feed, topic display)
- "Enter the Arena" splash page
- Persistent memory (agent callbacks to prior debates)
- Browser-based voice challenger (WebRTC mic input, not SIP)

### Stretch (if time allows):
- 4th agent
- SIP phone call-in (real phone number)
- Custom tools (ring_bell, drop_mic) with webhook responses
- Agent stats page
- Debate recording/replay

### Post-Hackathon:
- Multi-room support
- Twitch streaming integration
- AR overlay mode
- Audience profiles and leaderboards
- AI commentary track

---

## Final PRD Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| Vision & concept | Very High | Unique, compelling, demonstrates API capabilities |
| Technical feasibility | Medium | Depends entirely on SDK PoC results (Manual Work #2) |
| Design system | High | Comprehensive, accessible, dark-mode-first |
| User experience | High | Zero-friction entry, clear value in 5 seconds |
| Architecture | Medium-High | Sound choices, but video delivery model needs validation |
| Scope for hackathon timeline | High | MVP is focused and achievable in 2 weeks |
| Competitive differentiation | Very High | Nobody else will build multi-agent orchestration |
