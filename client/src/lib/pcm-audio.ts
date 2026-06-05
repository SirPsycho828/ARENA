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
  private unlocked = false;
  private chunks = 0;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 16000 });
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
    this.gainNode.gain.value = muted ? 0 : 1;
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
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);

    // Convert Int16 → Float32 for Web Audio
    const buffer = this.ctx.createBuffer(1, int16.length, 16000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / 32768;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    // Schedule gaplessly
    const now = this.ctx.currentTime;
    const start = Math.max(now, this.nextPlayTime);
    source.start(start);
    this.nextPlayTime = start + buffer.duration;
  }

  /** Reset on speaker change — instant cutoff of any remaining audio */
  reset() {
    this.nextPlayTime = 0;
    // Swap gain node for instant audio cutoff without clicks
    const newGain = this.ctx.createGain();
    newGain.gain.value = this.muted ? 0 : 1;
    newGain.connect(this.ctx.destination);
    this.gainNode.disconnect();
    this.gainNode = newGain;
  }

  destroy() {
    this.gainNode.disconnect();
    this.ctx.close().catch(() => {});
  }
}
