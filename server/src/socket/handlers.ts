import type { Server } from 'socket.io';
import type { ServerEvents, ClientEvents } from '../../../shared/types.js';
import type { SessionManager } from '../sessions/manager.js';

export function setupSocketHandlers(io: Server<ClientEvents, ServerEvents>, sessionManager: SessionManager) {
  // Broadcast spectator count on connect/disconnect
  const broadcastSpectatorCount = () => {
    io.emit('spectator_count' as any, { count: io.engine.clientsCount });
  };

  io.on('connection', (socket) => {
    console.log(`  Viewer connected: ${socket.id} (total: ${io.engine.clientsCount})`);

    // Send current state on connect
    socket.emit('session_state', sessionManager.getSessionState());
    broadcastSpectatorCount();

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

    // ─── Audience Events ──────────────────────────────────────────────────

    socket.on('chaos_inject', (data) => {
      const type = data.type || 'rule';
      const duration = (data as any).duration || 3;
      const result = sessionManager.handleChaosInject(socket.id, null, data.text, type, duration);
      if (!result.ok) {
        socket.emit('injection_rejected', {
          reason: result.reason || 'unknown',
          remainingMs: (result as any).remainingMs || 0,
        });
      }
    });

    socket.on('quick_chaos' as any, (data: { preset: string }) => {
      const result = sessionManager.handleQuickChaos(socket.id, null, data.preset);
      if (!result.ok) {
        socket.emit('injection_rejected', {
          reason: result.reason || 'unknown',
          remainingMs: (result as any).remainingMs || 0,
        });
      }
    });

    socket.on('vote', (data) => {
      sessionManager.handleVote(socket.id, data.agentId);
    });

    socket.on('topic_change', (data) => {
      const result = sessionManager.handleChaosInject(socket.id, null, data.topic, 'topic_change');
      if (!result.ok) {
        socket.emit('injection_rejected', {
          reason: result.reason || 'unknown',
          remainingMs: (result as any).remainingMs || 0,
        });
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

    socket.on('challenge_start', (data) => {
      const viewerName = (data as any).viewerName || null;
      console.log(`  CHALLENGER APPROACHING! ${socket.id} (${viewerName || 'anon'}) → ${data.agentId}`);

      // Notify all viewers about the live challenger
      io.emit('challenger_active' as any, {
        viewerId: socket.id,
        agentId: data.agentId,
        viewerName,
        startedAt: Date.now(),
      });

      // Send a system prompt to the target agent about the challenger
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

    // Client signals audio playback finished — generation counter prevents stale signals
    socket.on('playback_done' as any, (data: { gen?: number }) => {
      sessionManager.advanceFromPlayback(data?.gen);
    });

    socket.on('disconnect', (reason) => {
      console.log(`  Viewer disconnected: ${socket.id} (${reason})`);
      broadcastSpectatorCount();
    });
  });
}
