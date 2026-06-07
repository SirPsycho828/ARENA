import { motion, AnimatePresence } from 'framer-motion';
import { Phone } from 'lucide-react';
import { useArenaStore } from '../store/arena';

export function CallInBanner() {
  const callInActive = useArenaStore((s) => s.callInActive);

  return (
    <AnimatePresence>
      {callInActive && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 px-5 py-3 rounded-sm bg-card border border-accent/50 shadow-lg shadow-accent/10">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-accent text-white tracking-wider">
              <Phone size={12} />
              CALL-IN
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {callInActive.displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {callInActive.turnsRemaining > 0
                  ? `${callInActive.turnsRemaining} turn${callInActive.turnsRemaining !== 1 ? 's' : ''} remaining`
                  : callInActive.topic}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
