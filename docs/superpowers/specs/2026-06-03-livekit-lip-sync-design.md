# Spec: LiveKit Lip-Sync Architecture

**Date:** 2026-06-03
**Status:** Approved design, pending implementation
**Goal:** Replace the fake lip-sync system with real lip-synced avatars using a headless browser host and LiveKit SFU, while preserving the shared-experience model where all viewers see the same debate.

---

## Problem

ARENA's current lip-sync is fake. The debate audio comes from a WebSocket connection (the "debate brain"), while the video avatars are separate WebRTC connections (the "visual face"). These two systems are completely isolated — the avatar's mouth moves to its own internally generated speech (which is muted), not to the debate audio the audience hears. The phonemes don't match, timing drifts, and the result looks unconvincing.

**Constraint confirmed by testing:** Cross-connection speech does NOT propagate. A message sent on a WebSocket connection does not trigger lip animation on a WebRTC connection to the same agent, even with the same `externalClientId`. Each connection is an independent session. (See `test/cross-connection/` for the proof.)

**Constraint from Napster API:** The API provides no viseme data, no external audio input for lip-sync, and no mouth control parameters. The ONLY way to get real lip-sync is to let the avatar generate its own speech via `sendCommand('send_message')` on a WebRTC connection.

## Solution

A headless Chrome instance (Puppeteer) on the server becomes the single "debate renderer." It holds WebRTC connections to all 3 Napster avatars, sends debate prompts via `sendCommand`, and publishes the resulting lip-synced video+audio streams to a LiveKit Cloud room. All viewers subscribe to that room and see the same debate with perfect lip-sync.

---

## Architecture

```
                    Napster Avatars (3x WebRTC)
                              |
                              v
            +--------------------------------------+
            |   Puppeteer (Headless Chrome)         |
            |                                       |
            |   [Rico iframe] [Helena] [Darius]     |
            |        |            |         |       |
            |     MediaStream capture               |
            |        |            |         |       |
            |   +----v------------v---------v----+  |
            |   |   LiveKit Publisher             |  |
            |   |   (livekit-client)              |  |
            |   +----------------+---------------+  |
            +-------------------|-------------------+
                                |
    ARENA Server (Node.js)      |      LiveKit Cloud (SFU)
    +-------------------+       |      +------------------+
    | TurnManager       |       +----->| Room: debate-{id}|
    | ChaosQueue        |              +--------+---------+
    | Credits/Voting    |                       |
    | Transcripts (DB)  |              +--------+---------+
    +--------+----------+              |        |         |
             |                      Viewer   Viewer   Viewer
          Socket.io               (LiveKit WebRTC subscription)
             |
    +--------+---------+
    |        |         |
 Viewer   Viewer   Viewer
 (transcript, chaos, votes, credits)
```

**Two parallel channels to each viewer:**
1. **Socket.io** (existing, unchanged) -- transcript text, chaos events, voting, credits, speaker changes
2. **LiveKit WebRTC** (new) -- avatar video + audio streams with perfect lip-sync

---

## Component: Avatar Host (Headless Browser)

### Lifecycle

1. Server boot -> Puppeteer launches headless Chrome
2. Loads `avatar-host.html` (served locally, same-origin)
3. Page creates 3 iframes, each loading `avatar-frame.html` with a Napster WebRTC token
4. Each iframe initializes the Napster SDK (`@touchcastllc/napster-companion-api`)
5. Waits for all 3 avatars to report "ready" via `postMessage`
6. Captures `MediaStream` from each avatar's `<video>` element via `captureStream()`
7. Publishes 3 video+audio track pairs to a LiveKit room
8. Reports "host ready" to server -> debate can begin

### Server -> Headless Browser (via Puppeteer)

```typescript
// Send debate prompt to an avatar
await page.evaluate(
  (agentId, prompt) => window.sendPrompt(agentId, prompt),
  agentId, prompt
);

// Stop an avatar from speaking
await page.evaluate(
  (agentId) => window.stopSpeaking(agentId),
  agentId
);
```

### Headless Browser -> Server (via exposed functions)

