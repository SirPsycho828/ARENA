import { useState } from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { sounds } from '../lib/sounds';
import { PcmAudioPlayer } from '../lib/pcm-audio';

export function SoundToggle() {
  const soundMuted = useArenaStore((s) => s.soundMuted);
  const toggleSound = useArenaStore((s) => s.toggleSound);
  const setStoreVolume = useArenaStore((s) => s.setVolume);
  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem(PcmAudioPlayer.STORAGE_KEY);
      return saved !== null ? parseFloat(saved) : PcmAudioPlayer.DEFAULT_VOLUME;
    } catch { return PcmAudioPlayer.DEFAULT_VOLUME; }
  });

  const handleToggle = () => {
    toggleSound();
    const newMuted = !soundMuted;
    sounds.muted = newMuted;
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    sounds.volume = v;
    setStoreVolume(v);
    if (soundMuted && v > 0) {
      toggleSound();
      sounds.muted = false;
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
