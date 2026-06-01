/**
 * Napster native audio player for agent voices.
 * Receives base64-encoded PCM audio chunks (16-bit signed integer, 16kHz, mono)
 * and plays them via Web Audio API with gapless scheduling.
 *
 * Supports a completion callback: call markComplete() when no more chunks are
 * expected. The onDone callback fires when the last scheduled buffer finishes.
 */

const SAMPLE_RATE = 16000;

class AgentAudioPlayer {
  private _muted = false;
  private _volume = 1;
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextPlayTime = 0;
  private scheduledCount = 0;
  private generation = 0;
  private noMoreChunks = false;
  private onDoneCallback: (() => void) | null = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this._volume;
      this.gainNode.connect(this.ctx.destination);
      // Autoplay policy: resume on first user interaction if suspended
      if (this.ctx.state === 'suspended') {
        const ctx = this.ctx;
        const unlock = () => {
          ctx.resume();
          document.removeEventListener('click', unlock);
          document.removeEventListener('keydown', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playChunk(base64Pcm: string) {
    if (this._muted) return;

    const ctx = this.getContext();
    const raw = atob(base64Pcm);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode!);

    const now = ctx.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now;
    }
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
    this.scheduledCount++;

    const gen = this.generation;
    source.onended = () => {
      if (gen !== this.generation) return; // Stale callback from previous speaker
      this.scheduledCount--;
      this.checkDone();
    };
  }

  /**
   * Signal that no more audio chunks will arrive for this turn.
   * The callback fires when the last scheduled buffer finishes playing.
   */
  markComplete(onDone: () => void) {
    this.noMoreChunks = true;
    this.onDoneCallback = onDone;
    // If AudioContext is suspended (autoplay policy after hard refresh),
    // onended will never fire — advance the turn immediately
    if (this.ctx && this.ctx.state === 'suspended') {
      this.scheduledCount = 0;
    }
    this.checkDone();
  }

  private checkDone() {
    if (this.noMoreChunks && this.scheduledCount <= 0 && this.onDoneCallback) {
      const cb = this.onDoneCallback;
      this.onDoneCallback = null;
      cb();
    }
  }

  /** Reset for a new speaker. Does NOT close the AudioContext — avoids browser autoplay blocks. */
  reset() {
    this.nextPlayTime = 0;
    this.scheduledCount = 0;
    this.generation++; // Invalidate stale onended callbacks from previous speaker
    this.noMoreChunks = false;
    this.onDoneCallback = null;
  }

  /** Full stop — closes AudioContext. Only used for mute. */
  stop() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
      this.ctx = null;
      this.gainNode = null;
    }
    this.reset();
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) this.gainNode.gain.value = this._volume;
  }

  get volume() { return this._volume; }

  set muted(value: boolean) {
    this._muted = value;
    if (value) this.stop();
  }

  get muted() { return this._muted; }
}

export const agentAudio = new AgentAudioPlayer();
