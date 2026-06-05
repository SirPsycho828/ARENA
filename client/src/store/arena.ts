import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { connectLiveKit, disconnectLiveKit, type TrackMap } from '../lib/livekit-room';
import { PcmAudioPlayer } from '../lib/pcm-audio';

// Module-level audio player so toggleSound can reach it
let pcmPlayer: PcmAudioPlayer | null = null;

interface AgentInfo {
  id: string;
  name: string;
  personality: string;
  color: string;
  status: string;
}

interface TranscriptMessage {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: number;
}

interface DebateSession {
  id: string;
  topic: string;
  status: 'starting' | 'active' | 'paused' | 'ended';
  agentIds: string[];
  startedAt: number;
  endedAt: number | null;
}

interface VoteTallies {
  [agentId: string]: number;
}

interface IncomingReaction {
  emoji: string;
  id: string;
  x?: number;
}

interface VictoryData {
  winner: { id: string; name: string; color: string; votes: number } | null;
  voteTallies: VoteTallies;
  totalMessages: number;
  duration: number;
  agents: AgentInfo[];
}

interface StreamingTranscript {
  agentId: string;
  agentName: string;
  text: string;
}

interface ChaosRuleStatus {
  id: string;
  text: string;
  turnsRemaining: number;
  maxTurns: number;
  source: 'rule' | 'quick_chaos' | 'voice_challenge';
  viewerName: string | null;
  targetAgentId: string | null;
}

interface ToolEffect {
  agentId: string;
  agentName: string;
  tool: string;
  args: Record<string, any>;
}

interface ArenaState {
  // Connection
  connected: boolean;
  socket: Socket | null;

  // Session
  session: DebateSession | null;
  agents: AgentInfo[];
  currentSpeaker: string | null;

  // Live data
  transcripts: TranscriptMessage[];
  streamingTranscript: StreamingTranscript | null;
  voteTallies: VoteTallies;
  activeRules: string[];
  chaosStatus: ChaosRuleStatus[];
  spectatorCount: number;

  // Audience
  hasVoted: boolean;
  injectionCooldown: number;
  injectionQueue: string[];

  // Reactions
  incomingReactions: IncomingReaction[];

  // Voice Challenger
  challengerActive: boolean;
  challengerAgentId: string | null;
  challengerViewerName: string | null;

  // Sound
  soundMuted: boolean;
  toggleSound: () => void;
  setVolume: (v: number) => void;

  // Lip-sync: set when first audio chunk from a speaker starts playing
  lipSyncSpeaker: string | null;

  // Victory
  victoryData: VictoryData | null;

  // LiveKit
  livekitTracks: TrackMap;

  // Per-viewer Napster WebRTC tokens (agentId → token)
  avatarTokens: Record<string, string>;

  // Tool Effects
  activeToolEffect: ToolEffect | null;

  // Topic Reveal
  pendingTopic: string | null;
  dismissTopic: () => void;

  // Consensus Meter
  consensus: { leftPole: string; rightPole: string; needlePosition: number; agentStances: Record<string, number>; viewerVotes: { left: number; right: number } } | null;
  hasVotedPole: boolean;

  // Credits
  credits: number | null;
  creditsLoading: boolean;
  lastRejectionReason: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  vote: (agentId: string) => void;
  votePole: (side: 'left' | 'right') => void;
  injectChaos: (text: string, type?: 'rule' | 'topic_change', duration?: number, token?: string) => void;
  changeTopic: (topic: string, token?: string) => void;
  quickChaos: (preset: string, token?: string) => void;
  sendReaction: (emoji: string) => void;
  startChallenge: (agentId: string, stream: MediaStream, viewerName?: string, token?: string) => void;
  endChallenge: () => void;
  sendChallengerText: (agentId: string, text: string) => void;
  listenCredits: (uid: string) => void;
  stopListeningCredits: () => void;
}

// ─── Transcript Pacer ──────────────────────────────────────────────────────
// Buffers incoming deltas and releases words at speech rate (~170 WPM)
// so text appears like TV subtitles, roughly matching the spoken audio.

class TranscriptPacer {
  private buffer = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingDone: TranscriptMessage | null = null;
  private setFn: ((fn: (s: any) => any) => void) | null = null;

