/**
 * Cross-Connection Lip-Sync Test
 *
 * Tests whether speech triggered on a WebSocket connection
 * propagates lip animation to a WebRTC connection on the SAME agent.
 *
 * Usage:
 *   npx tsx test/cross-connection/server.ts
 *
 * Then open http://localhost:3099 in your browser.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameTmp = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root (two levels up from test/cross-connection/)
dotenv.config({ path: path.resolve(__dirnameTmp, '../../.env') });

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';

const __dirname = __dirnameTmp;
const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.OMNIAGENT_API_KEY;
const PORT = 3099;

let agentId: string | null = null;
let wsConnection: WebSocket | null = null;
let webrtcToken: string | null = null;

async function findCompanionId(apiKey: string): Promise<string> {
  console.log('  Looking up existing ARENA companions...');
  const res = await fetch(`${API_BASE}/public/companions?pageSize=50`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`List companions failed: ${res.status}`);
  const data = await res.json() as { items: any[] };

  // Find one with arena_role tag (our custom companions)
  const arena = data.items.find((c: any) => c.tags?.arena_role);
  if (arena) {
    console.log(`  Found: ${arena.firstName} ${arena.lastName} (${arena.id}, role=${arena.tags.arena_role})`);
    return arena.id;
  }

  // Fall back to any ready companion
  const ready = data.items.find((c: any) =>
    c.status === 'readyToUse' || c.status === 'completed' || c.status === 'generationCompleted'
  );
  if (ready) {
    console.log(`  Found: ${ready.firstName || 'Stock'} ${ready.lastName || ''} (${ready.id})`);
    return ready.id;
  }

  // Last resort: first companion in list
  if (data.items.length > 0) {
    const first = data.items[0];
    console.log(`  Using first available: ${first.id} (status=${first.status})`);
    return first.id;
  }

  throw new Error('No companions found. Create one first or run the ARENA server.');
}

async function main() {
  if (!API_KEY) {
    console.error('\n  ERROR: OMNIAGENT_API_KEY not set.');
    console.error('  Make sure .env exists in the project root with OMNIAGENT_API_KEY=...\n');
    process.exit(1);
  }

  // ─── Step 1: Create a temporary agent ─────────────────────────────────
  console.log('\n[1/4] Creating temporary agent...');
  const companionId = await findCompanionId(API_KEY);

  const agentRes = await fetch(`${API_BASE}/public/agents`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companionId,
      name: 'LipSyncCrossTest',
      voiceId: 'alloy',
      language: 'en',
      disableIdleTimeout: true,
      providerSettings: {
        instructions: 'You are a friendly assistant. When asked, respond with a short, enthusiastic answer.',
      },
    }),
  });

  if (!agentRes.ok) {
    const err = await agentRes.text();
    console.error(`  Failed: ${agentRes.status} ${err.slice(0, 200)}`);
    process.exit(1);
  }

  const agent = await agentRes.json() as { id: string };
  agentId = agent.id;
  console.log(`  Agent created: ${agentId}`);

  // ─── Step 2: Create WebSocket connection ──────────────────────────────
  console.log('[2/4] Creating WebSocket connection (externalClientId=crosstest01)...');
  const wsRes = await fetch(`${API_BASE}/public/agents/${agentId}/connections`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'websocket',
      externalClientId: 'crosstest01',
    }),
  });

  if (!wsRes.ok) {
    const err = await wsRes.text();
    console.error(`  Failed: ${wsRes.status} ${err.slice(0, 200)}`);
    await cleanup();
    process.exit(1);
  }

  const wsData = await wsRes.json() as { token: string };
  const decoded = JSON.parse(Buffer.from(wsData.token, 'base64').toString('utf-8'));
  const wsConnectionId = decoded.connection?.id;

  wsConnection = new WebSocket(decoded.url, {
    headers: decoded.authToken ? { Authorization: `Bearer ${decoded.authToken}` } : {},
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 15000);

    wsConnection!.on('open', () => {
      console.log(`  WebSocket connected (connection=${wsConnectionId})`);
      // Prime audio channel with silence (required for audio_received events)
      const silence = Buffer.alloc(3200);
      wsConnection!.send(JSON.stringify({
        type: 'send_audio',
        data: { data: silence.toString('base64') },
      }));
      clearTimeout(timeout);
      resolve();
    });

    wsConnection!.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Log WS events
  wsConnection.on('message', (raw) => {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as any);
    try {
      const event = JSON.parse(buf.toString('utf-8'));
      const type = event.event || event.type;
      if (type === 'talk_state_changed') {
        console.log(`  [WS] talk_state: ${event.data?.state}`);
      } else if (type === 'message_received') {
        const msg = event.data?.message || event.data;
        if (msg?.role === 'assistant' && msg.action === 'delta' && msg.content) {
          process.stdout.write(msg.content);
        } else if (msg?.role === 'assistant' && msg.action === 'completed') {
          console.log(`\n  [WS] Response complete: "${(msg.content || '').slice(0, 100)}"`);
        }
      } else if (type === 'audio_received') {
        // Silently count these — too noisy to log
      } else if (type) {
        console.log(`  [WS] ${type}`);
      }
    } catch {
      // binary audio frame
    }
  });

  // ─── Step 3: Create WebRTC token (SAME externalClientId) ─────────────
  console.log('[3/4] Creating WebRTC token (SAME externalClientId=crosstest01)...');
  const rtcRes = await fetch(`${API_BASE}/public/agents/${agentId}/connections`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'webrtc',
      externalClientId: 'crosstest01',
    }),
  });

  if (!rtcRes.ok) {
    const err = await rtcRes.text();
    console.error(`  Failed: ${rtcRes.status} ${err.slice(0, 200)}`);
    await cleanup();
    process.exit(1);
  }

  const rtcData = await rtcRes.json() as { token: string };
  webrtcToken = rtcData.token;
  console.log('  WebRTC token created');

  // ─── Step 4: Start test server ────────────────────────────────────────
  console.log('[4/4] Starting test server...');
  const app = express();
  const httpServer = createServer(app);

  // Serve test page with token injected
  app.get('/', (_req, res) => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8')
      .replace('__WEBRTC_TOKEN__', webrtcToken!);
    res.type('html').send(html);
  });

  // Trigger speech via WebSocket
  app.post('/trigger', (_req, res) => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      return res.status(503).json({ error: 'WebSocket not connected' });
    }
    const msg = 'Tell me a short, enthusiastic joke about robots. Keep it under 30 words.';
    wsConnection.send(JSON.stringify({
      type: 'send_message',
      data: { role: 'user', text: msg, trigger_response: true },
    }));
    console.log(`\n  [TRIGGER] Sent via WebSocket: "${msg}"`);
    res.json({ ok: true, message: msg });
  });

  // Signaling WebSocket proxy
  const signalingWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/signaling-proxy/')) return;

    signalingWss.handleUpgrade(req, socket, head, (clientWs) => {
      const targetPath = req.url!.replace('/signaling-proxy/', '');
      const targetUrl = `wss://avatar-signaling.touchcastmaas.com/${targetPath}`;
      console.log(`  [PROXY] Connecting: ${targetUrl.slice(0, 80)}...`);

      const upstream = new WebSocket(targetUrl);
      const pending: { data: any; isBinary: boolean }[] = [];

      clientWs.on('message', (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
        } else {
          pending.push({ data, isBinary });
        }
      });

      upstream.on('open', () => {
        console.log('  [PROXY] Upstream connected');
        for (const m of pending) upstream.send(m.data, { binary: m.isBinary });
        pending.length = 0;
      });

      upstream.on('message', (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      upstream.on('error', (err) => console.error('  [PROXY] Upstream error:', err.message));
      clientWs.on('close', () => upstream.close());
      upstream.on('close', () => { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(); });
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`
====================================================
  CROSS-CONNECTION LIP-SYNC TEST
====================================================

  Open: http://localhost:${PORT}

  1. Wait for the avatar to appear and show READY
  2. Click "Trigger Speech via WebSocket"
  3. WATCH THE AVATAR'S MOUTH:

     Mouth moves = Cross-connection WORKS
     Mouth still = Need headless browser approach

  Server console shows WebSocket events.
  Browser page shows WebRTC avatar events.

  Press Ctrl+C to stop and clean up.
====================================================
`);
  });

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await cleanup();
    process.exit();
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit();
  });
}

async function cleanup() {
  wsConnection?.close();
  if (agentId && API_KEY) {
    console.log(`  Deleting temporary agent ${agentId}...`);
    try {
      await fetch(`${API_BASE}/public/agents/${agentId}`, {
        method: 'DELETE',
        headers: { 'X-Api-Key': API_KEY },
      });
      console.log('  Agent deleted.');
    } catch (err) {
      console.error('  Failed to delete agent:', (err as Error).message);
    }
  }
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await cleanup();
  process.exit(1);
});