```typescript
await page.exposeFunction('onSpeechDelta', (agentId: string, text: string) => {
  // Emit transcript_delta to all viewers (same Socket.io event as current)
  io.emit('transcript_delta', { agentId, agentName: getName(agentId), content: text });
});

await page.exposeFunction('onSpeechEnd', (agentId: string, fullText: string) => {
  // Store transcript in DB, advance turn via TurnManager
  saveTranscript(agentId, fullText);
  turnManager.onSpeechEnd(agentId, fullText);
});

await page.exposeFunction('onTalkState', (agentId: string, state: string) => {
  // Track talk_state for dual-flag turn completion
  if (state === 'ended') markAudioDone(agentId);
});
```

### Text capture from SDK events

The Napster SDK's `onData` callback fires:
- `message_received` with `action: 'delta'` -- streaming text fragments
- `message_received` with `action: 'completed'` -- full response text
- `talk_state_changed` -- avatar speaking/stopped state

These are relayed to the server via the exposed functions above for transcript display and turn management.

### SDK singleton isolation

Same solution as current client: each avatar runs in its own iframe with its own JS context. Three iframes = three independent Napster SDK instances. Identical pattern to what works today.

---

## Component: LiveKit Integration

### Publisher (headless browser page)

After all 3 avatars are ready, the host page connects to LiveKit and publishes:

```typescript
import { Room, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';

const room = new Room();
await room.connect(LIVEKIT_URL, publisherToken);

for (const [agentId, iframe] of avatarIframes) {
  const stream = iframe.contentDocument.querySelector('video').captureStream();

  await room.localParticipant.publishTrack(
    new LocalVideoTrack(stream.getVideoTracks()[0]),
    { name: `${agentId}_video` }
  );
  await room.localParticipant.publishTrack(
    new LocalAudioTrack(stream.getAudioTracks()[0]),
    { name: `${agentId}_audio` }
  );
}
```

Track names include the agent ID so viewers can map tracks to avatar panels.

### Subscriber (viewer React app)

Viewers connect to the same LiveKit room and subscribe to tracks:

```typescript
import { Room, RoomEvent, Track } from 'livekit-client';

const room = new Room();
await room.connect(serverUrl, viewerToken);

room.on(RoomEvent.TrackSubscribed, (track, publication) => {
  const [agentId, kind] = publication.trackName.split('_');
  storeLiveKitTrack(agentId, kind, track);
});
```

The `AgentVideo` component renders a `<video>` element with the LiveKit track's `mediaStreamTrack` attached.

### Audio routing

Only the speaking avatar generates audio (others are idle). As extra safety:
- Headless browser mutes non-speaking avatars' audio tracks
- Viewer enables/disables audio tracks based on `currentSpeaker` from Socket.io

### Token generation (server-side)

```typescript
import { AccessToken } from 'livekit-server-sdk';

// Publisher token (headless browser): can publish, cannot subscribe
function createPublisherToken(roomName: string): string {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: 'arena-host', ttl: '2h',
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: false });
  return at.toJwt();
}

// Viewer token: can subscribe, cannot publish
function createViewerToken(roomName: string, viewerId: string): string {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: viewerId, ttl: '2h',
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: false, canSubscribe: true });
  return at.toJwt();
}
```

### Room lifecycle

- One room per debate session (room name = session ID)
- Headless browser joins first (publisher), viewers subscribe after
- Viewers joining mid-debate receive streams immediately
- Room destroyed when debate ends

---

## Component: Server Orchestration Changes

### Turn flow comparison

**Current (WebSocket-based):**
```
TurnManager selects agent
  -> server builds prompt with context
  -> omniagent.sendMessage(agentId, prompt) via WebSocket
  -> agent responds with text deltas + audio via WebSocket
  -> server emits transcript_delta + agent_audio to viewers
  -> server detects speech_end + talk_state:ended
  -> advance turn
```

**New (headless browser-based):**
```
TurnManager selects agent
  -> server builds prompt with context (SAME)
  -> page.evaluate('sendPrompt', agentId, prompt) via Puppeteer
  -> avatar responds with text + lip-synced video+audio
  -> headless browser relays text via onSpeechDelta/onSpeechEnd
  -> server emits transcript_delta to viewers (SAME event)
  -> video+audio delivered through LiveKit (NOT through server)
  -> headless browser relays talk_state via onTalkState
  -> server detects speech_end + talk_state:ended (SAME logic)
  -> advance turn
```

