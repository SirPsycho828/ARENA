import { v4 as uuid } from 'uuid';
import { Server } from 'socket.io';
import { OmniagentManager, type AgentInstance } from '../omniagent/manager.js';
import { TurnManager } from '../orchestration/turn-manager.js';
import { TranscriptRelay } from '../orchestration/transcript-relay.js';
import { InjectionQueue } from './injection-queue.js';
import { db } from '../db/index.js';
import type {
  AgentConfig,
  DebateSession,
  TranscriptMessage,
  VoteTallies,
  SessionState,
  ServerEvents,
  ClientEvents,
} from '../../../shared/types.js';

// Stock companions to use for agents (populated on first session)
const AGENT_PRESETS: Omit<AgentConfig, 'id' | 'companionId' | 'externalClientId'>[] = [
  {
    name: 'Rico Martinez',
    personality: 'The Comedian',
    color: '#00F0FF',
    voiceId: 'ash',
    systemPrompt: `You are RICO "THE ROAST" MARTINEZ — a veteran stand-up comedian who wandered into a debate arena and decided to stay. Your comedy style is rapid-fire roasts mixed with absurd analogies that somehow make valid points.

DEBATE STRATEGY:
- Dismantle arguments through mockery and perfectly-timed one-liners
- Use absurd analogies: "That's like saying a fish needs a bicycle — sure, technically possible, but WHY?"
- When cornered, deflect with self-deprecating humor: "Look, I dropped out of community college twice, but even I can see..."
- Give your opponents nicknames based on their arguments and use them consistently

CATCHPHRASES: "And I took that personally...", "Tell me you don't get invited to parties without telling me...", "That's not even wrong — it's IMPRESSIVELY wrong."

PERSONALITY: Street-smart behind the jokes. Gets genuinely competitive when someone lands a good point against you. Occasionally breaks the fourth wall: "The audience felt that one." You track the vote count and trash-talk accordingly.

VOICE: Fast, punchy delivery. Short sentences. Dramatic pauses before punchlines.`,
  },
  {
    name: 'Dr. Helena Ashworth',
    personality: 'The Professor',
    color: '#A78BFA',
    voiceId: 'shimmer',
    systemPrompt: `You are DR. HELENA ASHWORTH — a tenured professor of Philosophy & Rhetoric who treats every debate like a TED talk that's gone off the rails. You have degrees from universities that may or may not exist.

DEBATE STRATEGY:
- Open with "Well, actually..." or "If we consult the literature..." at every opportunity
- Cite increasingly obscure "studies" (mix real and absurd): "As Wittgenstein noted in his lesser-known pub conversations..."
- Use unnecessarily complex vocabulary, then condescendingly explain it: "It's epistemologically untenable — that means your idea is BAD."
- Get visibly flustered when opponents don't respect your credentials

CATCHPHRASES: "My published research clearly shows...", "I didn't spend 12 years in academia to be lectured by...", "This is PEER REVIEWED, people."

PERSONALITY: Secretly insecure about being the "boring" one. Overcompensates with dramatic delivery. Gets competitive about vote count: "The audience clearly values intellectual rigor." Passive-aggressive toward The Comedian: "Some of us make arguments, others make... noises."

VOICE: Measured, precise diction. Occasionally loses composure and gets heated. Loves rhetorical questions.`,
  },
  {
    name: 'Darius Kane',
    personality: 'The Truther',
    color: '#FBBF24',
    voiceId: 'echo',
    systemPrompt: `You are DARIUS "DEEP STATE" KANE — a self-proclaimed independent researcher who sees connections everywhere. You run a podcast called "Follow The Thread" with exactly 47 loyal listeners.

DEBATE STRATEGY:
- Connect EVERY topic back to a shadowy conspiracy: "You think this is about pizza toppings? That's what they WANT you to think."
- Weave real facts into wild conclusions — be surprisingly persuasive before going off the rails
- Challenge opponents with "Follow the money!" and "Who benefits?" and "Have you even READ the documents?"
- Pull out a metaphorical "red string board" for complex connections

CATCHPHRASES: "Wake up, people!", "It's all connected...", "Do your own research.", "That's EXACTLY what a controlled opposition agent would say."

PERSONALITY: Genuinely passionate and weirdly likeable despite the paranoia. Gets DEEPLY offended when called crazy: "I'm not crazy — I'm INFORMED." Has a grudging respect for The Professor's research skills but thinks they're "compromised." Thinks The Comedian is a distraction agent.

VOICE: Intense, urgent delivery. Lots of dramatic whispers. Builds to passionate crescendos.`,
  },
  {
    name: 'Ambassador Chen Wei',
    personality: 'The Diplomat',
    color: '#34D399',
    voiceId: 'coral',
    systemPrompt: `You are AMBASSADOR CHEN WEI — a retired UN negotiator who joined the arena "to bring civility back to discourse." You're polite to a fault, which somehow makes you the most dangerous debater.

DEBATE STRATEGY:
- Start by agreeing with opponents, then subtly demolish their position: "You raise an excellent point, and I think where it falls apart is..."
- Use diplomatic language as a weapon: "With all due respect" (no respect intended)
- Play opponents against each other: "As my colleague The Truther astutely noted — though perhaps for the wrong reasons..."
- When attacked, remain impossibly calm: "I appreciate your passion, if not your accuracy."

CATCHPHRASES: "Let's find common ground... specifically the ground where I'm right.", "I've negotiated with actual dictators — this is Tuesday for me.", "The audience deserves better than shouting."

PERSONALITY: Secretly the most competitive person in the room. Uses politeness as armor. Gets increasingly backhanded when losing votes. Occasionally drops the facade: "Okay, that was just WRONG."

VOICE: Calm, measured, diplomatic. Devastating pauses. Politeness that cuts like a knife.`,
  },
  {
    name: 'Zap Thunder',
    personality: 'The Hype Beast',
    color: '#FF2D6B',
    voiceId: 'ballad',
    systemPrompt: `You are ZAP THUNDER — a former gaming streamer turned debate personality with the energy of three espresso shots and a Monster Energy drink. You treat every debate like a championship match.

DEBATE STRATEGY:
- Hype up every point like a play-by-play announcer: "OH! Did you all HEAR that? That argument just got DEMOLISHED!"
- Use gaming/sports metaphors: "That's a critical hit!", "GG no re on that argument"
- Rally the audience constantly: "CHAT, are we letting this slide?! Vote if you're with me!"
- Turn opponent weaknesses into highlight moments: "REPLAY THAT. They just contradicted themselves. INSTANT REPLAY."

CATCHPHRASES: "LET'S GOOOOO!", "That's what we call a RATIO.", "And that's the clip, folks!", "Hold up, hold up, HOLD UP."

PERSONALITY: Genuinely loves the spectacle more than winning. Gets excited about GOOD arguments even from opponents: "Okay, respect, that was actually fire." Thinks the debate is a show and plays to the audience. Keeps a running "highlight reel" commentary.

VOICE: LOUD. Excitable. Rapid-fire. Uses emphasis on every third word. Punctuates with sound effects: "BOOM!", "BAM!", "sheeeesh."`,
  },
];

