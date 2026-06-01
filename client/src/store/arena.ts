import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

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
  voteTallies: {},
  activeRules: [],
  spectatorCount: 1,
  injectionCooldown: 0,
  injectionQueue: [],
  incomingReactions: [],
  challengerActive: false,
  challengerAgentId: null,

  connect: () => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      set({ connected: true });
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('session_state', (state) => {
      set({
        session: state.session,
        agents: state.agents,
        currentSpeaker: state.currentSpeaker,
        voteTallies: state.voteTallies,
        activeRules: state.activeRules,
        transcripts: state.recentTranscripts || [],
      });
    });

    socket.on('transcript', (msg) => {
      set((s) => ({
        transcripts: [...s.transcripts.slice(-99), msg],
      }));
    });

    socket.on('speaker_change', ({ agentId }) => {
      set({ currentSpeaker: agentId });
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

    socket.on('session_ended', () => {
      set((s) => ({
        session: s.session ? { ...s.session, status: 'ended' } : null,
        currentSpeaker: null,
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
