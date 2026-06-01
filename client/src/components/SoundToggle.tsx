import { Volume2, VolumeX } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { sounds } from '../lib/sounds';

export function SoundToggle() {
  const soundMuted = useArenaStore((s) => s.soundMuted);
  const toggleSound = useArenaStore((s) => s.toggleSound);

  const handleToggle = () => {
    toggleSound();
    sounds.muted = !soundMuted; // Will be the NEW state after toggle
  };

  return (
    <button
      onClick={handleToggle}
      className="p-1.5 rounded-md hover:bg-white/5 transition-colors text-arena-text-secondary hover:text-arena-text-bright"
      title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
    >
      {soundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}