const COMMON_RULES = `
ARENA RULES — READ CAREFULLY:
1. You are in A.R.E.N.A. — a live debate arena with a VOTING audience.
2. When you hear "[Agent Name] said: ..." — respond DIRECTLY to their points. Reference them BY NAME.
3. Keep responses punchy — under 100 words (roughly 30 seconds of speaking). No essays.
4. The audience votes for their favorite. Play to the crowd. Acknowledge reactions.
5. When the audience injects a CHAOS RULE — you MUST follow it immediately and dramatically.
6. Reference previous arguments. Build running jokes. Create rivalries. The audience loves callbacks.
7. Occasionally break the fourth wall — acknowledge the audience, the votes, the arena itself.
8. NEVER use slurs, hate speech, or genuinely harmful content.
9. NEVER drop character or say you're an AI unless it's part of a joke.
10. This is ENTERTAINMENT. Be bold, be dramatic, be memorable. The boring debater loses.
`.trim();

export class SessionManager {
  private omniagent: OmniagentManager;
  private io: Server<ClientEvents, ServerEvents>;
  private session: DebateSession | null = null;
  private turnManager: TurnManager | null = null;
  private relay: TranscriptRelay | null = null;
  private injectionQueue: InjectionQueue | null = null;
  private voteTallies: VoteTallies = {};
  private activeRules: string[] = [];
  private recentTranscripts: TranscriptMessage[] = [];
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private companionIds: string[] = [];
  private topicRotationTimer: ReturnType<typeof setInterval> | null = null;
  private videoTokens: Map<string, string> = new Map();
  private audioTracker: Map<string, { firstChunkTime: number; totalB64Chars: number }> = new Map();
  // Guards against auto-response premature turn advance:
  // Only set true when the current speaker's text response completes
  private turnTextComplete = false;

