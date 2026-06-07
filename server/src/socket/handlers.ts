import type { Server } from 'socket.io';
import type { ServerEvents, ClientEvents } from '../../../shared/types.js';
import type { SessionManager } from '../sessions/manager.js';
import { adminAuth } from '../lib/firebase-admin.js';
import { CreditService, CREDIT_COSTS } from '../lib/credits.js';
import { moderate } from '../lib/moderation.js';

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

    // Send per-viewer WebRTC tokens so the client renders Napster avatars directly.
    // Each viewer gets their own WebRTC connection tokens (tokens are single-use).
    const session = sessionManager.getActiveSession();
    if (session?.status === 'active') {
      sessionManager.createVideoTokensForViewer(socket.id).then((tokens) => {
        if (Object.keys(tokens).length > 0) {
          console.log(`  Sent avatar_tokens to ${socket.id}: ${Object.keys(tokens).length} agents`);
          (socket as any).emit('avatar_tokens', { tokens });
        }
      }).catch((err) => {
        console.warn(`  Avatar token creation failed for ${socket.id}:`, (err as Error).message);
      });
    }

    // ─── Auth: create user doc + starter credits on first sign-in ────────

    (socket as any).on('authenticate', async (data: { token: string }) => {
      try {
        const user = await verifyToken(data.token);
        if (!user) {
          console.warn('  [Auth] authenticate: token verification failed');
          return;
        }
        console.log(`  [Auth] authenticate: ${user.name || user.uid} — creating user doc`);
        await creditService.ensureUser(user.uid, user.name);
        console.log(`  [Auth] authenticate: user doc ready for ${user.uid}`);
        socket.emit('auth_ok' as any, { uid: user.uid });
      } catch (err) {
        console.error('  [Auth] authenticate failed:', (err as Error).message);
      }
    });

    // ─── Audience Events ──────────────────────────────────────────────────

    socket.on('chaos_inject', async (data) => {
      try {
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

        // Moderate user text
        const modResult = await moderate(data.text);
        if (!modResult.ok) {
          await creditService.addCredits(user.uid, cost, `refund_moderation_${Date.now()}`);
          return socket.emit('injection_rejected', { reason: modResult.reason, remainingMs: 0 });
        }

        const result = sessionManager.handleChaosInject(socket.id, user.name, data.text, type, duration);
        if (!result.ok) {
          await creditService.addCredits(user.uid, cost, `refund_${Date.now()}`);
          socket.emit('injection_rejected', { reason: result.reason || 'unknown', remainingMs: (result as any).remainingMs || 0 });
        }
      } catch (err) {
        console.error('  [chaos_inject] Firestore error:', (err as Error).message);
        socket.emit('injection_rejected', { reason: 'server_error', remainingMs: 0 });
      }
    });

    socket.on('quick_chaos' as any, async (data: { preset: string; token?: string }) => {
      try {
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
      } catch (err) {
        console.error('  [quick_chaos] Firestore error:', (err as Error).message);
        socket.emit('injection_rejected', { reason: 'server_error', remainingMs: 0 });
      }
    });

    socket.on('vote', (data) => {
      sessionManager.handleVote(socket.id, data.agentId);
    });

    (socket as any).on('pole_vote', (data: { side: 'left' | 'right' }) => {
      sessionManager.handlePoleVote(socket.id, data.side);
    });

    socket.on('topic_change', async (data) => {
      try {
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

        // Moderate user topic
        const modResult = await moderate(data.topic);
        if (!modResult.ok) {
          await creditService.addCredits(user.uid, CREDIT_COSTS.topic_change, `refund_moderation_${Date.now()}`);
          return socket.emit('injection_rejected', { reason: modResult.reason, remainingMs: 0 });
        }

        const result = sessionManager.handleChaosInject(socket.id, user.name, data.topic, 'topic_change');
        if (!result.ok) {
          await creditService.addCredits(user.uid, CREDIT_COSTS.topic_change, `refund_${Date.now()}`);
          socket.emit('injection_rejected', { reason: result.reason || 'unknown', remainingMs: (result as any).remainingMs || 0 });
        }
      } catch (err) {
        console.error('  [topic_change] Firestore error:', (err as Error).message);
        socket.emit('injection_rejected', { reason: 'server_error', remainingMs: 0 });
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

    // ─── Call-In ───────────────────────────────────���────────────────────────

    (socket as any).on('callin_submit', async (data: {
      audioBlob: ArrayBuffer;
      displayName: string;
      topic: string;
      durationMs: number;
      token: string;
    }) => {
      try {
        const user = await verifyToken(data.token);
        if (!user) {
          return (socket as any).emit('callin_rejected', { reason: 'auth_required' });
        }

        await creditService.ensureUser(user.uid, user.name);

        // Check queue capacity BEFORE charging
        const queue = sessionManager.getCallInQueue();
        if (!queue || queue.getQueueLength() >= 3) {
          return (socket as any).emit('callin_rejected', { reason: 'queue_full' });
        }

        // Reject audio over 60 seconds
        if (data.durationMs > 60000) {
          return (socket as any).emit('callin_rejected', { reason: 'too_long' });
        }

        // Moderate the typed topic field before charging
        const topicMod = await moderate(data.topic);
        if (!topicMod.ok) {
          return (socket as any).emit('callin_rejected', { reason: topicMod.reason });
        }

        // Charge credits
        const charged = await creditService.deductCredits(user.uid, CREDIT_COSTS.call_in, 'call_in', data.topic);
        if (!charged) {
          return (socket as any).emit('callin_rejected', { reason: 'insufficient_credits' });
        }

        // Submit to queue
        const audioBuffer = Buffer.from(data.audioBlob);
        const result = await sessionManager.handleCallInSubmit(
          socket.id,
          audioBuffer,
          data.displayName,
          data.topic,
          data.durationMs,
          async (entry) => {
            // Post-transcription moderation
            if (!entry.transcript) return;
            const modResult = await moderate(entry.transcript);
            if (!modResult.ok) {
              const queue = sessionManager.getCallInQueue();
              if (queue && entry.status !== 'active') {
                queue.eject(entry.callId);
                await creditService.addCredits(user.uid, CREDIT_COSTS.call_in, `refund_moderation_${Date.now()}`);
                (socket as any).emit('callin_moderated', { callId: entry.callId, reason: modResult.reason });
                console.log(`  [CallIn] Ejected ${entry.callId} — moderation: ${modResult.reason}`);
              }
            }
          },
        );

        if (!result) {
          await creditService.addCredits(user.uid, CREDIT_COSTS.call_in, `refund_${Date.now()}`);
          return (socket as any).emit('callin_rejected', { reason: 'queue_full' });
        }

        (socket as any).emit('callin_queued', { callId: result.callId, position: result.position });
        console.log(`  [CallIn] ${data.displayName} queued (pos ${result.position})`);
      } catch (err) {
        console.error('  [callin_submit] Error:', (err as Error).message);
        (socket as any).emit('callin_rejected', { reason: 'server_error' });
      }
    });

    (socket as any).on('playback_done', (data: { agentId: string; generation: number }) => {
      sessionManager.handlePlaybackDone(data.agentId, data.generation);
    });

    socket.on('disconnect', (reason) => {
      console.log(`  Viewer disconnected: ${socket.id} (${reason})`);
      broadcastSpectatorCount();
    });
  });
}
