import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useArenaStore } from '../store/arena';

export function ChaosStatusBar() {
  const chaosStatus = useArenaStore((s) => s.chaosStatus);

  if (chaosStatus.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="mx-4 mb-2"
      >
        <div className="bg-arena-magenta/10 border border-arena-magenta/30 rounded-lg px-3 py-2 flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-arena-magenta shrink-0">
            <Zap size={14} className="animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Chaos Active</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {chaosStatus.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-arena-magenta/15 border border-arena-magenta/20 shrink-0"
              >
                <span className="text-xs text-arena-text-secondary max-w-[200px] truncate">
                  {rule.source === 'voice_challenge' && rule.viewerName
                    ? `Challenge from ${rule.viewerName}`
                    : rule.text}
                </span>
                <span className="text-[10px] font-mono text-arena-magenta font-bold">
                  {rule.turnsRemaining}t
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
