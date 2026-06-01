/**
 * Text-to-Speech engine for agent voices using browser SpeechSynthesis.
 * Each agent gets a distinct voice configuration.
 */

interface VoiceConfig {
  pitch: number;   // 0-2, default 1
  rate: number;    // 0.1-10, default 1
  gender: 'male' | 'female';
  lang: string;
}

// Voice profiles mapped to agent names
const VOICE_PROFILES: Record<string, VoiceConfig> = {
  'Rico Martinez':       { pitch: 1.0, rate: 1.15, gender: 'male', lang: 'en-US' },
  'Dr. Helena Ashworth': { pitch: 1.2, rate: 0.95, gender: 'female', lang: 'en-GB' },
  'Darius Kane':         { pitch: 0.8, rate: 1.1, gender: 'male', lang: 'en-US' },
  'Ambassador Chen Wei': { pitch: 1.0, rate: 0.9, gender: 'male', lang: 'en-US' },
  'Zap Thunder':         { pitch: 1.3, rate: 1.3, gender: 'male', lang: 'en-US' },
};

class AgentTTS {
  private _muted = false;
  private voiceCache: Map<string, SpeechSynthesisVoice | null> = new Map();
  private speaking = false;
  private queue: Array<{ text: string; agentName: string }> = [];

  private getVoice(agentName: string): SpeechSynthesisVoice | null {
    if (this.voiceCache.has(agentName)) return this.voiceCache.get(agentName)!;

    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    const profile = VOICE_PROFILES[agentName] || { pitch: 1, rate: 1, gender: 'male', lang: 'en-US' };

    // Try to find a voice matching gender and lang
    const englishVoices = voices.filter((v) => v.lang.startsWith('en'));
    const genderHints = profile.gender === 'female'
      ? ['female', 'zira', 'hazel', 'susan', 'samantha', 'karen', 'moira', 'fiona', 'victoria', 'allison']
      : ['male', 'david', 'james', 'daniel', 'george', 'mark', 'alex', 'tom', 'fred'];

    // Prefer lang match
    const langMatch = englishVoices.filter((v) => v.lang === profile.lang);
    const pool = langMatch.length > 0 ? langMatch : englishVoices;

    // Try gender hint match
    let voice = pool.find((v) => genderHints.some((h) => v.name.toLowerCase().includes(h)));
    if (!voice) voice = pool[0] || voices[0];

    this.voiceCache.set(agentName, voice);
    return voice;
  }

  speak(text: string, agentName: string) {
    if (this._muted || !('speechSynthesis' in window)) return;

    // Queue if already speaking
    if (this.speaking) {
      this.queue.push({ text, agentName });
      return;
    }

    this.speakNow(text, agentName);
  }

  private speakNow(text: string, agentName: string) {
    // Cancel any existing speech first
    speechSynthesis.cancel();

    const profile = VOICE_PROFILES[agentName] || { pitch: 1, rate: 1, gender: 'male', lang: 'en-US' };
    const utterance = new SpeechSynthesisUtterance(text);

    const voice = this.getVoice(agentName);
    if (voice) utterance.voice = voice;

    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;
    utterance.volume = 1;

    this.speaking = true;

    utterance.onend = () => {
      this.speaking = false;
      // Play next in queue
      const next = this.queue.shift();
      if (next) {
        this.speakNow(next.text, next.agentName);
      }
    };

    utterance.onerror = () => {
      this.speaking = false;
      const next = this.queue.shift();
      if (next) {
        this.speakNow(next.text, next.agentName);
      }
    };

    speechSynthesis.speak(utterance);
  }

  stop() {
    this.queue = [];
    this.speaking = false;
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }

  set muted(value: boolean) {
    this._muted = value;
    if (value) this.stop();
  }

  get muted() {
    return this._muted;
  }
}

export const agentAudio = new AgentTTS();
