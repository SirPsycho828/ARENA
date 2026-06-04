# WebRTC Video Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WebSocket agent connections with WebRTC connections (via werift) to gain video tracks, decode them server-side with ffmpeg, and broadcast JPEG frames to all viewers via Socket.io.

**Architecture:** Server connects to Napster as a WebRTC peer using werift (pure TS). Audio/video RTP tracks are decoded by ffmpeg into PCM/JPEG. Data channel carries the same JSON events as the current WebSocket. Socket.io broadcasts frames to all viewers. Client renders JPEG on canvas.

**Tech Stack:** werift (WebRTC), ffmpeg (media decode), Socket.io (broadcast), React canvas (render)

**Spec:** `docs/superpowers/specs/2026-06-01-webrtc-video-integration-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server/src/omniagent/webrtc-connection.ts` | NEW - WebRTC peer connection to Napster via werift, signaling, data channel event handling |
| `server/src/omniagent/media-decoder.ts` | NEW - Spawns ffmpeg to decode RTP audio (Opus->PCM) and video (H264->JPEG), emits decoded chunks |
| `server/src/omniagent/manager.ts` | MODIFY - Import WebRTCConnection instead of OmniagentConnection |
| `server/src/sessions/manager.ts` | MODIFY - Wire video_frame event, emit agent_video_frame to Socket.io |
| `shared/types.ts` | MODIFY - Add agent_video_frame to ServerEvents |
| `client/src/components/AgentVideo.tsx` | MODIFY - Render JPEG frames on canvas instead of Napster SDK |
| `client/src/store/arena.ts` | MODIFY - Listen for agent_video_frame, store current frame per agent, remove videoTokens |
| `server/package.json` | MODIFY - Add werift dependency |
| `Dockerfile` | MODIFY - Install ffmpeg |

---

### Task 1: Add werift dependency and ffmpeg to Docker

**Files:**
- Modify: `server/package.json`
- Modify: `Dockerfile`

- [ ] **Step 1: Install werift**

```bash
cd server && npm install werift
```

- [ ] **Step 2: Add ffmpeg to Dockerfile**

Edit `Dockerfile` to install ffmpeg. The image is `node:22-alpine`, so use `apk`:

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

COPY server/ ./server/
COPY shared/ ./shared/
COPY client/dist/ ./client/dist/

ENV NODE_ENV=production

CMD ["npx", "--prefix", "server", "tsx", "server/src/index.ts"]
```

- [ ] **Step 3: Verify ffmpeg available locally**

```bash
ffmpeg -version
```

If not installed locally, that's OK -- it only needs to work in Docker and on Railway. For local dev, video frames won't decode but the data channel (audio+text) will still work. The code handles ffmpeg-not-found gracefully.

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json Dockerfile
git commit -m "feat: add werift dependency and ffmpeg to Docker image"
```

---

### Task 2: Create MediaDecoder class

**Files:**
- Create: `server/src/omniagent/media-decoder.ts`

This class spawns an ffmpeg process that reads RTP-like packets from stdin and outputs decoded frames. For audio: Opus->PCM 16-bit 16kHz mono. For video: H264->JPEG frames.

In practice, werift gives us individual RTP packets (not a continuous RTP stream). We'll pipe raw codec payloads to ffmpeg instead. Audio: raw Opus packets -> ffmpeg decodes to PCM. Video: raw H264 NAL units -> ffmpeg decodes to JPEG.

- [ ] **Step 1: Create the MediaDecoder file**

Create `server/src/omniagent/media-decoder.ts`:

