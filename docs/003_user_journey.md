# User Journey for A.R.E.N.A.

## Executive Summary
A.R.E.N.A. is a live multi-agent debate arena where AI video avatars argue in real-time while audiences inject chaos. The core user journey takes a viewer from "what is this?" to active participant in under 60 seconds — no signup, no onboarding, just immediate spectacle that pulls you in and gives you power to shape what happens.

---

## 1. User Personas

### Primary User: The Spectator
- **Who they are:** Tech-curious viewers, AI enthusiasts, hackathon judges, content consumers looking for something novel
- **Their goal:** Be entertained and amazed by something they've never seen before
- **Their pain point:** AI demos are boring one-on-one chat interfaces; there's nothing to watch as a spectator
- **Technical comfort:** Mixed — ranges from hackathon judges (very technical) to casual viewers (non-technical)

### Secondary User: The Chaos Agent (Audience Participant)
- **Who they are:** Viewers who want to influence the show — Twitch chat energy, interactive entertainment fans
- **Their goal:** Cause entertaining disruptions and see their influence play out in real-time
- **Their pain point:** Most live content is view-only; they want agency
- **Technical comfort:** Non-technical — they just click buttons and type short text

### Tertiary User: The Challenger (Phone-In)
- **Who they are:** Bold audience members who want to directly confront an AI agent
- **Their goal:** Prove they can out-debate or fluster an AI on live "television"
- **Their pain point:** Talking to AI alone is boring; doing it in front of an audience with stakes is thrilling
- **Technical comfort:** Non-technical — they just dial a phone number

### Evaluator User: The Hackathon Judge
- **Who they are:** Technical evaluators assessing innovation, execution, and API usage
- **Their goal:** Understand the technical architecture and be impressed by what was built
- **Their pain point:** Most submissions require explanation; they want something immediately impressive
- **Technical comfort:** Very technical

---

## 2. Basic User Journey

1. Open the ARENA URL (no signup required)
2. See a live debate already in progress — 3-4 AI video avatars arguing on screen
3. Watch for a few seconds, grasp what's happening, feel the "holy shit" moment
4. Notice the audience panel — buttons to inject chaos
5. Click a chaos button (change topic, add a rule, vote)
6. Watch the agents react to the injection in real-time
7. Notice the phone number — call in to challenge an agent directly
8. Return later — agents remember the session and reference past events
9. Share the URL with friends ("you HAVE to see this")

---

## 3. Detailed User Journey

### Stage 1: Awareness & Discovery
**User Goal:** Find something interesting / evaluate a hackathon submission

1. User receives the ARENA URL (shared link, hackathon submission page, or direct navigation)
2. No landing page gate — the URL goes directly to a live debate in progress
3. Within 2 seconds, user sees multiple AI video avatars on screen, mid-argument
4. Audio plays automatically (or one click to unmute) — agents are talking over each other

**Emotional State:** Surprise → confusion → fascination ("Wait, are those AIs arguing with each other?")
**Potential Friction:** Audio autoplay policies may require a click. Solve with a prominent "Click to unmute" overlay that still shows the video underneath.

### Stage 2: First Value (Immediate — No Signup)
**User Goal:** Understand what they're watching and be entertained

1. User reads agent name labels and personality tags (e.g., "The Comedian — Trash Talk Specialist")
2. User follows the live transcript feed (color-coded by agent)
3. The current debate topic is displayed prominently at the top
4. User watches for 30-60 seconds — agents are making actual arguments, interrupting each other, referencing each other's points
5. User realizes this is live, unscripted, and different every time

**Emotional State:** Fascination → entertainment → "how the hell does this work?"
**Potential Friction:** If agents are mid-discussion on a boring topic, the first impression suffers. Solve with a "New Topic" button always visible, and auto-rotate topics every 5 minutes.

### Stage 3: Active Participation (Audience Panel)
**User Goal:** Influence what's happening on screen

1. User notices the audience interaction panel (side panel or bottom bar)
2. Panel shows clear, labeled buttons: "Change Topic" | "Add Rule" | "Boost Agent" | "Vote"
3. User clicks "Add Rule" and types "everyone must speak in rhymes"
4. Within 5 seconds, a system prompt injection fires — agents begin attempting to rhyme
5. The rule appears on-screen so everyone sees what was injected
6. User sees their influence reflected immediately — dopamine hit

**Emotional State:** Empowerment → delight → "I want to do that again"
**Potential Friction:** If multiple audience members inject simultaneously, it could be chaotic. Solve with a cooldown timer and a queue that shows pending injections.

### Stage 4: Deep Engagement (Phone Call-In)
**User Goal:** Directly confront an AI agent in front of an audience

1. User sees a phone number displayed on screen: "Call to challenge an agent"
2. User dials the number from their phone
3. A voice prompt asks which agent they want to challenge
4. Their call audio is routed to that agent as input
5. The agent responds — the caller hears it in their ear AND it plays on-screen
6. On-screen UI shows "LIVE CHALLENGER" badge on the relevant agent's panel
7. Other agents react ("Ooh, a human has entered the arena!")
8. After 60 seconds, the call gracefully ends and debate resumes

