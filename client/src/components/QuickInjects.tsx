import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';

const PRESETS = [
  { key: 'rhyme_time', label: 'Rhyme Time' },
  { key: 'pirate_mode', label: 'Pirate Mode' },
  { key: 'opposite_day', label: 'Opposite Day' },
  { key: 'shakespeare', label: 'Shakespeare' },
  { key: 'eli5', label: 'ELI5' },
  { key: 'roast_battle', label: 'Roast Battle' },
  { key: 'hot_takes', label: 'Hot Takes Only' },
  { key: 'one_sentence', label: 'One Word' },
];

export function QuickInjects() {
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const quickChaos = useArenaStore((s) => s.quickChaos);
  const session = useArenaStore((s) => s.session);
  const credits = useArenaStore((s) => s.credits);
  const isActive = session?.status === 'active';
  const canAfford = credits !== null && credits >= 3;

  const handleClick = async (key: string) => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    const token = await user.getIdToken();
    quickChaos(key, token);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider font-display">
          <Sparkles size={12} />
          Quick Chaos
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">3 credits each</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => handleClick(preset.key)}
            disabled={!isActive || (!!user && !canAfford)}
            className="px-2.5 py-1 rounded-sm text-xs font-medium bg-muted border border-border text-muted-foreground hover:text-accent hover:border-accent/40 hover:bg-accent/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {preset.label}
          </button>
        ))}
      </div>
      {user && !canAfford && (
        <p className="text-[10px] text-destructive font-mono">Not enough credits for quick chaos</p>
      )}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
}