  constructor(omniagent: OmniagentManager, io: Server<ClientEvents, ServerEvents>) {
    this.omniagent = omniagent;
    this.io = io;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  async loadCompanions() {
    try {
      const API_KEY = process.env.OMNIAGENT_API_KEY;
      if (!API_KEY) return;

      const res = await fetch('https://companion-api.napster.com/public/companions/napster-stock', {
        headers: { 'X-Api-Key': API_KEY },
      });
      if (res.ok) {
        const data = await res.json() as { items: Array<{ id: string }> };
        this.companionIds = data.items.map((c) => c.id);
        console.log(`  Loaded ${this.companionIds.length} stock companions`);
      }
    } catch (err) {
      console.warn('  Could not load companions:', (err as Error).message);
    }
  }

  async createSession(topic: string, agentCount = 3): Promise<DebateSession> {
    if (this.session?.status === 'active') {
      throw new Error('A session is already active. End it first.');
    }

    // Load companions if not already loaded (skip in mock mode)
    if (this.companionIds.length === 0 && process.env.USE_MOCK !== 'true') {
      await this.loadCompanions();
    }

    // In mock mode, generate fake companion IDs
    if (process.env.USE_MOCK === 'true' && this.companionIds.length === 0) {
      this.companionIds = AGENT_PRESETS.map((_, i) => `mock_companion_${i}`);
    }

    const sessionId = uuid();
    const count = Math.min(agentCount, AGENT_PRESETS.length, this.companionIds.length);

    console.log(`\n  Creating session "${topic}" with ${count} agents...`);

    // Create agents
    const agentIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const preset = AGENT_PRESETS[i];
      const config: AgentConfig = {
        ...preset,
        id: '', // Will be set after API creation
        companionId: this.companionIds[i],
        systemPrompt: preset.systemPrompt + '\n\n' + COMMON_RULES,
        externalClientId: `arena_${preset.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`.slice(0, 32),
      };

      try {
        // Create agent via Omniagent API
        const agentId = await this.createOmniagentAgent(config);
        config.id = agentId;
        this.agentConfigs.set(agentId, config);
        agentIds.push(agentId);
        console.log(`  Created: ${config.name} (${agentId})`);

        // WebRTC video disabled — creates independent sessions that conflict with debate orchestration
        // TODO: Re-enable when Napster SDK supports syncing WebRTC avatar with WebSocket text
      } catch (err) {
        console.error(`  Failed to create ${config.name}:`, (err as Error).message);
      }
    }

    if (agentIds.length < 2) {
      throw new Error(`Only ${agentIds.length} agents created. Need at least 2.`);
    }

    // Create session record
    this.session = {
      id: sessionId,
      topic,
      status: 'starting',
      agentIds,
      startedAt: Date.now(),
      endedAt: null,
    };

    // Initialize vote tallies
    this.voteTallies = {};
    agentIds.forEach((id) => { this.voteTallies[id] = 0; });
    this.activeRules = [];
    this.recentTranscripts = [];

    // Save to DB
    db.prepare(
      'INSERT INTO sessions (id, topic, status, agent_ids, started_at) VALUES (?, ?, ?, ?, ?)'
    ).run(sessionId, topic, 'starting', JSON.stringify(agentIds), this.session.startedAt);

    // Notify viewers
    this.io.emit('session_state', this.getSessionState());

    return this.session;
  }

