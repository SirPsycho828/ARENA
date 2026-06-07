import { v4 as uuid } from 'uuid';

export interface ChaosRule {
  id: string;
  text: string;
  turnsRemaining: number;
  maxTurns: number;
  source: 'rule' | 'quick_chaos' | 'voice_challenge';
  viewerId: string;
  viewerName: string | null;
  targetAgentId: string | null;  // null = all agents, set for voice challenges
  activatedAt: number;
}

interface QueuedItem {
  id: string;
  text: string;
  type: 'rule' | 'quick_chaos' | 'voice_challenge';
  duration: number;              // turns (1-4 for rules, 1 for challenges)
  viewerId: string;
  viewerName: string | null;
  targetAgentId: string | null;
  enqueuedAt: number;
}

export interface ChaosStatus {
  active: ChaosRule[];
  queue: Array<{ id: string; text: string; type: string; position: number }>;
  topicQueue: string[];
}

const MAX_ACTIVE = 3;
const MAX_QUEUE = 10;
const MAX_TEXT_LENGTH = 200;
const COOLDOWN_MS = 15000;

export class ChaosQueue {
  private active: ChaosRule[] = [];
  private queue: QueuedItem[] = [];
  private topicQueue: string[] = [];
  private cooldowns: Map<string, number> = new Map();

  // Called at the start of every turn by SessionManager
  onTurnStart(): { expired: ChaosRule[]; activated: ChaosRule[]; active: ChaosRule[] } {
    // 1. Decrement turnsRemaining on all active rules
    for (const rule of this.active) {
      rule.turnsRemaining--;
    }

    // 2. Remove expired (turnsRemaining <= 0)
    const expired = this.active.filter(r => r.turnsRemaining <= 0);
    this.active = this.active.filter(r => r.turnsRemaining > 0);

    // 3. Promote from queue if room
    const activated: ChaosRule[] = [];
    while (this.active.length < MAX_ACTIVE && this.queue.length > 0) {
      const item = this.queue.shift()!;
      const rule: ChaosRule = {
        id: item.id,
        text: item.text,
        turnsRemaining: item.duration,
        maxTurns: item.duration,
        source: item.type,
        viewerId: item.viewerId,
        viewerName: item.viewerName,
        targetAgentId: item.targetAgentId,
        activatedAt: Date.now(),
      };
      this.active.push(rule);
      activated.push(rule);
    }

    return { expired, activated, active: [...this.active] };
  }

  // Build a message to tell agents that specific rules have expired
  getExpirationNotice(expired: ChaosRule[]): string {
    if (expired.length === 0) return '';
    const names = expired.map(r => `"${r.text}"`).join(', ');
    return `CHAOS RULE EXPIRED: ${names}. This rule is OVER. IMMEDIATELY return to your normal speaking style and personality. Do NOT continue the expired style in any way.`;
  }

  // Format active rules for injection into agent prompts
  getActiveRulesPrompt(agentId?: string): string {
    // Filter: include rules that target all agents OR this specific agent
    const relevant = this.active.filter(r =>
      r.targetAgentId === null || r.targetAgentId === agentId
    );
    if (relevant.length === 0) {
      return '\nNO CHAOS RULES ARE ACTIVE. Speak in your normal style and personality. Do NOT continue any previous chaos rule styles (pirate, rhyming, Shakespearean, etc.) — those have ended.\n';
    }

    const lines = relevant.map((r, i) => {
      if (r.source === 'voice_challenge' && r.viewerName) {
        return `${i + 1}. VIEWER CHALLENGE from ${r.viewerName}: "${r.text}" — Address ${r.viewerName} by name in your response. (this turn only)`;
      }
      return `${i + 1}. "${r.text}" (${r.turnsRemaining} turn${r.turnsRemaining !== 1 ? 's' : ''} remaining — when turns reach 0, STOP this style immediately)`;
    });

    return `\nACTIVE CHAOS RULES — you MUST follow these (and ONLY these — if a previous rule is not listed here, it has EXPIRED and you must STOP following it):\n${lines.join('\n')}\n`;
  }

