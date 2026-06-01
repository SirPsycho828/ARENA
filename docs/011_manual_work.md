# Manual Work Inventory: A.R.E.N.A.

## Summary

14 manual tasks identified. 5 are blockers that must happen before meaningful development can begin. The rest can be done in parallel with coding.

---

## Blocking Tasks (Do These First)

These must be completed before development can start or proceed past the prototype stage.

### 1. Napster Omniagent API Key
**What:** Sign up for the Omniagent developer portal and obtain an API key
**Why it blocks:** Cannot create agents, establish connections, or test anything without this
**How:**
- Go to developers.napster.com
- Create a developer account
- Register for the hackathon (May 18 – June 15 window)
- Obtain API key and note any rate limits or credit allocations
**Time:** 10-30 minutes
**Priority:** Do this TODAY

### 2. SDK/API Proof-of-Concept Test
**What:** Verify that you can create an agent, establish a WebRTC connection, receive video, and extract the MediaStream — AND test multiple simultaneous connections
**Why it blocks:** The entire project depends on capabilities that may not exist or work as assumed. If the SDK doesn't expose MediaStream, or if concurrent connections are limited to 1-2, the architecture needs fundamental redesign.
**How:**
- Create a bare HTML page
- Include the Omniagent SDK
- Create one agent, connect, verify video appears
- Inspect the DOM to find the video element and check if `srcObject` is accessible
- Attempt 2 agents simultaneously
- Attempt 3-4 agents simultaneously
- Document findings: what events fire, what's exposed, what's not
**Time:** 2-4 hours
**Priority:** Immediately after getting API key

### 3. Twilio Account Setup
**What:** Create a Twilio account, get a phone number for SIP integration
**Why it blocks:** SIP call-in feature requires a working phone number and SIP trunk configuration
**How:**
- Sign up at twilio.com
- Verify your account (phone verification)
- Claim trial credits ($15 free)
- Purchase a phone number ($1/month)
- Note: SIP trunking configuration can happen later — just need the account and number first
**Time:** 15-30 minutes
**Priority:** Within first 2 days

