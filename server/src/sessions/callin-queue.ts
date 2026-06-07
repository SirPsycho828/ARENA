import { v4 as uuid } from 'uuid';
import { transcribeAudio } from '../lib/speech-to-text.js';

export interface CallInEntry {
  callId: string;
  socketId: string;
  audioBuffer: Buffer;
  displayName: string;
  topic: string;
  durationMs: number;
  transcript: string | null;  // null until transcription completes
  status: 'transcribing' | 'queued' | 'active' | 'done';
}

const MAX_QUEUED = 3;

export class CallInQueue {
  private queue: CallInEntry[] = [];
  private active: CallInEntry | null = null;

  /**
   * Submit a new call-in. Transcription starts immediately in the background.
   * Returns the entry or null if queue is full.
   */
  async submit(
    socketId: string,
    audioBuffer: Buffer,
    displayName: string,
    topic: string,
    durationMs: number,
  ): Promise<{ entry: CallInEntry; position: number } | null> {
    if (this.queue.length >= MAX_QUEUED) return null;

    const entry: CallInEntry = {
      callId: uuid(),
      socketId,
      audioBuffer,
      displayName,
      topic,
      durationMs,
      transcript: null,
      status: 'transcribing',
    };

    this.queue.push(entry);
    const position = this.queue.length;

    // Transcribe in the background — don't block
    transcribeAudio(audioBuffer).then(transcript => {
      entry.transcript = transcript || `(Viewer "${displayName}" called in about: ${topic})`;
      entry.status = 'queued';
      console.log(`  [CallIn] Transcription ready for ${entry.callId}: "${entry.transcript.slice(0, 80)}"`);
    }).catch(err => {
      console.error(`  [CallIn] Transcription failed for ${entry.callId}:`, (err as Error).message);
      entry.transcript = `(Viewer "${displayName}" called in about: ${topic})`;
      entry.status = 'queued';
    });

    return { entry, position };
  }

  /**
   * Check if there's a call-in ready to play (transcription complete, queue not empty).
   */
  hasReady(): boolean {
    return this.active === null && this.queue.length > 0 && this.queue[0].status === 'queued';
  }

  /**
   * Pop the next ready call-in from the queue and mark it active.
   */
  popNext(): CallInEntry | null {
    if (!this.hasReady()) return null;
    this.active = this.queue.shift()!;
    this.active.status = 'active';
    return this.active;
  }

  /**
   * Mark the active call-in as done.
   */
  completeActive(): void {
    if (this.active) {
      this.active.status = 'done';
      this.active = null;
    }
  }

  getActive(): CallInEntry | null { return this.active; }
  hasActive(): boolean { return this.active !== null; }

  getQueuePositions(): Array<{ callId: string; socketId: string; position: number }> {
    return this.queue.map((e, i) => ({ callId: e.callId, socketId: e.socketId, position: i + 1 }));
  }

  getQueueLength(): number { return this.queue.length; }

  stop() {
    this.queue = [];
    this.active = null;
  }
}
