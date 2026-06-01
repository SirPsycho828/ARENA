/**
 * Plays base64-encoded PCM audio chunks from Napster agent WebSocket.
 * Format: 16-bit signed integer, 16kHz, mono.
 */
class AgentAudioPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextPlayTime = 0;
  private _muted = false;

  private ensureContext() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ sampleRate: 24000 });
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
      this.nextPlayTime = 0;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  play(base64Audio: string) {
    if (this._muted) return;

    try {
      const ctx = this.ensureContext();

      // Decode base64 to Int16 PCM
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);

      // Convert Int16 to Float32 (-1 to 1)
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      if (float32.length === 0) return;

      // Create audio buffer and schedule playback
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode!);

      // Schedule seamlessly after previous chunk
      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + buffer.duration;
    } catch {
      // Audio playback failed — silently ignore
    }
  }

  set muted(value: boolean) {
    this._muted = value;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(value ? 0 : 1, this.ctx.currentTime);
    }
    if (value) {
      this.nextPlayTime = 0; // Reset schedule on mute
    }
  }

  get muted() {
    return this._muted;
  }

  stop() {
    this.nextPlayTime = 0;
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.gainNode = null;
  }
}

export const agentAudio = new AgentAudioPlayer();
