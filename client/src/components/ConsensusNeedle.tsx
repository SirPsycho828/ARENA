import { useEffect, useState } from 'react';
import { useArenaStore } from '../store/arena';

export function ConsensusNeedle() {
  const consensus = useArenaStore((s) => s.consensus);
  const hasVotedPole = useArenaStore((s) => s.hasVotedPole);
  const votePole = useArenaStore((s) => s.votePole);

  // Jitter: small random oscillation around the real needle position
  const [jitter, setJitter] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setJitter((Math.random() - 0.5) * 3);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  if (!consensus) return null;

  // Convert -1..1 to 0..100 percentage
  const needlePct = ((consensus.needlePosition + 1) / 2) * 100;
  const totalVotes = consensus.viewerVotes.left + consensus.viewerVotes.right;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Chyron header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-primary animate-lower-third-bar" />
          <span className="font-display text-[11px] tracking-wider">OPINION METER</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-live-pulse" />
          LIVE
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Pole labels */}
        <div className="flex justify-between items-start">
          <span className="text-[11px] font-display tracking-wider text-accent max-w-[40%] leading-tight">
            {consensus.leftPole}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">VS</span>
          <span className="text-[11px] font-display tracking-wider text-primary max-w-[40%] leading-tight text-right">
            {consensus.rightPole}
          </span>
        </div>

        {/* Meter track */}
        <div className="relative h-4 bg-muted rounded-full overflow-visible">
          {/* Gradient fill */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-accent/25 via-muted to-primary/25" />

          {/* Center tick */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />

          {/* Agent stance dots */}
          {Object.entries(consensus.agentStances).map(([agentId, stance]) => {
            const pct = ((stance + 1) / 2) * 100;
            return (
              <div
                key={agentId}
                className="absolute top-1/2 w-1.5 h-1.5 rounded-full bg-foreground/30 -translate-y-1/2 transition-all duration-500"
                style={{ left: `calc(${pct}% - 3px)` }}
              />
            );
          })}

          {/* Main needle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-300"
            style={{ left: `calc(${Math.max(2, Math.min(98, needlePct + jitter))}% - 8px)` }}
          >
            <div className="w-4 h-4 rounded-full bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.4)] border-2 border-background" />
          </div>
        </div>

        {/* Vote buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => votePole('left')}
            disabled={hasVotedPole}
            className={`flex-1 py-1.5 rounded-sm text-[11px] font-display tracking-wider transition-all cursor-pointer ${
              hasVotedPole
                ? 'bg-muted text-muted-foreground/50'
                : 'bg-accent/15 text-accent hover:bg-accent/25 active:scale-[0.97]'
            }`}
          >
            {consensus.leftPole}
          </button>
          <button
            onClick={() => votePole('right')}
            disabled={hasVotedPole}
            className={`flex-1 py-1.5 rounded-sm text-[11px] font-display tracking-wider transition-all cursor-pointer ${
              hasVotedPole
                ? 'bg-muted text-muted-foreground/50'
                : 'bg-primary/15 text-primary hover:bg-primary/25 active:scale-[0.97]'
            }`}
          >
            {consensus.rightPole}
          </button>
        </div>

        {/* Subtitle */}
        <p className="text-center text-[9px] text-muted-foreground/60 font-mono tracking-wider">
          BASED ON AI ARGUMENTS & VIEWER VOTES{totalVotes > 0 ? ` (${totalVotes})` : ''}
        </p>
      </div>
    </div>
  );
}
