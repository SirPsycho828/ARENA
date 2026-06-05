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

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 16000 });
    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this.ctx.destination);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.gainNode.gain.value = muted ? 0 : 1;
  }

  playChunk(base64: string) {
    if (this.muted) return;

    // Resume AudioContext if suspended (autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
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
