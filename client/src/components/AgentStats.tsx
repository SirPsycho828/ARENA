import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useArenaStore } from '../store/arena';

interface AgentStatsProps {
  agentId: string;
  onClose: () => void;
}

export function AgentStats({ agentId, onClose }: AgentStatsProps) {
  const agents = useArenaStore((s) => s.agents);
  const voteTallies = useArenaStore((s) => s.voteTallies);
  const transcripts = useArenaStore((s) => s.transcripts);

  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;

  const votes = voteTallies[agentId] || 0;
  const totalVotes = Object.values(voteTallies).reduce((a, b) => a + b, 0);
  const votePercent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

  const messages = transcripts.filter((t) => t.agentId === agentId);
  const avgLength = messages.length > 0
    ? Math.round(messages.reduce((acc, m) => acc + m.text.length, 0) / messages.length)
    : 0;

  const topQuotes = [...messages]
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 3);

  const ranked = [...agents]
    .map((a) => ({ ...a, votes: voteTallies[a.id] || 0 }))
    .sort((a, b) => b.votes - a.votes);
  const rank = ranked.findIndex((a) => a.id === agentId) + 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-sm border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header — lower-third broadcast bio card */}
        <div className="h-[3px]" style={{ backgroundColor: agent.color }} />
        <div className="relative p-6 pb-4" style={{ background: `linear-gradient(135deg, ${agent.color}15, transparent)` }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-2"
              style={{ backgroundColor: agent.color + '15', color: agent.color, borderColor: agent.color + '40' }}
            >
              {agent.name.split(' ').pop()?.[0] || agent.name[0]}
            </div>
            <div>
              <h2 className="font-display text-2xl uppercase" style={{ color: agent.color }}>{agent.name}</h2>
              <p className="text-muted-foreground text-sm">{agent.personality}</p>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-px bg-border mx-6 rounded-sm overflow-hidden mb-4">
          <div className="bg-muted p-3 text-center">
            <p className="text-xl font-bold font-mono" style={{ color: agent.color }}>{votes}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Votes</p>
          </div>
          <div className="bg-muted p-3 text-center">
            <p className="text-xl font-bold font-mono text-foreground">{messages.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Messages</p>
          </div>
          <div className="bg-muted p-3 text-center">
            <p className="text-xl font-bold font-mono text-warning">#{rank}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rank</p>
          </div>
        </div>

        {/* Vote bar */}
        <div className="px-6 mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1 font-mono">
            <span>Vote share</span>
            <span>{votePercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-sm overflow-hidden">
            <div className="h-full rounded-sm transition-all" style={{ width: `${votePercent}%`, backgroundColor: agent.color }} />
          </div>
        </div>

        {/* Extra stats */}
        <div className="px-6 mb-4 flex gap-4 text-xs text-muted-foreground font-mono">
          <span>Avg message: {avgLength} chars</span>
        </div>

        {/* Top quotes */}
        {topQuotes.length > 0 && (
          <div className="px-6 pb-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-display">Memorable Quotes</p>
            <div className="space-y-2">
              {topQuotes.map((q, i) => (
                <div key={i} className="text-sm text-secondary-foreground bg-muted rounded-sm p-3 border-l-2" style={{ borderColor: agent.color }}>
                  "{q.text.slice(0, 120)}{q.text.length > 120 ? '...' : ''}"
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