  push(content: string, agentId: string, agentName: string, set: (fn: (s: any) => any) => void) {
    this.setFn = set;
    this.buffer += content;
    set((s: any) => {
      if (!s.streamingTranscript || s.streamingTranscript.agentId !== agentId) {
        return { streamingTranscript: { agentId, agentName, text: '' } };
      }
      return {};
    });
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 520); // ~1.9 words/sec ≈ 115 WPM — trails audio noticeably
    }
  }

  markDone(msg: TranscriptMessage) {
    this.pendingDone = msg;
    if (this.buffer.length === 0) this.finalize();
  }

  flush(set: (fn: (s: any) => any) => void) {
    this.setFn = set;
    this.stopTimer();
    if (this.pendingDone) {
      const msg = this.pendingDone;
      this.pendingDone = null;
      this.buffer = '';
      set((s: any) => ({
        transcripts: [...s.transcripts.slice(-99), msg],
        streamingTranscript: null,
      }));
    } else {
      const remaining = this.buffer;
      this.buffer = '';
      set((s: any) => {
        const cur = s.streamingTranscript;
        if (!cur) return {};
        return {
          transcripts: [...s.transcripts.slice(-99), {
            agentId: cur.agentId, agentName: cur.agentName,
            text: cur.text + remaining, timestamp: Date.now(),
          }],
          streamingTranscript: null,
        };
      });
    }
  }

  private tick() {
    if (!this.setFn) return;
    if (this.buffer.length === 0) {
      if (this.pendingDone) this.finalize();
      else this.stopTimer();
      return;
    }
    const spaceIdx = this.buffer.indexOf(' ');
    let chunk: string;
    if (spaceIdx !== -1) {
      chunk = this.buffer.slice(0, spaceIdx + 1);
      this.buffer = this.buffer.slice(spaceIdx + 1);
    } else if (this.pendingDone) {
      chunk = this.buffer;
      this.buffer = '';
    } else {
      return;
    }
    this.setFn((s: any) => {
      const cur = s.streamingTranscript;
      return cur ? { streamingTranscript: { ...cur, text: cur.text + chunk } } : {};
    });
    if (this.buffer.length === 0 && this.pendingDone) this.finalize();
  }

  private finalize() {
    this.stopTimer();
    if (this.pendingDone && this.setFn) {
      const msg = this.pendingDone;
      this.pendingDone = null;
      this.setFn((s: any) => ({
        transcripts: [...s.transcripts.slice(-99), msg],
        streamingTranscript: null,
      }));
    }
  }

  private stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

const transcriptPacer = new TranscriptPacer();
let creditsUnsub: Unsubscribe | null = null;

