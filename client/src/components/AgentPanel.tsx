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

  // Determine momentum tier based on vote percentage
  const totalVotes = Object.values(voteTallies).reduce((a, b) => a + b, 0);
  const votePercent = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
  const momentum = votePercent > 70 ? 'dominating' : votePercent > 50 ? 'favorite' : votePercent > 30 ? 'rising' : 'normal';
  const isLeading = momentum !== 'normal' && votes > 0;

  const momentumClass = isChallenged
    ? 'border-arena-magenta animate-challenger-glow'
    : isSpeaking
    ? 'border-arena-cyan animate-speaker-glow'
    : momentum === 'dominating'
    ? 'border-arena-warning animate-momentum-dominating'
    : momentum === 'favorite'
    ? 'border-arena-warning/70 animate-momentum-favorite'
    : momentum === 'rising'
    ? 'border-arena-warning/40 animate-momentum-rising'
    : 'border-arena-border-subtle hover:border-arena-border';

  return (
    <motion.div
      className={`relative rounded-xl border-2 overflow-hidden transition-all duration-300 ${momentumClass}`}
      style={{ '--agent-color': color } as React.CSSProperties}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Video / Avatar */}
      <div className="aspect-video bg-arena-elevated flex items-center justify-center relative overflow-hidden">
        {/* Animated background gradient */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${color}40, transparent 70%)`,
          }}
        />
        <div className="relative z-10 w-full h-full">
          <AgentVideo agentId={id} agentName={name} color={color} />
        </div>

        {/* Speaking audio wave indicator */}
        {isSpeaking && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-[3px] h-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-[3px] bg-arena-cyan rounded-full animate-waveform"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[rgba(10,10,15,0.95)] via-[rgba(10,10,15,0.7)] to-transparent p-3 pt-8">
        <div className="flex items-end justify-between">
          <div>
            <h3
              className="font-display font-semibold text-base leading-tight cursor-pointer hover:underline"
              style={{ color }}
              onClick={() => setShowStats(true)}
            >
              {name}
            </h3>
            <p className="text-[11px] text-arena-text-muted mt-0.5">{personality}</p>
          </div>
          <button
            onClick={() => vote(id)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-arena-hover/80 hover:bg-arena-border-subtle transition-all text-sm group"
          >
            <ThumbsUp size={14} className="group-hover:text-arena-cyan transition-colors" />
            <span className={isLeading ? 'text-arena-cyan font-semibold' : ''}>{votes}</span>
          </button>
        </div>
      </div>

      {/* Status badges */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
        {isSpeaking && !isChallenged && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-arena-cyan text-arena-base"
          >
            Speaking
          </motion.span>
        )}
        {isChallenged && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-arena-magenta text-white animate-challenger-badge"
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
            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-arena-warning/30 text-arena-warning border border-arena-warning/40"
          >
            DOMINATING
          </motion.span>
        )}
        {momentum === 'favorite' && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-arena-warning/20 text-arena-warning">
            CROWD FAVORITE
          </span>
        )}
        {momentum === 'rising' && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-arena-warning/10 text-arena-warning/80">
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
