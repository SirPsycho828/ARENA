# LiveKit Lip-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake lip-sync system with real lip-synced avatars using a headless browser host (Puppeteer) and LiveKit SFU, preserving the shared-experience model.

**Architecture:** Puppeteer runs headless Chrome with 3 Napster avatar iframes. Debate prompts go through `sendCommand` so avatars lip-sync to their own speech. `captureStream()` grabs the video+audio MediaStreams and publishes them to a LiveKit Cloud room. All viewers subscribe to the same LiveKit room for synchronized video/audio. Socket.io remains unchanged for transcript, chaos, voting, and credits.

**Tech Stack:** Puppeteer, livekit-server-sdk, livekit-client, Napster Companion API (WebRTC SDK via CDN)

---

## File Map

### New Files
| File | Purpose |
|---|---|
| `server/src/lib/livekit.ts` | LiveKit token generation (publisher + viewer) |
| `server/src/avatar-host/puppeteer.ts` | AvatarHost class: Puppeteer lifecycle, IPC bridge |
| `server/src/avatar-host/page.html` | Host page: 3 avatar iframes + LiveKit publisher |
| `server/src/avatar-host/avatar-frame.html` | Individual avatar: Napster SDK + event relay |
| `client/src/lib/livekit-room.ts` | Client LiveKit room + track management |

### Modified Files
| File | Change |
|---|---|
| `server/package.json` | Add puppeteer, livekit-server-sdk |
| `client/package.json` | Add livekit-client |
| `server/src/omniagent/manager.ts` | Delegate to AvatarHost in real mode |
| `server/src/sessions/manager.ts` | Extract event handlers, add AvatarHost wiring, simplify turn management |
| `server/src/socket/handlers.ts` | LiveKit viewer token on connect, remove playback_done |
| `server/src/index.ts` | Serve avatar-host files, add Puppeteer startup/shutdown |
| `client/src/components/AgentVideo.tsx` | Rewrite: iframe -> LiveKit `<video>` |
| `client/src/store/arena.ts` | Remove audio/playback handlers, add LiveKit state |
| `Dockerfile` | Switch to Debian, add Chromium |

### Deleted Files
| File | Reason |
|---|---|
| `server/src/omniagent/connection.ts` | WebSocket debate connections replaced by Puppeteer |
| `server/src/omniagent/webrtc-connection.ts` | Server-side WebRTC experiment, unused |
| `server/src/omniagent/media-decoder.ts` | Audio decoding for WebRTC, unused |
| `client/src/lib/agent-audio.ts` | PCM audio playback replaced by LiveKit |
| `client/src/avatar-main.ts` | Client-side Napster SDK replaced by LiveKit |
| `client/public/avatar.html` | Client avatar iframe replaced by LiveKit |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `server/package.json`
- Modify: `client/package.json`
- Modify: `.env`

- [ ] **Step 1: Install server dependencies**

Run:
```bash
cd "server" && npm install puppeteer livekit-server-sdk
```

- [ ] **Step 2: Install client dependency**

Run:
```bash
cd "client" && npm install livekit-client
```

- [ ] **Step 3: Add LiveKit env vars to .env**

Append to `.env`:
```
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=
```

These stay empty until the LiveKit Cloud account is created (Task 5, Step 5). The code checks for their presence and skips LiveKit when missing.

- [ ] **Step 4: Verify server compiles**

Run:
```bash
cd "server" && npx tsc --noEmit 2>&1 | head -5
```

Expected: No new errors from the dependency additions.

- [ ] **Step 5: Commit**

```bash
rtk git add server/package.json server/package-lock.json client/package.json client/package-lock.json .env
rtk git commit -m "feat: add puppeteer, livekit-server-sdk, livekit-client dependencies"
```

---

### Task 2: LiveKit Token Helper

**Files:**
- Create: `server/src/lib/livekit.ts`

- [ ] **Step 1: Create the token helper module**

```typescript
// server/src/lib/livekit.ts
import { AccessToken } from 'livekit-server-sdk';

const API_KEY = () => process.env.LIVEKIT_API_KEY || '';
const API_SECRET = () => process.env.LIVEKIT_API_SECRET || '';

export function getLiveKitUrl(): string {
  return process.env.LIVEKIT_URL || '';
}

export function isLiveKitConfigured(): boolean {
  return !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

export async function createPublisherToken(roomName: string): Promise<string> {
  const at = new AccessToken(API_KEY(), API_SECRET(), {
    identity: 'arena-host',
    ttl: '2h',
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: false });
  return await at.toJwt();
}

export async function createViewerToken(roomName: string, viewerId: string): Promise<string> {
  const at = new AccessToken(API_KEY(), API_SECRET(), {
    identity: `viewer-${viewerId}`,
    ttl: '2h',
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: false, canSubscribe: true });
  return await at.toJwt();
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd "server" && npx tsc --noEmit 2>&1 | head -5
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
rtk git add server/src/lib/livekit.ts
rtk git commit -m "feat: add LiveKit token generation helper"
```

---

### Task 3: Avatar Frame Page

**Files:**
- Create: `server/src/avatar-host/avatar-frame.html`

This is the individual avatar iframe. Loads the Napster SDK via CDN, connects via WebRTC, and relays SDK events to the parent host page via `postMessage`. Also handles `send-message` and `stop-speaking` commands from the parent.

- [ ] **Step 1: Create the avatar-frame.html file**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>ARENA Avatar Frame</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@latest/lib/index.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; overflow: hidden; }
    #container { width: 100%; height: 100vh; position: relative; }
  </style>