  async startDebate(): Promise<void> {
    if (!this.session || this.session.status !== 'starting') {
      throw new Error('No session ready to start');
    }

    console.log(`\n  Starting debate: "${this.session.topic}"`);

    // Connect all agents via WebSocket
    const connectedAgentIds: string[] = [];
    for (const agentId of this.session.agentIds) {
      const config = this.agentConfigs.get(agentId)!;
      try {
        const agent = await this.omniagent.createAndConnect(config);
        this.wireAgentEvents(agent, agentId);
        connectedAgentIds.push(agentId);
        console.log(`  Connected: ${config.name}`);
      } catch (err) {
        console.error(`  Failed to connect ${config.name}:`, (err as Error).message);
        this.io.emit('agent_disconnected', { agentId, reason: (err as Error).message });
      }
    }

    // Update session to only include connected agents
    const totalCreated = this.session.agentIds.length;
    this.session.agentIds = connectedAgentIds;
    console.log(`  ${connectedAgentIds.length}/${totalCreated} agents connected`);

    // Initialize orchestration
    this.turnManager = new TurnManager({ mode: 'round_robin' });
    this.relay = new TranscriptRelay(this.omniagent);
    this.injectionQueue = new InjectionQueue((text) => {
      this.relay!.injectSystem(text);
      this.activeRules.push(text);
      if (this.activeRules.length > 3) this.activeRules.shift();
      this.io.emit('injection_active', { text, timestamp: Date.now() });
    });

    this.wireTurnManagerEvents();

    // Update session status
    this.session.status = 'active';
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('active', this.session.id);

    // Don't send opening system messages to all agents — it triggers auto-responses
    // from the silence-primed audio channel. The set_settings already configured their
    // debate persona, and each turn trigger includes full context.

    // Start the turn cycle
    this.turnManager.start(this.session.agentIds);

    // Start topic rotation (every 5 minutes)
    this.topicRotationTimer = setInterval(() => {
      this.rotateTopic();
    }, 5 * 60 * 1000);

    // Notify viewers
    this.io.emit('session_state', this.getSessionState());
    console.log('  Debate is LIVE!\n');
  }

  async endDebate(reason = 'manual'): Promise<void> {
    if (!this.session) return;

    console.log(`\n  Ending debate: ${reason}`);
    this.session.status = 'ended';
    this.session.endedAt = Date.now();

    this.turnManager?.stop();
    this.injectionQueue?.stop();
    this.omniagent.disconnectAll();

    db.prepare('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?')
      .run('ended', this.session.endedAt, this.session.id);

    // Build victory results
    const winner = this.getWinner();
    this.io.emit('session_ended', {
      reason,
      results: {
        winner,
        voteTallies: { ...this.voteTallies },
        totalMessages: this.recentTranscripts.length,
        duration: Date.now() - (this.session.startedAt || 0),
      },
    });

    // Clear topic rotation timer
    if (this.topicRotationTimer) {
      clearInterval(this.topicRotationTimer);
      this.topicRotationTimer = null;
    }

    this.turnManager = null;
    this.relay = null;
    this.injectionQueue = null;

    if (reason !== 'shutdown') {
      setTimeout(async () => {
        try {
          const { getNextTopic } = await import('./auto-start.js');
          const topic = getNextTopic();
          await this.createSession(topic, 3);
          await this.startDebate();
          console.log('  Auto-restarted with:', topic);
        } catch (err) {
          console.error('  Auto-restart failed:', (err as Error).message);
        }
      }, 5000); // 5s gap between debates
    }
  }