### Turn completion simplification

The current system tracks client audio playback (`turn_audio_complete`, `playback_done`, generation counters, estimated durations). All of this is removed. The server advances the turn when the headless browser reports both `speech_end` and `talk_state:ended` -- same dual-flag logic, without the playback tracking layer.

### Chaos system

Zero changes. Chaos actions flow the same way: viewer sends action via Socket.io, server validates credits, ChaosQueue modifies the next turn's prompt, modified prompt sent to headless browser instead of WebSocket. Avatar responds to the modified prompt.

### Unchanged systems

- TurnManager state machine (selection, timeouts, modes)
- ChaosQueue (rules, topics, voice challenges, cooldowns)
- Credit system (Stripe, Firebase, atomic transactions)
- Consensus Needle (voting, AI stance analysis)
- Agent creation via Napster API
- Transcript storage in SQLite
- All Socket.io events for transcript, chaos, voting

---

## Component: Client-Side Changes

### Files that change

| File | Change |
|---|---|
| `AgentVideo.tsx` | Rewritten: iframe -> LiveKit `<video>` element |
| `store/arena.ts` | Remove `agent_audio`, `turn_audio_complete`, `playback_done`, `videoTokens`. Add `livekitToken`, LiveKit room init. |
| `socket/handlers.ts` | Remove `createVideoTokensForViewer`. Add `livekit_token` emission. |

### Files deleted

| File | Reason |
|---|---|
| `client/src/lib/agent-audio.ts` | Audio comes through LiveKit |
| `client/src/avatar-main.ts` | Client-side Napster SDK replaced by LiveKit |
| `client/public/avatar.html` | Avatar iframes no longer needed on client |

### Files unchanged

All UI components except `AgentVideo.tsx`, all auth/Stripe/Firebase code, all chaos/voting/credit components, `shared/types.ts`.

### Socket.io events

| Event | Status |
|---|---|
| `speaker_change` (server->client) | Stays -- drives UI highlighting |
| `transcript_delta` (server->client) | Stays -- drives transcript display |
| `transcript_done` (server->client) | Stays -- finalizes transcript |
| `agent_audio` (server->client) | Removed -- LiveKit handles audio |
| `turn_audio_complete` (server->client) | Removed -- no playback tracking |
| `playback_done` (client->server) | Removed -- no playback tracking |
| `agent_video_tokens` (server->client) | Removed -- replaced by `livekit_token` |
| `livekit_token` (server->client) | New -- sends LiveKit credentials |
| All chaos/vote/credit events | Unchanged |

### New client dependency

`livekit-client` (~50KB gzipped)

---

## Deployment

### Docker changes

Add Chromium and Puppeteer dependencies:

