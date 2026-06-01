# Deep Research Prompts: A.R.E.N.A.

> **How to use these prompts:** Copy each prompt into a deep research AI tool (Perplexity, Claude with Research, ChatGPT with browsing, etc.) to get comprehensive, up-to-date analysis of your options.

---

## Prompt 1: Multi-Agent WebRTC Orchestration Patterns

**Related to Hurdle #1 from Technical Landmine Report**

```
## Research Request: Multi-Stream WebRTC in Browser Applications

### Project Context
I'm building a web application that needs to display 3-4 simultaneous WebRTC video streams from different AI avatar agents (Napster Omniagent API) on a single page. Each agent is a separate WebRTC peer connection. Key details:
- **Scale:** 3-4 concurrent WebRTC connections in a single browser tab
- **Budget:** Free/open-source preferred; it's a hackathon project
- **Timeline:** 2 weeks to build

### The Problem I Need to Solve
I need to establish and maintain multiple WebRTC peer connections simultaneously in one browser page, extract the MediaStream from each, and render them in a custom composite grid layout. The Napster Omniagent SDK provides a widget per connection, but I need to break out of the widget and render custom layouts.

### My Specific Requirements
- Must run 3-4 WebRTC video streams simultaneously without browser tab crashes
- Need to extract raw MediaStream from SDK-managed connections OR establish connections manually via API
- Must work in Chrome and Firefox (Safari nice-to-have)
- Need to detect which stream is currently producing audio (active speaker detection)
- Video streams will have green-screen backgrounds that may need CSS/canvas processing

### What I Need to Understand
1. What are the browser performance limits for concurrent WebRTC peer connections in 2026?
2. How do multi-party video apps (Google Meet, Zoom web) handle this technically?
3. Are there open-source libraries for managing multiple WebRTC streams in a custom layout?
4. What's the CPU/bandwidth impact of 4 simultaneous 720p WebRTC streams?
5. How can I detect the active speaker across multiple WebRTC connections (audio level monitoring)?

### Suggested Output Format
- Browser limits and performance benchmarks for concurrent WebRTC
- Architecture patterns used by existing multi-party video apps
- Open-source library recommendations
- Performance optimization techniques
- Active speaker detection approaches
```

---

## Prompt 2: Real-Time Turn Management in Multi-Agent Conversations

**Related to Hurdle #2 from Technical Landmine Report**

```
## Research Request: Conversational Turn-Taking Systems for Multi-Agent AI

### Project Context
I'm building a system where 3-4 AI agents (powered by Napster Omniagent API) have a conversation with each other. There is no native agent-to-agent communication — I must orchestrate it by relaying transcripts between agents. Key details:
- **Scale:** 3-4 agents in one conversation, single session at a time
- **Budget:** Hackathon project, no budget for external services
- **Timeline:** 2 weeks

### The Problem I Need to Solve
When Agent A finishes speaking, I need to:
1. Detect that speech has ended (via API events)
2. Relay Agent A's transcript to Agents B, C, D
3. Decide who speaks next (turn management)
4. Handle cases where an agent takes too long to respond (timeout)
5. Allow "interruptions" (an agent jumping in before their turn)

This needs to feel like a natural multi-person conversation, not a robotic round-robin.

### My Specific Requirements
- Agents produce speech and I receive transcripts via `message_received` WebSocket events
- I can send text to agents via `send_message` API (role: "user" or "system")
- Response latency per agent is ~300ms after receiving input
- The conversation needs to feel dynamic and natural to viewers
- Must handle edge cases: agent silence, overlapping responses, topic derailment

### What I Need to Understand
1. What academic research or industry implementations exist for multi-agent turn-taking?
2. How do AI agent frameworks (AutoGen, CrewAI, LangGraph) handle multi-agent conversation flow?
3. What state machine patterns work best for N-party conversation management?
4. How do real debate/panel shows manage turn-taking (broadcast TV floor management)?
5. Are there open-source implementations of multi-agent conversation orchestration I can reference?

### Suggested Output Format
- Overview of turn-taking approaches (round-robin, priority, reactive, hybrid)
- Relevant academic/industry implementations
- State machine design patterns for this problem
- Practical recommendations for my specific constraints
- Code architecture suggestions
```

---

## Prompt 3: SIP Telephony Integration with WebRTC Applications

**Related to Hurdle #5 from Technical Landmine Report**

```
## Research Request: SIP Phone Call Integration for Web Application

### Project Context
I'm building a live debate web app where AI agents argue with each other. I want audience members to be able to dial a phone number and "call in" to challenge one of the AI agents directly — their phone audio goes to the agent, and the agent's response plays back in their ear. Key details:
- **Scale:** 1 caller at a time (queued if multiple)
- **Budget:** Under $20/month for phone number + per-minute costs
- **Timeline:** 2 weeks (hackathon)

### The Problem I Need to Solve
I need to:
1. Get a phone number that people can call
2. Route the incoming phone call audio to a specific AI agent (via Napster Omniagent SIP endpoint)
3. Route the agent's audio response back to the caller
4. Display on-screen that a "live challenger" is active
5. Handle call lifecycle (ring, answer, timeout, hangup)

### My Specific Requirements
- The Napster Omniagent API supports SIP connections (I can connect an agent via SIP URI)
- I need a SIP trunk/number provider that can bridge to the API's SIP endpoint
- Must work with standard cell phones (no app install required for the caller)
- Need programmatic control (answer, transfer, hang up) from my server
- Call quality should be reasonable for a live demo

### What I Need to Understand
1. What are the cheapest/fastest SIP trunk providers for hackathon projects in 2026?
2. How does Twilio SIP Trunking work end-to-end? (Or alternatives like Vonage, Telnyx)
3. What's the simplest architecture to bridge an incoming phone call to a SIP endpoint?
4. Can I programmatically control call routing (direct to specific agent) mid-call?
5. What latency should I expect for phone-to-SIP-to-AI-to-SIP-to-phone round trip?
6. Are there simpler alternatives (WebRTC-based "phone call" that doesn't need a real phone number)?

### Suggested Output Format
- Comparison of SIP trunk providers (Twilio, Vonage, Telnyx, etc.)
- End-to-end architecture diagram description
- Cost breakdown for a hackathon demo
- Implementation complexity estimate
- Recommended approach with reasoning
```

---

## Research Tips

- **Run these prompts in order of hurdle priority** — earlier decisions may constrain later ones
- **If a prompt returns outdated info**, add "as of May 2026" to the prompt
- **For the Napster Omniagent API specifically**, supplement research with the actual API docs at developers.napster.com/docs — research tools may not have indexed this new API
- **Save the outputs** — they'll feed directly into your tech stack selection process
