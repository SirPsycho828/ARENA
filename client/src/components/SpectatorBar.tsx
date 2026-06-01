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
    <div className="flex items-center justify-center gap-4 sm:gap-6 px-4 py-1.5 bg-arena-surface/80 backdrop-blur-sm border-b border-arena-border-subtle text-xs">
      <div className="flex items-center gap-1.5 text-arena-text-muted">
        <Users size={12} className="text-arena-cyan" />
        <span className="text-arena-text-secondary font-medium">{spectatorCount}</span>
        <span className="hidden sm:inline">watching</span>
      </div>
      <div className="flex items-center gap-1.5 text-arena-text-muted">
        <Clock size={12} className="text-arena-purple" />
        <span className="font-mono text-arena-text-secondary">{elapsed}</span>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-arena-text-muted">
        <MessageSquare size={12} className="text-arena-success" />
        <span className="text-arena-text-secondary font-medium">{transcripts.length}</span>
        <span>messages</span>
      </div>
      <div className="flex items-center gap-1.5 text-arena-text-muted">
        <Trophy size={12} className="text-arena-warning" />
        <span className="text-arena-text-secondary font-medium">{totalVotes}</span>
        <span className="hidden sm:inline">votes</span>
      </div>
    </div>
  );
}