</head>
<body>
  <div id="container"></div>

  <script src="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@latest/lib/index.standalone.js"></script>
  <script>
    let instance = null;
    let agentId = null;
    const responseBuffer = {};

    // ─── Signaling Proxy ─────────────────────────────────────────────────
    // Napster signaling server rejects browser WebSocket (returns 400).
    // Headless Chrome is still a browser — proxy through our server.
    const OrigWS = window.WebSocket;
    window.WebSocket = class ProxiedWS extends OrigWS {
      constructor(url, protocols) {
        const urlStr = url.toString();
        if (urlStr.includes('avatar-signaling.touchcastmaas.com')) {
          const sigPath = new URL(urlStr).pathname;
          const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const proxyUrl = `${wsProto}//${location.host}/signaling-proxy${sigPath}`;
          super(proxyUrl, protocols);
        } else {
          super(url, protocols);
        }
      }
    };

    // ─── Message Handlers ────────────────────────────────────────────────

    function handleSdkEvent(data) {
      if (!data?.event) return;

      if (data.event === 'message_received') {
        handleMessageReceived(data.data);
      } else if (data.event === 'talk_state_changed') {
        const state = data.data?.state;
        window.parent.postMessage({ type: 'talk-state', agentId, state }, '*');
      } else if (data.event === 'function_implicitly_called') {
        handleToolCall(data.data);
      }
    }

    function handleMessageReceived(data) {
      const msg = data?.message || data;
      if (msg?.role !== 'assistant') return;

      if (msg.action === 'created' && msg.item_id) {
        responseBuffer[msg.item_id] = '';
        window.parent.postMessage({ type: 'response-start', agentId }, '*');
      }
      if (msg.action === 'delta' && msg.item_id && msg.content) {
        responseBuffer[msg.item_id] = (responseBuffer[msg.item_id] || '') + msg.content;
        window.parent.postMessage({ type: 'speech-delta', agentId, text: msg.content }, '*');
      }
      if (msg.action === 'completed' && msg.item_id) {
        const fullText = responseBuffer[msg.item_id] || msg.content || '';
        delete responseBuffer[msg.item_id];
        if (fullText) {
          window.parent.postMessage({ type: 'speech-end', agentId, fullText }, '*');
        }
      }
    }

    function handleToolCall(data) {
      const callId = data?.call_id;
      const toolName = data?.name;
      const args = data?.arguments ? JSON.parse(data.arguments) : {};

      // Forward to parent for UI effects
      window.parent.postMessage({ type: 'tool-effect', agentId, toolName, args, callId }, '*');

      // Respond to the tool call so the agent can continue
      const outputs = {
        dramatic_pause: { status: 'ready' },
        crowd_appeal: { status: 'acknowledged', message: 'The audience is fired up!' },
        mic_drop: { status: 'dropped', message: 'The arena erupts!' },
      };
      if (instance) {
        instance.sendCommand({
          type: 'send_function_output',
          data: { call_id: callId, output: outputs[toolName] || { status: 'ok' }, delay: false },
        });
      }
    }

    // ─── Parent Communication ────────────────────────────────────────────

    window.addEventListener('message', async (e) => {
      if (e.data?.type === 'init-avatar') {
        if (instance) return;
        agentId = e.data.agentId;

        try {
          const sdk = window.napsterCompanionApiSDK;
          instance = await sdk.init(e.data.token, {
            mountContainer: '#container',
            avatarStyle: { view: 'rectangle' },
            features: {
              controls: { enabled: false },
              backgroundRemoval: { enabled: true },
              disclaimer: { enabled: false },
              showSDKLoader: { enabled: false },
              inactiveTimeout: { enabled: false },
              pictureInPicture: { enabled: false },
            },
            style: { width: '100%', height: '100%', position: 'absolute', top: '0', left: '0' },
            onData: handleSdkEvent,
            onAvatarReady: () => {
              instance.muteMic();
              // Do NOT mute audio — captureStream() needs live audio
              instance.showAvatar();
              window.parent.postMessage({ type: 'avatar-ready', agentId }, '*');
            },
            onError: (err) => {
              window.parent.postMessage({ type: 'avatar-error', agentId, error: err?.message || String(err) }, '*');
            },
          });
        } catch (err) {
          window.parent.postMessage({ type: 'avatar-error', agentId, error: err.message }, '*');
        }
      }

      if (e.data?.type === 'send-message' && instance && e.data.agentId === agentId) {
        // Cancel any in-progress response before sending new prompt
        try { instance.sendCommand({ type: 'cancel' }); } catch {}
        instance.sendCommand({
          type: 'send_message',
          data: {
            role: e.data.role || 'user',
            text: e.data.text,
            trigger_response: e.data.triggerResponse !== false,
          },
        });
      }

      if (e.data?.type === 'stop-speaking' && instance && e.data.agentId === agentId) {
        try { instance.sendCommand({ type: 'cancel' }); } catch {}
        try { instance.stopAvatarTalking(); } catch {}
      }
    });

    // Signal parent that frame is loaded and ready for token
    window.parent.postMessage({ type: 'frame-ready' }, '*');
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify the file is valid HTML**

