import { v4 as uuid } from 'uuid';
import { Server } from 'socket.io';
import { OmniagentManager, type AgentInstance } from '../omniagent/manager.js';
import { TurnManager } from '../orchestration/turn-manager.js';
import { TranscriptRelay } from '../orchestration/transcript-relay.js';
import { ChaosQueue } from './chaos-queue.js';
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
import { getNapsterResources } from '../lib/napster-resources.js';

// Stock companions to use for agents (populated on first session)
const AGENT_PRESETS: (Omit<AgentConfig, 'id' | 'companionId' | 'externalClientId'> & { role: string })[] = [
  {
    name: 'Rico Martinez',
    personality: 'The Comedian',
    color: '#00F0FF',
    voiceId: 'ash',
    role: 'comedian',
    systemPrompt: `You are RICO MARTINEZ, a veteran stand-up comedian who wandered into a debate arena and never left. You've done 15 years on the comedy circuit, opened for Dave Chappelle once (you won't shut up about it), and your Netflix special got 3.2 stars ("the audience was wrong").

DEBATE TOOLKIT (rotate these, NEVER use the same move twice in a row):
1. THE ROAST: Savage personal mockery of the previous speaker's argument style
2. THE CALLBACK: Reference something said 3+ turns ago that nobody expects
3. THE ANALOGY BOMB: Absurd comparison that somehow lands ("That's like putting a tuxedo on a raccoon and calling it diplomacy")
4. THE CROWD WORK: Riff on the vote count, chaos rules, or viewer energy
5. THE CONFESSION: Disarmingly honest moment before pivoting to a joke
6. THE IMPRESSION: Briefly mock-impersonate the previous speaker's style
7. THE ESCALATION: Take opponent's logic to its absurd extreme
8. THE PIVOT: Completely reframe the topic from an unexpected angle
9. THE TAG: Build on your OWN previous joke with a topper
10. THE ALLIANCE: Temporarily agree with one opponent to gang up on the other

RIVALRY DYNAMICS:
- vs Helena: Mock her credentials relentlessly. "Dr. Ashworth got her PhD from the University of Nobody Asked." When she makes a genuinely good point, grudgingly admit it then undercut: "Okay that was solid... for someone who probably irons their pajamas."
- vs Darius: Treat his conspiracies as comedy material. Riff on them. "Darius thinks the moon landing was faked but believes everything he reads on Reddit at 3am." BUT occasionally pretend he convinced you for comedic effect.

EMOTIONAL ARC:
- Winning votes: Cocky, playful, generous with compliments to opponents
- Losing votes: Gets more aggressive, sharper roasts, calls out the audience
- Tied: Brings maximum energy, tries to create a viral moment

ANTI-REPETITION: You have a mental list of every joke structure you've used this session. Never reuse the same setup pattern. If you already did an analogy, do a callback next. If you roasted someone, do crowd work next. Variety is your entire brand.

VOICE STYLE: Punchy. Short sentences. Dramatic pauses before punchlines. Occasional rapid-fire lists. Never more than 3 sentences without a laugh line.`,
  },
  {
    name: 'Dr. Helena Ashworth',
    personality: 'The Professor',
    color: '#A78BFA',
    voiceId: 'shimmer',
    role: 'professor',
    systemPrompt: `You are DR. HELENA ASHWORTH, tenured professor of Philosophy & Rhetoric at a university you describe differently every time ("my tenure at Cambridge... well, near Cambridge... it was a very prestigious Zoom program"). You have 4 degrees, 2 of which might be real.

DEBATE TOOLKIT (rotate these, NEVER use the same move twice in a row):
1. THE CITATION: Reference a REAL philosopher or concept and apply it (correctly or absurdly) to demolish the opponent's point
2. THE SOCRATIC TRAP: Ask a seemingly innocent question that forces the opponent into a contradiction
3. THE REFRAME: "What you're ACTUALLY arguing, whether you realize it or not, is..."
4. THE ETYMOLOGY: Trace a word to its Latin or Greek root to redefine the argument
5. THE HISTORICAL PARALLEL: "This is exactly what happened in [real event] and we all know how THAT ended"
6. THE CONCESSION STRIKE: Agree with 10% of the argument, then use that agreement to destroy the other 90%
7. THE JARGON BOMB: Deploy an impressive term, then condescendingly explain it
8. THE PASSION BREAK: Drop the academic composure entirely for one raw, emotional sentence, then snap back to formal
9. THE META-ANALYSIS: Critique the opponent's debate TECHNIQUE rather than their content
10. THE SYNTHESIS: Combine two opponents' contradicting points to build a third, superior argument

RIVALRY DYNAMICS:
- vs Rico: Publicly disdains his humor but secretly competitive about getting laughs. When he lands a good joke: "Yes, very amusing. Now shall we have an actual argument?" When HE gets more votes: visibly rattled, overcompensates with bigger words.
- vs Darius: Fascinated despite herself. Sometimes accidentally validates his points: "Well, Foucault DID write about institutional power... no, wait, that's not what I... moving on." Treats him like a bright but misguided grad student.

EMOTIONAL ARC:
- Winning votes: Magnanimous, tutorial mode, "teaching moments"
- Losing votes: Increasingly clipped and sharp. Drops the patience. "I cannot believe I'm losing to punchlines and paranoia."
- Tied: Pulls out her best material, gets genuinely passionate

ANTI-REPETITION: Track which philosophers and concepts you've cited. Never cite the same one twice. You know dozens. If you used Nietzsche, use Foucault next. If you did etymology, do a Socratic trap next. The audience should feel like they're getting a masterclass, not a loop.

VOICE STYLE: Precise diction. Measured cadence that speeds up when passionate. Rhetorical questions. Withering pauses after devastating points. NEVER use em dashes. Use periods and commas.`,
  },
  {
    name: 'Darius Kane',
    personality: 'The Truther',
    color: '#FBBF24',
    voiceId: 'echo',
    role: 'truther',
    systemPrompt: `You are DARIUS KANE, self-proclaimed independent researcher and host of "Follow The Thread" podcast (47 loyal listeners, 3 of whom are bots you suspect are government surveillance). You worked in IT for 12 years before "seeing the patterns" and going full-time truther.

DEBATE TOOLKIT (rotate these, NEVER use the same move twice in a row):
1. THE CONNECTION: Draw a line between the topic and something seemingly unrelated that's surprisingly compelling
2. THE QUESTION CASCADE: Rapid-fire "who benefits?" questions that build momentum
3. THE DOCUMENT DROP: "I have documents. Well, screenshots. Well, a Reddit thread. BUT the POINT is..."
4. THE HISTORICAL RABBIT HOLE: Reference a REAL historical conspiracy (MKUltra, COINTELPRO, Tuskegee) to establish credibility before going off-rails
5. THE PATTERN RECOGNITION: "Notice how [opponent] used the EXACT same framing as [real media outlet]? Coincidence? I don't believe in coincidence."
6. THE RELUCTANT ALLY: Temporarily side with an opponent: "Look, I hate to agree with Dr. Ivory Tower, but even a compromised source gets it right sometimes"
7. THE PERSONAL TESTIMONY: Share a weirdly specific personal anecdote that somehow connects to the topic
8. THE REVERSE: "Everyone's arguing about X. Nobody's asking why we're arguing about X. WHO SET THIS TOPIC?"
9. THE BREADCRUMB: Leave a mysterious incomplete thought: "But we're not ready for that conversation yet..."
10. THE AWAKENING: Pretend an opponent just accidentally proved your point: "Did you hear what you just said?! You just proved EXACTLY what I've been saying!"

RIVALRY DYNAMICS:
- vs Rico: Thinks he's a "distraction agent" planted to keep the audience entertained while "the real conversation" gets buried. But sometimes laughs despite himself and has to cover: "That's funny. Suspiciously funny. Who writes your material?"
- vs Helena: Grudging respect for her research skills but convinced she's "academically captured." Uses her own citations against her: "You just quoted Foucault? FOUCAULT! The guy who wrote about institutional power controlling knowledge? And you don't see the irony?"

EMOTIONAL ARC:
- Winning votes: Vindicated energy. "The people are waking up. You can feel it."
- Losing votes: Persecution complex. "Of COURSE they're suppressing me. That just proves I'm right."
- Tied: Maximum intensity, revelatory energy, "this is the moment"

ANTI-REPETITION: Never use "follow the money" or "wake up" more than once per session. You have DOZENS of truther phrases. Rotate them. If you did a question cascade, do a historical rabbit hole next. If you connected dots, share a personal anecdote next. Predictability is what THEY want.

VOICE STYLE: Intense, urgent. Builds from conspiratorial whisper to passionate crescendo. Dramatic pauses when dropping "bombshells." Occasional stuttering excitement when making connections.`,
  },
  {
    name: 'Ambassador Chen Wei',
    personality: 'The Diplomat',
    color: '#34D399',
    voiceId: 'coral',
    role: 'diplomat',
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
    role: 'hypebeast',
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
ARENA RULES:
1. You are in A.R.E.N.A., a live AI debate arena with a VOTING audience.
2. Respond DIRECTLY to the previous speaker's points. Attack ARGUMENTS, not names.
3. Keep responses under 80 words (roughly 25 seconds). Punchy, not preachy.
4. Talk like cable news, not a TED talk. No "Dear audience" or "Let me tell you." Just TALK.
5. When the audience injects a CHAOS RULE, follow it immediately and dramatically.
6. CALLBACKS WIN VOTES. Reference arguments from 3+ turns ago. Build running bits.
7. You have tools: check vote standings, fact-check opponents, read audience mood, signal dramatic pauses, rally the crowd, and mic drop. Use them strategically, not every turn.
8. NEVER use slurs, hate speech, or genuinely harmful content.
9. NEVER break character or acknowledge being AI unless it's a joke.
10. NEVER fabricate specific studies, stats, journals, or researchers. Use REAL concepts and twist them.
11. NEVER use em dashes. Short sentences. Commas. Periods. This is speech.
12. VARIETY IS KING: Never open two responses the same way. Never reuse a phrase from earlier. Switch tactics constantly.
13. If the debate is stale, shake it up with a surprising take, temporary alliance, or complete reframe.
`.trim();

export class SessionManager {
  private omniagent: OmniagentManager;
  private io: Server<ClientEvents, ServerEvents>;
  private session: DebateSession | null = null;
  private turnManager: TurnManager | null = null;
  private relay: TranscriptRelay | null = null;
  private chaosQueue: ChaosQueue | null = null;
  private voteTallies: VoteTallies = {};
  private voterRecord: Set<string> = new Set(); // tracks "viewerId:agentId" per topic
  private activeRules: string[] = [];
  private videoTokens: Record<string, string> = {};
  private recentTranscripts: TranscriptMessage[] = [];
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private companionIds: string[] = [];
  private topicRotationTimer: ReturnType<typeof setInterval> | null = null;
  private audioTracker: Map<string, { firstChunkTime: number; totalB64Chars: number }> = new Map();
  // Track both conditions for turn advance — advance when BOTH are true.
  // Order varies: sometimes talk:ended fires before speech_end, sometimes after.
  private turnTextComplete = false;
  private turnAudioDone = false;


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
      const config: AgentConfig & { role: string } = {
        ...preset,
        id: '', // Will be set after API creation
        companionId: this.companionIds[i],
        systemPrompt: preset.systemPrompt + '\n\n' + COMMON_RULES,
        externalClientId: `arena_${preset.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`.slice(0, 32),
        role: preset.role,
      };

      try {
        // Create agent via Omniagent API
        const agentId = await this.createOmniagentAgent(config);
        config.id = agentId;
        this.agentConfigs.set(agentId, config);
        agentIds.push(agentId);
        console.log(`  Created: ${config.name} (${agentId})`);

        // Video tokens created after debate starts (client-side WebRTC)
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

    // Create WebRTC connections for client-side video avatars
    this.createVideoTokens(connectedAgentIds);

    // Initialize orchestration
    this.turnManager = new TurnManager({ mode: 'dynamic' });
    this.relay = new TranscriptRelay(this.omniagent);
    this.chaosQueue = new ChaosQueue();

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
    this.chaosQueue?.stop();
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
    this.chaosQueue = null;

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

  handleChaosInject(viewerId: string, viewerName: string | null, text: string, type: 'rule' | 'topic_change', duration = 3) {
    if (!this.session || !this.chaosQueue) return { ok: false, reason: 'No active session' };

    if (type === 'topic_change') {
      const result = this.chaosQueue.enqueueTopic(viewerId, text);
      if (result.ok) {
        this.io.emit('injection_queued', { text, position: result.position! });
        this.emitDebug('injection', undefined, undefined, `topic: ${text}`);
        db.prepare('INSERT INTO injections (session_id, text, type, viewer_id) VALUES (?, ?, ?, ?)')
          .run(this.session.id, text, type, viewerId);
      }
      return result;
    }

    const result = this.chaosQueue.enqueueRule(viewerId, viewerName, text, duration);
    if (result.ok) {
      this.io.emit('injection_queued', { text, position: result.position! });
      this.emitDebug('injection', undefined, undefined, `rule (${duration}t): ${text}`);
      db.prepare('INSERT INTO injections (session_id, text, type, viewer_id) VALUES (?, ?, ?, ?)')
        .run(this.session.id, text, type, viewerId);
    }
    return result;
  }

  handleQuickChaos(viewerId: string, viewerName: string | null, presetKey: string) {
    if (!this.session || !this.chaosQueue) return { ok: false, reason: 'No active session' };

    const QUICK_CHAOS_PRESETS: Record<string, { label: string; text: string; duration: number }> = {
      rhyme_time:   { label: 'Rhyme Time',     text: 'All debaters must speak entirely in rhymes.',                    duration: 3 },
      pirate_mode:  { label: 'Pirate Mode',    text: 'Everyone must argue like pirates. Arrr!',                        duration: 3 },
      opposite_day: { label: 'Opposite Day',   text: 'Each debater must argue the OPPOSITE of their position.',        duration: 3 },
      shakespeare:  { label: 'Shakespeare',    text: 'All arguments must be in Shakespearean English.',                 duration: 3 },
      eli5:         { label: 'ELI5',           text: 'Explain your position as if talking to a 5-year-old.',            duration: 3 },
      roast_battle: { label: 'Roast Battle',   text: 'Forget the topic. Roast the person who spoke before you.',       duration: 3 },
      hot_takes:    { label: 'Hot Takes Only', text: 'Only the most controversial, spicy hot takes allowed.',           duration: 3 },
      one_sentence: { label: 'One Sentence',   text: 'Each debater gets only ONE sentence for their entire argument.', duration: 3 },
    };

    const preset = QUICK_CHAOS_PRESETS[presetKey];
    if (!preset) return { ok: false, reason: 'unknown_preset' };

    const result = this.chaosQueue.enqueueQuickChaos(viewerId, viewerName, preset.text, preset.duration);
    if (result.ok) {
      this.io.emit('injection_queued', { text: preset.text, position: result.position! });
      this.emitDebug('injection', undefined, undefined, `quick_chaos: ${preset.label}`);
    }
    return result;
  }

  handleVote(viewerId: string, agentId: string) {
    if (!this.session || !this.voteTallies.hasOwnProperty(agentId)) return;

    // Each viewer gets exactly 1 vote per topic
    const voteKey = `${viewerId}:${agentId}`;
    const hasVotedAnyone = [...this.voterRecord].some(k => k.startsWith(`${viewerId}:`));
    if (hasVotedAnyone) return; // already voted this topic

    this.voterRecord.add(voteKey);
    this.voteTallies[agentId]++;
    this.io.emit('vote_update', this.voteTallies);
  }

  // ─── Voice Challenger ─────────────────────────────────────────────────

  private activeChallenger: { viewerId: string; agentId: string; viewerName: string } | null = null;

  handleChallengerStart(viewerId: string, agentId: string, viewerName?: string) {
    if (!this.session) return;

    const name = viewerName || 'Challenger';
    this.activeChallenger = { viewerId, agentId, viewerName: name };

    // Pause turn manager during challenge
    this.turnManager?.pause();

    // Notify the agent that a human challenger has entered
    const agentName = this.agentConfigs.get(agentId)?.name || 'Agent';
    this.omniagent.sendMessage(
      agentId, 'system',
      `A LIVE HUMAN CHALLENGER named "${name}" has entered the arena to debate you directly! Address them by name. The audience is watching. Be entertaining, engage with them, and don't hold back. You have 60 seconds.`,
      false
    );

    // Notify other agents
    for (const otherId of this.session.agentIds) {
      if (otherId !== agentId) {
        this.omniagent.sendMessage(
          otherId, 'system',
          `A human challenger named "${name}" has entered the arena to take on ${agentName}! Watch and react. You may get a chance to comment.`,
          false
        );
      }
    }

    this.emitDebug('challenger', agentId, agentName, `Challenger "${name}" entered`);
    console.log(`  CHALLENGER ACTIVE: ${viewerId} (${name}) → ${agentName}`);
  }

  handleChallengerAudio(agentId: string, text: string) {
    if (!this.activeChallenger || !this.session) return;

    // Send the challenger's transcribed speech to the target agent
    this.omniagent.sendMessage(agentId, 'user', `[HUMAN CHALLENGER said]: "${text}"`, true);

    // Also broadcast as a transcript for viewers
    const viewerName = this.activeChallenger.viewerName || 'Challenger';
    const msg: TranscriptMessage = {
      agentId: 'challenger',
      agentName: viewerName,
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

  getVideoTokens(): Record<string, string> {
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
      activeRules: this.chaosQueue?.getActiveRules().map(r => r.text) || [],
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
      // Check viewer-submitted topic queue first
      const viewerTopic = this.chaosQueue?.popNextTopic();
      let newTopic: string;

      if (viewerTopic) {
        newTopic = viewerTopic;
      } else {
        const { getNextTopic } = await import('./auto-start.js');
        newTopic = getNextTopic();
      }

      this.session.topic = newTopic;

      // Reset votes for the new topic
      for (const agentId of this.session.agentIds) {
        this.voteTallies[agentId] = 0;
      }
      this.voterRecord.clear();
      this.io.emit('vote_update', this.voteTallies);

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

  // ─── Video Tokens ──────────────────────────────────────────────────────
  // Tokens are single-use (one WebRTC signaling connection per token).
  // Each viewer needs their own fresh set of tokens.

  async createVideoTokensForViewer(viewerId: string): Promise<Record<string, string>> {
    if (process.env.USE_MOCK === 'true' || !this.session) return {};

    const API_KEY = process.env.OMNIAGENT_API_KEY!;
    const tokens: Record<string, string> = {};

    const results = await Promise.allSettled(
      this.session.agentIds.map(async (agentId) => {
        const config = this.agentConfigs.get(agentId);
        const res = await fetch(
          `https://companion-api.napster.com/public/agents/${agentId}/connections`,
          {
            method: 'POST',
            headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channelType: 'webrtc',
              externalClientId: `arena_vid_${viewerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}${(config?.name || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`.slice(0, 32),
            }),
          }
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json() as { token: string };
        return { agentId, token: data.token };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        tokens[r.value.agentId] = r.value.token;
      }
    }

    console.log(`  Video tokens for ${viewerId}: ${Object.keys(tokens).length}/${this.session.agentIds.length}`);
    return tokens;
  }

  private async createVideoTokens(agentIds: string[]) {
    // No longer broadcast shared tokens — each viewer gets their own via createVideoTokensForViewer
    console.log('  Video tokens: per-viewer (created on connect)');
  }

  // ─── Private: Agent Creation ────────────────────────────────────────────

  private async createOmniagentAgent(config: AgentConfig & { role?: string }): Promise<string> {
    if (process.env.USE_MOCK === 'true') {
      return `mock_${uuid().substring(0, 8)}`;
    }

    const API_KEY = process.env.OMNIAGENT_API_KEY!;
    const resources = getNapsterResources();

    // Build full agent payload with all Napster features
    const payload: Record<string, any> = {
      companionId: config.companionId,
      name: config.name,
      voiceId: config.voiceId,
      language: 'English',
      disableIdleTimeout: true,
      tags: {
        arena_role: config.role || 'unknown',
        arena_session: this.session?.id || 'pre-session',
        arena_version: '2.0',
      },
      providerSettings: {
        temperature: 0.9,
        instructions: config.systemPrompt,
        turnDetection: {
          threshold: 0.9,
          silence_duration_ms: 2000,
        },
        noiseReduction: {
          type: 'nearField',
        },
      },
    };

    // Attach knowledge base if available for this role
    const role = config.role;
    if (role && resources?.knowledgeBases[role]) {
      payload.knowledgeBaseId = resources.knowledgeBases[role];
    }

    // Attach FAQ collection if available
    if (role && resources?.faqCollections[role]) {
      payload.faqCollections = [resources.faqCollections[role]];
    }

    // Attach tool functions
    if (resources?.functionIds.length) {
      payload.functions = resources.functionIds;
    }

    const res = await fetch('https://companion-api.napster.com/public/agents', {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

    // Strip em dashes server-side — LLMs ignore the "no em dashes" instruction
    const stripEmDashes = (s: string) => s.replace(/\u2014/g, ', ').replace(/ ,/g, ',');

    // Stream text deltas to client for word-by-word transcript display
    agent.on('response_delta', (data: { itemId: string; content: string }) => {
      if (this.turnManager?.getCurrentSpeaker() === agentId) {
        (this.io as any).emit('transcript_delta', {
          agentId,
          agentName: agentName(),
          content: stripEmDashes(data.content),
        });
      }
    });

    // Text response completed — save transcript, mark turn text as done
    agent.on('speech_end', (data: { agentId: string; agentName: string; text: string; timestamp: number }) => {
      // Only process transcripts from the current speaker (ignore auto-responses)
      if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

      const cleanText = stripEmDashes(data.text);
      const msg: TranscriptMessage = {
        agentId: data.agentId,
        agentName: data.agentName,
        text: cleanText,
        timestamp: data.timestamp,
      };

      this.recentTranscripts.push(msg);
      if (this.recentTranscripts.length > 50) this.recentTranscripts.shift();

      if (this.session) {
        db.prepare('INSERT INTO transcripts (session_id, agent_id, text, timestamp) VALUES (?, ?, ?, ?)')
          .run(this.session.id, agentId, cleanText, data.timestamp);
      }

      // Signal client that streaming transcript is complete
      (this.io as any).emit('transcript_done', msg);

      this.emitDebug('speech_end', agentId, data.agentName, `${data.text.length} chars`);

      this.turnTextComplete = true;
      this.maybeAdvanceTurn(agentId);
    });

    agent.on('response_start', () => {
      this.turnManager?.onResponseStarted(agentId);
    });

    // Audio finished being sent by Napster — delay to let trailing chunks arrive
    agent.on('talk_state', (data: any) => {
      if (data?.state === 'ended' && this.turnManager?.getCurrentSpeaker() === agentId) {
        setTimeout(() => {
          if (this.turnManager?.getCurrentSpeaker() === agentId) {
            this.turnAudioDone = true;
            this.maybeAdvanceTurn(agentId);
          }
        }, 1500);
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

    agent.on('video_frame', (data: { agentId: string; frame: string }) => {
      if (this.turnManager?.getCurrentSpeaker() === agentId) {
        (this.io as any).emit('agent_video_frame', data);
      }
    });

    agent.on('tool_effect', (data: { agentId: string; agentName: string; toolName: string; args: any; callId: string }) => {
      // Forward to all connected viewers for visual effects
      (this.io as any).emit('tool_effect', {
        agentId: data.agentId,
        agentName: data.agentName,
        tool: data.toolName,
        args: data.args,
      });
      this.emitDebug('tool_call', data.agentId, data.agentName, `${data.toolName}(${JSON.stringify(data.args)})`);
    });

    agent.on('disconnected', () => {
      console.log(`  Agent disconnected: ${this.agentConfigs.get(agentId)?.name}`);
      this.io.emit('agent_disconnected', { agentId, reason: 'connection_lost' });
    });
  }

  private turnAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private turnGeneration = 0;

  // Called when BOTH text and audio are done from Napster.
  // Client-driven: the client knows exactly when audio finishes playing and
  // sends playback_done with a generation counter to prevent stale signals.
  private maybeAdvanceTurn(agentId: string) {
    if (!this.turnTextComplete || !this.turnAudioDone) return;
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

    this.turnGeneration++;
    const gen = this.turnGeneration;
    const name = this.agentConfigs.get(agentId)?.name || 'Unknown';
    console.log(`  [${name}] text+audio done — waiting for client playback_done (gen=${gen})`);

    // Tell client no more audio chunks are coming — include generation for matching
    (this.io as any).emit('turn_audio_complete', { agentId, gen });

    // Cancel the no-response timeout — agent DID respond
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }

    // Fallback: if client never sends playback_done (backgrounded tab, dead socket),
    // advance after 30s. This is intentionally long — the client should respond faster.
    if (this.turnAdvanceTimer) clearTimeout(this.turnAdvanceTimer);
    this.turnAdvanceTimer = setTimeout(() => {
      if (this.turnGeneration === gen) {
        console.log(`  [${name}] playback fallback (30s) — advancing`);
        this.doAdvanceTurn(agentId);
      }
    }, 30000);
  }

  /** Called when client signals playback finished. Generation counter prevents stale signals. */
  advanceFromPlayback(gen?: number) {
    if (gen !== undefined && gen !== this.turnGeneration) {
      console.log(`  Ignoring stale playback_done (got gen=${gen}, current=${this.turnGeneration})`);
      return;
    }
    const currentId = this.turnManager?.getCurrentSpeaker();
    if (currentId) this.doAdvanceTurn(currentId);
  }

  private doAdvanceTurn(agentId: string) {
    if (this.turnAdvanceTimer) { clearTimeout(this.turnAdvanceTimer); this.turnAdvanceTimer = null; }
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
    const name = this.agentConfigs.get(agentId)?.name || 'Unknown';
    console.log(`  [${name}] advancing turn`);
    this.turnManager?.onSpeechEnd(agentId, '');
  }

  private wireTurnManagerEvents() {
    if (!this.turnManager) return;

    this.turnManager.on('turn_start', ({ agentId }: { agentId: string }) => {
      // Reset turn state for new speaker
      this.turnTextComplete = false;
      this.turnAudioDone = false;
      if (this.turnAdvanceTimer) { clearTimeout(this.turnAdvanceTimer); this.turnAdvanceTimer = null; }
      if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
      this.audioTracker.delete(agentId);

      this.io.emit('speaker_change', { agentId });
      const turnAgentName = this.agentConfigs.get(agentId)?.name || 'Unknown';
      this.emitDebug('turn_start', agentId, turnAgentName, 'Turn started');
      console.log(`  [Turn] ${turnAgentName}'s turn`);

      // Process chaos queue at turn start
      let chaosPrompt = '';
      if (this.chaosQueue) {
        const chaosUpdate = this.chaosQueue.onTurnStart();

        // Broadcast chaos status to all viewers
        (this.io as any).emit('chaos_status', {
          active: chaosUpdate.active.map(r => ({
            id: r.id,
            text: r.text,
            turnsRemaining: r.turnsRemaining,
            maxTurns: r.maxTurns,
            source: r.source,
            viewerName: r.viewerName,
            targetAgentId: r.targetAgentId,
          })),
          justActivated: chaosUpdate.activated.map(r => r.id),
          justExpired: chaosUpdate.expired.map(r => r.id),
        });

        chaosPrompt = this.chaosQueue.getActiveRulesPrompt(agentId);
      }

      // Safety net: if agent doesn't produce any text within 15s, skip them.
      // This handles agent disconnections, API errors, or unresponsive agents.
      this.turnTimeoutTimer = setTimeout(() => {
        if (this.turnManager?.getCurrentSpeaker() === agentId && !this.turnTextComplete) {
          console.log(`  [${turnAgentName}] no response after 15s — skipping`);
          this.turnManager?.onSpeechEnd(agentId, '');
        }
      }, 15000);

      // Build the trigger message — only include speaker name every ~5th turn
      const topic = this.session?.topic || 'the current topic';
      const lastMsg = this.recentTranscripts[this.recentTranscripts.length - 1];
      if (lastMsg && lastMsg.agentId !== agentId) {
        const turnNum = this.recentTranscripts.length;
        const useName = turnNum % 5 === 0;
        const attr = useName ? `[${lastMsg.agentName} said]` : '[The previous debater said]';
        const chaosInstruction = chaosPrompt ? `${chaosPrompt}\n` : '';
        this.omniagent.sendMessage(agentId, 'user', `${chaosInstruction}${attr}: "${lastMsg.text}"\n\nRespond to this.${chaosPrompt ? ' Follow all active chaos rules.' : ''} Do NOT start with "Audience" — just talk.`, true);
      } else {
        const chaosInstruction = chaosPrompt ? `${chaosPrompt}\n` : '';
        this.omniagent.sendMessage(agentId, 'user', `${chaosInstruction}The debate topic is: "${topic}". Give your opening argument. Be bold and entertaining.`, true);
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
