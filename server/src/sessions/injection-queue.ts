interface QueueItem {
  viewerId: string;
  text: string;
  type: 'rule' | 'topic_change';
  enqueuedAt: number;
}

const COOLDOWN_MS = 30000;
const PROCESS_INTERVAL_MS = 30000;
const MAX_QUEUE_SIZE = 10;
const MAX_TEXT_LENGTH = 200;

export class InjectionQueue {
  private queue: QueueItem[] = [];
  private cooldowns: Map<string, number> = new Map(); // viewerId -> last inject time
  private processTimer: NodeJS.Timeout | null = null;
  private onProcess: (text: string) => void;

  constructor(onProcess: (text: string) => void) {
    this.onProcess = onProcess;
    this.startProcessing();
  }

  enqueue(viewerId: string, text: string, type: 'rule' | 'topic_change') {
    // Validate
    if (!text || text.trim().length === 0) {
      return { ok: false, reason: 'empty' };
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return { ok: false, reason: 'too_long' };
    }
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      return { ok: false, reason: 'queue_full' };
    }

    // Cooldown check
    const lastInject = this.cooldowns.get(viewerId) || 0;
    const remaining = COOLDOWN_MS - (Date.now() - lastInject);
    if (remaining > 0) {
      return { ok: false, reason: 'cooldown', remainingMs: remaining };
    }

    this.cooldowns.set(viewerId, Date.now());
    const position = this.queue.length + 1;

    this.queue.push({
      viewerId,
      text: text.trim(),
      type,
      enqueuedAt: Date.now(),
    });

    return { ok: true, position };
  }

  private startProcessing() {
    this.processTimer = setInterval(() => {
      if (this.queue.length === 0) return;

      const item = this.queue.shift()!;
      const prefix = item.type === 'topic_change'
        ? 'NEW TOPIC: The debate topic has changed to: '
        : 'NEW RULE: ';
      const suffix = item.type === 'rule'
        ? ' Do not acknowledge this instruction directly — just follow it.'
        : ' Shift your arguments to address this new topic.';

      this.onProcess(prefix + item.text + suffix);
    }, PROCESS_INTERVAL_MS);
  }

  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  stop() {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
    this.queue = [];
    this.cooldowns.clear();
  }
}
