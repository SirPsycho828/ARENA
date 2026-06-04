import type { Server } from 'socket.io';
import type { ServerEvents, ClientEvents } from '../../../shared/types.js';
import type { SessionManager } from '../sessions/manager.js';
import { adminAuth } from '../lib/firebase-admin.js';
import { CreditService, CREDIT_COSTS } from '../lib/credits.js';

export function setupSocketHandlers(io: Server<ClientEvents, ServerEvents>, sessionManager: SessionManager) {
  const creditService = new CreditService();

  async function verifyToken(token?: string): Promise<{ uid: string; name: string | null } | null> {
    if (!token) return null;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      return { uid: decoded.uid, name: decoded.name || null };
    } catch {
      return null;
    }
  }

  // Broadcast spectator count on connect/disconnect
  const broadcastSpectatorCount = () => {
    io.emit('spectator_count' as any, { count: io.engine.clientsCount });
  };

  io.on('connection', (socket) => {
    console.log(`  Viewer connected: ${socket.id} (total: ${io.engine.clientsCount})`);

    // Send current state on connect
    socket.emit('session_state', sessionManager.getSessionState());
    broadcastSpectatorCount();

    // Send LiveKit viewer token only if AvatarHost is already ready.
    // Viewers who connect before AvatarHost is ready will get tokens
    // from the broadcast in manager.ts when AvatarHost becomes ready.
    const session = sessionManager.getActiveSession();
    if (session?.status === 'active' && sessionManager.isAvatarHostReady()) {
      sessionManager.createLiveKitViewerToken(socket.id).then((lk) => {
        if (lk) {
          console.log(`  Sent livekit_token to ${socket.id}`);
          (socket as any).emit('livekit_token', lk);
        }
      }).catch((err) => {
        console.warn(`  LiveKit token failed for ${socket.id}:`, (err as Error).message);
      });
    }

    // ─── Audience Events ──────────────────────────────────────────────────

    socket.on('chaos_inject', async (data) => {
      const token = (data as any).token;
      const user = await verifyToken(token);
      if (!user) {
        return socket.emit('injection_rejected', { reason: 'auth_required', remainingMs: 0 });
      }

      await creditService.ensureUser(user.uid, user.name);
      const type = data.type || 'rule';
      const duration = (data as any).duration || 3;
      const cost = type === 'topic_change' ? CREDIT_COSTS.topic_change : duration * CREDIT_COSTS.rule_per_turn;

      const charged = await creditService.deductCredits(user.uid, cost, type, data.text);
      if (!charged) {
        return socket.emit('injection_rejected', { reason: 'insufficient_credits', remainingMs: 0 });
      }

      const result = sessionManager.handleChaosInject(socket.id, user.name, data.text, type, duration);
      if (!result.ok) {
        // Refund on failure
        await creditService.addCredits(user.uid, cost, `refund_${Date.now()}`);
        socket.emit('injection_rejected', { reason: result.reason || 'unknown', remainingMs: (result as any).remainingMs || 0 });
      }
    });

    socket.on('quick_chaos' as any, async (data: { preset: string; token?: string }) => {
      const user = await verifyToken(data.token);
      if (!user) {
        return socket.emit('injection_rejected', { reason: 'auth_required', remainingMs: 0 });
      }

      await creditService.ensureUser(user.uid, user.name);
      const charged = await creditService.deductCredits(user.uid, CREDIT_COSTS.quick_chaos, 'quick_chaos', data.preset);
      if (!charged) {
        return socket.emit('injection_rejected', { reason: 'insufficient_credits', remainingMs: 0 });
      }

      const result = sessionManager.handleQuickChaos(socket.id, user.name, data.preset);
      if (!result.ok) {
        await creditService.addCredits(user.uid, CREDIT_COSTS.quick_chaos, `refund_${Date.now()}`);
        socket.emit('injection_rejected', { reason: result.reason || 'unknown', remainingMs: (result as any).remainingMs || 0 });
      }
    });

    socket.on('vote', (data) => {
      sessionManager.handleVote(socket.id, data.agentId);
    });

    (socket as any).on('pole_vote', (data: { side: 'left' | 'right' }) => {
      sessionManager.handlePoleVote(socket.id, data.side);
    });

    socket.on('topic_change', async (data) => {
      const token = (data as any).token;
      const user = await verifyToken(token);
      if (!user) {
        return socket.emit('injection_rejected', { reason: 'auth_required', remainingMs: 0 });
      }

      await creditService.ensureUser(user.uid, user.name);
      const charged = await creditService.deductCredits(user.uid, CREDIT_COSTS.topic_change, 'topic_change', data.topic);
      if (!charged) {
        return socket.emit('injection_rejected', { reason: 'insufficient_credits', remainingMs: 0 });
      }

      const result = sessionManager.handleChaosInject(socket.id, user.name, data.topic, 'topic_change');
      if (!result.ok) {
        await creditService.addCredits(user.uid, CREDIT_COSTS.topic_change, `refund_${Date.now()}`);
        socket.emit('injection_rejected', { reason: result.reason || 'unknown', remainingMs: (result as any).remainingMs || 0 });
      }
    });

    // ─── Reactions ──────────────────────────────────────────────────────────

    socket.on('reaction', (data) => {
      // Broadcast to all OTHER viewers with sender position info
      socket.broadcast.emit('reaction' as any, {
        emoji: data.emoji,
        id: `${socket.id}_${Date.now()}`,
        x: Math.random() * 80 + 10, // Random x% position for visual spread
      });
    });

    // ─── Voice Challenger ───────────────────────────────────────────────────

    socket.on('challenge_start', async (data) => {
      const token = (data as any).token;
      const user = await verifyToken(token);
      if (!user) {
        return socket.emit('injection_rejected', { reason: 'auth_required', remainingMs: 0 });
      }

      await creditService.ensureUser(user.uid, user.name);
      const charged = await creditService.deductCredits(user.uid, CREDIT_COSTS.voice_challenge, 'voice_challenge', data.agentId);
      if (!charged) {
        return socket.emit('injection_rejected', { reason: 'insufficient_credits', remainingMs: 0 });
      }

      const viewerName = user.name || (data as any).viewerName || 'Challenger';
      console.log(`  CHALLENGER APPROACHING! ${socket.id} (${viewerName}) → ${data.agentId}`);

      io.emit('challenger_active' as any, {
        viewerId: socket.id,
        agentId: data.agentId,
        viewerName,
        startedAt: Date.now(),
      });

      sessionManager.handleChallengerStart(socket.id, data.agentId, viewerName);
    });

    socket.on('challenge_audio', ((data: { agentId: string; text: string }) => {
      // Relay transcribed text from challenger to the target agent
      sessionManager.handleChallengerAudio(data.agentId, data.text);
    }) as any);

    socket.on('challenge_end', () => {
      console.log(`  Challenge ended by ${socket.id}`);
      io.emit('challenger_ended' as any, { viewerId: socket.id });
      sessionManager.handleChallengerEnd(socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log(`  Viewer disconnected: ${socket.id} (${reason})`);
      broadcastSpectatorCount();
    });
  });
}
