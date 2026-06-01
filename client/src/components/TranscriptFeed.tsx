import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useArenaStore } from '../store/arena';

export function TranscriptFeed() {
  const transcripts = useArenaStore((s) => s.transcripts);
  const streamingTranscript = useArenaStore((s) => s.streamingTranscript);
  const agents = useArenaStore((s) => s.agents);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const bottomRef = useRef<HTMLDivElement>(null);

  const getAgentColor = (agentId: string) => {
    if (agentId === 'challenger') return '#FF2D6B';
    return agents.find((a) => a.id === agentId)?.color || '#888';
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts.length, streamingTranscript?.text]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-arena-border-subtle">
        <h2 className="font-display font-semibold text-sm text-arena-text-bright uppercase tracking-wide">
          Live Transcript
        </h2>
        <span className="text-[10px] text-arena-text-muted font-mono">
          {transcripts.length} messages
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 pb-16 space-y-1">
        {transcripts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-arena-cyan/50 rounded-full animate-pulse"
                  style={{ animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </div>
            <p className="text-arena-text-muted text-sm italic">
              Warming up... agents are preparing their arguments
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {transcripts.map((msg, i) => {
            const color = getAgentColor(msg.agentId);
            const isActive = msg.agentId === currentSpeaker && i === transcripts.length - 1;
            const isChallenger = msg.agentId === 'challenger';

            return (
              <motion.div
                key={`${msg.timestamp}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2 py-1.5 rounded-md px-2 transition-colors ${
                  isActive ? 'bg-arena-elevated/50' : 'hover:bg-arena-elevated/30'
                } ${isChallenger ? 'border-l-2 border-arena-magenta' : isActive ? 'border-l-2' : ''}`}
                style={isActive && !isChallenger ? { borderColor: color } : undefined}
              >
                <span
                  className="font-mono text-xs font-semibold shrink-0 mt-0.5"
                  style={{ color }}
                >
                  {isChallenger ? 'CHALLENGER' : msg.agentName}
                </span>
                <span className="font-mono text-xs text-arena-text-secondary leading-relaxed break-words overflow-hidden">
                  {msg.text}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Currently streaming transcript — word-by-word as agent speaks */}
        {streamingTranscript && (
          <motion.div
            key="streaming"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex gap-2 py-1.5 rounded-md px-2 bg-arena-elevated/50 border-l-2"
            style={{ borderColor: getAgentColor(streamingTranscript.agentId) }}
          >
            <span
              className="font-mono text-xs font-semibold shrink-0 mt-0.5"
              style={{ color: getAgentColor(streamingTranscript.agentId) }}
            >
              {streamingTranscript.agentName}
            </span>
            <span className="font-mono text-xs text-arena-text-secondary leading-relaxed break-words overflow-hidden">
              {streamingTranscript.text}
              <span className="inline-block w-1.5 h-3.5 bg-arena-cyan/70 ml-0.5 animate-pulse" />
            </span>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
