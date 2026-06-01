import { Sparkles } from 'lucide-react';
import { useArenaStore } from '../store/arena';

const PRESETS = [
  { label: 'Rhyme Time', text: 'All debaters must now speak in rhymes for the next 3 responses.' },
  { label: 'Pirate Mode', text: 'Everyone must argue like pirates. Arrr, matey!' },
  { label: 'Opposite Day', text: 'Each debater must now argue the OPPOSITE of their current position.' },
  { label: 'Shakespeare', text: 'All arguments must be delivered in Shakespearean English.' },
  { label: 'ELI5', text: 'Explain your position as if talking to a 5-year-old.' },
  { label: 'Roast Battle', text: 'Forget the topic. Each debater must roast the person who spoke before them.' },
  { label: 'Hot Takes Only', text: 'Only the most controversial, spicy hot takes allowed. No mild opinions.' },
  { label: 'One Word', text: 'Each debater gets only ONE sentence to make their entire argument.' },
];

export function QuickInjects() {
  const injectChaos = useArenaStore((s) => s.injectChaos);
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
            key={preset.label}
            onClick={() => injectChaos(preset.text, 'rule')}
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