### 4. Railway Account Setup
**What:** Create a Railway account and verify deployment works
**Why it blocks:** Need to confirm the server can maintain persistent WebSocket/WebRTC connections (not all hosting platforms support this well)
**How:**
- Sign up at railway.app (GitHub OAuth recommended)
- Create a test project
- Deploy a minimal Express + Socket.io server
- Verify WebSocket connections persist (don't timeout)
- Note the free tier limits (500 hours/month execution)
**Time:** 30-60 minutes
**Priority:** Within first 3 days

### 5. Content Decision: Agent Personalities
**What:** Write the actual system prompts for 3-4 debate characters
**Why it blocks:** Cannot meaningfully test the debate system without defined personalities. These are creative decisions that affect everything about the experience.
**What to define for each agent:**
- Name and title (e.g., "The Comedian — Trash Talk Specialist")
- Personality traits (argumentative style, humor level, intelligence display)
- Debate strategy (interrupts often? builds long arguments? uses analogies?)
- Full system prompt (500-1000 words describing their persona, rules, and behavior)
**Suggested cast:**
- The Comedian (aggressive humor, pop culture references, roasts opponents)
- The Professor (scholarly, cites "studies," condescending but informed)
- The Conspiracy Theorist (connects everything to hidden forces, passionate, paranoid)
- The Zen Monk (calm, asks deep questions, turns arguments into philosophy)
**Time:** 2-4 hours of creative writing
**Priority:** Before building the orchestration layer

---

## Parallel Tasks (Do Alongside Development)

### 6. Hackathon Submission Registration
**What:** Register your project on the hackathon submission platform
**Why:** Don't miss the submission deadline (June 15). Early registration confirms your slot.
**How:** Check developers.napster.com for submission instructions. May require a project name, description, and team info.
**Time:** 15 minutes
**Priority:** Within first week

### 7. Domain Name (Optional)
**What:** Register a short, memorable domain for the demo (e.g., arena-ai.live or enterthe.arena)
**Why:** Makes the demo URL shareable and professional. "Check out enterthe.arena" sounds better than "check out my-project.up.railway.app"
**How:** Namecheap or Cloudflare Registrar. Point DNS to Railway.
**Time:** 15 minutes
**Cost:** $5-15/year
**Priority:** Nice-to-have, do in final week

### 8. Demo Video / Screen Recording Setup
**What:** Prepare screen recording software for the hackathon submission video
**Why:** Most hackathons require a demo video. You'll need to record the live debate in action.
**How:** OBS Studio (free) or Loom. Test recording with audio (you'll want your narration + agent audio).
**Time:** 30 minutes to set up and test
**Priority:** Final week of hackathon

### 9. SIP Trunk Configuration
**What:** Configure Twilio SIP Trunking to bridge incoming calls to the Omniagent SIP endpoint
**Why:** Required for the phone call-in feature
**How:**
- In Twilio Console → Elastic SIP Trunking → Create trunk
- Configure origination URI (pointing to your server webhook)
- Configure termination URI (pointing to Omniagent SIP endpoint)
- Map your phone number to the SIP trunk
- Test with a real phone call
**Time:** 1-2 hours (can be fiddly)
**Priority:** After core orchestration works

### 10. Agent Avatar Selection
**What:** Choose which avatar styles/appearances each agent should have
**Why:** Visual identity is part of the spectacle. Different-looking avatars make it immediately clear who's who.
**How:**
- Review Omniagent avatar options (may be configurable via API)
- Assign visually distinct avatars to each personality
- Ensure they work with green-screen mode
**Time:** 30 minutes
**Priority:** During UI development phase

### 11. Debate Topic Library
**What:** Create a list of 20-30 debate topics that generate entertaining arguments
**Why:** The system needs a rotation of topics. Good topics create better debates.
**Criteria for good topics:**
- Universally understood (no niche knowledge required)
- Genuinely debatable (no clear "right" answer)
- Entertaining when argued passionately
- Won't offend hackathon judges
**Examples:**
- "Is a hot dog a sandwich?"
- "Should humans colonize Mars?"
- "Is social media making us smarter or dumber?"
- "Would you rather fight 100 duck-sized horses or 1 horse-sized duck?"
- "Is AI art real art?"
**Time:** 1 hour
**Priority:** Before demo prep

### 12. Custom Tool Webhook Definitions
**What:** Define the webhook payloads and responses for custom agent tools (ring_bell, drop_mic, etc.)
**Why:** Agents need to know what tools they have and how to call them. The webhook endpoints need to exist before agents can use them.
**What to define:**
- Tool name, description, and parameters (JSON schema)
- Webhook URL for each tool
- Expected server behavior when tool is called
- Response format back to the agent
**Time:** 1-2 hours
**Priority:** During orchestration development

### 13. README and Hackathon Submission Writeup
**What:** Write the project description, technical overview, and setup instructions
**Why:** Hackathon submissions need clear documentation. Judges read this before/after watching the demo.
**Contents:**
- Project name and one-liner
- What it does (with screenshot or GIF)
- How it uses the Omniagent API (specific features leveraged)
- Technical architecture overview
- Setup instructions (for judges who want to run it)
- What makes it unique
**Time:** 1-2 hours
**Priority:** Final 2-3 days before submission

### 14. Pre-Demo Memory Seeding
**What:** Run a few "warm-up" debates before the live demo so agents have persistent memory to reference
**Why:** If the demo starts with zero memory, agents can't showcase the "callback humor" and "rivalry" features. Seeding 2-3 prior debates gives them material to reference.
**How:**
- Run 2-3 short debate sessions before the demo
- Use the same externalClientIds that the demo will use
- Ensure at least one memorable exchange per agent pair
- Verify agents recall these moments in a fresh session
**Time:** 30-60 minutes
**Priority:** 1-2 days before final demo

---

## Suggested Sequence (First 3 Days)

| Day | Manual Tasks | Why |
|-----|-------------|-----|
| Day 1 | #1 API Key, #2 Proof-of-concept test | Validate the project is possible |
| Day 1-2 | #3 Twilio setup | Get phone number while it's fresh |
| Day 2 | #5 Agent personalities (first drafts) | Need these to test orchestration |
| Day 2-3 | #4 Railway setup | Confirm deployment model works |
| Day 3 | #6 Hackathon registration | Don't forget this |

Everything else can happen in parallel with development during weeks 1-2.
