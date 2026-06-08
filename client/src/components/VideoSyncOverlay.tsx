import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SYNC_DURATION_MS = 15000;
const TEXT_STATES = ['SYNCING VIDEO...', 'CONNECTING...', 'INITIALIZING...', 'ALMOST READY...'];

export function VideoSyncOverlay() {
  const [visible, setVisible] = useState(true);
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), SYNC_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setTextIndex((i) => (i + 1) % TEXT_STATES.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-lg"
        >
          <div className="flex flex-col items-center gap-6">
            {/* Spinner */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              {/* Base Glow */}
              <div className="absolute inset-0 rounded-full blur-xl animate-pulse bg-cyan-500/10" />

              {/* Outer Dashed Ring */}
              <div className="absolute inset-0 rounded-full border border-dashed border-cyan-500/20 animate-[spin_10s_linear_infinite]" />

              {/* Main Arc */}
              <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.4)] animate-[spin_2s_linear_infinite]" />

              {/* Reverse Arc */}
              <div className="absolute inset-3 rounded-full border-2 border-transparent border-b-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)] animate-[spin_3s_linear_infinite_reverse]" />

              {/* Inner Fast Ring */}
              <div className="absolute inset-5 rounded-full border border-transparent border-l-white/50 animate-[spin_1s_ease-in-out_infinite]" />

              {/* Orbital Dot */}
              <div className="absolute inset-0 animate-[spin_4s_linear_infinite]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
              </div>

              {/* Center Core */}
              <div className="absolute w-2 h-2 rounded-full animate-pulse bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            </div>

            {/* Cycling Text */}
            <AnimatePresence mode="wait">
              <motion.span
                key={textIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="text-[10px] font-medium tracking-[0.3em] uppercase text-cyan-200/70"
              >
                {TEXT_STATES[textIndex]}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
