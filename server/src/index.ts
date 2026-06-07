import 'dotenv/config';

// Prevent gRPC streaming errors (e.g. Firestore PERMISSION_DENIED) from crashing the process
process.on('unhandledRejection', (reason, promise) => {
  console.error('  [FATAL] Unhandled rejection:', reason);
});

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WebSocketServer, WebSocket as WS } from 'ws';
import { fileURLToPath } from 'url';
import path from 'path';
import { setupSocketHandlers } from './socket/handlers.js';
import { db } from './db/index.js';
import { OmniagentManager } from './omniagent/manager.js';
import { SessionManager } from './sessions/manager.js';
import { DebateWatchdog } from './sessions/watchdog.js';
import { getNextTopic, getTopicPool } from './sessions/auto-start.js';
import type { ServerEvents, ClientEvents } from '../../shared/types.js';
import Stripe from 'stripe';
import { adminAuth } from './lib/firebase-admin.js';
import { CreditService } from './lib/credits.js';
import { initNapsterResources } from './lib/napster-resources.js';
import { ensureCustomCompanions } from './lib/companions.js';
import { createToolRoutes } from './routes/tools.js';
import { logLiveKitStatus } from './lib/livekit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientEvents, ServerEvents>(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// ─── Core Services ──────────────────────────────────────────────────────────

const omniagent = new OmniagentManager();
const sessionManager = new SessionManager(omniagent, io);
const watchdog = new DebateWatchdog(sessionManager, omniagent);
sessionManager.setWatchdog(watchdog);
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const creditService = new CreditService();

// ─── Stripe Webhook (MUST be before express.json) ─────────────────────────
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('  Stripe webhook error:', (err as Error).message);
    return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.metadata?.uid;
    const credits = parseInt(session.metadata?.credits || '0', 10);
    if (uid && credits > 0) {
      await creditService.addCredits(uid, credits, session.id);
    }
  }

  res.json({ received: true });
});

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(express.json());

// ─── Serve Static Client (production) ───────────────────────────────────────

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// Serve knowledge base playbooks as static files for Napster API to download
const contentDir = path.resolve(__dirname, 'content');
app.use('/static', express.static(contentDir));

// Serve avatar host pages for Puppeteer headless browser
const avatarHostDir = path.resolve(__dirname, 'avatar-host');
app.use('/avatar-host', express.static(avatarHostDir));

// ─── Health Endpoint ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const session = sessionManager.getActiveSession();
  const watchdogStatus = watchdog.getStatus();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    viewerCount: io.engine.clientsCount,
    activeSession: session ? { id: session.id, topic: session.topic, status: session.status } : null,
    watchdog: watchdogStatus,
    timestamp: Date.now(),
  });
});

// ─── Tool Endpoints (called by Napster explicit tools) ──────────────────────
app.use('/api/tools', createToolRoutes(sessionManager));

