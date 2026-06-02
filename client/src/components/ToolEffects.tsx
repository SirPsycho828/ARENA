import { AnimatePresence, motion } from 'framer-motion';
import { useArenaStore } from '../store/arena';

export function ToolEffects() {
  const effect = useArenaStore((s) => s.activeToolEffect);

  return (
    <AnimatePresence>
      {effect?.tool === 'dramatic_pause' && (
        <motion.div
          key="dramatic_pause"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="fixed inset-0 z-40 pointer-events-none bg-black/50 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="text-white/80 font-display text-lg tracking-widest uppercase"
          >
            {effect.agentName}
          </motion.div>
        </motion.div>
      )}

      {effect?.tool === 'crowd_appeal' && (
        <motion.div
          key="crowd_appeal"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
        >
          <div className="px-6 py-3 rounded-sm bg-primary/90 text-primary-foreground font-display text-sm tracking-widest uppercase text-center shadow-lg shadow-primary/40 animate-button-pulse">
            VOTE NOW &mdash; {effect.agentName} wants YOUR support!
          </div>
        </motion.div>
      )}

      {effect?.tool === 'mic_drop' && (
        <motion.div
          key="mic_drop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 pointer-events-none"
        >
          {/* Flash */}
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-white"
          />
          {/* Shake wrapper */}
          <motion.div
            animate={{ x: [0, -10, 10, -5, 5, 0], rotate: [-10, 5, 0] }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="text-6xl">🎤</div>
          </motion.div>
          {/* Emoji explosion */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{
                  scale: [0, 1.5, 1],
                  x: (Math.random() - 0.5) * 400,
                  y: (Math.random() - 0.5) * 400,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1.5, delay: 0.1 + i * 0.05 }}
                className="absolute text-3xl"
              >
                {['🔥', '💥', '⚡', '🎤', '👑', '💀'][i % 6]}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
