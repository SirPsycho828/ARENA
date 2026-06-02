import { useState } from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { sounds } from '../lib/sounds';
import { agentAudio } from '../lib/agent-audio';

export function SoundToggle() {
  const soundMuted = useArenaStore((s) => s.soundMuted);
  const toggleSound = useArenaStore((s) => s.toggleSound);
  const [volume, setVolume] = useState(0.8);

  const handleToggle = () => {
    toggleSound();
    const newMuted = !soundMuted;
    sounds.muted = newMuted;
    agentAudio.muted = newMuted;
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    agentAudio.volume = v;
    sounds.volume = v;
    if (soundMuted && v > 0) {
      toggleSound();
      sounds.muted = false;
      agentAudio.muted = false;
    }
  };

  const Icon = soundMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleToggle}
        className="p-1.5 rounded-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
        title={soundMuted ? 'Unmute' : 'Mute'}
      >
        <Icon size={16} />
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={soundMuted ? 0 : volume}
        onChange={handleVolume}
        className="w-16 h-1 accent-accent cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
      />
    </div>
  );
}
