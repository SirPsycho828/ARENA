import { Users, Clock, MessageSquare, Trophy } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { useEffect, useState } from 'react';

export function SpectatorBar() {
  const session = useArenaStore((s) => s.session);
  const transcripts = useArenaStore((s) => s.transcripts);
  const voteTallies = useArenaStore((s) => s.voteTallies);
  const spectatorCount = useArenaStore((s) => s.spectatorCount);
  const [elapsed, setElapsed] = useState('0:00');

  useEffect(() => {
    if (!session?.startedAt) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - session.startedAt) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.startedAt]);

  const totalVotes = Object.values(voteTallies).reduce((a, b) => a + b, 0);

  if (!session) return null;

  return (
    <div className="flex items-center justify-center gap-4 sm:gap-6 px-4 py-1 bg-muted/60 border-b border-border text-[10px] font-mono tracking-wider">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Users size={11} className="text-accent" />
        <span className="text-foreground font-semibold">{spectatorCount}</span>
        <span className="hidden sm:inline">WATCHING</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock size={11} className="text-[#8B5CF6]" />
        <span className="text-foreground font-semibold">{elapsed}</span>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground">
        <MessageSquare size={11} className="text-success" />
        <span className="text-foreground font-semibold">{transcripts.length}</span>
        <span>MSGS</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Trophy size={11} className="text-warning" />
        <span className="text-foreground font-semibold">{totalVotes}</span>
        <span className="hidden sm:inline">VOTES</span>
      </div>
    </div>
  );
}
