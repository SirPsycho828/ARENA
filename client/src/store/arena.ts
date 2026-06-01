import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
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
  spectatorCount: number;

  // Audience
  injectionCooldown: number;
  injectionQueue: string[];

  // Reactions
  incomingReactions: IncomingReaction[];

  // Voice Challenger
  challengerActive: boolean;
  challengerAgentId: string | null;

  // Sound
  soundMuted: boolean;
  toggleSound: () => void;

  // Victory
  victoryData: VictoryData | null;

  // Video
  videoTokens: Record<string, string>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  vote: (agentId: string) => void;
  injectChaos: (text: string, type?: 'rule' | 'topic_change') => void;
  changeTopic: (topic: string) => void;
  sendReaction: (emoji: string) => void;
  startChallenge: (agentId: string, stream: MediaStream) => void;
  endChallenge: () => void;
  sendChallengerText: (agentId: string, text: string) => void;
}

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
  spectatorCount: 1,
  injectionCooldown: 0,
  injectionQueue: [],
  incomingReactions: [],
  challengerActive: false,
  challengerAgentId: null,
  soundMuted: false,
  toggleSound: () => set((s) => ({ soundMuted: !s.soundMuted })),
  victoryData: null,
  videoTokens: {},

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

      // Fetch video tokens if session is active
      if (state.session?.status === 'active' || state.session?.status === 'starting') {
        fetch('/api/sessions/tokens')
          .then((r) => r.json())
          .then((data) => { if (data.tokens) set({ videoTokens: data.tokens }); })
          .catch(() => {});
      }
    });

    // Word-by-word streaming transcript — deltas arrive as agent speaks
    (socket as any).on('transcript_delta', (data: { agentId: string; agentName: string; content: string }) => {
      set((s) => {
        const current = s.streamingTranscript;
        if (current && current.agentId === data.agentId) {
          return { streamingTranscript: { ...current, text: current.text + data.content } };
        }
        return { streamingTranscript: { agentId: data.agentId, agentName: data.agentName, text: data.content } };
      });
    });

    // Transcript complete — finalize streaming text into transcript list
    (socket as any).on('transcript_done', (msg: TranscriptMessage) => {
      set((s) => ({
        transcripts: [...s.transcripts.slice(-99), msg],
        streamingTranscript: null,
      }));
    });

    // Play Napster native audio chunks (base64 PCM 16-bit 16kHz mono)
    socket.on('agent_audio', (data: { agentId: string; audio: string }) => {
      if (data.audio) {
        agentAudio.playChunk(data.audio);
      }
    });

    // Server says no more audio chunks for this turn — wait for playback to finish
    (socket as any).on('turn_audio_complete', () => {
      agentAudio.markComplete(() => {
        // All audio buffers have finished playing — tell server to advance
        socket.emit('playback_done' as any);
      });
    });

    socket.on('speaker_change', ({ agentId }) => {
      // Finalize any pending streaming transcript before switching
      const s = get();
      if (s.streamingTranscript) {
        set((prev) => ({
          transcripts: [...prev.transcripts.slice(-99), {
            agentId: prev.streamingTranscript!.agentId,
            agentName: prev.streamingTranscript!.agentName,
            text: prev.streamingTranscript!.text,
            timestamp: Date.now(),
          }],
          streamingTranscript: null,
        }));
      }
      set({ currentSpeaker: agentId });
      // Hard-stop any remaining audio from previous speaker
      agentAudio.stop();
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

    (socket as any).on('challenger_active', ({ agentId }: { agentId: string }) => {
      set({ challengerActive: true, challengerAgentId: agentId });
    });

    (socket as any).on('challenger_ended', () => {
      set({ challengerActive: false, challengerAgentId: null });
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

  injectChaos: (text, type = 'rule') => {
    get().socket?.emit('chaos_inject', { text, type });
  },

  changeTopic: (topic) => {
    get().socket?.emit('topic_change', { topic });
  },

  sendReaction: (emoji) => {
    get().socket?.emit('reaction', { emoji });
  },

  startChallenge: (agentId, _stream) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('challenge_start', { agentId });
    set({ challengerActive: true, challengerAgentId: agentId });
  },

  endChallenge: () => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('challenge_end', {});
    set({ challengerActive: false, challengerAgentId: null });
  },

  sendChallengerText: (agentId, text) => {
    (get().socket as any)?.emit('challenge_audio', { agentId, text });
  },
}));
