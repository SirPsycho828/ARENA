import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, Mic } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { AgentStats } from './AgentStats';
import { AgentVideo } from './AgentVideo';

interface Props {
  id: string;
  name: string;
  personality: string;
  color: string;
}

export function AgentPanel({ id, name, personality, color }: Props) {
  const [showStats, setShowStats] = useState(false);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const voteTallies = useArenaStore((s) => s.voteTallies);
  const vote = useArenaStore((s) => s.vote);
  const challengerActive = useArenaStore((s) => s.challengerActive);
  const challengerAgentId = useArenaStore((s) => s.challengerAgentId);
  const challengerViewerName = useArenaStore((s) => s.challengerViewerName);
  const isSpeaking = currentSpeaker === id;
  const isChallenged = challengerActive && challengerAgentId === id;
  const votes = voteTallies[id] || 0;

  const totalVotes = Object.values(voteTallies).reduce((a, b) => a + b, 0);
  const votePercent = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
  const momentum = votePercent > 70 ? 'dominating' : votePercent > 50 ? 'favorite' : votePercent > 30 ? 'rising' : 'normal';
  const isLeading = momentum !== 'normal' && votes > 0;

  const borderClass = isChallenged
    ? 'border-primary animate-challenger-glow'
    : isSpeaking
    ? 'border-accent animate-speaker-glow'
    : momentum === 'dominating'
    ? 'border-warning animate-momentum-dominating'
    : momentum === 'favorite'
    ? 'border-warning/70 animate-momentum-favorite'
    : momentum === 'rising'
    ? 'border-warning/40 animate-momentum-rising'
    : 'border-border hover:border-muted-foreground/30';

  return (
    <motion.div
      className={`relative rounded-sm border-2 overflow-hidden transition-all duration-300 ${borderClass}`}
      style={{ '--agent-color': color } as React.CSSProperties}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Video / Avatar */}
      <div className="aspect-video bg-card flex items-center justify-center relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${color}40, transparent 70%)`,
          }}
        />
        <div className="relative z-10 w-full h-full">
          <AgentVideo agentId={id} agentName={name} color={color} />
        </div>

      </div>

      {/* ─── Cable news lower-third ─── */}
      <div className="absolute bottom-0 inset-x-0 z-20">
        {/* Top color bar — the signature chyron accent */}
        <div className="h-1" style={{ backgroundColor: color }} />
        {/* Name strip — solid opaque, like a real broadcast graphic */}
        <div className="bg-[#0a0f18] px-3 py-1.5">
          <div className="flex items-center justify-between">
            <h3
              className="font-display text-base uppercase leading-tight tracking-wider cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color }}
              onClick={() => setShowStats(true)}
            >
              {name}
            </h3>
            <button
              onClick={() => vote(id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-white/10 hover:bg-white/20 transition-all text-xs group"
            >
              <ThumbsUp size={12} className="group-hover:text-accent transition-colors" />
              <span className={isLeading ? 'text-accent font-semibold' : 'text-foreground'}>{votes}</span>
            </button>
          </div>
        </div>
        {/* Title strip — slightly lighter, two-tone like CNN */}
        <div className="bg-[#111827] px-3 py-1">
          <p className="text-[11px] text-[#94a3b8] tracking-wide font-body">
            {personality}
          </p>
        </div>
      </div>

      {/* Status badges — top-right broadcast overlays */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end">
        {isSpeaking && !isChallenged && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-accent text-accent-foreground tracking-wider"
          >
            Speaking
          </motion.span>
        )}
        {isChallenged && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-primary text-primary-foreground animate-challenger-badge tracking-wider"
          >
            <Mic size={10} />
            {challengerViewerName ? `${challengerViewerName} CHALLENGING` : 'LIVE CHALLENGER'}
          </motion.span>
        )}
        {momentum === 'dominating' && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase bg-warning/30 text-warning border border-warning/40"
          >
            DOMINATING
          </motion.span>
        )}
        {momentum === 'favorite' && (
          <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase bg-warning/20 text-warning">
            CROWD FAVORITE
          </span>
        )}
        {momentum === 'rising' && (
          <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase bg-warning/10 text-warning/80">
            Rising
          </span>
        )}
      </div>

      {/* Stats modal */}
      <AnimatePresence>
        {showStats && <AgentStats agentId={id} onClose={() => setShowStats(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
