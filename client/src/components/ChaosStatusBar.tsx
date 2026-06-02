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
        className="mx-3 mb-2"
      >
        <div className="bg-primary/10 border border-primary/30 rounded-sm px-3 py-1.5 flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-primary shrink-0">
            <Zap size={12} className="animate-live-pulse" />
            <span className="text-[10px] font-display tracking-wider">CHAOS ACTIVE</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {chaosStatus.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-primary/10 border border-primary/20 shrink-0"
              >
                <span className="text-[10px] font-body text-card-foreground max-w-[200px] truncate">
                  {rule.source === 'voice_challenge' && rule.viewerName
                    ? `Challenge from ${rule.viewerName}`
                    : rule.text}
                </span>
                <span className="text-[9px] font-mono text-primary font-bold">
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