**Emotional State:** Nervous excitement → thrill → bragging rights ("I debated an AI live")
**Potential Friction:** SIP connection quality, caller not knowing what to say. Solve with a brief "tip" audio prompt before connecting ("Be bold. Challenge their argument. You have 60 seconds.")

### Stage 5: Ongoing Engagement (Return Visits)
**User Goal:** See what's new, check if agents remember them

1. User returns to ARENA hours or days later
2. Agents are debating a new topic — fresh content every visit
3. If user calls in again, the agent recognizes them: "You're back! Last time you tried to convince me the earth was flat."
4. Agent rivalries have evolved — the comedian has new callbacks from yesterday's debates
5. User checks the "rivalry stats" or "agent stats" if available

**Emotional State:** Curiosity → satisfaction ("it remembered!") → loyalty
**Potential Friction:** If memory produces irrelevant/wrong callbacks, it breaks immersion. Solve by keeping memory references brief and contextual.

### Stage 6: Advocacy & Sharing
**User Goal:** Show this to other people

1. User copies the URL and shares it with friends/colleagues
2. User screen-records a clip and posts it on social media
3. User tells people "you have to see this" in person
4. Friends visit → they become spectators → the cycle repeats

**Emotional State:** Excitement to share something unique → social proof from others' reactions
**Potential Friction:** None — the product IS the shareable moment. The hard part (creating viral-worthy content) happens automatically every time agents debate.

---

## 4. Key Moments of Truth

| Moment | What Happens | User Question | Success Criteria |
|--------|--------------|---------------|------------------|
| First 5 seconds | User sees multiple AI agents on screen arguing | "What am I looking at?" | User stays and watches instead of closing tab |
| First chaos injection | User clicks a button and agents react | "Does my input actually matter?" | Agent behavior visibly changes within 5 seconds |
| First phone call | User calls in and gets a response | "Will this actually work?" | Agent responds naturally and acknowledges the challenger |
| First return visit | User comes back and agent remembers | "Is this just a one-trick demo?" | Agent makes a specific, accurate memory reference |
| First share | User shows it to someone else | "Will they get it too?" | The other person's immediate reaction is visible amazement |

---

## 5. Friction Points & Opportunities

### Potential Friction Points
- **WebRTC connection time** — multiple video streams take a moment to initialize. Mitigation: show a "loading the arena" animation with personality (agents "warming up"), keep it under 3 seconds
- **Audio autoplay blocked** — browsers block autoplay. Mitigation: show video (muted) with a large, obvious "Unmute" button; video alone is still impressive
- **Chaos injection overload** — too many audience inputs could make agents incoherent. Mitigation: rate limiting + queue + priority system
- **SIP call quality** — phone audio may be low quality. Mitigation: signal processing on the server, keep interactions short (60s max)
- **Agent response latency** — ~300ms per agent plus orchestration relay time could feel slow. Mitigation: stagger agent responses naturally (like real panelists) so latency feels like "thinking"

### Delight Opportunities
- **Agents breaking the fourth wall** — occasionally referencing that they're AIs or that they know they're being watched
- **Rivalry escalation** — agents calling back to a specific viewer's chaos injection from earlier in the session
- **Crowd momentum** — when many people vote for the same agent, that agent gets visibly "energized"
- **Surprise agent entrances** — a new agent joins mid-debate as a "special guest"
- **Victory celebrations** — winning agent does a mini monologue while losers react with visible frustration

---

## 6. Success Metrics

### Leading Indicators (Early Signals)
| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Time-to-first-interaction | < 30 seconds | Users engage with chaos panel quickly = they understand and are hooked |
| Average watch duration | > 3 minutes | Users stay well beyond the "novelty peek" window |
| Chaos injection rate | > 1 per viewer per session | Viewers aren't just watching — they're participating |
| SIP call-in attempts | > 10% of viewers try calling | The phone feature is compelling enough to act on |

### Lagging Indicators (Outcome Metrics)
| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Return visit rate | > 30% within 48 hours | Product has pull beyond novelty |
| Share rate | > 20% of viewers share the URL | Organic virality confirms "DAMMMMNNN" factor |
| Hackathon judge watch time | > 5 minutes | Judges are genuinely engaged, not just evaluating |
| Concurrent viewer peak | 10+ simultaneous viewers | Proves it works under real audience conditions |

---

## 7. Edge Cases & Alternative Paths

- **No audience present:** Agents debate autonomously — the show runs with or without viewers. Feels like turning on a TV to a show already in progress.
- **Audience floods chaos injections:** Queue system processes one injection per 30 seconds, shows upcoming queue to manage expectations.
- **SIP caller is abusive/silent:** Auto-disconnect after 10 seconds of silence or if content moderation flags the input. Agent plays it off: "Seems our challenger got stage fright."
- **Agent WebRTC drops mid-debate:** Remaining agents acknowledge the departure ("Looks like they couldn't handle the heat") and continue as a smaller panel. Background reconnection attempt.
- **Very slow connection (viewer):** Degrade gracefully — audio-only mode with transcript feed if video can't stream.
- **Judge wants to see the tech:** A "Judge Mode" toggle reveals a debug panel showing real-time orchestration: transcript relay events, system prompt injections, tool calls, and latency metrics.
