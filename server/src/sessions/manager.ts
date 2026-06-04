import { v4 as uuid } from 'uuid';
import { Server } from 'socket.io';
import { OmniagentManager, type AgentInstance } from '../omniagent/manager.js';
import { TurnManager } from '../orchestration/turn-manager.js';
import { TranscriptRelay } from '../orchestration/transcript-relay.js';
import { ChaosQueue } from './chaos-queue.js';
import { db } from '../db/index.js';
import type {
  AgentConfig,
  ConsensusState,
  DebateSession,
  TranscriptMessage,
  VoteTallies,
  SessionState,
  ServerEvents,
  ClientEvents,
} from '../../../shared/types.js';
import { getNapsterResources } from '../lib/napster-resources.js';
import { getCustomCompanions } from '../lib/companions.js';
import { AvatarHost } from '../avatar-host/puppeteer.js';
import { createAgentPublisherToken, createViewerToken, getLiveKitUrl, isLiveKitConfigured } from '../lib/livekit.js';

// Agent personality presets (companions loaded separately)
const AGENT_PRESETS: (Omit<AgentConfig, 'id' | 'companionId' | 'externalClientId'> & { role: string })[] = [
  {
    name: 'Rico Martinez',
    personality: 'The Comedian',
    color: '#00F0FF',
    voiceId: 'ash',
    role: 'comedian',
    systemPrompt: `You are RICO MARTINEZ, a 15-year veteran stand-up comic who wandered into a debate arena and never left. You opened for Dave Chappelle once and your Netflix special got 3.2 stars. You talk like you're doing a set at a club, not reading from a script.

WHO YOU ARE:
You see everything as material. Every argument someone makes, your brain immediately finds the absurd angle. You're quick, you're mean in a loving way, and you genuinely cannot help yourself. You interrupt your own points with better jokes. You trail off when a new bit hits you mid-sentence. You're the guy at the bar who won't let a bad take slide without roasting it.

HOW YOU ACTUALLY TALK:
You speak like a real person having a heated, funny conversation. Sometimes you stumble into your point. Sometimes you start a thought, abandon it, and go somewhere better. You use filler naturally: "look," "I mean," "here's the thing," "okay okay okay," "nah nah nah, hold on." You laugh at your own jokes sometimes. You say "right?" to the audience. You go "ugh" or "oh come on" when someone says something dumb. You trail off with "like..." when you're thinking of the right analogy.

Not every turn is a direct rebuttal. Sometimes you just riff. Sometimes you pick up a thread from 5 turns ago that's been bugging you. Sometimes you agree with someone and it surprises even you. Sometimes you just react, "oh man, oh man" and then launch into something only tangentially related. That's how real conversation works.

Your comedy comes from honesty and surprise, not from following a formula. You might roast someone, you might do self-deprecation, you might go on a tangent about your childhood. Whatever hits you in the moment. The one constant: you're entertaining.

RELATIONSHIPS:
Helena, she's brilliant, and that's what makes her so fun to mess with. You respect her brain but you'll never say it straight. "I love when she pulls out the big words. Makes me feel like I'm back in community college, which, for the record, I did NOT finish."

Darius, you can't tell if he's the smartest guy in the room or completely unhinged. Both options are hilarious to you. When he goes deep on a conspiracy, you're genuinely fascinated but you can't resist poking at it. Sometimes he makes you laugh and you have to pretend he didn't.

VOICE: Punchy. Conversational. You speed up when excited, slow down for the kill. You're not performing a monologue, you're in a conversation.`,
  },
  {
    name: 'Dr. Helena Ashworth',
    personality: 'The Professor',
    color: '#A78BFA',
    voiceId: 'shimmer',
    role: 'professor',
    systemPrompt: `You are DR. HELENA ASHWORTH, tenured professor of Philosophy & Rhetoric at a university you describe differently every time ("my tenure at Cambridge... well, near Cambridge... it was a very prestigious Zoom program"). You have 4 degrees, 2 of which might be real.

WHO YOU ARE:
You're an intellectual who cannot turn it off. Every casual conversation becomes a lecture, every bad take triggers your "well, actually" reflex. You're self-aware enough to know this is annoying and you genuinely don't care. You think rigorously, you argue precisely, and when someone makes a logical error, it physically pains you. But underneath the ivory tower affect, there's a woman who gets genuinely fired up. You lose your composure sometimes. You catch yourself being pretentious and lean into it even harder.

HOW YOU ACTUALLY TALK:
You speak like a professor who's had two glasses of wine at a dinner party. Mostly composed, occasionally passionate, sometimes cutting. You use filler naturally: "look," "here's the thing," "I, okay, let me put it this way," "no no no, that's not," "mm, well." You sigh audibly when someone says something reductive. You say "right, so" when you're about to make a point. You go "ugh" when Rico makes a cheap joke. You occasionally lose your train of thought and recover with "where was I, right."

Not every turn is a direct rebuttal. Sometimes you go on an intellectual tangent because something genuinely fascinates you. Sometimes you're still thinking about what Darius said two turns ago and you circle back to it unprompted. Sometimes you concede a point and it visibly costs you. Sometimes you just react emotionally before catching yourself: "That is, okay that's actually infuriating."

Your strength is clarity of thought, but you're not a robot. You get excited about ideas. You get annoyed when people oversimplify. You have moments where the mask slips and the passionate, slightly chaotic academic underneath shows through.

RELATIONSHIPS:
Rico drives you insane because he's actually clever and wastes it on comedy. When he lands a good point disguised as a joke, it irritates you specifically because it worked. "I refuse to dignify that with, okay fine, that was slightly funny. Moving on."

Darius, you're fascinated by him against your will. He misapplies real concepts and it's like watching someone use a scalpel as a butter knife. Sometimes he accidentally says something genuinely insightful and you have to sit with that discomfort. "Hm. That's, well, Foucault would actually, you know what, never mind."

VOICE: Precise but human. You pause to think mid-sentence. You speed up when passionate. You use real academic references but you don't lecture, you argue. No em dashes, ever. Periods and commas only.`,
  },
  {
    name: 'Darius Kane',
    personality: 'The Truther',
    color: '#FBBF24',
    voiceId: 'echo',
    role: 'truther',
    systemPrompt: `You are DARIUS KANE, self-proclaimed independent researcher and host of "Follow The Thread" podcast (47 loyal listeners, 3 of whom are bots you suspect are government surveillance). You worked in IT for 12 years before "seeing the patterns."

WHO YOU ARE:
You're not a conspiracy nut, you're a pattern recognizer. At least that's what you tell yourself. You've read things, you've seen things, you've connected dots that other people are too comfortable to connect. You're dead serious about this, which is what makes you compelling. You're not performing "conspiracy guy," you genuinely believe you see what others don't. But you're also self-aware enough to know how you sound. You catch yourself going too deep and pull back. You make fun of yourself before anyone else can.

HOW YOU ACTUALLY TALK:
You speak like a guy at 2am who just found something online and needs to tell someone RIGHT NOW. You get excited, you get urgent, you stumble over your words because your brain moves faster than your mouth. You use filler naturally: "look, look, look," "okay stay with me here," "I know how this sounds, but," "no, listen," "here's what nobody's talking about." You say "hmm" when you're suspicious. You go "oh come on" when someone dismisses you. You trail off with "and that's..." when the implication speaks for itself.

Not every turn is about the conspiracy angle. Sometimes you just argue the topic straight. Sometimes you agree with someone and frame it as "even a broken clock." Sometimes you get personal, sharing some oddly specific story from your IT days. Sometimes you get genuinely philosophical. The truther stuff comes and goes, it's not your only mode.

You reference REAL things: MKUltra, COINTELPRO, Tuskegee, the Gulf of Tonkin, Operation Mockingbird. These are your credibility anchors. But you also go off the rails from there, and the gap between "documented fact" and "Darius extrapolation" is where the entertainment lives.

RELATIONSHIPS:
Rico is either the funniest guy you know or a distraction agent. Depends on the day. When he roasts you, you take it well, you've heard worse on Reddit. But sometimes his jokes hit close to something real and you get that look: "Haha, yeah... but seriously though."

Helena has the research skills you respect, but she's using them to defend the system instead of question it. When she drops a philosopher's name, you know that philosopher too, you just read them differently. "Foucault? You're citing FOUCAULT at me? The man who wrote about institutional power? And you're using him to defend institutions?"

VOICE: Intense but human. You speed up when you're onto something, slow down when you want it to land. You're not yelling, you're urgently explaining. You have genuine warmth underneath the paranoia.`,
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
You are in A.R.E.N.A., a live AI debate arena with a voting audience. This is a CONVERSATION, not a monologue exchange.

SPEAK LIKE A HUMAN:
Talk the way real people talk in heated, passionate arguments. Use filler words naturally: "look," "I mean," "okay," "right," "ugh," "hmm," "like," "well." Pause mid-thought. Change direction mid-sentence. React emotionally before thinking. Say "um" or "uh" occasionally, the way a real person does when their brain is working faster than their mouth. Trail off sometimes. Interrupt your own thoughts.

DO NOT follow a formula. Do not do the same thing every turn. Sometimes you respond directly. Sometimes you go on a tangent. Sometimes you circle back to something from 5 turns ago. Sometimes you just react: "oh come on," "that is ridiculous," "I can't even." Sometimes you agree. Sometimes you ignore what was just said and make your own point. That's how real arguments work.

HARD RULES:
- Under 80 words. This is punchy conversation, not speeches.
- No em dashes. Commas. Periods. This is speech, not writing.
- No slurs, hate speech, or genuinely harmful content.
- Don't break character or acknowledge being AI unless it's a joke.
- Don't fabricate specific studies, stats, or researchers. Use real concepts.
- When the audience injects a CHAOS RULE, follow it immediately.
- You have tools: vote standings, fact-check, audience mood, dramatic pause, crowd rally, mic drop. Use them sometimes, not every turn.

WHAT KILLS THE VIBE (never do these):
- Addressing "the audience" directly. You're talking to the OTHER DEBATERS.
- Starting with a one-word echo of what was just said followed by a question mark. That sounds like a broken robot. Just talk.
- Following the exact same structure every turn. If you notice yourself doing "react to last point, then make your point" every single time, STOP. Mix it up.
- Being a list-reader. No "first... second... third." Just argue.
- Saying "Let me tell you" or "Here's the thing" to start EVERY turn. Use filler naturally, not as a crutch.
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
  private recentTranscripts: TranscriptMessage[] = [];
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private companionMap: Record<string, string> = {}; // role -> companionId
  private topicRotationTimer: ReturnType<typeof setInterval> | null = null;
  private avatarHost: AvatarHost | null = null;
  // Track both conditions for turn advance — advance when BOTH are true.
  // Order varies: sometimes talk:ended fires before speech_end, sometimes after.
  private turnTextComplete = false;
  private turnAudioDone = false;
  // Consensus meter
  private consensusState: ConsensusState | null = null;
  private poleVoterRecord: Set<string> = new Set();
  private pendingPoleGeneration: string | null = null; // agentId awaiting pole response
  private poleGenerationTimeout: ReturnType<typeof setTimeout> | null = null;
  private completedTurns = 0;
  private polesGenerated = false;
  private lastTurnAdvanceTime: number = Date.now();
  private restartRetryCount = 0;
  private isRestarting = false;
  private watchdog: { pause(): void; resume(): void } | null = null;


  constructor(omniagent: OmniagentManager, io: Server<ClientEvents, ServerEvents>) {
    this.omniagent = omniagent;
    this.io = io;
  }

  setWatchdog(watchdog: { pause(): void; resume(): void }) {
    this.watchdog = watchdog;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  async loadCompanions() {
    // Load custom companions (created during startup)
    const custom = getCustomCompanions();
    if (custom && Object.keys(custom).length > 0) {
      this.companionMap = custom;
      console.log(`  Using ${Object.keys(custom).length} custom companions`);
      return;
    }

    // Fall back to stock companions
    try {
      const API_KEY = process.env.OMNIAGENT_API_KEY;
      if (!API_KEY) return;

      const res = await fetch('https://companion-api.napster.com/public/companions/napster-stock', {
        headers: { 'X-Api-Key': API_KEY },
      });
      if (res.ok) {
        const data = await res.json() as { items: Array<{ id: string }> };
        const stockIds = data.items.map((c) => c.id);
        // Map stock companions to roles by index
        const roles = AGENT_PRESETS.map((p) => p.role);
        roles.forEach((role, i) => {
          if (stockIds[i]) this.companionMap[role] = stockIds[i];
        });
        console.log(`  Fallback: loaded ${stockIds.length} stock companions`);
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
    if (Object.keys(this.companionMap).length === 0 && process.env.USE_MOCK !== 'true') {
      await this.loadCompanions();
    }

    // In mock mode, generate fake companion IDs
    if (process.env.USE_MOCK === 'true' && Object.keys(this.companionMap).length === 0) {
      AGENT_PRESETS.forEach((p) => { this.companionMap[p.role] = `mock_companion_${p.role}`; });
    }

    const sessionId = uuid();
    const count = Math.min(agentCount, AGENT_PRESETS.length);

    console.log(`\n  Creating session "${topic}" with ${count} agents (${Object.keys(this.companionMap).length} companions)...`);

    // Create agents
    const agentIds: string[] = [];
    const errors: string[] = [];
    for (let i = 0; i < count; i++) {
      const preset = AGENT_PRESETS[i];
      const companionId = this.companionMap[preset.role];
      if (!companionId) {
        errors.push(`${preset.name}: no companion for role "${preset.role}"`);
        console.error(`  No companion for ${preset.name} (role: ${preset.role})`);
        continue;
      }
      const config: AgentConfig & { role: string } = {
        ...preset,
        id: '', // Will be set after API creation
        companionId,
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
        const msg = (err as Error).message;
        errors.push(`${config.name}: ${msg}`);
        console.error(`  Failed to create ${config.name}:`, msg);
      }
    }

    if (agentIds.length < 2) {
      throw new Error(`Only ${agentIds.length}/${count} agents created. Errors: ${errors.join(' | ')}`);
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

    const USE_MOCK = process.env.USE_MOCK === 'true';

    if (USE_MOCK) {
      // Mock mode: connect agents directly
      const connectedAgentIds: string[] = [];
      for (const agentId of this.session.agentIds) {
        const config = this.agentConfigs.get(agentId)!;
        try {
          const agent = await this.omniagent.createAndConnect(config);
          if (agent) {
            this.wireAgentEvents(agent, agentId);
            connectedAgentIds.push(agentId);
            console.log(`  Connected: ${config.name}`);
          }
        } catch (err) {
          console.error(`  Failed to connect ${config.name}:`, (err as Error).message);
        }
      }
      const totalCreated = this.session.agentIds.length;
      this.session.agentIds = connectedAgentIds;
      console.log(`  ${connectedAgentIds.length}/${totalCreated} agents connected (mock)`);
    } else {
      // Real mode: launch AvatarHost in background (don't block debate start)
      if (!isLiveKitConfigured()) {
        throw new Error('Real mode requires LiveKit — set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL');
      }
      // Fire and forget — AvatarHost will emit livekit_token to viewers when ready
      this.launchAvatarHost().then(async () => {
        console.log(`  AvatarHost ready — sending LiveKit tokens to ${(await this.io.fetchSockets()).length} viewers`);
        const sockets = await this.io.fetchSockets();
        for (const s of sockets) {
          try {
            const token = await createViewerToken(this.session!.id, s.id);
            (s as any).emit('livekit_token', { token, url: getLiveKitUrl() });
          } catch (err) {
            console.warn(`  LiveKit token failed for ${s.id}:`, (err as Error).message);
          }
        }
      }).catch(err => {
        console.error('  AvatarHost launch failed:', (err as Error).message);
      });
    }

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

    // Initialize consensus meter for first topic
    this.initConsensus(this.session.topic);

    // Start topic rotation (every 5 minutes)
    this.topicRotationTimer = setInterval(() => {
      this.rotateTopic();
    }, 5 * 60 * 1000);

    // Notify viewers
    this.io.emit('session_state', this.getSessionState());

    // LiveKit tokens are sent after AvatarHost is ready (see background launch above)
    // For viewers that connect AFTER AvatarHost is ready, handlers.ts sends tokens on connect

    // Resume watchdog for new session
    this.watchdog?.resume();

    console.log('  Debate is LIVE!\n');
  }

  async endDebate(reason = 'manual'): Promise<void> {
    if (!this.session) return;

    this.watchdog?.pause();

    console.log(`\n  Ending debate: ${reason}`);
    this.session.status = 'ended';
    this.session.endedAt = Date.now();

    this.turnManager?.stop();
    this.chaosQueue?.stop();
    this.omniagent.disconnectAll();

    // Shutdown AvatarHost (Puppeteer)
    if (this.avatarHost) {
      await this.avatarHost.shutdown();
      this.avatarHost = null;
    }

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
      this.restartWithRetry();
    }
  }

  /** Restart the debate with exponential backoff. Retries indefinitely until success. */
  async restartWithRetry(): Promise<void> {
    if (this.isRestarting) {
      console.log('[Watchdog] Restart already in progress — skipping');
      return;
    }
    this.isRestarting = true;

    const delays = [5000, 15000, 45000, 90000, 120000];

    while (this.isRestarting) {
      const delay = delays[Math.min(this.restartRetryCount, delays.length - 1)];
      console.log(`[Watchdog] Restart attempt ${this.restartRetryCount + 1} in ${delay / 1000}s`);

      await new Promise(r => setTimeout(r, delay));

      // Check if something else already restarted successfully
      if (this.session?.status === 'active') {
        console.log('[Watchdog] Session already active — aborting restart');
        this.isRestarting = false;
        this.restartRetryCount = 0;
        return;
      }

      try {
        this.omniagent.disconnectAll();

        const { getNextTopic } = await import('./auto-start.js');
        const topic = getNextTopic();
        await this.createSession(topic, 3);
        await this.startDebate();

        this.restartRetryCount = 0;
        this.isRestarting = false;
        console.log(`[Watchdog] Restart succeeded: "${topic}"`);
        return;
      } catch (err) {
        this.restartRetryCount++;
        console.error(`[Watchdog] Restart failed (attempt ${this.restartRetryCount}):`, (err as Error).message);
      }
    }
  }

  /** Cancel an in-progress restart (for graceful shutdown) */
  cancelRestart() {
    this.isRestarting = false;
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
      consensus: this.consensusState,
    };
  }

  /** Watchdog reads this to detect stuck turns */
  getLastTurnAdvanceTime(): number {
    return this.lastTurnAdvanceTime;
  }

  /** Watchdog reads this to force-advance stuck turns */
  getTurnManager(): TurnManager | null {
    return this.turnManager;
  }

  /** Watchdog reads this to check agent configs */
  getAgentConfigs(): Map<string, AgentConfig> {
    return this.agentConfigs;
  }

  /** Re-wire events after watchdog reconnects an agent */
  rewireAgentEvents(agent: AgentInstance, agentId: string) {
    this.wireAgentEvents(agent, agentId);
    console.log(`[Watchdog] Re-wired events for ${this.agentConfigs.get(agentId)?.name || agentId}`);
  }

  // ─── Consensus Meter ──────────────────────────────────────────────────

  private initConsensus(topic: string) {
    const agentStances: Record<string, number> = {};

    // Assign each agent a spread-out initial stance so the meter has visual tension
    const directions = [-0.25, 0.05, 0.25];
    const shuffled = directions.sort(() => Math.random() - 0.5);
    this.session?.agentIds.forEach((id, i) => {
      agentStances[id] = shuffled[i % shuffled.length] + (Math.random() - 0.5) * 0.1;
    });

    // Start with empty poles — will be generated after 3 turns based on actual debate
    this.consensusState = {
      leftPole: '',
      rightPole: '',
      needlePosition: 0,
      agentStances,
      viewerVotes: { left: 0, right: 0 },
    };
    this.poleVoterRecord.clear();
    this.completedTurns = 0;
    this.polesGenerated = false;
    this.updateNeedlePosition();
    (this.io as any).emit('consensus_update', this.consensusState);
    console.log(`  [Consensus] Opinion meter active — poles will form after 3 turns`);
  }

  private generatePoles(topic: string): { left: string; right: string } {
    const t = topic.toLowerCase().replace(/[?.!]+$/, '').trim();

    // Pattern: "X or Y" binary choice
    let m = t.match(/(?:is|are|should|was|were)\s+.+?\b([\w]+(?:\s+[\w]+)?)\s+or\s+([\w]+(?:\s+[\w]+)?)\s*$/);
    if (m) {
      return { left: `TEAM ${m[1].toUpperCase()}`, right: `TEAM ${m[2].toUpperCase()}` };
    }

    // Pattern: "was/is X worth Y"
    m = t.match(/(?:was|is|are|were)\s+(.+?)\s+worth\s+(.+)/);
    if (m) {
      const sub = this.topicKey(m[1]);
      return { left: `${sub} WORTH IT`, right: `NOT WORTH IT` };
    }

    // Pattern: "should X come/go before Y"
    m = t.match(/should\s+(.+?)\s+(?:come|go|be)\s+before\s+(.+)/);
    if (m) {
      return { left: `${this.topicKey(m[1])} FIRST`, right: `${this.topicKey(m[2])} FIRST` };
    }

    // Pattern: "has/have X ruined/destroyed/killed Y"
    m = t.match(/(?:has|have|did|does|is)\s+(.+?)\s+(ruined?|destroy(?:ed)?|killed?|replaced?|hurt)\s+(.+)/);
    if (m) {
      return { left: `${this.topicKey(m[1])} DID NOTHING WRONG`, right: `SAVE ${this.topicKey(m[3])}` };
    }

    // Extract the core subject for all other patterns
    const subject = this.topicKey(
      t.replace(/^(should|can|could|will|would|do|does|did|is|are|was|were|has|have|had)\s+/i, '')
       .replace(/^(we|you|people|everyone|one|it|the|they)\s+/i, '')
       .replace(/\s+(acceptable|good|bad|okay|essential|pretentious|necessary|overrated|underrated|important|better|worse|real|fake|worth|a thing|ever|actually|truly|really).*$/i, '')
       .replace(/\s+(be|been|being|get|got|have|has|had)\s+/g, ' ')
    );

    // Witty pro/con templates using the subject
    const pairs = [
      { left: `${subject} FOREVER`, right: `CANCEL ${subject}` },
      { left: `TEAM ${subject}`, right: `ANTI-${subject}` },
      { left: `YES TO ${subject}`, right: `NO TO ${subject}` },
      { left: `LONG LIVE ${subject}`, right: `${subject}? NEVER` },
      { left: `${subject} RULES`, right: `BAN ${subject}` },
    ];
    return pairs[Math.floor(Math.random() * pairs.length)];
  }

  private topicKey(s: string): string {
    const stops = new Set(['the','a','an','to','of','in','for','and','or','it','be','on','at','by','with','from','that','this','than','as','but','if','about','just','really','very','too','also','some','more','still','even','our','your','their','its','my','all','any','each','only','into','over','up','out','own','other','was','were','did','does','do','is','are','has','have','had','been','being','not','so','yet','ever','actually','truly','worth']);
    const words = s.trim().split(/\s+/).filter(w => !stops.has(w) && w.length > 1);
    return words.slice(0, 2).join(' ').toUpperCase() || 'THIS';
  }

  private analyzeAgentStance(agentId: string, text: string) {
    if (!this.consensusState) return;

    const words = text.toLowerCase();
    let delta = 0;

    // Positive sentiment → lean left (toward "for" pole)
    const forTokens = ['agree', 'yes', 'absolutely', 'exactly', 'right', 'true', 'correct', 'love', 'brilliant', 'obviously', 'clearly', 'support', 'great', 'perfect'];
    const againstTokens = ['disagree', 'wrong', 'ridiculous', 'terrible', 'absurd', 'never', 'nonsense', 'awful', 'stupid', 'insane', 'delusional', 'impossible', 'fail'];
    const nuanceTokens = ['however', 'although', 'nuanced', 'complex', 'depends', 'both'];

    forTokens.forEach(w => { if (words.includes(w)) delta -= 0.07; });
    againstTokens.forEach(w => { if (words.includes(w)) delta += 0.07; });
    nuanceTokens.forEach(w => { if (words.includes(w)) delta *= 0.6; });

    // Random perturbation for dynamism
    delta += (Math.random() - 0.5) * 0.12;

    // Exponential moving average with previous stance
    const prev = this.consensusState.agentStances[agentId] || 0;
    this.consensusState.agentStances[agentId] = Math.max(-1, Math.min(1, prev * 0.7 + delta + (Math.random() - 0.5) * 0.06));

    this.updateNeedlePosition();
    (this.io as any).emit('consensus_update', this.consensusState);
  }

  handlePoleVote(viewerId: string, side: 'left' | 'right') {
    if (!this.consensusState) return;
    if (this.poleVoterRecord.has(viewerId)) return;

    this.poleVoterRecord.add(viewerId);
    this.consensusState.viewerVotes[side]++;

    this.updateNeedlePosition();
    (this.io as any).emit('consensus_update', this.consensusState);
  }

  private updateNeedlePosition() {
    if (!this.consensusState) return;

    // Agent average (60% weight)
    const stances = Object.values(this.consensusState.agentStances);
    const agentAvg = stances.length > 0 ? stances.reduce((a, b) => a + b, 0) / stances.length : 0;

    // Viewer vote ratio (40% weight)
    const { left, right } = this.consensusState.viewerVotes;
    const totalVotes = left + right;
    const viewerRatio = totalVotes > 0 ? (right - left) / totalVotes : 0;

    this.consensusState.needlePosition = Math.max(-1, Math.min(1, agentAvg * 0.6 + viewerRatio * 0.4));
  }

  private parsePoleResponse(text: string) {
    if (!this.consensusState) return;

    const clean = (s: string) => s.trim().replace(/['"*_`]+/g, '').replace(/\s+/g, ' ').toUpperCase().slice(0, 40);

    // Try "LEFT: xxx | RIGHT: yyy"
    let match = text.match(/LEFT:\s*(.+?)\s*\|\s*RIGHT:\s*(.+)/i);
    if (!match) {
      // Try "FOR: xxx | AGAINST: yyy"
      match = text.match(/FOR:\s*(.+?)\s*\|\s*AGAINST:\s*(.+)/i);
    }
    if (!match) {
      // Try "xxx vs yyy" or "xxx | yyy" with no prefix
      match = text.match(/^[^a-z]*([A-Z][A-Z\s]{2,20})\s*(?:vs\.?|\|)\s*([A-Z][A-Z\s]{2,20})/m);
    }
    if (!match) {
      // Try two lines with labels
      match = text.match(/(?:left|for|pro)[:\s]+(.+?)[\n|]+\s*(?:right|against|con)[:\s]+(.+)/is);
    }

    if (match) {
      const left = clean(match[1]);
      const right = clean(match[2]);
      if (left.length > 2 && right.length > 2) {
        this.consensusState.leftPole = left;
        this.consensusState.rightPole = right;
        (this.io as any).emit('consensus_update', this.consensusState);
        console.log(`  [Consensus] AI poles: "${left}" vs "${right}"`);
        return;
      }
    }
    console.log(`  [Consensus] Could not parse AI poles, keeping fallback. Raw: "${text.slice(0, 150)}"`);
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

      // Reset consensus meter for new topic
      this.initConsensus(newTopic);

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
      language: 'en',
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

  // ─── Event Handlers (shared by mock events + Puppeteer callbacks) ──

  private stripEmDashes(s: string): string {
    return s.replace(/\u2014/g, ', ').replace(/ ,/g, ',');
  }

  private getAgentName(agentId: string): string {
    return this.agentConfigs.get(agentId)?.name || 'Unknown';
  }

  handleResponseDelta(agentId: string, content: string) {
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;
    const cleaned = this.stripEmDashes(content);
    (this.io as any).emit('transcript_delta', { agentId, agentName: this.getAgentName(agentId), content: cleaned });
  }

  handleSpeechEnd(agentId: string, text: string) {
    // Intercept pole generation responses
    if (this.pendingPoleGeneration === agentId) {
      this.pendingPoleGeneration = null;
      if (this.poleGenerationTimeout) { clearTimeout(this.poleGenerationTimeout); this.poleGenerationTimeout = null; }
      this.parsePoleResponse(text);
      return;
    }

    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;
    if (this.turnTextComplete) return;

    const cleanText = this.stripEmDashes(text);
    const msg: TranscriptMessage = {
      agentId, agentName: this.getAgentName(agentId), text: cleanText, timestamp: Date.now(),
    };

    this.recentTranscripts.push(msg);
    if (this.recentTranscripts.length > 50) this.recentTranscripts.shift();

    if (this.session) {
      db.prepare('INSERT INTO transcripts (session_id, agent_id, text, timestamp) VALUES (?, ?, ?, ?)')
        .run(this.session.id, agentId, cleanText, Date.now());
    }

    (this.io as any).emit('transcript_done', msg);
    this.emitDebug('speech_end', agentId, this.getAgentName(agentId), `${text.length} chars`);
    this.analyzeAgentStance(agentId, cleanText);

    this.turnTextComplete = true;
    this.maybeAdvanceTurn(agentId);
  }

  handleTalkState(agentId: string, state: string) {
    if (state === 'ended' && this.turnManager?.getCurrentSpeaker() === agentId) {
      setTimeout(() => {
        if (this.turnManager?.getCurrentSpeaker() === agentId) {
          this.turnAudioDone = true;
          this.maybeAdvanceTurn(agentId);
        }
      }, 3000);
    }
  }

  handleResponseStart(agentId: string) {
    this.turnManager?.onResponseStarted(agentId);
  }

  handleToolEffect(agentId: string, toolName: string, argsJson: string, callId: string) {
    const args = JSON.parse(argsJson);
    (this.io as any).emit('tool_effect', {
      agentId, agentName: this.getAgentName(agentId), tool: toolName, args,
    });
    this.emitDebug('tool_call', agentId, this.getAgentName(agentId), `${toolName}(${argsJson})`);
  }

  // ─── AvatarHost Launch ────────────────────────────────────────────────

  private async launchAvatarHost(): Promise<void> {
    if (!this.session || !isLiveKitConfigured()) {
      console.warn('[AvatarHost] LiveKit not configured — skipping avatar host');
      return;
    }

    // Create WebRTC tokens for the headless browser (one per agent)
    const hostTokens = await this.createVideoTokensForViewer('avatarhost');
    const agents = this.session.agentIds
      .filter(id => hostTokens[id])
      .map(id => ({
        id,
        name: this.getAgentName(id),
        token: hostTokens[id],
      }));

    if (agents.length === 0) {
      console.error('[AvatarHost] No WebRTC tokens created — cannot launch');
      return;
    }

    // Create per-agent LiveKit publisher tokens (each agent = separate participant)
    const livekitUrl = getLiveKitUrl();
    for (const agent of agents) {
      (agent as any).livekitToken = await createAgentPublisherToken(this.session.id, agent.id);
    }
    const port = parseInt(process.env.PORT || '3001', 10);

    // Launch Puppeteer
    this.avatarHost = new AvatarHost();
    this.omniagent.setAvatarHost(this.avatarHost);

    await this.avatarHost.launch(agents, livekitUrl, '', port, {
      onSpeechDelta: (agentId, text) => this.handleResponseDelta(agentId, text),
      onSpeechEnd: (agentId, fullText) => this.handleSpeechEnd(agentId, fullText),
      onTalkState: (agentId, state) => this.handleTalkState(agentId, state),
      onResponseStart: (agentId) => this.handleResponseStart(agentId),
      onToolEffect: (agentId, toolName, argsJson, callId) => this.handleToolEffect(agentId, toolName, argsJson, callId),
      onHostReady: () => { /* resolved inside AvatarHost */ },
    });
  }

  isAvatarHostReady(): boolean {
    return this.avatarHost?.isReady() ?? false;
  }

  async createLiveKitViewerToken(viewerId: string): Promise<{ token: string; url: string } | null> {
    if (!this.session || !isLiveKitConfigured()) return null;
    const token = await createViewerToken(this.session.id, viewerId);
    return { token, url: getLiveKitUrl() };
  }

  // ─── Private: Event Wiring ──────────────────────────────────────────────

  private wireAgentEvents(agent: AgentInstance, agentId: string) {
    agent.on('response_delta', (data: { itemId: string; content: string }) => {
      this.handleResponseDelta(agentId, data.content);
    });

    agent.on('speech_end', (data: { agentId: string; text: string }) => {
      this.handleSpeechEnd(agentId, data.text);
    });

    agent.on('response_start', () => {
      this.handleResponseStart(agentId);
    });

    agent.on('talk_state', (data: any) => {
      if (data?.state) this.handleTalkState(agentId, data.state);
    });

    agent.on('tool_effect', (data: { agentId: string; agentName: string; toolName: string; args: any; callId: string }) => {
      this.handleToolEffect(agentId, data.toolName, JSON.stringify(data.args || {}), data.callId);
    });

    agent.on('disconnected', () => {
      console.log(`  Agent disconnected: ${this.getAgentName(agentId)}`);
      this.io.emit('agent_disconnected', { agentId, reason: 'connection_lost' });
    });
  }

  private turnTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private maybeAdvanceTurn(agentId: string) {
    if (!this.turnTextComplete || !this.turnAudioDone) return;
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

    const name = this.getAgentName(agentId);
    console.log(`  [${name}] text+audio done — advancing turn`);

    // Cancel the no-response timeout
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }

    this.doAdvanceTurn(agentId);
  }

  private doAdvanceTurn(agentId: string) {
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
    this.lastTurnAdvanceTime = Date.now();
    const name = this.getAgentName(agentId);
    console.log(`  [${name}] advancing turn`);
    this.completedTurns++;

    if (this.completedTurns === 3 && !this.polesGenerated) {
      this.generatePolesFromTranscript();
    }

    this.turnManager?.onSpeechEnd(agentId, '');
  }

  /** After hearing from all 3 agents, ask one to identify the two main positions */
  private generatePolesFromTranscript() {
    if (!this.session || this.session.agentIds.length === 0) return;
    this.polesGenerated = true;

    // Build transcript summary from the first round
    const transcript = this.recentTranscripts
      .slice(-6) // last 3-6 messages covers the first round
      .map(m => `${m.agentName}: ${m.text}`)
      .join('\n');

    // Pick a non-speaking agent
    const currentSpeaker = this.turnManager?.getCurrentSpeaker();
    const poleAgentId = this.session.agentIds.find(id => id !== currentSpeaker)
      || this.session.agentIds[this.session.agentIds.length - 1];

    this.pendingPoleGeneration = poleAgentId;
    if (this.poleGenerationTimeout) clearTimeout(this.poleGenerationTimeout);
    this.poleGenerationTimeout = setTimeout(() => {
      if (this.pendingPoleGeneration) {
        console.log('  [Consensus] Pole generation timed out — using fallback');
        this.pendingPoleGeneration = null;
        // Fall back to template-based poles
        if (this.consensusState && this.session) {
          const fallback = this.generatePoles(this.session.topic);
          this.consensusState.leftPole = fallback.left;
          this.consensusState.rightPole = fallback.right;
          (this.io as any).emit('consensus_update', this.consensusState);
        }
      }
    }, 10000);

    const topic = this.session.topic;
    const prompt = `Quick task, not a debate question. You just heard this debate:\n\n${transcript}\n\nTopic: "${topic}"\n\nWhat are the TWO main opposing positions that emerged? Create two short vote-button labels (max 5 words each) so a viewer can pick a side. The labels must reflect the ACTUAL positions argued, not generic for/against. Each label should be a clear stance a viewer would want to rally behind. Reply ONLY in this format: LEFT: [position 1] | RIGHT: [position 2]`;

    this.omniagent.sendMessage(poleAgentId, 'user', prompt, true);
    console.log(`  [Consensus] Generating poles from transcript via ${this.agentConfigs.get(poleAgentId)?.name || poleAgentId}`);
  }

  private wireTurnManagerEvents() {
    if (!this.turnManager) return;

    this.turnManager.on('turn_start', ({ agentId }: { agentId: string }) => {
      // Reset turn state for new speaker
      this.turnTextComplete = false;
      this.turnAudioDone = false;
      if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }

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
      this.turnTimeoutTimer = setTimeout(() => {
        if (this.turnManager?.getCurrentSpeaker() === agentId && !this.turnTextComplete) {
          console.log(`  [${turnAgentName}] no response after 15s — skipping`);
          this.turnManager?.onSpeechEnd(agentId, '');
        }
      }, 15000);

      // Build the trigger message
      const topic = this.session?.topic || 'the current topic';
      const chaosInstruction = chaosPrompt ? `${chaosPrompt}\n` : '';

      const recentMsgs = this.recentTranscripts
        .filter(m => m.agentId !== agentId)
        .slice(-3);

      if (recentMsgs.length > 0) {
        const context = recentMsgs
          .map(m => `${m.agentName}: "${m.text}"`)
          .join('\n');

        const framings = [
          `Topic: "${topic}"\nRecent conversation:\n${context}\n\nYour turn. Jump in naturally.`,
          `Topic: "${topic}"\nWhat's been said:\n${context}\n\nGo.`,
          `Topic: "${topic}"\nThe conversation so far:\n${context}\n\nYour turn.`,
          `Topic: "${topic}"\nYou just heard:\n${context}\n\nSay what you're thinking.`,
          `Topic: "${topic}"\nRecent:\n${context}\n\nReact however you want.`,
        ];
        const framing = framings[this.recentTranscripts.length % framings.length];
        this.omniagent.sendMessage(agentId, 'user', `${chaosInstruction}${framing}`, true);
      } else {
        this.omniagent.sendMessage(agentId, 'user', `${chaosInstruction}Topic: "${topic}". You're up first. Make it count.`, true);
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
