import { motion } from 'framer-motion';
import { ThumbsUp, Mic } from 'lucide-react';
import { useArenaStore } from '../store/arena';

interface Props {
  id: string;
  name: string;
  personality: string;
  color: string;
}

export function AgentPanel({ id, name, personality, color }: Props) {
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const voteTallies = useArenaStore((s) => s.voteTallies);
  const vote = useArenaStore((s) => s.vote);
  const challengerActive = useArenaStore((s) => s.challengerActive);
  const challengerAgentId = useArenaStore((s) => s.challengerAgentId);
  const isSpeaking = currentSpeaker === id;
  const isChallenged = challengerActive && challengerAgentId === id;
  const votes = voteTallies[id] || 0;

  // Determine highest vote count for "leading" indicator
  const maxVotes = Math.max(...Object.values(voteTallies), 0);
  const isLeading = votes > 0 && votes === maxVotes;

  return (
    <motion.div
      className={`relative rounded-xl border-2 overflow-hidden transition-all duration-300 ${
        isChallenged
          ? 'border-arena-magenta animate-challenger-glow'
          : isSpeaking
          ? 'border-arena-cyan animate-speaker-glow'
          : 'border-arena-border-subtle hover:border-arena-border'
      }`}
      style={{ '--agent-color': color } as React.CSSProperties}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Video placeholder — will be replaced with WebRTC widget */}
      <div className="aspect-video bg-arena-elevated flex items-center justify-center relative overflow-hidden">
        {/* Animated background gradient */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${color}40, transparent 70%)`,
          }}
        />
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold relative z-10"
          style={{ backgroundColor: color + '20', color, border: `2px solid ${color}40` }}
        >
          {name.split(' ').pop()?.[0] || name[0]}
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
              className="font-display font-semibold text-base leading-tight"
              style={{ color }}
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
            LIVE CHALLENGER
          </motion.span>
        )}
        {isLeading && votes > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-arena-warning/20 text-arena-warning">
            Leading
          </span>
        )}
      </div>
    </motion.div>
  );
}
