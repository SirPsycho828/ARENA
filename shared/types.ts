// ─── Agent Types ────────────────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  name: string;
  personality: string;
  systemPrompt: string;
  companionId: string;
  voiceId: string;
  color: string;
  externalClientId: string;
}

export interface AgentConnection {
  agentId: string;
  config: AgentConfig;
  connectionId: string | null;
  status: 'disconnected' | 'connecting' | 'ready' | 'speaking' | 'thinking' | 'error';
  wsUrl: string | null;
}

// ─── Session Types ──────────────────────────────────────────────────────────

export interface DebateSession {
  id: string;
  topic: string;
  status: 'starting' | 'active' | 'paused' | 'ended';
  agentIds: string[];
  startedAt: number;
  endedAt: number | null;
}

// ─── Turn Management ────────────────────────────────────────────────────────

export type TurnState =
  | 'IDLE'
  | 'WAITING_FOR_SPEECH_END'
  | 'RELAYING'
  | 'SELECTING_NEXT'
  | 'WAITING_FOR_RESPONSE'
  | 'SPEAKING';

export type TurnMode = 'round_robin' | 'free_for_all' | 'dynamic';

export interface TurnManagerConfig {
  mode: TurnMode;
  turnTimeout: number;
  speechEndDebounce: number;
  minTurnGap: number;
}

// ─── Transcript ─────────────────────────────────────────────────────────────

export interface TranscriptMessage {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: number;
  isCallIn?: boolean;
}

// ─── Audience Interaction ───────────────────────────────────────────────────

export interface ChaosInjection {
  id: string;
  text: string;
  type: 'rule' | 'topic_change';
  viewerId: string;
  queuePosition: number;
  processedAt: number | null;
}

export interface VoteTallies {
  [agentId: string]: number;
}

// ─── Consensus Meter ─────────────────────────────────────────────────────

export interface ConsensusState {
  leftPole: string;            // witty "for" label
  rightPole: string;           // witty "against" label
  needlePosition: number;      // -1.0 (full left) to 1.0 (full right)
  agentStances: Record<string, number>;  // agentId → stance (-1 to 1)
  viewerVotes: { left: number; right: number };
}

// ─── Socket Events (Server → Client) ───────────────────────────────────────

export interface ServerEvents {
  session_state: (state: SessionState) => void;
  transcript: (msg: TranscriptMessage) => void;
  speaker_change: (data: { agentId: string }) => void;
  injection_queued: (data: { text: string; position: number }) => void;
  injection_active: (data: { text: string; timestamp: number }) => void;
  injection_rejected: (data: { reason: string; remainingMs: number }) => void;
  vote_update: (tallies: VoteTallies) => void;
  spectator_count: (data: { count: number }) => void;
  agent_disconnected: (data: { agentId: string; reason: string }) => void;
  agent_video_frame: (data: { agentId: string; frame: string }) => void;
  agent_video_tokens: (data: { tokens: Record<string, string> }) => void;
  session_ended: (data: { reason: string; results?: { winner: { id: string; name: string; color: string; votes: number } | null; voteTallies: Record<string, number>; totalMessages: number; duration: number } }) => void;
  consensus_update: (state: ConsensusState) => void;
  callin_queued: (data: { position: number; callId: string }) => void;
  callin_queue_update: (data: { position: number }) => void;
  callin_starting: (data: { callId: string; displayName: string; topic: string; introducerAgentId: string }) => void;
  callin_audio: (data: { callId: string; audioBlob: ArrayBuffer }) => void;
  callin_discussion: (data: { callId: string; turnsRemaining: number }) => void;
  callin_ended: (data: { callId: string }) => void;
  callin_rejected: (data: { reason: string }) => void;
}

// ─── Socket Events (Client → Server) ───────────────────────────────────────

export interface ClientEvents {
  chaos_inject: (data: { text: string; type?: 'rule' | 'topic_change' }) => void;
  vote: (data: { agentId: string }) => void;
  topic_change: (data: { topic: string }) => void;
  reaction: (data: { emoji: string }) => void;
  callin_submit: (data: { audioBlob: ArrayBuffer; displayName: string; topic: string; durationMs: number; token: string }) => void;
  pole_vote: (data: { side: 'left' | 'right' }) => void;
}


// ─── Session State (sent on viewer connect) ─────────────────────────────────

export interface SessionState {
  session: DebateSession | null;
  agents: Array<{
    id: string;
    name: string;
    personality: string;
    color: string;
    status: AgentConnection['status'];
  }>;
  currentSpeaker: string | null;
  voteTallies: VoteTallies;
  activeRules: string[];
  recentTranscripts: TranscriptMessage[];
  consensus: ConsensusState | null;
}

// ─── Omniagent API Events ───────────────────────────────────────────────────

export interface OmniagentEvent {
  type: 'message_received' | 'avatar_state_changed' | 'talk_state_changed' | 'audio_received';
  data: Record<string, unknown>;
}

export interface MessageReceivedEvent {
  message: {
    action: 'created' | 'completed' | 'delta';
    type?: 'session' | 'message';
    role?: 'user' | 'assistant';
    response_id?: string;
    item_id?: string;
    content?: string;
    content_index?: number;
    is_forced?: boolean;
    timestamp?: string;
  };
}