export const useArenaStore = create<ArenaState>((set, get) => ({
  connected: false,
  socket: null,
  session: null,
  agents: [],
  currentSpeaker: null,
  transcripts: [],
  streamingTranscript: null,
  voteTallies: {},
  activeRules: [],
  chaosStatus: [],
  spectatorCount: 1,
  hasVoted: false,
  injectionCooldown: 0,
  injectionQueue: [],
  incomingReactions: [],
  challengerActive: false,
  challengerAgentId: null,
  challengerViewerName: null,
  soundMuted: false,
  lipSyncSpeaker: null,
  toggleSound: () => set((s) => {
    const newMuted = !s.soundMuted;
    pcmPlayer?.setMuted(newMuted);
    return { soundMuted: newMuted };
  }),
  setVolume: (v: number) => {
    pcmPlayer?.setVolume(v);
  },
  victoryData: null,
  livekitTracks: {},
  avatarTokens: {},
  activeToolEffect: null,
  pendingTopic: null,
  dismissTopic: () => set({ pendingTopic: null }),
  consensus: null,
  hasVotedPole: false,
  credits: null,
  creditsLoading: false,
  lastRejectionReason: null,

  connect: () => {
    const socket = io(window.location.origin, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      set({ connected: true });
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('reconnect', () => {
      set({ connected: true });
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`Reconnecting... attempt ${attempt}`);
    });

    socket.on('reconnect_failed', () => {
      console.log('Reconnection failed');
    });

    socket.on('session_state', (state) => {
      set({
        session: state.session,
        agents: state.agents,
        currentSpeaker: state.currentSpeaker,
        voteTallies: state.voteTallies,
        activeRules: state.activeRules,
        transcripts: state.recentTranscripts || [],
        consensus: (state as any).consensus || null,
        victoryData: null, // Clear victory screen when new session arrives
      });

    });

    // Word-by-word streaming transcript — buffer deltas and release at speech rate
    (socket as any).on('transcript_delta', (data: { agentId: string; agentName: string; content: string }) => {
      transcriptPacer.push(data.content, data.agentId, data.agentName, set);
    });

    // Transcript complete — pacer will finalize once its buffer drains
    (socket as any).on('transcript_done', (msg: TranscriptMessage) => {
      transcriptPacer.markDone(msg);
    });

    // Connect to LiveKit room for audio
    (socket as any).on('livekit_token', ({ token, url }: { token: string; url: string }) => {
      console.log(`[LiveKit] Received token, connecting to ${url}...`);
      connectLiveKit(url, token, (tracks) => {
        const count = Object.values(tracks).reduce((n, t) => n + (t.video ? 1 : 0) + (t.audio ? 1 : 0), 0);
        console.log(`[LiveKit] Tracks updated: ${count} total`, Object.keys(tracks));
        set({ livekitTracks: tracks });
      }).catch((err) => console.error('[LiveKit] Connect failed:', err));
    });

    // Per-viewer Napster avatar tokens — client renders avatars directly in iframes
    (socket as any).on('avatar_tokens', ({ tokens }: { tokens: Record<string, string> }) => {
      console.log(`[Avatars] Received ${Object.keys(tokens).length} WebRTC tokens`);
      set({ avatarTokens: tokens });
    });

    // PCM audio chunks from server (Napster WebSocket audio)
    pcmPlayer = new PcmAudioPlayer();
    pcmPlayer.setMuted(get().soundMuted);
    let lastAudioSpeaker: string | null = null;
    (socket as any).on('audio_chunk', ({ agentId, audio }: { agentId: string; audio: string }) => {
      if (agentId !== lastAudioSpeaker) {
        pcmPlayer?.reset();
        lastAudioSpeaker = agentId;
        // Trigger lip-sync immediately — avatar API startup latency (~300ms)
        // roughly offsets the jitter buffer (200ms), so lips and audio align
        set({ lipSyncSpeaker: agentId });
      }
      pcmPlayer?.playChunk(audio);
    });

    socket.on('speaker_change', ({ agentId }) => {
      transcriptPacer.flush(set);
      // Clear lip-sync immediately, set new speaker for UI (badge, ring)
      set({ currentSpeaker: agentId, lipSyncSpeaker: null });
    });

    // Server signals all audio chunks sent (after 1.5s trailing-audio grace period).
    // Wait for client playback buffer to drain, then tell server we're done.
    (socket as any).on('turn_audio_complete', ({ agentId, generation }: { agentId: string; generation: number }) => {
      const remaining = pcmPlayer?.getRemainingTime() || 0;
      // Server already waited 1.5s for trailing chunks, so all audio is buffered.
      // Just wait for the buffer to finish + 500ms margin.
      const delayMs = Math.max(500, remaining * 1000 + 500);
      console.log(`[Audio] turn_audio_complete gen=${generation}, buffer=${remaining.toFixed(1)}s, waiting ${delayMs}ms`);
      setTimeout(() => {
        // Stop lip-sync when audio finishes — don't wait for turn advance
        if (get().lipSyncSpeaker === agentId) {
          set({ lipSyncSpeaker: null });
        }
        (socket as any).emit('playback_done', { agentId, generation });
      }, delayMs);
    });

    socket.on('vote_update', (tallies) => {
      set({ voteTallies: tallies });
    });

    socket.on('injection_active', ({ text }) => {
      set((s) => ({
        activeRules: [...s.activeRules.slice(-2), text],
      }));
    });

    socket.on('injection_queued', ({ text, position }) => {
      set((s) => ({
        injectionQueue: [...s.injectionQueue, `#${position}: ${text}`],
      }));
    });

    socket.on('injection_rejected', ({ reason, remainingMs }) => {
      if (reason === 'cooldown') {
        set({ injectionCooldown: remainingMs });
      } else if (reason === 'auth_required' || reason === 'insufficient_credits') {
        set({ lastRejectionReason: reason });
        setTimeout(() => set({ lastRejectionReason: null }), 4000);
      }
    });

    socket.on('session_ended', (data: any) => {
      const s = get();
      const reason = data?.reason || 'manual';
      const isAutoRestart = reason === 'watchdog_restart' || reason === 'topic_rotation';

      // Skip victory screen for auto-restarts — new session arrives momentarily
      if (isAutoRestart) {
        set({
          session: s.session ? { ...s.session, status: 'ended' } : null,
          currentSpeaker: null,
          streamingTranscript: null,
        });
        return;
      }

      const results = data?.results;
      let victoryData: VictoryData | null = null;

      if (results && s.agents.length > 0) {
        victoryData = {
          winner: results.winner || null,
          voteTallies: results.voteTallies || s.voteTallies,
          totalMessages: results.totalMessages || s.transcripts.length,
          duration: results.duration || (Date.now() - (s.session?.startedAt || Date.now())),
          agents: s.agents,
        };
      }

      set({
        session: s.session ? { ...s.session, status: 'ended' } : null,
        currentSpeaker: null,
        victoryData,
      });
    });

    (socket as any).on('topic_changed', ({ topic }: { topic: string }) => {
      set((s) => ({
        session: s.session ? { ...s.session, topic } : null,
        hasVoted: false,
        hasVotedPole: false,
        pendingTopic: topic,
      }));
    });

    (socket as any).on('consensus_update', (state: any) => {
      set({ consensus: state });
    });

    // New event listeners
    (socket as any).on('spectator_count', ({ count }: { count: number }) => {
      set({ spectatorCount: count });
    });

    (socket as any).on('reaction', (reaction: IncomingReaction) => {
      set((s) => ({
        incomingReactions: [...s.incomingReactions.slice(-19), reaction],
      }));
      // Auto-remove after animation
      setTimeout(() => {
        set((s) => ({
          incomingReactions: s.incomingReactions.filter((r) => r.id !== reaction.id),
        }));
      }, 2000);
    });

    (socket as any).on('challenger_active', ({ agentId, viewerName }: { agentId: string; viewerName?: string }) => {
      set({ challengerActive: true, challengerAgentId: agentId, challengerViewerName: viewerName || null });
    });

    (socket as any).on('challenger_ended', () => {
      set({ challengerActive: false, challengerAgentId: null, challengerViewerName: null });
    });

    (socket as any).on('chaos_status', (data: { active: ChaosRuleStatus[]; justActivated: string[]; justExpired: string[] }) => {
      set({ chaosStatus: data.active });
    });

    (socket as any).on('tool_effect', (data: ToolEffect) => {
      set({ activeToolEffect: data });
      const duration = data.tool === 'mic_drop' ? 4000 : data.tool === 'crowd_appeal' ? 3500 : 2500;
      setTimeout(() => set({ activeToolEffect: null }), duration);
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    socket?.disconnect();
    disconnectLiveKit();
    pcmPlayer?.destroy();
    pcmPlayer = null;
    set({ socket: null, connected: false, livekitTracks: {} });
  },

  vote: (agentId) => {
    if (get().hasVoted) return;
    get().socket?.emit('vote', { agentId });
    set({ hasVoted: true });
  },

  votePole: (side) => {
    if (get().hasVotedPole) return;
    (get().socket as any)?.emit('pole_vote', { side });
    set({ hasVotedPole: true });
  },

  injectChaos: (text, type = 'rule', duration = 3, token) => {
    get().socket?.emit('chaos_inject', { text, type, duration, token } as any);
  },

  quickChaos: (preset, token) => {
    (get().socket as any)?.emit('quick_chaos', { preset, token });
  },

  changeTopic: (topic, token) => {
    get().socket?.emit('topic_change', { topic, token } as any);
  },

  sendReaction: (emoji) => {
    get().socket?.emit('reaction', { emoji });
  },

  startChallenge: (agentId, _stream, viewerName, token) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('challenge_start', { agentId, viewerName, token } as any);
    set({ challengerActive: true, challengerAgentId: agentId, challengerViewerName: viewerName || null });
  },

  endChallenge: () => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('challenge_end', {});
    set({ challengerActive: false, challengerAgentId: null, challengerViewerName: null });
  },

  sendChallengerText: (agentId, text) => {
    (get().socket as any)?.emit('challenge_audio', { agentId, text });
  },

  listenCredits: (uid) => {
    if (creditsUnsub) creditsUnsub();
    set({ creditsLoading: true });
    creditsUnsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const data = snap.data();
      set({ credits: data?.credits ?? 0, creditsLoading: false });
    }, () => {
      set({ credits: null, creditsLoading: false });
    });
  },

  stopListeningCredits: () => {
    if (creditsUnsub) { creditsUnsub(); creditsUnsub = null; }
    set({ credits: null, creditsLoading: false });
  },
}));