  enqueueRule(viewerId: string, viewerName: string | null, text: string, duration: number) {
    const check = this.validate(viewerId, text);
    if (!check.ok) return check;

    duration = Math.max(1, Math.min(4, Math.round(duration)));
    this.cooldowns.set(viewerId, Date.now());

    const item: QueuedItem = {
      id: uuid(),
      text: text.trim(),
      type: 'rule',
      duration,
      viewerId,
      viewerName,
      targetAgentId: null,
      enqueuedAt: Date.now(),
    };
    this.queue.push(item);
    return { ok: true as const, id: item.id, position: this.queue.length };
  }

  enqueueQuickChaos(viewerId: string, viewerName: string | null, text: string, duration = 3) {
    const check = this.validate(viewerId, text);
    if (!check.ok) return check;

    this.cooldowns.set(viewerId, Date.now());

    const item: QueuedItem = {
      id: uuid(),
      text: text.trim(),
      type: 'quick_chaos',
      duration,
      viewerId,
      viewerName,
      targetAgentId: null,
      enqueuedAt: Date.now(),
    };
    this.queue.push(item);
    return { ok: true as const, id: item.id, position: this.queue.length };
  }

  enqueueVoiceChallenge(viewerId: string, viewerName: string, targetAgentId: string, text: string) {
    // Voice challenges skip cooldown and queue size checks — they're special
    if (!text || text.trim().length === 0) return { ok: false as const, reason: 'empty' };
    if (text.length > 500) return { ok: false as const, reason: 'too_long' }; // longer limit for challenges

    const item: QueuedItem = {
      id: uuid(),
      text: text.trim(),
      type: 'voice_challenge',
      duration: 1, // challenges last 1 turn
      viewerId,
      viewerName,
      targetAgentId,
      enqueuedAt: Date.now(),
    };
    // Voice challenges go to FRONT of queue (priority)
    this.queue.unshift(item);
    return { ok: true as const, id: item.id, position: 1 };
  }

  enqueueTopic(viewerId: string, topic: string) {
    if (!topic || topic.trim().length === 0) return { ok: false as const, reason: 'empty' };
    if (topic.length > MAX_TEXT_LENGTH) return { ok: false as const, reason: 'too_long' };
    if (this.topicQueue.length >= 5) return { ok: false as const, reason: 'topic_queue_full' };

    const cd = this.cooldowns.get(viewerId) || 0;
    const remaining = COOLDOWN_MS - (Date.now() - cd);
    if (remaining > 0) return { ok: false as const, reason: 'cooldown', remainingMs: remaining };

    this.cooldowns.set(viewerId, Date.now());
    this.topicQueue.push(topic.trim());
    return { ok: true as const, position: this.topicQueue.length };
  }

  popNextTopic(): string | null {
    return this.topicQueue.shift() || null;
  }

  getStatus(): ChaosStatus {
    return {
      active: [...this.active],
      queue: this.queue.map((item, i) => ({
        id: item.id,
        text: item.text,
        type: item.type,
        position: i + 1,
      })),
      topicQueue: [...this.topicQueue],
    };
  }

  getActiveRules(): ChaosRule[] {
    return [...this.active];
  }

  stop() {
    this.active = [];
    this.queue = [];
    this.topicQueue = [];
    this.cooldowns.clear();
  }

  private validate(viewerId: string, text: string) {
    if (!text || text.trim().length === 0) return { ok: false as const, reason: 'empty' };
    if (text.length > MAX_TEXT_LENGTH) return { ok: false as const, reason: 'too_long' };
    if (this.queue.length >= MAX_QUEUE) return { ok: false as const, reason: 'queue_full' };

    const lastInject = this.cooldowns.get(viewerId) || 0;
    const remaining = COOLDOWN_MS - (Date.now() - lastInject);
    if (remaining > 0) return { ok: false as const, reason: 'cooldown', remainingMs: remaining };

    return { ok: true as const };
  }
}
