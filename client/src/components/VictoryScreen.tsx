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

  const ranked = [...data.agents]
    .map((a) => ({ ...a, votes: data.voteTallies[a.id] || 0 }))
    .sort((a, b) => b.votes - a.votes);

  const confettiColors = data.winner
    ? [data.winner.color, '#FFC800', '#3B9AE1', '#E63946', '#8B5CF6']
    : ['#FFC800', '#3B9AE1', '#E63946'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
    >
      <div className="absolute inset-0 bg-background/95" />

      {/* Spotlight */}
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

      {/* Content — broadcast results card */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg w-full px-6">
        {/* Trophy */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        >
          <Trophy size={56} className="text-breaking" />
        </motion.div>

        {/* Winner lower-third */}
        {data.winner ? (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="w-full origin-left"
          >
            <div className="h-[3px]" style={{ backgroundColor: data.winner.color }} />
            <div className="bg-card/90 backdrop-blur-sm px-6 py-4 text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-[0.2em] mb-1">Tonight's Winner</p>
              <h1
                className="font-display text-5xl md:text-6xl uppercase"
                style={{ color: data.winner.color, textShadow: `0 0 40px ${data.winner.color}60` }}
              >
                {data.winner.name}
              </h1>
              <p className="text-muted-foreground mt-1 font-mono tabular-nums">{data.winner.votes} votes</p>
            </div>
            <div className="h-[2px]" style={{ backgroundColor: data.winner.color, opacity: 0.4 }} />
          </motion.div>
        ) : (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <h1 className="font-display text-4xl uppercase text-foreground">It's a Tie!</h1>
          </motion.div>
        )}

        {/* Vote breakdown — election night style */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="w-full space-y-2 bg-card/80 rounded-sm p-4 border border-border"
        >
          {ranked.map((agent, i) => {
            const pct = totalVotes > 0 ? (agent.votes / totalVotes) * 100 : 0;
            return (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="text-muted-foreground text-sm font-mono w-5">#{i + 1}</span>
                <span className="font-display text-sm w-28 truncate uppercase" style={{ color: agent.color }}>
                  {agent.name}
                </span>
                <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.8 + i * 0.15, duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-sm"
                    style={{ backgroundColor: agent.color }}
                  />
                </div>
                <span className="text-sm font-mono text-muted-foreground w-16 text-right tabular-nums">
                  {agent.votes} ({Math.round(pct)}%)
                </span>
              </div>
            );
          })}
        </motion.div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex gap-6 text-muted-foreground text-sm font-mono"
        >
          <span className="flex items-center gap-1.5"><Clock size={14} /> {formatDuration(data.duration)}</span>
          <span className="flex items-center gap-1.5"><MessageSquare size={14} /> {data.totalMessages}</span>
          <span className="flex items-center gap-1.5"><ThumbsUp size={14} /> {totalVotes}</span>
        </motion.div>

        {/* Next debate countdown */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-muted-foreground text-sm mt-4 font-mono"
        >
          {countdown > 0 ? `Next debate in ${countdown}s...` : 'Starting new debate...'}
        </motion.p>
      </div>
    </motion.div>
  );
}