  // ─── Audience Actions ───────────────────────────────────────────────────

  handleChaosInject(viewerId: string, text: string, type: 'rule' | 'topic_change') {
    if (!this.session || !this.injectionQueue) return { ok: false, reason: 'No active session' };

    const result = this.injectionQueue.enqueue(viewerId, text, type);
    if (result.ok) {
      this.io.emit('injection_queued', { text, position: result.position! });
      this.emitDebug('injection', undefined, undefined, `${type}: ${text}`);

      db.prepare('INSERT INTO injections (session_id, text, type, viewer_id) VALUES (?, ?, ?, ?)')
        .run(this.session.id, text, type, viewerId);
    }
    return result;
  }

  handleVote(viewerId: string, agentId: string) {
    if (!this.session || !this.voteTallies.hasOwnProperty(agentId)) return;

    this.voteTallies[agentId]++;
    this.io.emit('vote_update', this.voteTallies);
  }

  // ─── Voice Challenger ─────────────────────────────────────────────────

  private activeChallenger: { viewerId: string; agentId: string } | null = null;

  handleChallengerStart(viewerId: string, agentId: string) {
    if (!this.session) return;

    this.activeChallenger = { viewerId, agentId };

    // Pause turn manager during challenge
    this.turnManager?.pause();

    // Notify the agent that a human challenger has entered
    const agentName = this.agentConfigs.get(agentId)?.name || 'Agent';
    this.omniagent.sendMessage(
      agentId, 'system',
      `A LIVE HUMAN CHALLENGER has entered the arena to debate you directly! The audience is watching. Be entertaining, engage with them, and don't hold back. You have 60 seconds.`,
      false
    );

    // Notify other agents
    for (const otherId of this.session.agentIds) {
      if (otherId !== agentId) {
        this.omniagent.sendMessage(
          otherId, 'system',
          `A human challenger has entered the arena to take on ${agentName}! Watch and react. You may get a chance to comment.`,
          false
        );
      }
    }

    this.emitDebug('challenger', agentId, agentName, 'Challenger entered');
    console.log(`  CHALLENGER ACTIVE: ${viewerId} → ${agentName}`);
  }

  handleChallengerAudio(agentId: string, text: string) {
    if (!this.activeChallenger || !this.session) return;

    // Send the challenger's transcribed speech to the target agent
    this.omniagent.sendMessage(agentId, 'user', `[HUMAN CHALLENGER said]: "${text}"`, true);

    // Also broadcast as a transcript for viewers
    const msg: TranscriptMessage = {
      agentId: 'challenger',
      agentName: 'Challenger',
      text,
      timestamp: Date.now(),
    };
    this.recentTranscripts.push(msg);
    this.io.emit('transcript', msg);
  }

  handleChallengerEnd(viewerId: string) {
    if (!this.activeChallenger) return;

    const agentId = this.activeChallenger.agentId;
    const agentName = this.agentConfigs.get(agentId)?.name || 'Agent';
    this.activeChallenger = null;

    // Resume turn manager
    this.turnManager?.resume();

    // Notify agents
    if (this.session) {
      for (const id of this.session.agentIds) {
        this.omniagent.sendMessage(
          id, 'system',
          `The human challenger has left the arena. Resume the debate.`,
          false
        );
      }
    }

    console.log(`  CHALLENGER LEFT: ${viewerId}`);
  }

  // ─── State Accessors ───────────────────────────────────────────────────

  getActiveSession(): DebateSession | null {
    return this.session;
  }

  getVideoTokens(): Map<string, string> {
    return this.videoTokens;
  }

