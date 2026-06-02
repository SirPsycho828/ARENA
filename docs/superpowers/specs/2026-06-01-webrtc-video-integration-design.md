# WebRTC Video Integration Design Spec

**Date**: 2026-06-01
**Status**: Draft
**Goal**: Replace WebSocket-only agent connections with WebRTC connections to gain video tracks, then broadcast decoded video frames to all viewers via Socket.io.

---

## Problem

ARENA agents currently connect via WebSocket (`channelType: "websocket"`), which provides audio + text events but no video. The Napster API also supports `channelType: "webrtc"`, which adds an H264 video track showing a lip-synced avatar. We need video for the "wow factor" at the hackathon demo.

**Constraint**: Each WebRTC connection creates an independent session. We can't give every viewer their own WebRTC connection (different LLM responses, no shared experience). Instead, the **server** must be the single WebRTC peer, decode the video, and broadcast frames to all viewers.

## Architecture

```
Napster WebRTC Server
        |
   WebRTC (RTP)
        |
  ARENA Server (werift)
   /    |    \
  /     |     \
Audio  Video  DataChannel
  |     |       |
ffmpeg ffmpeg  JSON events
  |     |    (same as current WS)
  |     |
base64  JPEG
PCM    frames
  \     /
Socket.io broadcast
  \     /
  All Viewers
```

### Why werift?

- Pure TypeScript, zero native dependencies (no `node-webrtc` build issues)
- Runs on Railway without special system packages
- Standard WebRTC: createOffer, setLocalDescription, addIceCandidate, setRemoteDescription
- Actively maintained, supports Opus + H264

### Why NOT alternatives?

- **Shared token**: Each connection creates an independent LLM session. Two viewers see different responses.
- **Headless browser**: Puppeteer/Playwright running the Napster SDK. 500MB+ RAM per agent, fragile on Railway.
- **Client-side SDK**: Each viewer gets their own session. Not shared, not a broadcast.

## Data Flow

### 1. Connection Setup (replaces `OmniagentConnection.connect()`)

```
1. POST /public/agents/{agentId}/connections
   body: { channelType: "webrtc", externalClientId: "arena_..." }
   response: { token: "<base64>", connection: { id: "..." } }

2. Decode token → { signalingEndpoint, connection.id, authToken, expiresAt }

3. Open WebSocket to signalingEndpoint with Bearer auth

4. Create werift MediaSessionContext (RTCPeerConnection equivalent)
   - Add transceivers: audio (recvonly), video (recvonly)
   - Create data channel: "events"

5. Create SDP offer → send via signaling WS:
   { type: "set_remote_description", data: { sdp, type: "offer" } }

6. Gather ICE candidates → send each via signaling WS:
   { type: "add_ice_candidate", data: { candidate, sdpMid, sdpMLineIndex } }

7. Receive SDP answer from signaling WS:
   { type: "set_local_description", data: { sdp, type: "answer" } }

8. Apply answer → ICE connects → media flows
```