Open in a browser manually (it won't fully work without a token, but should load without JS errors from the frame itself):

Run:
```bash
ls -la "server/src/avatar-host/avatar-frame.html"
```

Expected: File exists, ~130 lines.

- [ ] **Step 3: Commit**

```bash
rtk git add server/src/avatar-host/avatar-frame.html
rtk git commit -m "feat: add avatar-frame.html for headless browser Napster SDK"
```

---

### Task 4: Avatar Host Page

**Files:**
- Create: `server/src/avatar-host/page.html`

The orchestrator page loaded by Puppeteer. Creates 3 avatar iframes, waits for all to be ready, captures MediaStream from each, and publishes to LiveKit. Exposes `window.initHost()`, `window.sendToAvatar()`, and `window.stopAvatar()` for Puppeteer IPC. Relays SDK events to the server via Puppeteer `exposeFunction` callbacks.

- [ ] **Step 1: Create the page.html file**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>ARENA Avatar Host</title>
  <style>
    body { margin: 0; background: #000; display: flex; gap: 4px; }
    iframe { width: 420px; height: 420px; border: none; }
  </style>
</head>
<body>
  <div id="frames"></div>

  <script type="module">
    // LiveKit SDK loaded via ESM CDN
    const LK = await import('https://esm.sh/livekit-client@2');
    const { Room, RoomEvent, Track } = LK;

    const avatarFrames = {}; // agentId -> { iframe, ready: boolean }
    let livekitRoom = null;
    window.__hostReady = false;

    // ─── initHost: called by Puppeteer after exposeFunction setup ─────
    window.initHost = async function(config) {
      console.log('[Host] initHost called with', config.agents.length, 'agents');
      const framesDiv = document.getElementById('frames');

      // Create iframes and wait for all avatars to be ready
      const readyPromises = config.agents.map((agent) => {
        return new Promise((resolve, reject) => {
          const iframe = document.createElement('iframe');
          iframe.src = '/avatar-host/avatar-frame.html';
          iframe.style.cssText = 'width:420px;height:420px;border:none;';
          iframe.allow = 'autoplay; camera; microphone';
          framesDiv.appendChild(iframe);

          avatarFrames[agent.id] = { iframe, ready: false };

          const timeout = setTimeout(() => reject(new Error(`Avatar ${agent.id} timeout`)), 120000);

          window.addEventListener('message', function handler(e) {
            if (e.source !== iframe.contentWindow) return;

            if (e.data?.type === 'frame-ready') {
              iframe.contentWindow.postMessage({
                type: 'init-avatar',
                token: agent.token,
                agentId: agent.id,
              }, '*');
            }

            if (e.data?.type === 'avatar-ready' && e.data.agentId === agent.id) {
              avatarFrames[agent.id].ready = true;
              clearTimeout(timeout);
              console.log(`[Host] Avatar ready: ${agent.id} (${agent.name})`);
              resolve();
            }

            if (e.data?.type === 'avatar-error' && e.data.agentId === agent.id) {
              clearTimeout(timeout);
              reject(new Error(e.data.error));
            }

            // Relay SDK events to server via Puppeteer-exposed functions
            if (e.data?.type === 'speech-delta' && e.data.agentId) {
              window.__onSpeechDelta(e.data.agentId, e.data.text);
            }
            if (e.data?.type === 'speech-end' && e.data.agentId) {
              window.__onSpeechEnd(e.data.agentId, e.data.fullText);
            }
            if (e.data?.type === 'talk-state' && e.data.agentId) {
              window.__onTalkState(e.data.agentId, e.data.state);
            }
            if (e.data?.type === 'response-start' && e.data.agentId) {
              window.__onResponseStart(e.data.agentId);
            }
            if (e.data?.type === 'tool-effect' && e.data.agentId) {
              window.__onToolEffect(e.data.agentId, e.data.toolName, JSON.stringify(e.data.args || {}), e.data.callId);
            }
          });
        });
      });

      console.log('[Host] Waiting for all avatars...');
      await Promise.all(readyPromises);
      console.log('[Host] All avatars ready! Capturing streams...');

      // Capture MediaStream from each avatar's video element
      const tracks = [];
      for (const agent of config.agents) {
        const iframe = avatarFrames[agent.id].iframe;
        const video = iframe.contentDocument?.querySelector('video');
        if (!video) {
          console.error(`[Host] No <video> in iframe for ${agent.id} — trying fallback`);
          continue;
        }

        // Wait a moment for the video to start playing
        if (video.readyState < 2) {
          await new Promise(r => { video.onloadeddata = r; setTimeout(r, 5000); });
        }

        const stream = video.captureStream();
        const vt = stream.getVideoTracks()[0];
        const at = stream.getAudioTracks()[0];
        if (vt) tracks.push({ agentId: agent.id, track: vt, kind: 'video' });
        if (at) tracks.push({ agentId: agent.id, track: at, kind: 'audio' });
        console.log(`[Host] Captured ${agent.id}: video=${!!vt} audio=${!!at}`);
      }

      // Connect to LiveKit and publish tracks
      if (config.livekit?.url && config.livekit?.token) {
        livekitRoom = new Room();
        await livekitRoom.connect(config.livekit.url, config.livekit.token);
        console.log('[Host] Connected to LiveKit room');

        for (const { agentId, track, kind } of tracks) {
          await livekitRoom.localParticipant.publishTrack(track, {
            name: `${agentId}_${kind}`,
            source: kind === 'video' ? Track.Source.Camera : Track.Source.Microphone,
          });
          console.log(`[Host] Published ${kind} for ${agentId}`);
        }
      } else {
        console.warn('[Host] LiveKit not configured — streams not published');
      }

      window.__hostReady = true;
      window.__onHostReady();
      console.log('[Host] All streams published. Host ready!');
    };

    // ─── sendToAvatar: called by Puppeteer to send debate prompts ─────
    window.sendToAvatar = function(agentId, role, text, triggerResponse) {
      const frame = avatarFrames[agentId];
      if (!frame?.ready || !frame.iframe.contentWindow) return;
      frame.iframe.contentWindow.postMessage({
        type: 'send-message', agentId, role, text, triggerResponse,
      }, '*');
    };

    // ─── stopAvatar: called by Puppeteer to stop speech ───────────────
    window.stopAvatar = function(agentId) {
      const frame = avatarFrames[agentId];
      if (!frame?.ready || !frame.iframe.contentWindow) return;
      frame.iframe.contentWindow.postMessage({ type: 'stop-speaking', agentId }, '*');
    };
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify file exists and is well-formed**

Run:
```bash
ls -la "server/src/avatar-host/page.html"
```

Expected: File exists, ~140 lines.

- [ ] **Step 3: Commit**

```bash
rtk git add server/src/avatar-host/page.html
rtk git commit -m "feat: add avatar host page with LiveKit publisher"
```

---

### Task 5: Puppeteer Lifecycle Manager

**Files:**
- Create: `server/src/avatar-host/puppeteer.ts`

The `AvatarHost` class manages the headless Chrome lifecycle: launches browser, navigates to the host page, exposes IPC functions, and provides `sendMessage()`/`stopSpeaking()` methods for the SessionManager.

- [ ] **Step 1: Create the AvatarHost class**

```typescript
// server/src/avatar-host/puppeteer.ts
import puppeteer, { type Browser, type Page } from 'puppeteer';

interface HostAgent {
  id: string;
  name: string;
  token: string; // Napster WebRTC token
}

interface AvatarHostCallbacks {
  onSpeechDelta: (agentId: string, text: string) => void;
  onSpeechEnd: (agentId: string, fullText: string) => void;
  onTalkState: (agentId: string, state: string) => void;
  onResponseStart: (agentId: string) => void;
  onToolEffect: (agentId: string, toolName: string, argsJson: string, callId: string) => void;
  onHostReady: () => void;
}

export class AvatarHost {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private ready = false;

  async launch(
    agents: HostAgent[],
    livekitUrl: string,
    livekitToken: string,
    serverPort: number,
    callbacks: AvatarHostCallbacks,
  ): Promise<void> {
    console.log('[AvatarHost] Launching headless Chrome...');

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-ui-for-media-stream',
        '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
      ],
      protocolTimeout: 180000,
    });

    this.page = await this.browser.newPage();

    // Log browser console to server console
    this.page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith('[Host]') || text.startsWith('[Frame]')) {
        console.log(`  ${text}`);
      }
    });

    this.page.on('pageerror', (err) => {
      console.error('[AvatarHost] Page error:', err.message);
    });

    // Expose callback functions BEFORE navigating
    const readyPromise = new Promise<void>((resolve) => {
      callbacks.onHostReady = resolve;
    });

    await this.page.exposeFunction('__onSpeechDelta', callbacks.onSpeechDelta);
    await this.page.exposeFunction('__onSpeechEnd', callbacks.onSpeechEnd);
    await this.page.exposeFunction('__onTalkState', callbacks.onTalkState);
    await this.page.exposeFunction('__onResponseStart', callbacks.onResponseStart);
    await this.page.exposeFunction('__onToolEffect', callbacks.onToolEffect);
    await this.page.exposeFunction('__onHostReady', () => {
      this.ready = true;
      callbacks.onHostReady();
    });

    // Navigate to host page
    const url = `http://localhost:${serverPort}/avatar-host/page.html`;
    console.log(`[AvatarHost] Loading ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the ES module to load (defines window.initHost)
    await this.page.waitForFunction('typeof window.initHost === "function"', { timeout: 30000 });

    // Initialize with agent tokens and LiveKit config
    const config = {
      agents: agents.map(a => ({ id: a.id, name: a.name, token: a.token })),
      livekit: { url: livekitUrl, token: livekitToken },
    };

    console.log('[AvatarHost] Calling initHost...');
    await this.page.evaluate((cfg) => (window as any).initHost(cfg), config);

    // Wait for all avatars to be ready and streams published
    await readyPromise;
    console.log('[AvatarHost] Host is ready!');
  }

  async sendMessage(agentId: string, role: string, text: string, triggerResponse: boolean): Promise<void> {
    if (!this.page || !this.ready) {
      console.warn(`[AvatarHost] Cannot send — not ready`);
      return;
    }
    await this.page.evaluate(
      (id, r, t, tr) => (window as any).sendToAvatar(id, r, t, tr),
      agentId, role, text, triggerResponse,
    );
  }

  async stopSpeaking(agentId: string): Promise<void> {
    if (!this.page || !this.ready) return;
    await this.page.evaluate(
      (id) => (window as any).stopAvatar(id),
      agentId,
    );
  }

  isReady(): boolean {
    return this.ready;
  }

  async shutdown(): Promise<void> {
    console.log('[AvatarHost] Shutting down...');
    this.ready = false;
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd "server" && npx tsc --noEmit 2>&1 | head -10
```

Expected: No errors from puppeteer.ts. If there are Puppeteer type errors, run:
```bash
cd "server" && npm install --save-dev @types/node
```

- [ ] **Step 3: Commit**

```bash
rtk git add server/src/avatar-host/puppeteer.ts
rtk git commit -m "feat: add AvatarHost class for Puppeteer lifecycle"
```

---

### Task 6: Refactor OmniagentManager

**Files:**
- Modify: `server/src/omniagent/manager.ts`

Add an `AvatarHost` reference so `sendMessage()` delegates to Puppeteer in real mode. Mock mode is unchanged.

- [ ] **Step 1: Add AvatarHost import and delegation**

Replace the entire file content of `server/src/omniagent/manager.ts`:

```typescript
import { MockOmniagentConnection } from './mock.js';
import type { AgentConfig } from '../../../shared/types.js';
import type { AvatarHost } from '../avatar-host/puppeteer.js';

const USE_MOCK = process.env.USE_MOCK === 'true';

export type AgentInstance = MockOmniagentConnection;

export class OmniagentManager {
  private mockAgents: Map<string, MockOmniagentConnection> = new Map();
  private avatarHost: AvatarHost | null = null;
  private agentIds: Set<string> = new Set();

  setAvatarHost(host: AvatarHost) {
    this.avatarHost = host;
  }

  getAvatarHost(): AvatarHost | null {
    return this.avatarHost;
  }

  async createAndConnect(config: AgentConfig): Promise<MockOmniagentConnection | null> {
    if (USE_MOCK) {
      const agent = new MockOmniagentConnection(config);
      await agent.connect();
      this.mockAgents.set(config.id, agent);
      return agent;
    }
    // In Puppeteer mode, agents are managed by AvatarHost — no individual connection
    this.agentIds.add(config.id);
    return null;
  }

  get(agentId: string): MockOmniagentConnection | undefined {
    return this.mockAgents.get(agentId);
  }

  getAll(): MockOmniagentConnection[] {
    return [...this.mockAgents.values()];
  }

  sendMessage(agentId: string, role: 'user' | 'system', text: string, triggerResponse = true) {
    if (USE_MOCK) {
      const agent = this.mockAgents.get(agentId);
      if (!agent) { console.warn(`Agent ${agentId} not found`); return; }
      agent.sendMessage(role, text, triggerResponse);
      return;
    }
    // Delegate to AvatarHost (Puppeteer)
    this.avatarHost?.sendMessage(agentId, role, text, triggerResponse).catch((err) => {
      console.error(`[OmniagentManager] sendMessage failed for ${agentId}:`, (err as Error).message);
    });
  }

  updateSettings(agentId: string, instructions: string) {
    // set_settings doesn't work on WebRTC connections — instructions are set at agent creation
    if (USE_MOCK) {
      this.mockAgents.get(agentId)?.updateSettings(instructions);
    }
  }

  disconnectAll() {
    for (const agent of this.mockAgents.values()) {
      agent.disconnect();
    }
    this.mockAgents.clear();
    this.agentIds.clear();
    // AvatarHost shutdown is handled by SessionManager/index.ts
  }

  disconnect(agentId: string) {
    this.mockAgents.get(agentId)?.disconnect();
    this.mockAgents.delete(agentId);
    this.agentIds.delete(agentId);
  }

  getAgentHealth(): Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> {
    const health: Record<string, { alive: boolean; lastActivity: number; reconnectAttempts: number }> = {};
    if (USE_MOCK) {
      for (const [id] of this.mockAgents) {
        health[id] = { alive: true, lastActivity: Date.now(), reconnectAttempts: 0 };
      }
    } else {
      const ready = this.avatarHost?.isReady() ?? false;
      for (const id of this.agentIds) {
        health[id] = { alive: ready, lastActivity: Date.now(), reconnectAttempts: 0 };
      }
    }
    return health;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd "server" && npx tsc --noEmit 2>&1 | head -10
```

Expected: May show errors in files that import the old `AgentInstance` type or `OmniagentConnection`. These are fixed in the next tasks.

- [ ] **Step 3: Commit**

```bash
rtk git add server/src/omniagent/manager.ts
rtk git commit -m "refactor: OmniagentManager delegates to AvatarHost in real mode"
```

---

### Task 7: Refactor SessionManager

**Files:**
- Modify: `server/src/sessions/manager.ts`

This is the largest task. Changes:
1. Extract event handler logic into standalone methods (usable by both mock events and Puppeteer callbacks)
2. Add `launchAvatarHost()` method for Puppeteer mode
3. Simplify `startDebate()` to branch on mock vs real mode
4. Remove audio tracking and playback estimation (LiveKit handles audio)
5. Simplify `maybeAdvanceTurn()` — no `turn_audio_complete`, no `playback_done`, no generation counters
6. Remove `createVideoTokensForViewer()` and `getVideoTokens()`

- [ ] **Step 1: Add imports and AvatarHost reference**

At the top of `server/src/sessions/manager.ts`, add the import:

```typescript
import { AvatarHost } from '../avatar-host/puppeteer.js';
import { createPublisherToken, createViewerToken, getLiveKitUrl, isLiveKitConfigured } from '../lib/livekit.js';
```

Add to the class fields (after existing fields around line 181):

```typescript
  private avatarHost: AvatarHost | null = null;
```

- [ ] **Step 2: Extract event handler methods**

Add these methods to the SessionManager class (before the existing `wireAgentEvents` method around line 1050):

```typescript
  // ─── Event Handlers (shared by mock events + Puppeteer callbacks) ──

  private stripEmDashes(s: string): string {
    return s.replace(/\u2014/g, ', ').replace(/ ,/g, ',');
  }

  private getAgentName(agentId: string): string {
    return this.agentConfigs.get(agentId)?.name || 'Unknown';
  }

  handleResponseDelta(agentId: string, content: string) {
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;
    const cleaned = this.stripEmDashes(content);
    (this.io as any).emit('transcript_delta', { agentId, agentName: this.getAgentName(agentId), content: cleaned });
  }

  handleSpeechEnd(agentId: string, text: string) {
    // Intercept pole generation responses
    if (this.pendingPoleGeneration === agentId) {
      this.pendingPoleGeneration = null;
      if (this.poleGenerationTimeout) { clearTimeout(this.poleGenerationTimeout); this.poleGenerationTimeout = null; }
      this.parsePoleResponse(text);
      return;
    }

    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;
    if (this.turnTextComplete) return;

    const cleanText = this.stripEmDashes(text);
    const msg: TranscriptMessage = {
      agentId, agentName: this.getAgentName(agentId), text: cleanText, timestamp: Date.now(),
    };

    this.recentTranscripts.push(msg);
    if (this.recentTranscripts.length > 50) this.recentTranscripts.shift();

    if (this.session) {
      db.prepare('INSERT INTO transcripts (session_id, agent_id, text, timestamp) VALUES (?, ?, ?, ?)')
        .run(this.session.id, agentId, cleanText, Date.now());
    }

    (this.io as any).emit('transcript_done', msg);
    this.emitDebug('speech_end', agentId, this.getAgentName(agentId), `${text.length} chars`);
    this.analyzeAgentStance(agentId, cleanText);

    this.turnTextComplete = true;
    this.maybeAdvanceTurn(agentId);
  }

  handleTalkState(agentId: string, state: string) {
    if (state === 'ended' && this.turnManager?.getCurrentSpeaker() === agentId) {
      setTimeout(() => {
        if (this.turnManager?.getCurrentSpeaker() === agentId) {
          this.turnAudioDone = true;
          this.maybeAdvanceTurn(agentId);
        }
      }, 1500);
    }
  }

  handleResponseStart(agentId: string) {
    this.turnManager?.onResponseStarted(agentId);
  }

  handleToolEffect(agentId: string, toolName: string, argsJson: string, callId: string) {
    const args = JSON.parse(argsJson);
    (this.io as any).emit('tool_effect', {
      agentId, agentName: this.getAgentName(agentId), tool: toolName, args,
    });
    this.emitDebug('tool_call', agentId, this.getAgentName(agentId), `${toolName}(${argsJson})`);
  }
```

- [ ] **Step 3: Update wireAgentEvents to delegate to extracted methods**

Replace the existing `wireAgentEvents` method (around line 1052) with a simplified version that delegates to the extracted methods:

```typescript
  private wireAgentEvents(agent: AgentInstance, agentId: string) {
    agent.on('response_delta', (data: { itemId: string; content: string }) => {
      this.handleResponseDelta(agentId, data.content);
    });

    agent.on('speech_end', (data: { agentId: string; text: string }) => {
      this.handleSpeechEnd(agentId, data.text);
    });

    agent.on('response_start', () => {
      this.handleResponseStart(agentId);
    });

    agent.on('talk_state', (data: any) => {
      if (data?.state) this.handleTalkState(agentId, data.state);
    });

    agent.on('tool_effect', (data: { agentId: string; agentName: string; toolName: string; args: any; callId: string }) => {
      this.handleToolEffect(agentId, data.toolName, JSON.stringify(data.args || {}), data.callId);
    });

    agent.on('disconnected', () => {
      console.log(`  Agent disconnected: ${this.getAgentName(agentId)}`);
      this.io.emit('agent_disconnected', { agentId, reason: 'connection_lost' });
    });
  }
```

Note: the `audio` and `video_frame` event handlers are removed — LiveKit handles media delivery.

- [ ] **Step 4: Add launchAvatarHost method**

Add this method after the extracted event handlers:

```typescript
  private async launchAvatarHost(): Promise<void> {
    if (!this.session || !isLiveKitConfigured()) {
      console.warn('[AvatarHost] LiveKit not configured — skipping avatar host');
      return;
    }

    // Create WebRTC tokens for the headless browser (one per agent)
    const hostTokens = await this.createVideoTokensForViewer('avatarhost');
    const agents = this.session.agentIds
      .filter(id => hostTokens[id])
      .map(id => ({
        id,
        name: this.getAgentName(id),
        token: hostTokens[id],
      }));

    if (agents.length === 0) {
      console.error('[AvatarHost] No WebRTC tokens created — cannot launch');
      return;
    }

    // Create LiveKit publisher token
    const livekitToken = await createPublisherToken(this.session.id);
    const livekitUrl = getLiveKitUrl();
    const port = parseInt(process.env.PORT || '3001', 10);

    // Launch Puppeteer
    this.avatarHost = new AvatarHost();
    this.omniagent.setAvatarHost(this.avatarHost);

    await this.avatarHost.launch(agents, livekitUrl, livekitToken, port, {
      onSpeechDelta: (agentId, text) => this.handleResponseDelta(agentId, text),
      onSpeechEnd: (agentId, fullText) => this.handleSpeechEnd(agentId, fullText),
      onTalkState: (agentId, state) => this.handleTalkState(agentId, state),
      onResponseStart: (agentId) => this.handleResponseStart(agentId),
      onToolEffect: (agentId, toolName, argsJson, callId) => this.handleToolEffect(agentId, toolName, argsJson, callId),
      onHostReady: () => { /* resolved inside AvatarHost */ },
    });
  }
```

- [ ] **Step 5: Modify startDebate to use AvatarHost**

Replace the `startDebate()` method's agent connection block (lines ~337-398). Find the section starting with `// Connect all agents via WebSocket` and replace it through `console.log('  Debate is LIVE!\n');`:

Replace:
```typescript
    // Connect all agents via WebSocket
    const connectedAgentIds: string[] = [];
    for (const agentId of this.session.agentIds) {
      const config = this.agentConfigs.get(agentId)!;
      try {
        const agent = await this.omniagent.createAndConnect(config);
        this.wireAgentEvents(agent, agentId);
        connectedAgentIds.push(agentId);
        console.log(`  Connected: ${config.name}`);
      } catch (err) {
        console.error(`  Failed to connect ${config.name}:`, (err as Error).message);
        this.io.emit('agent_disconnected', { agentId, reason: (err as Error).message });
      }
    }

    // Update session to only include connected agents
    const totalCreated = this.session.agentIds.length;
    this.session.agentIds = connectedAgentIds;
    console.log(`  ${connectedAgentIds.length}/${totalCreated} agents connected`);

    // Create WebRTC connections for client-side video avatars
    this.createVideoTokens(connectedAgentIds);
```

With:
```typescript
    const USE_MOCK = process.env.USE_MOCK === 'true';

    if (USE_MOCK) {
      // Mock mode: connect agents directly
      const connectedAgentIds: string[] = [];
      for (const agentId of this.session.agentIds) {
        const config = this.agentConfigs.get(agentId)!;
        try {
          const agent = await this.omniagent.createAndConnect(config);
          if (agent) {
            this.wireAgentEvents(agent, agentId);
            connectedAgentIds.push(agentId);
            console.log(`  Connected: ${config.name}`);
          }
        } catch (err) {
          console.error(`  Failed to connect ${config.name}:`, (err as Error).message);
        }
      }
      const totalCreated = this.session.agentIds.length;
      this.session.agentIds = connectedAgentIds;
      console.log(`  ${connectedAgentIds.length}/${totalCreated} agents connected (mock)`);
    } else {
      // Real mode: launch AvatarHost (Puppeteer + LiveKit)
      try {
        await this.launchAvatarHost();
        console.log(`  AvatarHost launched with ${this.session.agentIds.length} agents`);
      } catch (err) {
        console.error('  AvatarHost launch failed:', (err as Error).message);
        throw err;
      }
    }
```

- [ ] **Step 6: Simplify maybeAdvanceTurn and remove playback tracking**

Replace the `maybeAdvanceTurn` method (around line 1161) with a simplified version that removes playback estimation, generation counters, and `turn_audio_complete`:

```typescript
  private maybeAdvanceTurn(agentId: string) {
    if (!this.turnTextComplete || !this.turnAudioDone) return;
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

    const name = this.getAgentName(agentId);
    console.log(`  [${name}] text+audio done — advancing turn`);

    // Cancel the no-response timeout
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }

    this.doAdvanceTurn(agentId);
  }
```

Remove these fields from the class (they're no longer needed):
- `private audioTracker` (line ~181)
- `private turnAdvanceTimer` (line ~1157)
- `private turnGeneration` (line ~1159)

Remove the `estimatePlaybackSeconds` method (lines ~1202-1208).

Remove the `advanceFromPlayback` method (lines ~1192-1199).

Simplify `doAdvanceTurn` — remove the `turnAdvanceTimer` clearing:
```typescript
  private doAdvanceTurn(agentId: string) {
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
    this.lastTurnAdvanceTime = Date.now();
    const name = this.getAgentName(agentId);
    console.log(`  [${name}] advancing turn`);
    this.completedTurns++;

    if (this.completedTurns === 3 && !this.polesGenerated) {
      this.generatePolesFromTranscript();
    }

    this.turnManager?.onSpeechEnd(agentId, '');
  }
```

Also update the `wireTurnManagerEvents` turn_start handler: remove `this.audioTracker.delete(agentId)` and the `turnAdvanceTimer` clearing.

- [ ] **Step 7: Remove video token methods that are now replaced by LiveKit**

Remove `getVideoTokens()` method (line ~645-647), `createVideoTokens()` method (line ~979-982). Keep `createVideoTokensForViewer()` since the AvatarHost uses it to get Napster WebRTC tokens for the headless browser.

Replace the viewer video token emission in `startDebate()` (the block with `Send video tokens to all already-connected viewers`). Replace it with LiveKit token emission:

```typescript
    // Send LiveKit viewer tokens to all connected viewers
    if (!USE_MOCK && isLiveKitConfigured()) {
      const sockets = await this.io.fetchSockets();
      for (const s of sockets) {
        try {
          const token = await createViewerToken(this.session!.id, s.id);
          (s as any).emit('livekit_token', { token, url: getLiveKitUrl() });
        } catch (err) {
          console.warn(`  LiveKit token failed for ${s.id}:`, (err as Error).message);
        }
      }
    }
```

Add a new public method for socket handlers to call on viewer connect:

```typescript
  async createLiveKitViewerToken(viewerId: string): Promise<{ token: string; url: string } | null> {
    if (!this.session || !isLiveKitConfigured()) return null;
    const token = await createViewerToken(this.session.id, viewerId);
    return { token, url: getLiveKitUrl() };
  }
```

- [ ] **Step 8: Add AvatarHost shutdown to endDebate**

In the `endDebate()` method (line ~406), add avatar host shutdown after `this.omniagent.disconnectAll()`:

```typescript
    // Shutdown AvatarHost (Puppeteer)
    if (this.avatarHost) {
      await this.avatarHost.shutdown();
      this.avatarHost = null;
    }
```

- [ ] **Step 9: Verify it compiles**

Run:
```bash
cd "server" && npx tsc --noEmit 2>&1 | head -20
```

Expected: Possible errors from handlers.ts referencing removed methods. These are fixed in Task 8.

- [ ] **Step 10: Commit**

```bash
rtk git add server/src/sessions/manager.ts
rtk git commit -m "refactor: SessionManager uses AvatarHost for real mode, simplified turn mgmt"
```

---

### Task 8: Server Entry Point + Socket Handler Updates

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/socket/handlers.ts`

Changes to index.ts:
- Serve `avatar-host/` directory as static files (for Puppeteer to load)
- Remove the `/api/sessions/tokens` endpoint
- Keep signaling proxy (headless Chrome needs it)
- Add AvatarHost shutdown to graceful shutdown

Changes to handlers.ts:
- Replace `agent_video_tokens` with `livekit_token` on viewer connect
- Remove `playback_done` handler

- [ ] **Step 1: Add avatar-host static serving to index.ts**

In `server/src/index.ts`, after the `contentDir` static serving (around line 82), add:

```typescript
// Serve avatar host pages for Puppeteer headless browser
const avatarHostDir = path.resolve(__dirname, 'avatar-host');
app.use('/avatar-host', express.static(avatarHostDir));
```

- [ ] **Step 2: Remove the /api/sessions/tokens endpoint from index.ts**

Remove these lines (around line 160-162):

```typescript
app.get('/api/sessions/tokens', (_req, res) => {
  res.json({ tokens: sessionManager.getVideoTokens() });
});
```

- [ ] **Step 3: Add AvatarHost shutdown to graceful shutdown in index.ts**

In the `shutdown` function (around line 331), add before `io.close()`:

```typescript
  const host = omniagent.getAvatarHost();
  if (host) await host.shutdown();
```

- [ ] **Step 4: Update socket handlers for LiveKit**

In `server/src/socket/handlers.ts`, replace the video token block (lines 32-41) with LiveKit token emission:

Replace:
```typescript
    // Create fresh per-viewer video tokens (single-use for WebRTC signaling)
    if (sessionManager.getActiveSession()?.status === 'active') {
      sessionManager.createVideoTokensForViewer(socket.id).then((tokens) => {
        if (Object.keys(tokens).length > 0) {
          socket.emit('agent_video_tokens' as any, { tokens });
        }
      }).catch((err) => {
        console.warn(`  Video tokens failed for ${socket.id}:`, (err as Error).message);
      });
    }
```

With:
```typescript
    // Send LiveKit viewer token for video/audio subscription
    if (sessionManager.getActiveSession()?.status === 'active') {
      sessionManager.createLiveKitViewerToken(socket.id).then((lk) => {
        if (lk) {
          (socket as any).emit('livekit_token', lk);
        }
      }).catch((err) => {
        console.warn(`  LiveKit token failed for ${socket.id}:`, (err as Error).message);
      });
    }
```

- [ ] **Step 5: Remove playback_done handler**

In `server/src/socket/handlers.ts`, remove these lines (around line 168-170):

```typescript
    // Client signals audio playback finished — generation counter prevents stale signals
    socket.on('playback_done' as any, (data: { gen?: number }) => {
      sessionManager.advanceFromPlayback(data?.gen);
    });
```

- [ ] **Step 6: Verify it compiles**

Run:
```bash
cd "server" && npx tsc --noEmit 2>&1 | head -10
```

Expected: Clean or only warnings about unused imports (connection.ts etc. still exist, will be deleted in Task 10).

- [ ] **Step 7: Commit**

```bash
rtk git add server/src/index.ts server/src/socket/handlers.ts
rtk git commit -m "feat: serve avatar-host, LiveKit viewer tokens, remove playback_done"
```

---

### Task 9: Client LiveKit Room + AgentVideo + Store

**Files:**
- Create: `client/src/lib/livekit-room.ts`
- Modify: `client/src/components/AgentVideo.tsx`
- Modify: `client/src/store/arena.ts`

- [ ] **Step 1: Create the LiveKit room manager**

```typescript
// client/src/lib/livekit-room.ts
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client';

export type TrackMap = Record<string, { video?: MediaStreamTrack; audio?: MediaStreamTrack }>;

let room: Room | null = null;
let onTracksChanged: ((tracks: TrackMap) => void) | null = null;
const trackMap: TrackMap = {};

function parseTrackName(name: string): { agentId: string; kind: 'video' | 'audio' } | null {
  const parts = name.split('_');
  if (parts.length < 2) return null;
  const kind = parts[parts.length - 1];
  const agentId = parts.slice(0, -1).join('_');
  if (kind !== 'video' && kind !== 'audio') return null;
  return { agentId, kind };
}

function updateTrack(track: RemoteTrack, publication: RemoteTrackPublication, subscribed: boolean) {
  const parsed = parseTrackName(publication.trackName);
  if (!parsed) return;

  if (!trackMap[parsed.agentId]) trackMap[parsed.agentId] = {};

  if (subscribed) {
    trackMap[parsed.agentId][parsed.kind] = track.mediaStreamTrack;
  } else {
    delete trackMap[parsed.agentId][parsed.kind];
  }

  onTracksChanged?.({ ...trackMap });
}

export async function connectLiveKit(url: string, token: string, onChange: (tracks: TrackMap) => void): Promise<void> {
  if (room) {
    await room.disconnect();
  }

  onTracksChanged = onChange;
  room = new Room();

  room.on(RoomEvent.TrackSubscribed, (track, publication) => {
    updateTrack(track, publication, true);
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
    updateTrack(track, publication, false);
  });

  room.on(RoomEvent.Disconnected, () => {
    console.log('[LiveKit] Disconnected');
  });

  await room.connect(url, token);
  console.log('[LiveKit] Connected to room');
}

export function disconnectLiveKit() {
  if (room) {
    room.disconnect();
    room = null;
  }
  onTracksChanged = null;
  for (const key of Object.keys(trackMap)) delete trackMap[key];
}
```

- [ ] **Step 2: Rewrite AgentVideo.tsx for LiveKit**

Replace the entire content of `client/src/components/AgentVideo.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useArenaStore } from '../store/arena';

interface AgentVideoProps {
  agentId: string;
  agentName: string;
  color: string;
}

export function AgentVideo({ agentId, agentName, color }: AgentVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoTrack = useArenaStore((s) => s.livekitTracks[agentId]?.video);
  const audioTrack = useArenaStore((s) => s.livekitTracks[agentId]?.audio);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const soundMuted = useArenaStore((s) => s.soundMuted);
  const isSpeaking = currentSpeaker === agentId;
  const hasVideo = !!videoTrack;

  // Attach video track
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    el.srcObject = new MediaStream([videoTrack]);
    el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [videoTrack]);

  // Attach audio track (only for current speaker)
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioTrack) return;
    el.srcObject = new MediaStream([audioTrack]);
    el.muted = !isSpeaking || soundMuted;
    if (isSpeaking && !soundMuted) {
      el.play().catch(() => {});
    }
    return () => { el.srcObject = null; };
  }, [audioTrack, isSpeaking, soundMuted]);

  return (
    <div className={`w-full h-full relative ${isSpeaking ? 'ring-2 ring-offset-2 ring-offset-gray-900' : ''}`}
      style={isSpeaking ? { ringColor: color } : undefined}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: hasVideo ? 'block' : 'none' }}
      />
      <audio ref={audioRef} autoPlay />
      {!hasVideo && (
        <div className="w-full h-full flex items-center justify-center absolute inset-0 z-0">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
            style={{ backgroundColor: color + '20', color, border: `2px solid ${color}40` }}
          >
            {agentName.split(' ').pop()?.[0] || agentName[0]}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update the arena store**

In `client/src/store/arena.ts`, make these changes:

**3a. Replace the agent-audio import with livekit-room import (line 5):**

Replace:
```typescript
import { agentAudio } from '../lib/agent-audio';
```

With:
```typescript
import { connectLiveKit, disconnectLiveKit, type TrackMap } from '../lib/livekit-room';
```

**3b. Add livekitTracks to the state interface (around line 111, after videoTokens):**

Replace:
```typescript
  // Video
  videoFrames: Record<string, string>; // agentId -> latest base64 JPEG frame (server-pushed)
  videoTokens: Record<string, string>; // agentId -> WebRTC token (for client-side video)
```

With:
```typescript
  // LiveKit
  livekitTracks: TrackMap;
```

**3c. Update the initial state (around line 270-271):**

Replace:
```typescript
  videoFrames: {},
  videoTokens: {},
```

With:
```typescript
  livekitTracks: {},
```

**3d. Remove the agent_audio handler (around line 335-339):**

Remove:
```typescript
    // Play Napster native audio chunks (base64 PCM 16-bit 16kHz mono)
    socket.on('agent_audio', (data: { agentId: string; audio: string }) => {
      if (data.audio) {
        agentAudio.playChunk(data.audio);
      }
    });
```

**3e. Remove the agent_video_frame handler (around line 342-346):**

Remove:
```typescript
    // Receive video frames from server (JPEG base64, only current speaker)
    (socket as any).on('agent_video_frame', (data: { agentId: string; frame: string }) => {
      set((s) => ({
        videoFrames: { ...s.videoFrames, [data.agentId]: data.frame },
      }));
    });
```

**3f. Replace the agent_video_tokens handler (around line 349-351) with livekit_token:**

Replace:
```typescript
    // Receive WebRTC video tokens for client-side video rendering
    (socket as any).on('agent_video_tokens', (data: { tokens: Record<string, string> }) => {
      set({ videoTokens: data.tokens });
    });
```

With:
```typescript
    // Connect to LiveKit room for video/audio
    (socket as any).on('livekit_token', ({ token, url }: { token: string; url: string }) => {
      connectLiveKit(url, token, (tracks) => {
        set({ livekitTracks: tracks });
      }).catch((err) => console.error('[LiveKit] Connect failed:', err));
    });
```

**3g. Remove the turn_audio_complete handler (around line 355-359):**

Remove:
```typescript
    // Server says no more audio chunks for this turn — play remaining buffered audio,
    // then signal server to advance. Generation counter prevents stale signals.
    (socket as any).on('turn_audio_complete', ({ gen }: { gen: number }) => {
      agentAudio.markComplete(() => {
        socket.emit('playback_done' as any, { gen });
      });
    });
```

**3h. Simplify the speaker_change handler (around line 361-365):**

Replace:
```typescript
    socket.on('speaker_change', ({ agentId }) => {
      transcriptPacer.flush(set);
      set({ currentSpeaker: agentId, videoFrames: {} });
      agentAudio.reset();
    });
```

With:
```typescript
    socket.on('speaker_change', ({ agentId }) => {
      transcriptPacer.flush(set);
      set({ currentSpeaker: agentId });
    });
```

**3i. Add LiveKit disconnect to the disconnect action (around line 466-469):**

Replace:
```typescript
  disconnect: () => {
    const { socket } = get();
    socket?.disconnect();
    set({ socket: null, connected: false });
  },
```

With:
```typescript
  disconnect: () => {
    const { socket } = get();
    socket?.disconnect();
    disconnectLiveKit();
    set({ socket: null, connected: false, livekitTracks: {} });
  },
```

- [ ] **Step 4: Verify client compiles**

Run:
```bash
cd "client" && npx tsc --noEmit 2>&1 | head -10
```

Expected: Clean or warnings about unused agent-audio.ts (deleted in Task 10).

- [ ] **Step 5: Commit**

```bash
rtk git add client/src/lib/livekit-room.ts client/src/components/AgentVideo.tsx client/src/store/arena.ts
rtk git commit -m "feat: client LiveKit integration, rewrite AgentVideo, update store"
```

---

### Task 10: Dead Code Removal + Dockerfile

**Files:**
- Delete: `server/src/omniagent/connection.ts`
- Delete: `server/src/omniagent/webrtc-connection.ts`
- Delete: `server/src/omniagent/media-decoder.ts`
- Delete: `client/src/lib/agent-audio.ts`
- Delete: `client/src/avatar-main.ts`
- Delete: `client/public/avatar.html`
- Modify: `Dockerfile`

- [ ] **Step 1: Delete server dead code**

Run:
```bash
rm -f "server/src/omniagent/connection.ts" "server/src/omniagent/webrtc-connection.ts" "server/src/omniagent/media-decoder.ts"
```

- [ ] **Step 2: Delete client dead code**

Run:
```bash
rm -f "client/src/lib/agent-audio.ts" "client/src/avatar-main.ts" "client/public/avatar.html"
```

- [ ] **Step 3: Verify both projects compile**

Run:
```bash
cd "server" && npx tsc --noEmit 2>&1 | head -10
```

```bash
cd "client" && npx tsc --noEmit 2>&1 | head -10
```

Fix any remaining import errors (e.g., if any file still imports from deleted modules).

- [ ] **Step 4: Update Dockerfile**

Replace the entire `Dockerfile`:

```dockerfile
FROM node:22-slim

# Install Chromium for Puppeteer + ffmpeg
RUN apt-get update && apt-get install -y \
  chromium fonts-liberation libnss3 libatk-bridge2.0-0 \
  libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 \
  ffmpeg \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

COPY server/ ./server/
COPY shared/ ./shared/
COPY client/dist/ ./client/dist/

ENV NODE_ENV=production

CMD ["npx", "--prefix", "server", "tsx", "server/src/index.ts"]
```

Key changes from old Dockerfile:
- `node:22-alpine` -> `node:22-slim` (Debian for Chromium compatibility)
- `apk add ffmpeg` -> `apt-get install chromium fonts-liberation ... ffmpeg`
- Added `PUPPETEER_EXECUTABLE_PATH` and `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` env vars

- [ ] **Step 5: Rebuild client dist**

Run:
```bash
cd "client" && npx vite build
```

Expected: Build succeeds. The built files reflect the LiveKit changes.

- [ ] **Step 6: Commit all changes**

```bash
rtk git add -A
rtk git commit -m "chore: remove dead code (WS connection, audio player, avatar iframe), update Dockerfile for Chromium"
```

Then force-add client dist:
```bash
cd "client" && npx vite build && cd .. && rtk git add -f client/dist && rtk git commit -m "build: update client dist with LiveKit changes"
```

---

## Post-Implementation: LiveKit Cloud Setup

Before deploying, create a LiveKit Cloud account and configure env vars:

1. Go to `https://cloud.livekit.io` and create a free account (no credit card required)
2. Create a project
3. Copy the API Key, API Secret, and WebSocket URL
4. Add to `.env` locally:
   ```
   LIVEKIT_API_KEY=APIxxxxxxx
   LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxx
   LIVEKIT_URL=wss://your-project.livekit.cloud
   ```
5. Add the same vars to Railway environment variables

Free tier limits: 50 concurrent participants, 25,000 participant-minutes/month.

## Post-Implementation: Manual Testing

1. Start the server: `cd server && npx tsx src/index.ts`
2. Open `http://localhost:3001` in a browser
3. The server console should show:
   - `[AvatarHost] Launching headless Chrome...`
   - `[Host] Avatar ready: ...` (3 times)
   - `[Host] Connected to LiveKit room`
   - `[Host] All streams published. Host ready!`
4. The browser should show 3 video panels with lip-synced avatars
5. Transcript should stream word-by-word in sync with the avatar speech
6. Audio should play from the current speaker through LiveKit

## Spec Deviations

1. **Signaling proxy retained:** The spec says to remove the signaling proxy from `index.ts`. However, the headless Chrome browser still needs it (Napster's signaling server rejects browser WebSocket connections). The proxy is kept as-is but now serves only the headless browser, not viewer clients.

2. **`host-main.ts` merged into `page.html`:** The spec lists `host-main.ts` as a separate file. For simplicity (no build step needed for the headless browser pages), the JavaScript is inline in `page.html`.

3. **LiveKit SDK loaded via `esm.sh` CDN:** The spec suggests `jsdelivr` for the LiveKit UMD bundle. Since `livekit-client` may not have a UMD build, we use `esm.sh` which transpiles npm packages to browser ESM. This is loaded as a `<script type="module">` in `page.html`.
