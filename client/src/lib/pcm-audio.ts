/**
 * PCM Audio Player — plays base64-encoded 16-bit PCM audio chunks
 * from the Napster WebSocket connection via Web Audio API.
 * Gapless scheduling ensures smooth playback.
 */
export class PcmAudioPlayer {
  private ctx: AudioContext;
  private gainNode: GainNode;
  private nextPlayTime = 0;
  private muted = false;
  private _volume = 1;
  private unlocked = false;
  private chunks = 0;

  constructor() {
    // Use system default rate (usually 48kHz) — browser's high-quality resampler
    // handles 16kHz→48kHz much better than forcing the context to 16kHz
    this.ctx = new AudioContext();
    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this.ctx.destination);

    // Unlock AudioContext on first user interaction (autoplay policy)
    const unlock = () => {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          console.log('[Audio] AudioContext unlocked by user gesture');
          this.unlocked = true;
        });
      } else {
        this.unlocked = true;
      }
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);

    // Also try immediately (some browsers allow it)
    if (this.ctx.state !== 'suspended') {
      this.unlocked = true;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.gainNode.gain.value = muted ? 0 : this._volume;
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (!this.muted) {
      this.gainNode.gain.value = this._volume;
    }
  }

  playChunk(base64: string) {
    if (this.muted) return;

    // Log first chunk received
    if (this.chunks === 0) {
      console.log(`[Audio] First chunk received, ctx=${this.ctx.state}, size=${base64.length}`);
    }
    this.chunks++;

    // Try to resume if not yet unlocked
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
      return; // Skip this chunk — will play next ones once unlocked
    }

    // Decode base64 → Int16 PCM
    const raw = atob(base64);
    const byteLen = raw.length & ~1; // ensure even byte count for Int16
    const bytes = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) bytes[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);

    if (int16.length === 0) return;

    // Convert Int16 → Float32 for Web Audio.
    // Attenuate by 0.8x to prevent clipping: browser's 16kHz→48kHz sinc resampler
    // can overshoot peaks (Gibbs phenomenon), especially on sibilants (S, Z sounds).
    const buffer = this.ctx.createBuffer(1, int16.length, 16000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / 32768 * 0.8;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    // Schedule with jitter buffer to prevent clicks from network latency
    const now = this.ctx.currentTime;
    if (this.nextPlayTime <= now) {
      // Buffer underrun or first chunk — add 200ms lookahead to absorb jitter
      this.nextPlayTime = now + 0.2;
    }
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
  }

  /** Returns seconds of audio still buffered and waiting to play */
  getRemainingTime(): number {
    return Math.max(0, this.nextPlayTime - this.ctx.currentTime);
  }

  /** Reset on speaker change — instant cutoff of any remaining audio */
  reset() {
    this.nextPlayTime = 0;
    // Swap gain node for instant audio cutoff without clicks
    const newGain = this.ctx.createGain();
    newGain.gain.value = this.muted ? 0 : this._volume;
    newGain.connect(this.ctx.destination);
    this.gainNode.disconnect();
    this.gainNode = newGain;
  }

  destroy() {
    this.gainNode.disconnect();
    this.ctx.close().catch(() => {});
  }
}
