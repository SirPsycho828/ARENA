import { Sparkles } from 'lucide-react';
import { useArenaStore } from '../store/arena';

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
  const quickChaos = useArenaStore((s) => s.quickChaos);
  const session = useArenaStore((s) => s.session);
  const isActive = session?.status === 'active';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-arena-text-muted uppercase tracking-wide">
        <Sparkles size={12} />
        Quick Chaos
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => quickChaos(preset.key)}
            disabled={!isActive}
            className="px-2.5 py-1 rounded-full text-xs font-medium bg-arena-surface border border-arena-border-subtle text-arena-text-secondary hover:text-arena-cyan hover:border-arena-cyan/40 hover:bg-arena-cyan/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
