import { sounds } from './sounds';

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private running = false;

  start() {
    if (this.running || sounds.muted) return;

    try {
      this.ctx = new AudioContext();
      const ctx = this.ctx;

      // Create noise buffer (brown noise for crowd murmur)
      const bufferSize = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        data[i] = lastOut * 3.5;
      }

      // Noise source (looped)
      this.noiseNode = ctx.createBufferSource();
      this.noiseNode.buffer = buffer;
      this.noiseNode.loop = true;

      // Low-pass filter for muffled crowd effect
      this.filterNode = ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 200;
      this.filterNode.Q.value = 1;

      // Very quiet gain
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = 0.015;

      this.noiseNode.connect(this.filterNode);
      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(ctx.destination);
      this.noiseNode.start();
      this.running = true;
    } catch {
      // Audio not supported
    }
  }

  stop() {
    try {
      this.noiseNode?.stop();
      this.ctx?.close();
    } catch {}
    this.noiseNode = null;
    this.gainNode = null;
    this.filterNode = null;
    this.ctx = null;
    this.running = false;
  }

  setIntensity(level: number) {
    if (!this.gainNode || !this.filterNode || !this.ctx) return;
    // level 0-1: adjust gain (0.015 - 0.04) and filter freq (200 - 400 Hz)
    const clamped = Math.max(0, Math.min(1, level));
    const targetGain = 0.015 + clamped * 0.025;
    const targetFreq = 200 + clamped * 200;

    this.gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.5);
    this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.5);
  }

  get isRunning() {
    return this.running;
  }
}

export const ambient = new AmbientEngine();