```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export class AudioDecoder extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private chunkSize = 3200; // 100ms at 16kHz 16-bit mono = 1600 samples * 2 bytes

  start() {
    // Decode raw Opus packets to PCM s16le 16kHz mono
    this.proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'opus', '-i', 'pipe:0',
      '-f', 's16le', '-ar', '16000', '-ac', '1',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    this.proc.stdout!.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      while (this.buffer.length >= this.chunkSize) {
        const chunk = this.buffer.subarray(0, this.chunkSize);
        this.buffer = this.buffer.subarray(this.chunkSize);
        this.emit('audio', chunk.toString('base64'));
      }
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.warn('[AudioDecoder] ffmpeg:', msg);
    });

    this.proc.on('exit', (code) => {
      console.log(`[AudioDecoder] ffmpeg exited: ${code}`);
      this.proc = null;
    });
  }

  feed(opusData: Buffer) {
    if (this.proc?.stdin?.writable) {
      this.proc.stdin.write(opusData);
    }
  }

  stop() {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.buffer = Buffer.alloc(0);
  }
}

// JPEG markers for frame splitting
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

export class VideoDecoder extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private frameCount = 0;

  start() {
    // Decode raw H264 NAL units to JPEG frames at 10fps
    this.proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'h264', '-i', 'pipe:0',
      '-f', 'image2pipe', '-vcodec', 'mjpeg',
      '-q:v', '5', '-r', '10',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    this.proc.stdout!.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.extractFrames();
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.warn('[VideoDecoder] ffmpeg:', msg);
    });

    this.proc.on('exit', (code) => {
      console.log(`[VideoDecoder] ffmpeg exited: ${code}`);
      this.proc = null;
    });
  }

  private extractFrames() {
    while (true) {
      const soiIdx = this.buffer.indexOf(JPEG_SOI);
      if (soiIdx === -1) break;

      const eoiIdx = this.buffer.indexOf(JPEG_EOI, soiIdx + 2);
      if (eoiIdx === -1) break; // Incomplete frame, wait for more data

      const frame = this.buffer.subarray(soiIdx, eoiIdx + 2);
      this.buffer = this.buffer.subarray(eoiIdx + 2);
      this.frameCount++;
      this.emit('frame', frame.toString('base64'));
    }
  }

  feed(h264Data: Buffer) {
    if (this.proc?.stdin?.writable) {
      this.proc.stdin.write(h264Data);
    }
  }

  stop() {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.buffer = Buffer.alloc(0);
    this.frameCount = 0;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/omniagent/media-decoder.ts
git commit -m "feat: add AudioDecoder and VideoDecoder classes (ffmpeg wrappers)"
```

---

### Task 3: Create WebRTCConnection class - signaling and data channel

**Files:**
- Create: `server/src/omniagent/webrtc-connection.ts`

This is the core replacement for `OmniagentConnection`. It:
1. Creates a WebRTC connection token via the Napster API (same as current)
2. Opens a signaling WebSocket
3. Creates a werift RTCPeerConnection with audio+video transceivers (recvonly) and a data channel
4. Performs the SDP offer/answer exchange via signaling
5. Receives data channel events (same JSON format as current WebSocket events)
6. Receives audio/video RTP tracks, pipes to decoders
7. Exposes the same public API as OmniagentConnection

- [ ] **Step 1: Create the WebRTCConnection file**

Create `server/src/omniagent/webrtc-connection.ts`:

```typescript
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  RTCPeerConnection,
  RTCIceCandidate,
} from 'werift';
import { AudioDecoder, VideoDecoder } from './media-decoder.js';
import type { AgentConfig } from '../../../shared/types.js';

const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.OMNIAGENT_API_KEY!;

interface TokenPayload {
  url: string;
  token?: string;
  authToken?: string;
  connection: { id: string };
  signalingEndpoint?: string;
  expiresAt: string;
}

export class WebRTCConnection extends EventEmitter {
  private config: AgentConfig;
  private pc: RTCPeerConnection | null = null;
  private signalingWs: WebSocket | null = null;
  private dataChannel: any = null; // werift DataChannel
  private connectionId: string | null = null;
  private responseBuffer: Map<string, string> = new Map();
  private audioDecoder: AudioDecoder | null = null;
  private videoDecoder: VideoDecoder | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;
  private settingsPending: string | null = null;
  private silencePrimed = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
  }

  get id() { return this.config.id; }
  get name() { return this.config.name; }

  async connect(): Promise<void> {
    this.responseBuffer.clear();
    this.silencePrimed = false;

    // 1. Create WebRTC connection via API
    const res = await fetch(`${API_BASE}/public/agents/${this.config.id}/connections`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelType: 'webrtc',
        externalClientId: this.config.externalClientId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create WebRTC connection for ${this.config.name}: ${res.status} ${err}`);
    }

    const data = await res.json();
    const decoded: TokenPayload = JSON.parse(
      Buffer.from(data.token, 'base64').toString('utf-8')
    );

    this.connectionId = decoded.connection.id;
    const signalingUrl = decoded.signalingEndpoint || decoded.url;
    const authToken = decoded.authToken || decoded.token;

    console.log(`  [${this.config.name}] WebRTC token decoded, connectionId=${this.connectionId}`);

    // 2. Create werift peer connection
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Add transceivers for receiving audio and video
    this.pc.addTransceiver('audio', { direction: 'recvonly' });
    this.pc.addTransceiver('video', { direction: 'recvonly' });

    // Create data channel for events (same JSON as current WebSocket)
    this.dataChannel = this.pc.createDataChannel('events');
    this.wireDataChannel();

    // Handle incoming media tracks
    this.wireMediaTracks();

    // 3. Open signaling WebSocket
    await this.performSignaling(signalingUrl, authToken!);
  }

  private wireDataChannel() {
    const dc = this.dataChannel;

    dc.stateChanged.subscribe((state: string) => {
      console.log(`  [${this.config.name}] DataChannel state: ${state}`);
      if (state === 'open') {
        // Send settings override (same as current WS set_settings)
        if (this.config.systemPrompt) {
          this.updateSettings(this.config.systemPrompt);
          console.log(`  [${this.config.name}] Sent set_settings via DataChannel`);
        }
        // Prime audio channel with silence
        this.primeSilence();
      }
    });

    dc.onMessage.subscribe((data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      try {
        const event = JSON.parse(text);
        this.handleEvent(event);
      } catch {
        console.log(`  [${this.config.name}] non-JSON DataChannel message: ${text.slice(0, 100)}`);
      }
    });
  }

  private wireMediaTracks() {
    this.pc!.onTrack.subscribe((track: any) => {
      const kind = track.kind;
      console.log(`  [${this.config.name}] Got ${kind} track`);

      if (kind === 'audio') {
        this.audioDecoder = new AudioDecoder();
        this.audioDecoder.on('audio', (b64: string) => {
          this.emit('audio', {
            agentId: this.config.id,
            audio: b64,
          });
        });
        this.audioDecoder.start();

        track.onReceiveRtp.subscribe((rtp: any) => {
          // Extract payload from RTP packet and feed to decoder
          const payload = rtp.payload;
          if (payload && payload.length > 0) {
            this.audioDecoder!.feed(Buffer.from(payload));
          }
        });
      }

      if (kind === 'video') {
        this.videoDecoder = new VideoDecoder();
        this.videoDecoder.on('frame', (b64: string) => {
          this.emit('video_frame', {
            agentId: this.config.id,
            frame: b64,
          });
        });
        this.videoDecoder.start();

        track.onReceiveRtp.subscribe((rtp: any) => {
          const payload = rtp.payload;
          if (payload && payload.length > 0) {
            this.videoDecoder!.feed(Buffer.from(payload));
          }
        });
      }
    });
  }

  private async performSignaling(signalingUrl: string, authToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Signaling timeout')), 30000);

      this.signalingWs = new WebSocket(signalingUrl, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      this.signalingWs.on('open', async () => {
        console.log(`  [${this.config.name}] Signaling WS connected`);

        try {
          // Create and send SDP offer
          const offer = await this.pc!.createOffer();
          await this.pc!.setLocalDescription(offer);
          const localDesc = this.pc!.localDescription;

          this.signalingWs!.send(JSON.stringify({
            type: 'set_remote_description',
            data: { sdp: localDesc!.sdp, type: 'offer' },
          }));
          console.log(`  [${this.config.name}] Sent SDP offer via signaling`);

          // Send ICE candidates as they're gathered
          this.pc!.onIceCandidate.subscribe((candidate) => {
            if (candidate) {
              this.signalingWs!.send(JSON.stringify({
                type: 'add_ice_candidate',
                data: {
                  candidate: candidate.candidate,
                  sdpMid: candidate.sdpMid,
                  sdpMLineIndex: candidate.sdpMLineIndex,
                },
              }));
            }
          });
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.signalingWs.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'set_local_description' && msg.data) {
            // This is the SDP answer from Napster
            await this.pc!.setRemoteDescription({
              type: msg.data.type || 'answer',
              sdp: msg.data.sdp,
            });
            console.log(`  [${this.config.name}] Applied SDP answer`);
            clearTimeout(timeout);
            resolve();
          } else if (msg.type === 'add_ice_candidate' && msg.data) {
            await this.pc!.addIceCandidate(msg.data);
          }
        } catch (err) {
          console.error(`  [${this.config.name}] Signaling message error:`, (err as Error).message);
        }
      });

      this.signalingWs.on('error', (err) => {
        console.error(`  [${this.config.name}] Signaling WS error:`, err.message);
        clearTimeout(timeout);
        reject(err);
      });

      this.signalingWs.on('close', () => {
        console.log(`  [${this.config.name}] Signaling WS closed`);
      });

      // Monitor ICE connection state
      this.pc!.iceConnectionStateChange.subscribe((state) => {
        console.log(`  [${this.config.name}] ICE state: ${state}`);
        if (state === 'disconnected' || state === 'failed') {
          this.emit('disconnected', 0);
          this.attemptReconnect();
        }
      });
    });
  }

  private primeSilence() {
    if (this.silencePrimed || !this.dataChannel) return;
    this.silencePrimed = true;
    const silence = Buffer.alloc(3200); // 100ms at 16kHz 16-bit mono
    this.sendViaDataChannel({
      type: 'send_audio',
      data: { data: silence.toString('base64') },
    });
    console.log(`  [${this.config.name}] Sent silence prime via DataChannel`);
  }

  private handleEvent(event: any) {
    const eventType = event.event || event.type;

    switch (eventType) {
      case 'message_received':
        this.handleMessageReceived(event.data);
        break;
      case 'talk_state_changed':
        console.log(`  [${this.config.name}] talk: ${event.data?.state || JSON.stringify(event.data).slice(0, 100)}`);
        this.emit('talk_state', event.data);
        break;
      case 'avatar_state_changed':
        console.log(`  [${this.config.name}] avatar: ${event.data?.state}`);
        this.emit('avatar_state', event.data);
        break;
      case 'audio_received': {
        // Backup: audio via data channel JSON (if RTP track not available)
        const audioB64 = event.data?.data || event.data?.audio;
        if (audioB64) {
          this.emit('audio', {
            agentId: this.config.id,
            audio: audioB64,
          });
        }
        break;
      }
      default:
        if (eventType) console.log(`  [${this.config.name}] unknown event: ${eventType}`);
        break;
    }
  }

  private handleMessageReceived(data: any) {
    const msg = data.message || data;

    if (msg.role === 'assistant') {
      if (msg.action === 'created') {
        console.log(`  [${this.config.name}] assistant created: item=${msg.item_id || 'none'}`);
      } else if (msg.action === 'delta') {
        const key = msg.item_id || 'unknown';
        if (!this.responseBuffer.has(key) || this.responseBuffer.get(key) === '') {
          console.log(`  [${this.config.name}] first delta: "${(msg.content || '').slice(0, 60)}"`);
        }
      } else if (msg.action === 'completed') {
        console.log(`  [${this.config.name}] assistant completed: item=${msg.item_id} content=${(msg.content || '').slice(0, 80)}`);
      }
    }

    if (msg.role === 'assistant') {
      if (msg.action === 'created' && msg.item_id) {
        this.responseBuffer.set(msg.item_id, '');
        this.emit('response_start', { itemId: msg.item_id });
      } else if (msg.action === 'delta' && msg.item_id && msg.content) {
        const current = this.responseBuffer.get(msg.item_id) || '';
        this.responseBuffer.set(msg.item_id, current + msg.content);
        this.emit('response_delta', { itemId: msg.item_id, content: msg.content });
      } else if (msg.action === 'completed' && msg.item_id) {
        const fullText = this.responseBuffer.get(msg.item_id) || msg.content || '';
        this.responseBuffer.delete(msg.item_id);
        if (fullText) {
          console.log(`  [${this.config.name}] SPEECH_END: "${fullText.slice(0, 100)}"`);
          this.emit('speech_end', {
            agentId: this.config.id,
            agentName: this.config.name,
            text: fullText,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  private sendViaDataChannel(payload: any) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(payload));
    }
  }

  sendMessage(role: 'user' | 'system', text: string, triggerResponse = true) {
    const payload = {
      type: 'send_message',
      data: { role, text, trigger_response: triggerResponse },
    };
    console.log(`  [${this.config.name}] Sending: role=${role} trigger=${triggerResponse} text="${text.slice(0, 80)}..."`);
    this.sendViaDataChannel(payload);
  }

  updateSettings(instructions: string) {
    this.sendViaDataChannel({
      type: 'set_settings',
      data: {
        instructions,
        turn_detection: {
          threshold: 0.9,
          silence_duration_ms: 2000,
        },
      },
    });
  }

  private attemptReconnect() {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(`  [${this.config.name}] Max reconnect attempts reached`);
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(2000 * this.reconnectAttempts, 10000);
    console.log(`  [${this.config.name}] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        this.cleanup();
        await this.connect();
        console.log(`  [${this.config.name}] Reconnected successfully`);
        this.reconnectAttempts = 0;
        this.emit('reconnected');
      } catch (err) {
        console.error(`  [${this.config.name}] Reconnect failed:`, (err as Error).message);
        this.attemptReconnect();
      }
    }, delay);
  }

  private cleanup() {
    this.audioDecoder?.stop();
    this.videoDecoder?.stop();
    this.audioDecoder = null;
    this.videoDecoder = null;
    this.signalingWs?.close();
    this.signalingWs = null;
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
  }

  disconnect() {
    this.shouldReconnect = false;
    this.cleanup();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/omniagent/webrtc-connection.ts
git commit -m "feat: add WebRTCConnection class (werift peer + signaling + data channel)"
```

---

### Task 4: Wire WebRTCConnection into the manager

**Files:**
- Modify: `server/src/omniagent/manager.ts`

- [ ] **Step 1: Update manager.ts to use WebRTCConnection**

Replace `OmniagentConnection` import with `WebRTCConnection`. Keep `MockOmniagentConnection` for mock mode. Add an env flag `USE_WEBRTC` (default `true`) to allow fallback.

Edit `server/src/omniagent/manager.ts` to become:

```typescript
import { OmniagentConnection } from './connection.js';
import { WebRTCConnection } from './webrtc-connection.js';
import { MockOmniagentConnection } from './mock.js';
import type { AgentConfig } from '../../../shared/types.js';

const USE_MOCK = process.env.USE_MOCK === 'true';
const USE_WEBRTC = process.env.USE_WEBRTC !== 'false'; // default true

export type AgentInstance = OmniagentConnection | WebRTCConnection | MockOmniagentConnection;

export class OmniagentManager {
  private agents: Map<string, AgentInstance> = new Map();

  async createAndConnect(config: AgentConfig): Promise<AgentInstance> {
    let agent: AgentInstance;
    if (USE_MOCK) {
      agent = new MockOmniagentConnection(config);
    } else if (USE_WEBRTC) {
      agent = new WebRTCConnection(config);
    } else {
      agent = new OmniagentConnection(config);
    }

    await agent.connect();
    this.agents.set(config.id, agent);
    return agent;
  }

  get(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  getAll(): AgentInstance[] {
    return [...this.agents.values()];
  }

  sendMessage(agentId: string, role: 'user' | 'system', text: string, triggerResponse = true) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`Agent ${agentId} not found`);
      return;
    }
    agent.sendMessage(role, text, triggerResponse);
  }

  broadcastExcept(excludeId: string, role: 'user' | 'system', text: string, triggerResponse = true) {
    for (const [id, agent] of this.agents) {
      if (id !== excludeId) {
        agent.sendMessage(role, text, triggerResponse);
      }
    }
  }

  updateSettings(agentId: string, instructions: string) {
    const agent = this.agents.get(agentId);
    if (agent) agent.updateSettings(instructions);
  }

  disconnectAll() {
    for (const agent of this.agents.values()) {
      agent.disconnect();
    }
    this.agents.clear();
  }

  disconnect(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.disconnect();
      this.agents.delete(agentId);
    }
  }
}

export const omniagentManager = new OmniagentManager();
```

- [ ] **Step 2: Commit**

```bash
git add server/src/omniagent/manager.ts
git commit -m "feat: wire WebRTCConnection into OmniagentManager (USE_WEBRTC flag)"
```

---

### Task 5: Wire video frames through SessionManager to Socket.io

**Files:**
- Modify: `server/src/sessions/manager.ts` (around line 594, `wireAgentEvents`)
- Modify: `shared/types.ts`

- [ ] **Step 1: Add agent_video_frame to shared types**

Edit `shared/types.ts`. Add `agent_video_frame` to the `ServerEvents` interface (after the existing `agent_disconnected` event around line 90):

```typescript
agent_video_frame: (data: { agentId: string; frame: string }) => void;
```

- [ ] **Step 2: Wire video_frame event in session manager**

In `server/src/sessions/manager.ts`, inside the `wireAgentEvents` method (after the `agent.on('audio', ...)` block around line 665), add the video frame handler:

```typescript
    agent.on('video_frame', (data: { agentId: string; frame: string }) => {
      if (this.turnManager?.getCurrentSpeaker() === agentId) {
        (this.io as any).emit('agent_video_frame', data);
      }
    });
```

- [ ] **Step 3: Remove the "WebRTC disabled" comment**

In `server/src/sessions/manager.ts` around lines 221-222, remove or update the comment:

```typescript
        // WebRTC video disabled — creates independent sessions that conflict with debate orchestration
        // TODO: Re-enable when Napster SDK supports syncing WebRTC avatar with WebSocket text
```

Replace with:

```typescript
        // Video enabled via server-side WebRTC (werift) — see webrtc-connection.ts
```

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts server/src/sessions/manager.ts
git commit -m "feat: wire agent_video_frame events from WebRTC to Socket.io"
```

---

### Task 6: Update client to render video frames on canvas

**Files:**
- Modify: `client/src/components/AgentVideo.tsx`
- Modify: `client/src/store/arena.ts`

- [ ] **Step 1: Add video frame state to arena store**

In `client/src/store/arena.ts`, replace the `videoTokens` state with `videoFrames`:

In the `ArenaState` interface (around line 88-89), change:

```typescript
  // Video
  videoTokens: Record<string, string>;
```

to:

```typescript
  // Video
  videoFrames: Record<string, string>; // agentId -> latest base64 JPEG frame
```

In the initial state (around line 223), change:

```typescript
  videoTokens: {},
```

to:

```typescript
  videoFrames: {},
```

Remove the `videoTokens` fetch block in the `session_state` handler (lines 266-271):

```typescript
      // Fetch video tokens if session is active
      if (state.session?.status === 'active' || state.session?.status === 'starting') {
        fetch('/api/sessions/tokens')
          .then((r) => r.json())
          .then((data) => { if (data.tokens) set({ videoTokens: data.tokens }); })
          .catch(() => {});
      }
```

Add a new Socket.io listener after the `agent_audio` listener (after line 289):

```typescript
    // Receive video frames from server (JPEG base64, only current speaker)
    (socket as any).on('agent_video_frame', (data: { agentId: string; frame: string }) => {
      set((s) => ({
        videoFrames: { ...s.videoFrames, [data.agentId]: data.frame },
      }));
    });
```

In the `speaker_change` handler (around line 299-303), clear old frames on speaker change:

```typescript
    socket.on('speaker_change', ({ agentId }) => {
      transcriptPacer.flush(set);
      set((s) => ({
        currentSpeaker: agentId,
        videoFrames: {}, // Clear stale frames on speaker change
      }));
      agentAudio.reset();
    });
```

- [ ] **Step 2: Rewrite AgentVideo.tsx to use canvas**

Replace `client/src/components/AgentVideo.tsx` entirely:

```tsx
import { useEffect, useRef } from 'react';
import { useArenaStore } from '../store/arena';

interface AgentVideoProps {
  agentId: string;
  agentName: string;
  color: string;
}

export function AgentVideo({ agentId, agentName, color }: AgentVideoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useArenaStore((s) => s.videoFrames[agentId]);

  useEffect(() => {
    if (!frame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    };
    img.src = 'data:image/jpeg;base64,' + frame;
  }, [frame]);

  // No frames yet — show avatar placeholder
  if (!frame) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
          style={{ backgroundColor: color + '20', color, border: `2px solid ${color}40` }}
        >
          {agentName.split(' ').pop()?.[0] || agentName[0]}
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-cover"
    />
  );
}
```

- [ ] **Step 3: Update AgentPanel.tsx to pass agentId instead of token**

In `client/src/components/AgentPanel.tsx`, change the `AgentVideo` usage (around line 64):

From:

```tsx
          <AgentVideo token={videoTokens[id] || null} agentName={name} color={color} />
```

To:

```tsx
          <AgentVideo agentId={id} agentName={name} color={color} />
```

And remove the `videoTokens` selector (around line 22):

```tsx
  const videoTokens = useArenaStore((s) => s.videoTokens);
```

- [ ] **Step 4: Commit**

```bash
git add client/src/store/arena.ts client/src/components/AgentVideo.tsx client/src/components/AgentPanel.tsx
git commit -m "feat: render WebRTC video frames on canvas (replace SDK tokens)"
```

---

### Task 7: Build client and verify

**Files:**
- No new files

- [ ] **Step 1: Build the client**

```bash
cd client && npx vite build
```

Expected: Build completes without errors.

- [ ] **Step 2: Test with mock mode**

```bash
cd server && USE_MOCK=true npx tsx src/index.ts
```

Open browser to `http://localhost:3001`. Verify:
- Debate loads, agents take turns
- Colored circle placeholders show (no video frames in mock mode)
- Audio and transcript still work as before

- [ ] **Step 3: Test with WebRTC (real API)**

```bash
cd server && npx tsx src/index.ts
```

Watch the server logs for:
- `WebRTC token decoded, connectionId=...`
- `Signaling WS connected`
- `Sent SDP offer via signaling`
- `Applied SDP answer`
- `ICE state: connected`
- `DataChannel state: open`
- `Got audio track`
- `Got video track`

If ffmpeg is installed locally, also expect:
- Video frames appearing in the browser (canvas rendering)
- Audio playing as before

If ffmpeg is NOT installed locally:
- Data channel events should still work (text + talk_state)
- Audio will come through the `audio_received` data channel fallback
- No video frames (expected)

- [ ] **Step 4: Commit built client dist**

```bash
cd client && npx vite build && cd .. && git add -f client/dist
git commit -m "build: update client dist with video canvas renderer"
```

---

### Task 8: Graceful ffmpeg fallback

**Files:**
- Modify: `server/src/omniagent/media-decoder.ts`

The decoders should handle the case where ffmpeg is not installed (local dev without it). Check at start and degrade gracefully.

- [ ] **Step 1: Add ffmpeg availability check**

At the top of `server/src/omniagent/media-decoder.ts`, add a check function:

```typescript
import { execSync } from 'child_process';

let ffmpegAvailable: boolean | null = null;

function checkFfmpeg(): boolean {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegAvailable = true;
  } catch {
    console.warn('[MediaDecoder] ffmpeg not found - video decode disabled, audio via data channel fallback');
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}
```

- [ ] **Step 2: Guard start() methods**

In `AudioDecoder.start()`, add at the beginning:

```typescript
  start() {
    if (!checkFfmpeg()) return;
    // ... rest of existing code
  }
```

In `VideoDecoder.start()`, add at the beginning:

```typescript
  start() {
    if (!checkFfmpeg()) return;
    // ... rest of existing code
  }
```

Also guard `feed()` in both classes:

```typescript
  feed(data: Buffer) {
    if (!this.proc?.stdin?.writable) return;
    this.proc.stdin.write(data);
  }
```

- [ ] **Step 3: Commit**

```bash
git add server/src/omniagent/media-decoder.ts
git commit -m "fix: graceful ffmpeg fallback when not installed"
```

---

### Task 9: End-to-end integration test

**Files:**
- No new files

This is a manual verification task.

- [ ] **Step 1: Run locally with real API and ffmpeg**

Make sure ffmpeg is installed. Run:

```bash
cd server && npx tsx src/index.ts
```

Open `http://localhost:3001` in the browser. Verify:

1. Agents connect (server logs show WebRTC signaling)
2. Debate starts, turns rotate
3. Audio plays through speakers
4. Video frames appear on the canvas for the current speaker
5. Transcript streams word-by-word
6. Voting, chaos injection, reactions all still work

- [ ] **Step 2: Test without ffmpeg (fallback)**

Set `USE_WEBRTC=false` to verify the old WebSocket path still works:

```bash
cd server && USE_WEBRTC=false npx tsx src/index.ts
```

Verify debate works identically to before (colored circles, audio via WebSocket).

- [ ] **Step 3: Test mock mode**

```bash
cd server && USE_MOCK=true npx tsx src/index.ts
```

Verify mock debate still runs with colored circle placeholders.

- [ ] **Step 4: Commit client dist for deployment**

```bash
cd client && npx vite build && cd .. && git add -f client/dist
git commit -m "build: final client dist with WebRTC video integration"
```

- [ ] **Step 5: Push and deploy**

```bash
git push origin master
```

Railway will auto-deploy. The Dockerfile now includes ffmpeg, werift is in package.json, and the client dist is committed.
