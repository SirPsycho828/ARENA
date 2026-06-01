import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Clock, MessageSquare, ThumbsUp } from 'lucide-react';

interface AgentInfo {
  id: string;
  name: string;
  personality: string;
  color: string;
}

interface VictoryData {
  winner: { id: string; name: string; color: string; votes: number } | null;
  voteTallies: Record<string, number>;
  totalMessages: number;
  duration: number;
  agents: AgentInfo[];
}

interface VictoryScreenProps {
  data: VictoryData;
}

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function VictoryScreen({ data }: VictoryScreenProps) {
  const [countdown, setCountdown] = useState(8);
  const totalVotes = Object.values(data.voteTallies).reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Sort agents by votes
  const ranked = [...data.agents]
    .map((a) => ({ ...a, votes: data.voteTallies[a.id] || 0 }))
    .sort((a, b) => b.votes - a.votes);

  const confettiColors = data.winner
    ? [data.winner.color, '#FFD700', '#00F0FF', '#FF2D6B', '#8B5CF6']
    : ['#FFD700', '#00F0FF', '#FF2D6B'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
    >
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-arena-base/95" />

      {/* Spotlight effect */}
      {data.winner && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse at 50% 40%, ${data.winner.color}15, transparent 60%)`,
        }} />
      )}

      {/* Confetti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-3 animate-confetti"
            style={{
              left: `${Math.random() * 100}%`,
              backgroundColor: confettiColors[i % confettiColors.length],
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg w-full px-6">
        {/* Trophy */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        >
          <Trophy size={56} className="text-yellow-400" />
        </motion.div>

        {/* Winner name */}
        {data.winner ? (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <p className="text-arena-text-muted text-sm uppercase tracking-widest mb-2">Winner</p>
            <h1
              className="font-display text-5xl md:text-6xl font-bold"
              style={{ color: data.winner.color, textShadow: `0 0 40px ${data.winner.color}60` }}
            >
              {data.winner.name}
            </h1>
            <p className="text-arena-text-secondary mt-1">{data.winner.votes} votes</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <h1 className="font-display text-4xl font-bold text-arena-text-bright">It's a Tie!</h1>
          </motion.div>
        )}

        {/* Vote breakdown */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="w-full space-y-2 bg-arena-surface/80 rounded-xl p-4 border border-arena-border-subtle"
        >
          {ranked.map((agent, i) => {
            const pct = totalVotes > 0 ? (agent.votes / totalVotes) * 100 : 0;
            return (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="text-arena-text-muted text-sm w-5">#{i + 1}</span>
                <span className="font-semibold text-sm w-28 truncate" style={{ color: agent.color }}>
                  {agent.name}
                </span>
                <div className="flex-1 h-5 bg-arena-elevated rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.8 + i * 0.15, duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                </div>
                <span className="text-sm font-mono text-arena-text-secondary w-16 text-right">
                  {agent.votes} ({Math.round(pct)}%)
                </span>
              </div>
            );
          })}
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex gap-6 text-arena-text-muted text-sm"
        >
          <span className="flex items-center gap-1.5"><Clock size={14} /> {formatDuration(data.duration)}</span>
          <span className="flex items-center gap-1.5"><MessageSquare size={14} /> {data.totalMessages} messages</span>
          <span className="flex items-center gap-1.5"><ThumbsUp size={14} /> {totalVotes} votes</span>
        </motion.div>

        {/* Next debate countdown */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-arena-text-muted text-sm mt-4"
        >
          {countdown > 0 ? `Next debate in ${countdown}s...` : 'Starting new debate...'}
        </motion.p>
      </div>
    </motion.div>
  );
}