**Note**: The signaling protocol uses "set_remote_description" for the local offer (naming is from the server's perspective) and "set_local_description" for the remote answer. This was confirmed via the signal capture test.

### 2. Audio Pipeline (same output format as current)

```
werift audio track (Opus RTP packets)
  → pipe to ffmpeg stdin (RTP → PCM)
  → ffmpeg: -f rtp -acodec opus → -f s16le -ar 16000 -ac 1
  → read stdout as raw PCM
  → base64 encode in chunks
  → emit('agent_audio', { agentId, audio: base64 })
```

The client's `agent-audio.ts` receives the exact same `agent_audio` event format. **No client audio changes needed.**

### 3. Video Pipeline (NEW)

```
werift video track (H264 RTP packets)
  → pipe to ffmpeg stdin
  → ffmpeg: -f rtp -vcodec h264 → -f image2pipe -vcodec mjpeg -q:v 5 -r 10
  → read stdout as JPEG frames (separated by JPEG SOI/EOI markers)
  → base64 encode each frame
  → emit('agent_video_frame', { agentId, frame: base64, width, height })
```

Parameters:
- **FPS**: 10 (sufficient for talking head, low bandwidth)
- **Quality**: `-q:v 5` (good quality, ~15-30KB per frame)
- **Resolution**: Native from Napster (likely 480x480 or 640x480)

### 4. Data Channel Events (replaces WebSocket text frames)

The WebRTC data channel carries the same JSON events as the current WebSocket:
- `message_received` (with action: created/delta/completed)
- `talk_state_changed` (state: talking/ended)
- `avatar_state_changed`
- `audio_received` (backup if audio comes via data channel instead of RTP)

The `handleEvent()` method in `OmniagentConnection` stays identical. Only the transport changes.

### 5. Sending Messages (replaces WebSocket sends)

Currently: `ws.send(JSON.stringify({ type: 'send_message', data: {...} }))`
New: `dataChannel.send(JSON.stringify({ type: 'send_message', data: {...} }))`

Same for `set_settings` and `send_audio` (silence prime).

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `server/src/omniagent/webrtc-connection.ts` | `WebRTCConnection` class — drop-in replacement for `OmniagentConnection` |
| `server/src/omniagent/media-decoder.ts` | ffmpeg spawn + management for audio/video decode |

### Modified Files

| File | Change |
|------|--------|
| `server/src/omniagent/manager.ts` | Import `WebRTCConnection` instead of `OmniagentConnection` |
| `server/src/sessions/manager.ts` | Emit `agent_video_frame` events to Socket.io; remove "WebRTC disabled" comment |
| `shared/types.ts` | Add `agent_video_frame` to `ServerEvents` |
| `client/src/components/AgentVideo.tsx` | Render JPEG frames on `<canvas>` instead of SDK init |
| `server/package.json` | Add `werift` dependency |
| `Dockerfile` | Add `ffmpeg` to the image |

### Unchanged Files

| File | Why |
|------|-----|
| `client/src/lib/agent-audio.ts` | Same `agent_audio` event format, same PCM base64 |
| `server/src/orchestration/turn-manager.ts` | Turn logic unchanged |
| `server/src/orchestration/transcript-relay.ts` | Uses `sendMessage()` which is preserved |
| All audience interaction code | Socket.io events unchanged |

## WebRTCConnection Class API

```typescript
// Drop-in replacement for OmniagentConnection
export class WebRTCConnection extends EventEmitter {
  constructor(config: AgentConfig);

  get id(): string;
  get name(): string;

  // Same public API as OmniagentConnection
  async connect(): Promise<void>;
  sendMessage(role: 'user' | 'system', text: string, triggerResponse?: boolean): void;
  updateSettings(instructions: string): void;
  disconnect(): void;

  // Same events emitted:
  // 'audio'         → { agentId, audio: base64 }
  // 'talk_state'    → { state: 'talking' | 'ended' }
  // 'avatar_state'  → { state: string }
  // 'response_start' → { itemId }
  // 'response_delta' → { itemId, content }
  // 'speech_end'    → { agentId, agentName, text, timestamp }
  // 'error'         → Error
  // 'disconnected'  → code
  // 'reconnected'   → void

  // NEW event:
  // 'video_frame'   → { agentId, frame: base64, width, height }
}
```

The session manager just swaps `OmniagentConnection` → `WebRTCConnection`. All event wiring stays the same, plus one new listener for `video_frame`.

## Client: AgentVideo.tsx Changes

Replace the Napster SDK integration with a simple canvas renderer:

```tsx
// Listen for agent_video_frame events from Socket.io
// Draw base64 JPEG onto a <canvas> element
// When no frames arriving, show the colored circle placeholder

socket.on('agent_video_frame', ({ agentId, frame }) => {
  if (agentId !== currentSpeaker) return;
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.src = 'data:image/jpeg;base64,' + frame;
});
```

Only render frames for the current speaker. When speaker changes, the new agent's frames start flowing and the canvas updates automatically.

## Socket.io Events

### New Server → Client Event

```typescript
agent_video_frame: (data: {
  agentId: string;
  frame: string;    // base64 JPEG
  width: number;
  height: number;
}) => void;
```

### Bandwidth Estimate

- 10 FPS * ~20KB/frame = ~200KB/s per agent per viewer
- Only the current speaker streams video → 200KB/s total
- Socket.io binary support can reduce base64 overhead by ~33%

## Reconnection

Same strategy as current `OmniagentConnection`:
- On WebSocket close or ICE failure → exponential backoff reconnect
- Create new connection token → new signaling → new WebRTC session
- Max 10 attempts, delay: `min(2000 * attempt, 10000)ms`

Token expiration (~2 minutes) is not an issue since connection setup completes in <10 seconds. Only matters for reconnection, where a fresh token is created each time.

## ffmpeg Process Management

```
Per agent: 1 ffmpeg process (demuxes both audio + video from RTP)

Lifecycle:
  - Spawned on WebRTC media connection
  - Killed on disconnect/reconnect
  - Restarted on reconnect with new RTP streams

Crash handling:
  - Monitor ffmpeg stderr for errors
  - If ffmpeg dies, attempt restart with backoff
  - If 3 consecutive failures, fall back to data-channel-only (audio via JSON events, no video)
```

## Latency Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Audio-video sync | < 100ms | Both from same ffmpeg PTS clock |
| Video frame latency | < 200ms | RTP → decode → JPEG → Socket.io |
| End-to-end (speech → viewer) | < 500ms | Napster processing + our pipeline |
| Frame rate | 10 FPS | Talking head doesn't need 30 FPS |

## Railway Considerations

- **RAM**: werift + ffmpeg (3 agents) ≈ 300-400MB. Hobby tier (8GB) is comfortable. Free tier (512MB) is tight.
- **CPU**: ffmpeg decode is the main load. 3 concurrent ffmpeg at 10 FPS is modest.
- **Bandwidth**: 200KB/s * N viewers. Railway hobby tier has generous bandwidth.
- **ffmpeg in Docker**: Add `RUN apt-get install -y ffmpeg` to Dockerfile.
- **No GPU needed**: ffmpeg software decode of 480p H264 at 10 FPS is trivial for CPU.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| werift can't complete Napster handshake | Medium | Captured exact signaling protocol; werift supports standard WebRTC. Fallback: data channel only (audio via JSON, no video). |
| ffmpeg RTP parsing issues | Low | Well-tested codepath. Can pipe raw packets instead of RTP if needed. |
| Railway free tier OOM | High | Upgrade to Hobby ($5/mo). Already needed for client build. |
| Napster rate limiting | Low | Only 3 connections per session. Token refresh on reconnect. |
| Video frames too large for Socket.io | Low | 10 FPS * 20KB = 200KB/s. Socket.io handles this fine. Can reduce quality/FPS if needed. |

## Dependencies

```json
{
  "werift": "^0.19.0"
}
```

System: `ffmpeg` (added to Dockerfile)

## Out of Scope

- Multiple simultaneous speakers showing video (only current speaker gets video)
- Client-side WebRTC (all video goes through server relay)
- Video recording/archival
- Custom avatar selection per agent (uses stock Napster companions)
