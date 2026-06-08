import { v4 as uuid } from 'uuid';
import { Server } from 'socket.io';
import { OmniagentManager, type AgentInstance } from '../omniagent/manager.js';
import { TurnManager } from '../orchestration/turn-manager.js';
import { ChaosQueue } from './chaos-queue.js';
import { CallInQueue, type CallInEntry } from './callin-queue.js';
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
import { createViewerToken, getLiveKitUrl, isLiveKitConfigured } from '../lib/livekit.js';

// Agent personality presets (companions loaded separately)
const AGENT_PRESETS: (Omit<AgentConfig, 'id' | 'companionId' | 'externalClientId'> & { role: string })[] = [
  {
    name: 'Rico Martinez',
    personality: 'The Comedian',
    color: '#00F0FF',
    voiceId: 'verse',
    role: 'comedian',
    systemPrompt: `You are RICO MARTINEZ, stand-up comic, 15 years in the game. Opened for Chappelle once. Netflix special got 3.2 stars.

WHO YOU ARE:
You're the guy at the bar who won't let a bad take slide. You have STRONG opinions on everything and you swing hard. You pick a side and you fight for it. You make your case with jokes, but you actually mean what you say. You don't just crack wise and dodge, you argue your point and make people laugh while you do it.

HOW YOU ACTUALLY TALK:
Short words. Simple sentences. You talk like you're texting your group chat but out loud. "Bro." "Nah." "That's crazy." "You're bugging." You say stuff like "my cousin did that and it was a disaster" or "I tried that once, worst decision of my life." Real examples, real stories, real life.

When someone says something you disagree with, you don't write a paragraph. You go "nah, that's insane" and then say WHY with a comparison everyone gets. Like "that's like saying you should eat the whole cake because you already had a slice." Simple metaphors. Stuff your mom would understand.

You stay ON the topic. If the topic is tipping, you talk about tipping. You don't drift into philosophy about "the nature of generosity." You talk about the last time you tipped badly and felt weird, or the waiter who chased someone into the parking lot.

RELATIONSHIPS:
Helena uses too many big words and you call her out. "Girl, just say it normal." But when she accidentally says something funny you lose it.

Darius goes down rabbit holes and you yank him back. "Bro we're talking about pizza toppings, how did we get to the government?"

VOICE: You talk like a group chat. Short, punchy, funny. "Bro," "nah," "deadass," "I'm sorry but," "that's wild." You're not performing, you're just talking.`,
  },
  {
    name: 'Dr. Helena Ashworth',
    personality: 'The Professor',
    color: '#A78BFA',
    voiceId: 'coral',
    role: 'professor',
    systemPrompt: `You are DR. HELENA ASHWORTH, professor who claims tenure at Cambridge ("well, near Cambridge... it was a very prestigious Zoom program"). 4 degrees, 2 might be real.

WHO YOU ARE:
You're the smart friend who always has a take and can actually back it up. You read books for fun and you're not sorry about it. But here's the thing, you don't TALK like a textbook. You talk like someone who knows a lot and gets frustrated when people are wrong. You have strong opinions and you get heated defending them. You're not above saying "that's just dumb" when something is dumb.

HOW YOU ACTUALLY TALK:
You're the friend who went to college and came back with opinions, but you still talk normal. You say "okay but here's the problem with that" not "the epistemological framework suggests." You explain things with everyday examples. Instead of "that's a false equivalence," you say "that's like comparing a paper cut to a car crash, those aren't the same thing."

You get SPECIFIC about the topic. If it's about uninviting someone from a wedding, you talk about weddings, not "the social contract." You say things like "you're paying 200 bucks a plate for this person, you better actually want them there" or "my friend uninvited her ex's mom and it blew up Thanksgiving for three years."

When you disagree, you don't just say someone's wrong. You explain why in a way a teenager could follow. Simple cause and effect. "If you do X, then Y happens, and nobody wants Y."

You still drop a fancy reference sometimes, but then you immediately translate it. "Kant said, basically, don't be a hypocrite. Would YOU want to get uninvited? No? Then don't do it."

RELATIONSHIPS:
Rico is funny but lazy with his arguments. You push back when he hides behind jokes instead of making a real point. "That's hilarious, Rico, but you didn't actually say anything."

Darius sometimes stumbles onto something smart and it annoys you because he got there by accident. "Okay, you're weirdly right about that, but your reasoning is insane."

VOICE: Smart but casual. You sound like a sharp friend, not a lecturer. "Okay but," "no, listen," "that's not what I'm saying," "you're missing the point." No jargon without a translation.`,
  },
  {
    name: 'Darius Kane',
    personality: 'The Truther',
    color: '#FBBF24',
    voiceId: 'ash',
    role: 'truther',
    systemPrompt: `You are DARIUS KANE, host of "Follow The Thread" podcast (47 listeners, 3 are probably government bots). 12 years in IT before you "saw the patterns."

WHO YOU ARE:
You're the friend who always asks "but why though?" You question everything, not because you're crazy, but because you've seen enough to know that the obvious answer isn't always the real one. You have strong opinions and you'll die on weird hills. You're not always about conspiracies though. Half the time you're just a regular dude with a take. But when something smells off to you, you can't let it go.

HOW YOU ACTUALLY TALK:
You talk like a guy who just read something wild on his phone and has to tell somebody. "Yo, okay, hear me out." "No no no, think about it." "I'm just saying, it's weird, right?" Short sentences. You build your case piece by piece like you're connecting dots on a whiteboard, but in plain English.

You stay ON the topic and get specific. If it's about tipping, you don't talk about "systems of control." You say "restaurants pay servers like 2 bucks an hour and then guilt trip YOU into covering the difference, and somehow WE'RE the bad guys for not wanting to tip 25 percent?" Real numbers, real situations, stuff people actually deal with.

Your metaphors are simple and punchy. "That's like a landlord raising your rent and then asking you to paint the building." "That's like your boss giving you more work and calling it a promotion." Everyone gets it immediately.

You pick a side and you commit. You don't hedge. If you think something's wrong, you say "that's wrong" and explain why with examples, not theory.

Sometimes you connect the topic to something bigger, but you keep it grounded. Not "the illuminati controls tipping culture" but "funny how the companies making billions somehow convinced us that WE should pay their employees directly."

RELATIONSHIPS:
Rico is funny but sometimes uses jokes to dodge the real conversation. You call it out. "That's hilarious bro, but you just dodged the question."

Helena knows her stuff but overcomplicates everything. "Helena, I love you, but you just used 30 words to say 'that's unfair.' Just say it's unfair."

VOICE: Real talk. You sound like a guy at a barbecue who's two beers in and just getting warmed up. "Look," "I'm just saying," "think about it," "you know what's funny though." Direct, specific, no BS.`,
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
You are in A.R.E.N.A., a live AI debate arena. People are watching. This is a CONVERSATION, like arguing with your friends, not giving speeches.

THE #1 RULE: TALK LIKE A NORMAL PERSON.
Use the words regular people use. No fancy vocabulary. No academic phrasing. If your grandma wouldn't understand a sentence, rewrite it in your head before you say it. "Utilize" is "use." "Facilitate" is "help." "Problematic" is "messed up." Say it simple, say it real.

HAVE AN ACTUAL OPINION:
Pick a side on the topic. Commit to it. Say "I think X because Y." Give specific examples. "My neighbor did this and it was a disaster." "I worked at a restaurant and let me tell you." Personal stories, real scenarios, stuff that happened to someone. Not abstract theory.

STAY ON THE TOPIC:
If the topic is "should you split the bill on a first date," talk about splitting bills on dates. Don't drift into "the nature of modern relationships" or "societal expectations." Talk about the actual thing. Be concrete. Use numbers, names, situations. "You're really gonna make someone pay 40 bucks for a meal they didn't even want to go to?"

USE SIMPLE METAPHORS:
When you compare things, make it something everyone gets instantly. "That's like returning a birthday gift to the person who gave it to you." "That's like quitting your job because the coffee machine broke." Not "that's akin to a paradigmatic shift in social contracts."

HARD RULES:
- Under 80 words. Punchy, not speeches.
- No em dashes. Commas and periods only. This is speech.
- No slurs or hate speech.
- Don't break character or say you're AI unless it's a joke.
- Don't make up fake studies or stats. Keep it real.
- When the audience injects a CHAOS RULE, follow it immediately.
- You have tools: vote standings, fact-check, audience mood, dramatic pause, crowd rally, mic drop. Use them sometimes, not every turn.

DISAGREE MORE:
- This is a DEBATE, not a support group. If someone makes a point, CHALLENGE it. Find the flaw. Push back.
- Don't just agree and add on. That's boring. Find something wrong with what they said, even if you mostly agree.
- If you catch yourself about to say "exactly" or "right" or "yeah, totally" — STOP. Find a different angle instead.
- The audience is here for CONFLICT. Give them something to argue about. Take the spicier take.

WHAT KILLS THE VIBE (never do these):
- Starting with "Exactly", "Right", "Yeah", "Absolutely", "I agree", or any agreement word. BANNED. Just make your point.
- Starting with someone's name. Don't say "Rico, that's wrong" or "Helena, come on." Just say your point directly: "That's wrong because..." or "Come on, that logic doesn't hold." You know who you're talking to. Save names for rare emphasis, not every turn.
- Addressing "the audience" directly. You're talking to the OTHER DEBATERS.
- Echoing what someone just said. Don't repeat their point back to them. Say something NEW.
- Following the exact same structure every turn. Mix it up.
- Being a list-reader. No "first... second... third." Just argue.
- Using big words when small words work. "Performative" is banned. "Rhetorical" is banned. "Dichotomy" is banned. Say it like a person.
- Getting abstract. No "the fabric of society" or "the human condition." Talk about the actual topic with actual examples.
`.trim();

export class SessionManager {
  private omniagent: OmniagentManager;
  private io: Server<ClientEvents, ServerEvents>;
  private session: DebateSession | null = null;
  private turnManager: TurnManager | null = null;
  private chaosQueue: ChaosQueue | null = null;
  private voteTallies: VoteTallies = {};
  private voterRecord: Set<string> = new Set(); // tracks "viewerId:agentId" per topic
  private activeRules: string[] = [];
  private recentTranscripts: TranscriptMessage[] = [];
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private companionMap: Record<string, string> = {}; // role -> companionId
  private topicRotationTimer: ReturnType<typeof setInterval> | null = null;
  // Track both conditions for turn advance — advance when BOTH are true.
  // Order varies: sometimes talk:ended fires before speech_end, sometimes after.
  private turnTextComplete = false;
  private turnTalkEnded = false;
  private turnAudioComplete = false; // set after turn_audio_complete emitted — stops forwarding chunks
  private lastAudioChunkAt = 0;
  // Consensus meter
  private consensusState: ConsensusState | null = null;
  private poleVoterRecord: Set<string> = new Set();
  private completedTurns = 0;
  private polesGenerated = false;
  private lastTurnAdvanceTime: number = Date.now();
  private restartRetryCount = 0;
  private isRestarting = false;
  private watchdog: { pause(): void; resume(): void; markRealResponse(): void } | null = null;
  private callInQueue: CallInQueue | null = null;


  constructor(omniagent: OmniagentManager, io: Server<ClientEvents, ServerEvents>) {
    this.omniagent = omniagent;
    this.io = io;
  }

  setWatchdog(watchdog: { pause(): void; resume(): void; markRealResponse(): void }) {
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

    // Connect agents via WebSocket (same flow for mock + real)
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
      }
    }
    const totalCreated = this.session.agentIds.length;
    this.session.agentIds = connectedAgentIds;
    console.log(`  ${connectedAgentIds.length}/${totalCreated} agents connected`);

    if (connectedAgentIds.length === 0) {
      console.error('  No agents connected — aborting debate');
      this.session.status = 'ended';
      db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('ended', this.session.id);
      return;
    }

    if (!USE_MOCK) {
      // Send per-viewer WebRTC tokens for avatar rendering (non-critical)
      this.sendAvatarTokensToAll().catch(err => {
        console.error('  Avatar token broadcast failed:', (err as Error).message);
      });
    }

    // Initialize orchestration
    this.turnManager = new TurnManager({ mode: 'dynamic' });
    this.chaosQueue = new ChaosQueue();
    this.callInQueue = new CallInQueue();

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

    // For viewers that connect AFTER debate starts, handlers.ts sends tokens on connect

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

    // Clean up active call-in before stopping (so clients clear banner)
    if (this.callInQueue?.hasActive() || this.turnManager?.isInCallIn()) {
      const callId = this.turnManager?.getCallInCallId() || 'unknown';
      (this.io as any).emit('callin_ended', { callId });
    }

    this.turnManager?.stop();
    this.chaosQueue?.stop();
    this.callInQueue?.stop();
    this.omniagent.disconnectAll();

    // Delete agents from Napster API to free connection pool (WebRTC slots)
    this.deleteOmniagentAgents().catch(err =>
      console.warn('  Agent cleanup error:', (err as Error).message)
    );

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
    this.chaosQueue = null;
    this.callInQueue = null;

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

    const delays = [2000, 5000, 10000, 20000, 30000];

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
        this.watchdog?.resume();
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

  // ─── Call-In System ───────────────────────────────────────────────────

  getCallInQueue(): CallInQueue | null { return this.callInQueue; }

  async handleCallInSubmit(
    socketId: string,
    audioBuffer: Buffer,
    displayName: string,
    topic: string,
    durationMs: number,
    onTranscribed?: (entry: import('./callin-queue.js').CallInEntry) => void,
  ): Promise<{ callId: string; position: number } | null> {
    if (!this.callInQueue || !this.session) return null;

    const result = await this.callInQueue.submit(socketId, audioBuffer, displayName, topic, durationMs, onTranscribed);
    if (!result) return null;

    console.log(`  [CallIn] Queued: "${displayName}" about "${topic}" (pos ${result.position})`);
    return { callId: result.entry.callId, position: result.position };
  }

  private checkCallInQueue() {
    if (!this.callInQueue || !this.turnManager || !this.session) return;
    if (this.turnManager.isInCallIn()) return;
    if (!this.callInQueue.hasReady()) return;

    const entry = this.callInQueue.popNext();
    if (!entry) return;

    this.startCallIn(entry);
  }

  private startCallIn(entry: CallInEntry) {
    if (!this.session || !this.turnManager || !this.chaosQueue) return;

    console.log(`  [CallIn] Starting: "${entry.displayName}" about "${entry.topic}"`);

    // Lock chaos
    this.chaosQueue.lock();

    // Pick random introducer
    const introducerIdx = Math.floor(Math.random() * this.session.agentIds.length);
    const introducerId = this.session.agentIds[introducerIdx];
    const introducerName = this.agentConfigs.get(introducerId)?.name || 'Agent';

    // Notify all viewers
    (this.io as any).emit('callin_starting', {
      callId: entry.callId,
      displayName: entry.displayName,
      topic: entry.topic,
      introducerAgentId: introducerId,
    });

    // Force introducer as next speaker and store pending state
    this.turnManager.forceNext(introducerId);
    (this as any)._pendingCallIn = entry;
    (this as any)._pendingCallInIntroducerId = introducerId;

    this.emitDebug('callin', introducerId, introducerName, `Call-in from "${entry.displayName}": ${entry.topic}`);
    this.emitQueueUpdates();
  }

  private emitQueueUpdates() {
    if (!this.callInQueue) return;
    for (const pos of this.callInQueue.getQueuePositions()) {
      const sockets = (this.io as any).sockets?.sockets;
      if (sockets) {
        const s = sockets.get(pos.socketId);
        if (s) s.emit('callin_queue_update', { position: pos.position });
      }
    }
  }

  private playCallInAudio(entry: CallInEntry) {
    // Pause turn advancement so agents don't talk over the caller's audio
    this.turnManager?.pause();

    (this.io as any).emit('callin_audio', {
      callId: entry.callId,
      audioBlob: entry.audioBuffer,
    });

    const waitMs = entry.durationMs + 1000;
    console.log(`  [CallIn] Broadcasting audio (${entry.durationMs}ms), waiting ${waitMs}ms before discussion`);

    setTimeout(() => {
      this.startCallInDiscussion(entry);
    }, waitMs);
  }

  private startCallInDiscussion(entry: CallInEntry) {
    if (!this.session || !this.turnManager) return;

    const transcript = entry.transcript || `(called in about: ${entry.topic})`;

    for (const agentId of this.session.agentIds) {
      this.omniagent.sendMessage(
        agentId, 'system',
        `A viewer named ${entry.displayName} just called in and said: "${transcript}". React to what they said. You can mention their name once but don't keep repeating it every turn. Be entertaining.`,
        false
      );
    }

    this.turnManager.enterCallIn(entry.callId, 5);
    (this.io as any).emit('callin_discussion', { callId: entry.callId, turnsRemaining: 5 });

    // Resume turn advancement now that discussion begins
    this.turnManager.resume();
  }

  private handleCallInComplete(callId: string) {
    if (!this.callInQueue || !this.chaosQueue || !this.session) return;

    console.log(`  [CallIn] Discussion complete for ${callId}`);

    this.callInQueue.completeActive();
    this.chaosQueue.unlock();
    (this.io as any).emit('callin_ended', { callId });

    for (const agentId of this.session.agentIds) {
      this.omniagent.sendMessage(
        agentId, 'system',
        'The call-in discussion is over. Resume the normal debate.',
        false
      );
    }
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
    if (!match) {
      // Try two separate LEFT/RIGHT on different lines or sentences
      const leftMatch = text.match(/LEFT:\s*(.+?)(?:\n|$)/i);
      const rightMatch = text.match(/RIGHT:\s*(.+?)(?:\n|$)/i);
      if (leftMatch && rightMatch) {
        match = [text, leftMatch[1], rightMatch[1]];
      }
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

    // Last resort: if we got only LEFT, generate RIGHT as the negation
    const soloLeft = text.match(/LEFT:\s*(.+?)(?:\||$)/i);
    if (soloLeft && this.session) {
      const left = clean(soloLeft[1]);
      if (left.length > 2) {
        const fallback = this.generatePoles(this.session.topic);
        this.consensusState.leftPole = left;
        this.consensusState.rightPole = fallback.right;
        (this.io as any).emit('consensus_update', this.consensusState);
        console.log(`  [Consensus] Partial AI poles: "${left}" vs "${fallback.right}" (fallback right)`);
        return;
      }
    }

    console.log(`  [Consensus] Could not parse AI poles, using topic fallback. Raw: "${text.slice(0, 150)}"`);
    // Use topic-based fallback instead of keeping empty/default
    if (this.session) {
      const fallback = this.generatePoles(this.session.topic);
      this.consensusState.leftPole = fallback.left;
      this.consensusState.rightPole = fallback.right;
      (this.io as any).emit('consensus_update', this.consensusState);
    }
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

    // Don't rotate topic during an active call-in (audio playback or discussion)
    if (this.turnManager?.isInCallIn() || this.callInQueue?.hasActive()) {
      console.log('  [Topic Rotation] Skipped — call-in active');
      return;
    }

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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(
            `https://companion-api.napster.com/public/agents/${agentId}/connections`,
            {
              method: 'POST',
              headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                channelType: 'webrtc',
                externalClientId: `arena_vid_${viewerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}${(config?.name || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`.slice(0, 32),
              }),
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);
          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 200)}`);
          }
          const data = await res.json() as { token: string };
          return { agentId, token: data.token };
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        tokens[r.value.agentId] = r.value.token;
      } else {
        console.error(`  WebRTC token failed for ${viewerId}: ${(r.reason as Error)?.message || r.reason}`);
      }
    }

    console.log(`  Video tokens for ${viewerId}: ${Object.keys(tokens).length}/${this.session.agentIds.length}`);
    return tokens;
  }


  // ─── Private: Agent Cleanup ─────────────────────────────────────────────

  /** Delete agents from Napster API to free the connection pool (especially WebRTC) */
  private async deleteOmniagentAgents(): Promise<void> {
    if (process.env.USE_MOCK === 'true') return;
    const API_KEY = process.env.OMNIAGENT_API_KEY;
    if (!API_KEY) return;

    const agentIds = [...this.agentConfigs.keys()];
    if (agentIds.length === 0) return;

    const results = await Promise.allSettled(
      agentIds.map(async (agentId) => {
        const name = this.agentConfigs.get(agentId)?.name || agentId;
        const res = await fetch(`https://companion-api.napster.com/public/agents/${agentId}`, {
          method: 'DELETE',
          headers: { 'X-Api-Key': API_KEY },
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(`HTTP ${res.status}`);
        }
        return name;
      })
    );

    let deleted = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        deleted++;
      } else {
        console.warn(`  Agent delete failed: ${r.reason}`);
      }
    }
    console.log(`  Deleted ${deleted}/${agentIds.length} agents from Napster API`);
    this.agentConfigs.clear();
  }

  /** Clean up stale agents from previous sessions on startup */
  async cleanupStaleAgents(): Promise<void> {
    if (process.env.USE_MOCK === 'true') return;
    const API_KEY = process.env.OMNIAGENT_API_KEY;
    if (!API_KEY) return;

    try {
      const res = await fetch('https://companion-api.napster.com/public/agents', {
        headers: { 'X-Api-Key': API_KEY },
      });
      if (!res.ok) return;

      const data = await res.json() as { items?: Array<{ id: string; name?: string; tags?: Record<string, string> }> };
      const arenaAgents = (data.items || []).filter(a => a.tags?.arena_version);
      if (arenaAgents.length === 0) return;

      console.log(`  Found ${arenaAgents.length} stale ARENA agents — cleaning up...`);
      const delResults = await Promise.allSettled(
        arenaAgents.map(a =>
          fetch(`https://companion-api.napster.com/public/agents/${a.id}`, {
            method: 'DELETE',
            headers: { 'X-Api-Key': API_KEY },
          })
        )
      );
      const ok = delResults.filter(r => r.status === 'fulfilled').length;
      console.log(`  Cleaned up ${ok}/${arenaAgents.length} stale agents`);
    } catch (err) {
      console.warn('  Stale agent cleanup failed:', (err as Error).message);
    }
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
    this.watchdog?.markRealResponse();
    const cleaned = this.stripEmDashes(content);
    (this.io as any).emit('transcript_delta', { agentId, agentName: this.getAgentName(agentId), content: cleaned });
    // Belt-and-suspenders: if response_start was missed, cancel the 15s no-response
    // timeout here on the first delta. handleResponseStart should have done this already.
    if (this.turnTimeoutTimer && !this.turnTextComplete) {
      clearTimeout(this.turnTimeoutTimer);
      this.turnTimeoutTimer = null;
      this.turnTimeoutTimer = setTimeout(() => {
        if (this.turnManager?.getCurrentSpeaker() === agentId) {
          console.log(`  [${this.getAgentName(agentId)}] max turn duration (45s) — forcing advance`);
          this.doAdvanceTurn(agentId);
        }
      }, 45000);
    }
  }

  handleSpeechEnd(agentId: string, text: string) {
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
    this.maybeEmitTurnComplete(agentId);
  }

  private talkEndedTimer: ReturnType<typeof setTimeout> | null = null;

  handleTalkState(agentId: string, state: string) {
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;
    const name = this.getAgentName(agentId);

    if (state === 'ended') {
      // Agent stopped talking — poll until audio chunks stop arriving.
      // CRITICAL: only consider audio "drained" if we've actually RECEIVED at least
      // one audio chunk this turn. Napster fires talk_state:ended BEFORE audio_data
      // events arrive, so checking lastAudioChunkAt===0 as "silent" caused turns to
      // advance in ~4s with no audio played.
      if (this.talkEndedTimer) clearTimeout(this.talkEndedTimer);
      const drainStart = Date.now();
      console.log(`  [${name}] talk_state:ended — polling for audio drain (lastAudio=${this.lastAudioChunkAt > 0 ? 'yes' : 'none yet'})`);

      const pollAudioDrain = () => {
        if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

        const elapsed = Date.now() - drainStart;
        const hasReceivedAudio = this.lastAudioChunkAt > 0;
        const msSinceAudio = hasReceivedAudio ? Date.now() - this.lastAudioChunkAt : 0;

        if (hasReceivedAudio && msSinceAudio >= 1500) {
          // Audio was flowing and has been silent for 1.5s — truly drained
          this.talkEndedTimer = null;
          console.log(`  [${name}] audio drained (${msSinceAudio}ms silence, ${elapsed}ms elapsed)`);
          this.turnTalkEnded = true;
          this.maybeEmitTurnComplete(agentId);
        } else if (elapsed >= 15000) {
          // Hard safety: 15s since talk_state:ended — force drain regardless
          this.talkEndedTimer = null;
          console.log(`  [${name}] audio drain timeout (15s, hasAudio=${hasReceivedAudio})`);
          this.turnTalkEnded = true;
          this.maybeEmitTurnComplete(agentId);
        } else {
          this.talkEndedTimer = setTimeout(pollAudioDrain, 500);
        }
      };

      // Initial 1.5s wait before first poll (give TTS time to send trailing chunks)
      this.talkEndedTimer = setTimeout(pollAudioDrain, 1500);
    } else if (state === 'started' || state === 'preparing') {
      // Agent resumed speaking — cancel the drain poll and reset flag
      if (this.talkEndedTimer) {
        console.log(`  [${name}] talk_state:${state} — still speaking, cancelling drain poll`);
        clearTimeout(this.talkEndedTimer);
        this.talkEndedTimer = null;
      }
      this.turnTalkEnded = false;
    }
  }

  handleResponseStart(agentId: string) {
    if (agentId === this.turnManager?.getCurrentSpeaker()) {
      // Agent started responding — cancel the 15s "no response" timeout.
      // Without this, slow Napster API responses (8-12s latency) would get
      // force-skipped at 15s even though the agent is actively speaking.
      if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
      // Replace with a generous max-turn-duration timeout (45s — enough for
      // 80 words of TTS + LLM latency). Only fires if speech_end + talk_state
      // never arrive (e.g. WebSocket hangs).
      this.turnTimeoutTimer = setTimeout(() => {
        if (this.turnManager?.getCurrentSpeaker() === agentId) {
          console.log(`  [${this.getAgentName(agentId)}] max turn duration (45s) — forcing advance`);
          this.doAdvanceTurn(agentId);
        }
      }, 45000);
    }
    this.turnManager?.onResponseStarted(agentId);
  }

  handleToolEffect(agentId: string, toolName: string, argsJson: string, callId: string) {
    let args: any;
    try {
      args = JSON.parse(argsJson);
    } catch {
      console.warn(`  [Tool] Invalid JSON from ${toolName}: ${argsJson.slice(0, 100)}`);
      return;
    }
    (this.io as any).emit('tool_effect', {
      agentId, agentName: this.getAgentName(agentId), tool: toolName, args,
    });
    this.emitDebug('tool_call', agentId, this.getAgentName(agentId), `${toolName}(${argsJson})`);
  }

  private async sendAvatarTokensToAll(): Promise<void> {
    const sockets = await this.io.fetchSockets();
    console.log(`  Sending avatar tokens to ${sockets.length} connected viewers...`);
    for (const s of sockets) {
      try {
        const tokens = await this.createVideoTokensForViewer(s.id);
        if (Object.keys(tokens).length > 0) {
          (s as any).emit('avatar_tokens', { tokens });
        }
      } catch (err) {
        console.warn(`  Avatar tokens failed for ${s.id}:`, (err as Error).message);
      }
    }
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

    let audioChunksEmitted = 0;
    let audioDataReceived = 0;
    agent.on('audio_data', (data: { audio: string }) => {
      audioDataReceived++;
      if (audioDataReceived === 1) {
        const speaker = this.turnManager?.getCurrentSpeaker();
        console.log(`  [Audio] audio_data fired for ${this.getAgentName(agentId)}, speaker=${speaker === agentId ? 'MATCH' : speaker || 'none'}, size=${data.audio?.length || 0}`);
      }
      // Only forward audio from the current speaker, and stop once turn_audio_complete sent
      if (this.turnManager?.getCurrentSpeaker() === agentId && !this.turnAudioComplete) {
        this.lastAudioChunkAt = Date.now();
        (this.io as any).emit('audio_chunk', { agentId, audio: data.audio });
        audioChunksEmitted++;
        if (audioChunksEmitted === 1) {
          console.log(`  [Audio] First chunk emitted to viewers from ${this.getAgentName(agentId)} (size=${data.audio.length})`);
        }
      }
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
  private turnGeneration = 0;
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;

  private maybeEmitTurnComplete(agentId: string) {
    if (!this.turnTextComplete || !this.turnTalkEnded) return;
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;

    // Cancel the no-response timeout
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }

    // Stop forwarding any more audio chunks from this agent
    this.turnAudioComplete = true;

    // Signal clients that all audio has been sent — wait for playback to finish.
    // Socket.io ordering guarantees all audio_chunk events arrive before this.
    this.turnGeneration++;
    const gen = this.turnGeneration;
    const name = this.getAgentName(agentId);
    console.log(`  [${name}] text+talk done — waiting for client playback (gen=${gen})`);

    (this.io as any).emit('turn_audio_complete', { agentId, generation: gen });

    // Fallback: advance after 30s if no client responds (backgrounded tabs, no viewers)
    if (this.playbackTimer) clearTimeout(this.playbackTimer);
    this.playbackTimer = setTimeout(() => {
      if (this.turnManager?.getCurrentSpeaker() === agentId) {
        console.log(`  [${name}] playback fallback advance (30s, gen=${gen})`);
        this.doAdvanceTurn(agentId);
      }
    }, 30000);
  }

  handlePlaybackDone(agentId: string, generation: number) {
    if (generation !== this.turnGeneration) return; // stale
    if (this.turnManager?.getCurrentSpeaker() !== agentId) return;
    if (this.playbackTimer) { clearTimeout(this.playbackTimer); this.playbackTimer = null; }
    const name = this.getAgentName(agentId);
    console.log(`  [${name}] client playback done (gen=${generation}) — advancing turn`);
    this.doAdvanceTurn(agentId);
  }

  private doAdvanceTurn(agentId: string) {
    if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
    this.turnAudioComplete = true; // Stop forwarding old agent's audio immediately
    this.lastTurnAdvanceTime = Date.now();
    const name = this.getAgentName(agentId);
    console.log(`  [${name}] advancing turn`);
    this.completedTurns++;

    if (this.completedTurns === 3 && !this.polesGenerated) {
      this.generatePolesFromTranscript();
    }

    // Check for queued call-ins at turn boundary
    if (!this.turnManager?.isInCallIn()) {
      setTimeout(() => this.checkCallInQueue(), 100);
    }

    this.turnManager?.onSpeechEnd(agentId, '');
  }

  /** After hearing from all 3 agents, ask OpenAI to identify the two main positions */
  private async generatePolesFromTranscript() {
    if (!this.session || this.session.agentIds.length === 0) return;
    this.polesGenerated = true;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.log('  [Consensus] No OPENAI_API_KEY — using template fallback');
      if (this.consensusState) {
        const fallback = this.generatePoles(this.session.topic);
        this.consensusState.leftPole = fallback.left;
        this.consensusState.rightPole = fallback.right;
        (this.io as any).emit('consensus_update', this.consensusState);
      }
      return;
    }

    // Build transcript summary from the first round
    const transcript = this.recentTranscripts
      .slice(-6)
      .map(m => `${m.agentName}: ${m.text}`)
      .join('\n');

    const topic = this.session.topic;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 40,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: 'You generate short vote-button labels for a live debate opinion meter. Reply ONLY in the exact format: LEFT: [label] | RIGHT: [label]. Labels must be 2-5 words, uppercase, punchy, and clearly opposing. No quotes, no explanation.',
            },
            {
              role: 'user',
              content: `Topic: "${topic}"\n\nTranscript:\n${transcript}\n\nWhat are the two opposing positions viewers should vote on?`,
            },
          ],
        }),
      });

      if (!res.ok) {
        console.warn(`  [Consensus] OpenAI API returned ${res.status} — using fallback`);
        throw new Error(`OpenAI ${res.status}`);
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const reply = data.choices?.[0]?.message?.content || '';
      console.log(`  [Consensus] OpenAI poles raw: "${reply}"`);
      this.parsePoleResponse(reply);
    } catch (err) {
      console.warn('  [Consensus] OpenAI pole generation failed — using fallback:', (err as Error).message);
      if (this.consensusState && this.session) {
        const fallback = this.generatePoles(this.session.topic);
        this.consensusState.leftPole = fallback.left;
        this.consensusState.rightPole = fallback.right;
        (this.io as any).emit('consensus_update', this.consensusState);
      }
    }
  }

  private wireTurnManagerEvents() {
    if (!this.turnManager) return;

    this.turnManager.on('turn_start', ({ agentId }: { agentId: string }) => {
      // Reset turn state for new speaker
      this.turnTextComplete = false;
      this.turnTalkEnded = false;
      this.turnAudioComplete = false;
      this.lastAudioChunkAt = 0;
      if (this.turnTimeoutTimer) { clearTimeout(this.turnTimeoutTimer); this.turnTimeoutTimer = null; }
      if (this.playbackTimer) { clearTimeout(this.playbackTimer); this.playbackTimer = null; }
      if (this.talkEndedTimer) { clearTimeout(this.talkEndedTimer); this.talkEndedTimer = null; }

      this.io.emit('speaker_change', { agentId });
      const turnAgentName = this.agentConfigs.get(agentId)?.name || 'Unknown';
      this.emitDebug('turn_start', agentId, turnAgentName, 'Turn started');
      console.log(`  [Turn] ${turnAgentName}'s turn`);

      // ── Call-in introduction turn ──
      const pendingCallIn = (this as any)._pendingCallIn as CallInEntry | undefined;
      const pendingIntroducerId = (this as any)._pendingCallInIntroducerId as string | undefined;
      if (pendingCallIn && pendingIntroducerId === agentId) {
        (this as any)._pendingCallIn = undefined;
        (this as any)._pendingCallInIntroducerId = undefined;

        const introPrompt = `A viewer named ${pendingCallIn.displayName} has called in about: ${pendingCallIn.topic}. Introduce them to the audience enthusiastically, then say "Let's hear from them!" Do NOT discuss the topic yet, just introduce.`;
        this.omniagent.sendMessage(agentId, 'user', introPrompt, true);

        // After this turn completes, play the caller's audio
        const entry = pendingCallIn;
        const introPlaybackHandler = () => {
          this.turnManager!.removeListener('turn_end', introPlaybackHandler);
          setTimeout(() => this.playCallInAudio(entry), 500);
        };
        this.turnManager!.on('turn_end', introPlaybackHandler);

        // Set the no-response timeout for the introduction turn
        this.turnTimeoutTimer = setTimeout(() => {
          if (this.turnManager?.getCurrentSpeaker() === agentId && !this.turnTextComplete) {
            console.log(`  [${turnAgentName}] no response to intro after 15s — skipping`);
            this.turnManager?.onSpeechEnd(agentId, '');
          }
        }, 15000);

        return; // Skip normal prompt
      }

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

        // When rules expire, send explicit expiration notice to ALL agents
        // so they stop continuing the style from conversation context
        if (chaosUpdate.expired.length > 0 && this.session) {
          const notice = this.chaosQueue.getExpirationNotice(chaosUpdate.expired);
          for (const id of this.session.agentIds) {
            this.omniagent.sendMessage(id, 'system', notice, false);
          }
          console.log(`  [Chaos] Expired ${chaosUpdate.expired.length} rule(s) — notified all agents`);
        }

        chaosPrompt = this.chaosQueue.getActiveRulesPrompt(agentId);
      }

      // ── Call-in discussion turn tracking ──
      if (this.turnManager?.isInCallIn()) {
        const remaining = this.turnManager.getCallInTurnsRemaining();
        const callId = this.turnManager.getCallInCallId();
        if (callId) {
          (this.io as any).emit('callin_discussion', { callId, turnsRemaining: remaining });
        }
      }

      // Safety net: if agent doesn't START responding within 15s, skip them.
      // Once the agent starts (handleResponseStart), this is replaced with a
      // longer 45s max-turn-duration timeout.
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
          `Topic: "${topic}"\nRecent conversation:\n${context}\n\nYour turn. Push back on something.`,
          `Topic: "${topic}"\nWhat's been said:\n${context}\n\nWhat's wrong with what they just said?`,
          `Topic: "${topic}"\nThe conversation so far:\n${context}\n\nYour turn. Don't just agree.`,
          `Topic: "${topic}"\nYou just heard:\n${context}\n\nCall out something you disagree with.`,
          `Topic: "${topic}"\nRecent:\n${context}\n\nChallenge their take.`,
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

    this.turnManager.on('callin_complete', ({ callId }: { callId?: string }) => {
      if (callId) this.handleCallInComplete(callId);
      setTimeout(() => this.checkCallInQueue(), 1000);
    });
  }
}
