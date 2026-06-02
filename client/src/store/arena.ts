import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { agentAudio } from '../lib/agent-audio';

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

  // Victory
  victoryData: VictoryData | null;

  // Video
  videoFrames: Record<string, string>; // agentId -> latest base64 JPEG frame (server-pushed)
  videoTokens: Record<string, string>; // agentId -> WebRTC token (for client-side video)

  // Credits
  credits: number | null;
  creditsLoading: boolean;
  lastRejectionReason: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  vote: (agentId: string) => void;
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
  injectionCooldown: 0,
  injectionQueue: [],
  incomingReactions: [],
  challengerActive: false,
  challengerAgentId: null,
  challengerViewerName: null,
  soundMuted: false,
  toggleSound: () => set((s) => ({ soundMuted: !s.soundMuted })),
  victoryData: null,
  videoFrames: {},
  videoTokens: {},
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

    // Play Napster native audio chunks (base64 PCM 16-bit 16kHz mono)
    socket.on('agent_audio', (data: { agentId: string; audio: string }) => {
      if (data.audio) {
        agentAudio.playChunk(data.audio);
      }
    });

    // Receive video frames from server (JPEG base64, only current speaker)
    (socket as any).on('agent_video_frame', (data: { agentId: string; frame: string }) => {
      set((s) => ({
        videoFrames: { ...s.videoFrames, [data.agentId]: data.frame },
      }));
    });

    // Receive WebRTC video tokens for client-side video rendering
    (socket as any).on('agent_video_tokens', (data: { tokens: Record<string, string> }) => {
      set({ videoTokens: data.tokens });
    });

    // Server says no more audio chunks for this turn — play remaining buffered audio,
    // then signal server to advance. Generation counter prevents stale signals.
    (socket as any).on('turn_audio_complete', ({ gen }: { gen: number }) => {
      agentAudio.markComplete(() => {
        socket.emit('playback_done' as any, { gen });
      });
    });

    socket.on('speaker_change', ({ agentId }) => {
      transcriptPacer.flush(set);
      set({ currentSpeaker: agentId, videoFrames: {} });
      agentAudio.reset();
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
      }));
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

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    socket?.disconnect();
    set({ socket: null, connected: false });
  },

  vote: (agentId) => {
    get().socket?.emit('vote', { agentId });
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