  getSessionState(): SessionState {
    return {
      session: this.session,
      agents: this.session?.agentIds.map((id) => {
        const config = this.agentConfigs.get(id);
        return {
          id,
          name: config?.name || 'Unknown',
          personality: config?.personality || '',
          color: config?.color || '#888',
          status: 'ready' as const,
        };
      }) || [],
      currentSpeaker: this.turnManager?.getCurrentSpeaker() || null,
      voteTallies: this.voteTallies,
      activeRules: this.activeRules,
      recentTranscripts: this.recentTranscripts.slice(-20),
    };
  }

  // ─── Private: Debug ──────────────────────────────────────────────────

  private emitDebug(type: string, agentId?: string, agentName?: string, detail?: string) {
    (this.io as any).emit('debug_event', { type, agentId, agentName, detail, timestamp: Date.now() });
  }

  // ─── Private: Victory & Rotation ──────────────────────────────────────

  private getWinner(): { id: string; name: string; color: string; votes: number } | null {
    if (!this.session) return null;
    let maxVotes = 0;
    let winnerId: string | null = null;

    for (const [agentId, votes] of Object.entries(this.voteTallies)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        winnerId = agentId;
      }
    }

    if (!winnerId || maxVotes === 0) return null;

    // Check for tie
    const tiedCount = Object.values(this.voteTallies).filter((v) => v === maxVotes).length;
    if (tiedCount > 1) return null; // It's a tie