```dockerfile
RUN apt-get update && apt-get install -y \
  chromium fonts-liberation libnss3 libatk-bridge2.0-0 \
  libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

### Resource requirements

| Resource | Current | With Headless Chrome |
|---|---|---|
| Docker image | ~200MB | ~500-600MB |
| RAM idle | ~150MB | ~400MB |
| RAM during debate | ~250MB | ~800MB-1.2GB |
| CPU | Low | Moderate |

Railway Pro (up to 8GB RAM) handles this comfortably.

### New environment variables

```
LIVEKIT_API_KEY=APIxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxx
LIVEKIT_URL=wss://your-project.livekit.cloud
```

### LiveKit Cloud setup

1. Create account at livekit.cloud (free tier, no credit card)
2. Create a project
3. Copy API key, secret, WebSocket URL
4. Add to Railway env vars

### Free tier limits

- 50 concurrent participants per room
- 25,000 participant-minutes/month

### Startup sequence

1. Express + Socket.io start
2. Create agents via Napster API
3. Launch Puppeteer (headless Chrome)
4. Load avatar-host.html with WebRTC tokens
5. Wait for all 3 avatars ready
6. Publish streams to LiveKit room
7. Start debate (TurnManager)

### Reliability

| Concern | Mitigation |
|---|---|
| Chrome crash | Puppeteer auto-restart with try/catch |
| LiveKit disconnect | Built-in reconnection in livekit-client |
| Napster avatar timeout (~60 min) | Watchdog reconnects in headless browser |
| Railway deploy restart | Debate restarts cleanly |

---

## Migration: Files Summary

### Deleted

- `server/src/omniagent/connection.ts` -- WebSocket debate connections
- `server/src/omniagent/webrtc-connection.ts` -- Server-side WebRTC experiment
- `server/src/omniagent/media-decoder.ts` -- Audio decoding for WebRTC
- `client/src/lib/agent-audio.ts` -- PCM audio playback
- `client/src/avatar-main.ts` -- Client-side Napster SDK
- `client/public/avatar.html` -- Avatar iframe page

### New

- `server/src/avatar-host/page.html` -- Headless browser page (3 iframes + LiveKit publisher)
- `server/src/avatar-host/avatar-frame.html` -- Individual avatar iframe
- `server/src/avatar-host/host-main.ts` -- Host page script (capture, prompts, events)
- `server/src/avatar-host/puppeteer.ts` -- Puppeteer lifecycle management
- `server/src/lib/livekit.ts` -- Token generation helpers
- `client/src/lib/livekit-room.ts` -- Client LiveKit room + track management

### Modified

- `server/src/sessions/manager.ts` -- Replace OmniagentConnection wiring with Puppeteer callbacks
- `server/src/omniagent/manager.ts` -- Thin wrapper around Puppeteer page commands
- `server/src/index.ts` -- Remove signaling proxy, remove video-tokens endpoint
- `server/src/socket/handlers.ts` -- LiveKit token instead of video tokens
- `client/src/components/AgentVideo.tsx` -- LiveKit video element
- `client/src/store/arena.ts` -- Remove audio handlers, add LiveKit state
- `Dockerfile` -- Add Chromium

### Net change

- ~400 lines removed
- ~500 lines added
- ~150 lines modified
- System becomes simpler: one audio/video path (LiveKit) replaces three disconnected systems

---

## Risks & Unknowns

### 1. `captureStream()` in headless Chrome

The spec relies on `HTMLVideoElement.captureStream()` to extract MediaStream from the Napster avatar's video element. This should work in headless Chrome (it's a standard API), but needs early validation.

**Fallback:** If `captureStream()` fails, intercept `RTCPeerConnection.prototype.ontrack` in the iframe to capture the remote MediaStreamTrack directly before it reaches the video element. This is more invasive but guaranteed to work since the track must pass through the PeerConnection.

### 2. SDK event format for text capture

The spec assumes the Napster SDK's `onData` callback fires `message_received` events with `action: 'delta'` and `action: 'completed'` (same as the WebSocket protocol). The cross-connection test showed `message_received` events firing on the WebRTC side, but the exact structure needs verification.

**Mitigation:** The first implementation task should validate SDK event structure. If deltas aren't available, fall back to capturing the full text on `action: 'completed'` and displaying it all at once (transcript appears on completion rather than streaming word-by-word). This is a cosmetic degradation, not a blocker.

### 3. Host page bundling

The headless browser pages (`page.html`, `avatar-frame.html`) need the Napster SDK and LiveKit SDK. Rather than adding a separate build step, use CDN bundles:

- Napster SDK: `https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@latest/lib/index.standalone.js`
- LiveKit client: `https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.js`

This keeps the host pages as plain HTML/JS with no build tooling. They only run in the controlled headless Chrome environment, so CDN reliability is not a concern (fetched once on startup).

### 4. Headless Chrome audio support

WebRTC audio decoding requires Chrome's audio subsystem. Headless Chrome may need the `--use-fake-device-for-media-stream` or `--autoplay-policy=no-user-gesture-required` flags. Puppeteer's `new` headless mode (`--headless=new`) has better media support than the old mode.

**Mitigation:** Launch Puppeteer with appropriate Chrome flags:
```typescript
const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
  ],
});
```

### 5. Debate text: avatar generates its own wording

With the headless browser approach, debate prompts go to the avatar via `sendCommand`, and the avatar's LLM generates the response. The avatar controls the exact wording (the server provides the prompt/context but doesn't control the output). This is functionally the same as the current WebSocket approach — the server sends a prompt and the agent decides what to say. The difference is the response comes through the WebRTC SDK events instead of WebSocket events.
