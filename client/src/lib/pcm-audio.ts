/**
 * PCM Audio Player — plays base64-encoded 16-bit PCM audio chunks
 * from the Napster WebSocket connection via Web Audio API.
 *
 * Audio buffers are created at 16kHz (source rate) and the browser's
 * built-in sinc resampler handles upsampling to 48kHz with proper
 * anti-imaging filtering. A 2ms crossfade at each chunk boundary
 * prevents the sinc resampler from producing edge artifacts.
 */
export class PcmAudioPlayer {
  private ctx: AudioContext;
  private gainNode: GainNode;
  private nextPlayTime = 0;
  private muted = false;
  private _volume: number;
  private unlocked = false;
  private chunks = 0;
  private lastSample = 0;

  static readonly STORAGE_KEY = 'arena-pcm-volume';
  static readonly DEFAULT_VOLUME = 0.50;

  constructor() {
    this.ctx = new AudioContext();

    // Restore persisted volume (default 50%)
    this._volume = PcmAudioPlayer.DEFAULT_VOLUME;
    try {
      const saved = localStorage.getItem(PcmAudioPlayer.STORAGE_KEY);
      if (saved !== null) this._volume = Math.max(0, Math.min(1, parseFloat(saved)));
    } catch {}

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this._volume;
    this.gainNode.connect(this.ctx.destination);

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
    if (this.ctx.state !== 'suspended') this.unlocked = true;
  }

  getVolume(): number { return this._volume; }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.gainNode.gain.value = muted ? 0 : this._volume;
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (!this.muted) this.gainNode.gain.value = this._volume;
    try { localStorage.setItem(PcmAudioPlayer.STORAGE_KEY, String(this._volume)); } catch {}
  }

  playChunk(base64: string) {
    if (this.muted) return;

    if (this.chunks === 0) {
      console.log(`[Audio] First chunk, ctx=${this.ctx.state}, size=${base64.length}, ctxRate=${this.ctx.sampleRate}`);
    }
    this.chunks++;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
      return;
    }

    // Decode base64 → Int16 PCM
    const raw = atob(base64);
    const byteLen = raw.length & ~1;
    const bytes = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) bytes[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    if (int16.length === 0) return;

    // Create buffer at 16kHz (source rate). The browser's built-in sinc resampler
    // upsamples to 48kHz with proper anti-imaging filtering — critical for clean
    // sibilants. Manual linear interpolation (previous approach) created imaging
    // artifacts that made S/Z sounds harsh.
    const buffer = this.ctx.createBuffer(1, int16.length, 16000);
    const channel = buffer.getChannelData(0);

    // 2ms crossfade (32 samples @ 16kHz) smooths chunk boundaries so the sinc
    // resampler doesn't produce edge artifacts at each ~100ms chunk seam
    const rampLen = Math.min(32, int16.length);

    for (let i = 0; i < int16.length; i++) {
      let sample = int16[i] / 32768;
      if (i < rampLen) {
        const t = i / rampLen;
        sample = this.lastSample * (1 - t) + sample * t;
      }
      channel[i] = sample;
    }

    this.lastSample = channel[int16.length - 1];

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    // 350ms jitter buffer — absorbs network latency and aligns audio start
    // with avatar API latency (~300-400ms) for lip-sync
    const now = this.ctx.currentTime;
    if (this.nextPlayTime <= now) {
      this.nextPlayTime = now + 0.35;
    }
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
  }

  getRemainingTime(): number {
    return Math.max(0, this.nextPlayTime - this.ctx.currentTime);
  }

  reset() {
    this.nextPlayTime = 0;
    this.lastSample = 0;
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