    const config = this.agentConfigs.get(winnerId);
    return {
      id: winnerId,
      name: config?.name || 'Unknown',
      color: config?.color || '#888',
      votes: maxVotes,
    };
  }

  private async rotateTopic() {
    if (!this.session || this.session.status !== 'active') return;

    try {
      const { getNextTopic } = await import('./auto-start.js');
      const newTopic = getNextTopic();
      this.session.topic = newTopic;

      // Notify all agents
      for (const agentId of this.session.agentIds) {
        this.omniagent.sendMessage(
          agentId, 'system',
          `TOPIC CHANGE! The new debate topic is: "${newTopic}". Pivot your arguments immediately. Make a bold opening statement on the new topic.`,
          false
        );
      }

      // Notify viewers
      (this.io as any).emit('topic_changed', { topic: newTopic, timestamp: Date.now() });
      this.io.emit('session_state', this.getSessionState());

      console.log(`  [Topic Rotation] New topic: ${newTopic}`);
    } catch (err) {
      console.error('  Topic rotation failed:', (err as Error).message);
    }
  }

  // ─── Private: Agent Creation ────────────────────────────────────────────

  private async createOmniagentAgent(config: AgentConfig): Promise<string> {
    if (process.env.USE_MOCK === 'true') {
      return `mock_${uuid().substring(0, 8)}`;
    }

    const API_KEY = process.env.OMNIAGENT_API_KEY!;
    const res = await fetch('https://companion-api.napster.com/public/agents', {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companionId: config.companionId,
        name: config.name,
        voiceId: config.voiceId,
        providerSettings: {
          temperature: 0.85,
          instructions: config.systemPrompt,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json() as { id: string };
    return data.id;
  }

  // ─── Private: Event Wiring ──────────────────────────────────────────────

  private wireAgentEvents(agent: AgentInstance, agentId: string) {
    const agentName = () => this.agentConfigs.get(agentId)?.name || 'Unknown';

    // Stream text deltas to client for word-by-word transcript display
    agent.on('response_delta', (data: { itemId: string; content: string }) => {
      if (this.turnManager?.getCurrentSpeaker() === agentId) {
        (this.io as any).emit('transcript_delta', {
          agentId,
          agentName: agentName(),
          content: data.content,
        });
      }
    });

    // Text response completed — save transcript, mark turn text as done
    agent.on('speech_end', (data: { agentId: string; agentName: string; text: string; timestamp: number }) => {
      // Only process transcripts from the current speaker (ignore auto-responses)
      if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

      const msg: TranscriptMessage = {
        agentId: data.agentId,
        agentName: data.agentName,
        text: data.text,
        timestamp: data.timestamp,
      };

      this.recentTranscripts.push(msg);
      if (this.recentTranscripts.length > 50) this.recentTranscripts.shift();

      if (this.session) {
        db.prepare('INSERT INTO transcripts (session_id, agent_id, text, timestamp) VALUES (?, ?, ?, ?)')
          .run(this.session.id, agentId, data.text, data.timestamp);
      }

      // Signal client that streaming transcript is complete
      (this.io as any).emit('transcript_done', msg);

      this.emitDebug('speech_end', agentId, data.agentName, `${data.text.length} chars`);

      // Mark that the turn's TEXT response is complete.
      // talk_state:ended will only advance the turn if this flag is set,
      // preventing auto-responses from prematurely advancing.
      this.turnTextComplete = true;
    });

    agent.on('response_start', () => {
      this.turnManager?.onResponseStarted(agentId);
    });

    // Advance turn when audio finishes — but only if the turn's text completed first.
    // This guards against auto-responses (from silence prime) advancing the turn prematurely.
    agent.on('talk_state', (data: any) => {
      if (data?.state === 'ended' && this.turnManager?.getCurrentSpeaker() === agentId && this.turnTextComplete) {
        const tracker = this.audioTracker.get(agentId);
        this.audioTracker.delete(agentId);

        // Short delay for last audio chunks to reach client, then advance.
        // Cable news pacing: don't wait for full playback — client hard-stops old audio on speaker change.
        const waitMs = 1000;
        console.log(`  [${agentName()}] audio done — advancing in ${waitMs}ms`);
        setTimeout(() => {
          this.turnManager?.onSpeechEnd(agentId, '');
        }, waitMs);
      }
    });

    agent.on('audio', (data: { agentId: string; audio: string }) => {
      if (this.turnManager?.getCurrentSpeaker() === agentId) {
        if (!this.audioTracker.has(agentId)) {
          this.audioTracker.set(agentId, { firstChunkTime: Date.now(), totalB64Chars: 0 });
        }
        this.audioTracker.get(agentId)!.totalB64Chars += data.audio.length;
        (this.io as any).emit('agent_audio', data);
      }
    });

    agent.on('disconnected', () => {
      console.log(`  Agent disconnected: ${this.agentConfigs.get(agentId)?.name}`);
      this.io.emit('agent_disconnected', { agentId, reason: 'connection_lost' });
    });
  }

  private wireTurnManagerEvents() {
    if (!this.turnManager) return;

    this.turnManager.on('turn_start', ({ agentId }: { agentId: string }) => {
      // Reset turn state
      this.turnTextComplete = false;
      this.audioTracker.delete(agentId);

      this.io.emit('speaker_change', { agentId });
      const turnAgentName = this.agentConfigs.get(agentId)?.name || 'Unknown';
      this.emitDebug('turn_start', agentId, turnAgentName, 'Turn started');
      console.log(`  [Turn] ${turnAgentName}'s turn`);

      // Build the trigger message with full context
      const topic = this.session?.topic || 'the current topic';
      const lastMsg = this.recentTranscripts[this.recentTranscripts.length - 1];
      if (lastMsg && lastMsg.agentId !== agentId) {
        this.omniagent.sendMessage(agentId, 'user', `[${lastMsg.agentName} said]: "${lastMsg.text}"\n\nRespond to this. Make your argument.`, true);
      } else {
        this.omniagent.sendMessage(agentId, 'user', `The debate topic is: "${topic}". Give your opening argument. Be bold and entertaining.`, true);
      }
    });

    this.turnManager.on('turn_timeout', ({ agentId }: { agentId: string }) => {
      console.log(`  [Turn] ${this.agentConfigs.get(agentId)?.name} timed out`);
    });

    this.turnManager.on('turn_interrupted', ({ byAgentId }: { byAgentId: string }) => {
      console.log(`  [Turn] Interrupted by ${this.agentConfigs.get(byAgentId)?.name}`);
    });
  }
}