// ─── API Routes ─────────────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  const state = sessionManager.getSessionState();
  res.json({
    session: state.session,
    agents: state.agents,
    currentSpeaker: state.currentSpeaker,
    viewerCount: io.engine.clientsCount,
  });
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { topic, agentCount } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });
    const session = await sessionManager.createSession(topic, agentCount || 3);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/sessions/start', async (_req, res) => {
  try {
    await sessionManager.startDebate();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Combined create + start (for easy demo launch)
app.post('/api/sessions/launch', async (req, res) => {
  try {
    const { topic, agentCount } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });
    const session = await sessionManager.createSession(topic, agentCount || 3);
    await sessionManager.startDebate();
    res.json({ session, started: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/sessions/end', async (_req, res) => {
  try {
    await sessionManager.endDebate('manual');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/topics', (_req, res) => {
  res.json({ topics: getTopicPool() });
});

// ─── Authenticate (ensure user doc + starter credits) ────────────────────
const creditServiceHttp = new CreditService();

app.post('/api/authenticate', async (req, res) => {
  const { token } = req.body;
  console.log(`  [Auth] /api/authenticate called, token length: ${token?.length || 0}`);
  if (!token) return res.status(401).json({ error: 'No token' });
  if (!adminAuth) {
    console.error('  [Auth] adminAuth is null — Firebase Admin not initialized');
    return res.status(503).json({ error: 'Firebase Admin not ready' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const name = decoded.name || null;
    console.log(`  [Auth] Verified: ${name || decoded.uid}`);
    await creditServiceHttp.ensureUser(decoded.uid, name);
    console.log(`  [Auth] User doc ready for ${decoded.uid}`);
    res.json({ uid: decoded.uid });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`  [Auth] verifyIdToken failed: ${msg}`);
    res.status(401).json({ error: msg });
  }
});

// ─── Credit Purchase ──────────────────────────────────────────────────────
const CREDIT_PACKAGES: Record<string, { credits: number; price: number; name: string }> = {
  starter: { credits: 10, price: 500, name: '10 ARENA Credits' },
  popular: { credits: 25, price: 1000, name: '25 ARENA Credits' },
  whale:   { credits: 50, price: 1800, name: '50 ARENA Credits' },
};

app.post('/api/credits/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const { packageId, token } = req.body;
  if (!token) return res.status(401).json({ error: 'Auth required' });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const pkg = CREDIT_PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: pkg.name },
          unit_amount: pkg.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://arenaserver-production-f84b.up.railway.app'}/?credits=success`,
      cancel_url: `${req.headers.origin || 'https://arenaserver-production-f84b.up.railway.app'}/?credits=cancel`,
      metadata: { uid: decoded.uid, credits: pkg.credits.toString() },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('  Checkout error:', (err as Error).message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ─── SPA Catch-All (after API routes, before socket) ────────────────────────

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ─── Signaling WebSocket Proxy ───────────────────────────────────────────────
// The Napster signaling server rejects browser WebSocket connections (returns 400).
// We proxy signaling through our server (no Origin header from Node.js).
// Client path: /signaling-proxy/ws/connections/{id}/signaling
//           → wss://avatar-signaling.touchcastmaas.com/ws/connections/{id}/signaling

const signalingWss = new WebSocketServer({ noServer: true });
// Track connection attempt counts per connection ID (for logging only)
const proxyAttempts = new Map<string, number>();

httpServer.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/signaling-proxy/')) return;

  signalingWss.handleUpgrade(req, socket, head, (clientWs) => {
    const targetPath = req.url!.replace('/signaling-proxy/', '');
    const targetUrl = `wss://avatar-signaling.touchcastmaas.com/${targetPath}`;

    // Extract connection ID for logging
    const connIdMatch = targetPath.match(/connections\/([^/]+)\//);
    const connId = connIdMatch?.[1]?.slice(0, 8) || 'unknown';
    const attempt = (proxyAttempts.get(connId) || 0) + 1;
    proxyAttempts.set(connId, attempt);
    const tag = `[Proxy:${connId}#${attempt}]`;
    console.log(`  ${tag} → ${targetUrl}`);

    // Forward WebSocket subprotocols from the client request
    const protocols = req.headers['sec-websocket-protocol'];
    const upstream = protocols
      ? new WS(targetUrl, protocols.split(',').map(p => p.trim()))
      : new WS(targetUrl);

    // Buffer client messages until upstream is ready
    const pendingMessages: { data: any; isBinary: boolean }[] = [];

    clientWs.on('message', (data, isBinary) => {
      // Log signaling message direction (client → upstream)
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());
          console.log(`  ${tag} C→S: ${msg.type || msg.event || 'unknown'}`);
        } catch { /* binary or non-JSON */ }
      }
      if (upstream.readyState === WS.OPEN) {
        upstream.send(data, { binary: isBinary });
      } else {
        pendingMessages.push({ data, isBinary });
      }
    });

    // Relay upstream → client (register immediately, not inside 'open')
    upstream.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());
          console.log(`  ${tag} S→C: ${msg.type || msg.event || 'unknown'}`);
        } catch { /* binary or non-JSON */ }
      }
      if (clientWs.readyState === WS.OPEN) clientWs.send(data, { binary: isBinary });
    });

    upstream.on('open', () => {
      console.log(`  ${tag} upstream connected (${pendingMessages.length} buffered)`);
      for (const msg of pendingMessages) {
        upstream.send(msg.data, { binary: msg.isBinary });
      }
      pendingMessages.length = 0;
    });

    clientWs.on('close', () => { console.log(`  ${tag} client closed`); upstream.close(); });
    upstream.on('close', () => { console.log(`  ${tag} upstream closed`); if (clientWs.readyState <= WS.OPEN) clientWs.close(); });
    clientWs.on('error', () => { upstream.close(); });
    upstream.on('error', (err) => {
      console.warn(`  ${tag} upstream error:`, (err as Error).message);
      if (clientWs.readyState <= WS.OPEN) clientWs.close();
    });
  });
});

// ─── Socket.io ──────────────────────────────────────────────────────────────

setupSocketHandlers(io, sessionManager);

// ─── Start Server ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);

httpServer.listen(PORT, () => {
  console.log(`\n  ARENA Server running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Socket.io: ws://localhost:${PORT}`);
  console.log(`  Mock mode: ${process.env.USE_MOCK === 'true' ? 'ON' : 'OFF'}`);
  logLiveKitStatus();
  console.log(`  API: POST /api/sessions, POST /api/sessions/start, POST /api/sessions/end\n`);

  setTimeout(async () => {
    try {
      const serverUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`;
      await Promise.all([
        ensureCustomCompanions(serverUrl),
        initNapsterResources(serverUrl),
      ]);

      // Clean up stale agents from previous sessions to free WebRTC pool
      await sessionManager.cleanupStaleAgents();

      const topic = getNextTopic();
      await sessionManager.createSession(topic, 3);
      await sessionManager.startDebate();
      console.log('  Auto-started debate:', topic);
    } catch (err) {
      console.error('  Auto-start failed:', (err as Error).message);
      console.log('  Falling back to restartWithRetry()...');
      sessionManager.restartWithRetry();
    }

    // Start watchdog after first session attempt
    watchdog.start();
  }, 2000);
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down gracefully...`);
  watchdog.stop();
  sessionManager.cancelRestart();
  await sessionManager.endDebate('shutdown').catch(() => {});
  omniagent.disconnectAll();
  io.close();
  db.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, io, httpServer, sessionManager, creditService, watchdog };
