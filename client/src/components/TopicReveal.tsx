import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useArenaStore } from '../store/arena';

type Phase = 'reveal' | 'fly' | 'done';

export function TopicReveal() {
  const pendingTopic = useArenaStore((s) => s.pendingTopic);
  const dismissTopic = useArenaStore((s) => s.dismissTopic);
  const [phase, setPhase] = useState<Phase>('done');
  const [displayTopic, setDisplayTopic] = useState('');

  useEffect(() => {
    if (!pendingTopic) return;
    setDisplayTopic(pendingTopic);
    setPhase('reveal');

    // After 3s in full-screen reveal, fly to header
    const flyTimer = setTimeout(() => setPhase('fly'), 3000);
    // After fly animation completes, dismiss
    const doneTimer = setTimeout(() => {
      setPhase('done');
      dismissTopic();
    }, 3800);

    return () => {
      clearTimeout(flyTimer);
      clearTimeout(doneTimer);
    };
  }, [pendingTopic, dismissTopic]);

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="topic-reveal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          {/* Dark overlay */}
          <motion.div
            className="absolute inset-0 bg-background/90 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'fly' ? 0 : 1 }}
            transition={{ duration: phase === 'fly' ? 0.6 : 0.3 }}
          />

          {/* Scanline accent */}
          <motion.div
            className="absolute left-0 right-0 h-px bg-primary"
            initial={{ top: '0%', opacity: 0 }}
            animate={{
              top: phase === 'fly' ? '0%' : '50%',
              opacity: phase === 'fly' ? 0 : [0, 1, 1, 0.3],
            }}
            transition={{ duration: 0.6 }}
          />

          {/* Content container */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-4 px-8"
            animate={
              phase === 'fly'
                ? { y: '-45vh', scale: 0.35, opacity: 0 }
                : { y: 0, scale: 1, opacity: 1 }
            }
            transition={
              phase === 'fly'
                ? { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0.4 }
            }
          >
            {/* "NEW TOPIC" label */}
            <motion.div
              initial={{ opacity: 0, y: 20, letterSpacing: '0.5em' }}
              animate={{ opacity: 1, y: 0, letterSpacing: '0.3em' }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex items-center gap-3"
            >
              <div className="w-8 h-px bg-primary" />
              <span className="font-mono text-xs text-primary uppercase tracking-[0.3em]">
                New Topic
              </span>
              <div className="w-8 h-px bg-primary" />
            </motion.div>

            {/* Topic text — large centered */}
            <motion.h1
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-3xl sm:text-5xl md:text-6xl tracking-wider text-foreground text-center max-w-4xl leading-tight"
            >
              {displayTopic}
            </motion.h1>

            {/* Accent bar underneath */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="w-32 h-1 bg-primary rounded-full origin-center"
            />

            {/* Glowing pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-xl"
              initial={{ boxShadow: '0 0 0 0 rgba(var(--primary-rgb, 255 0 0) / 0)' }}
              animate={{
                boxShadow: [
                  '0 0 0 0px rgba(255, 0, 68, 0)',
                  '0 0 60px 10px rgba(255, 0, 68, 0.15)',
                  '0 0 0 0px rgba(255, 0, 68, 0)',
                ],
              }}
              transition={{ duration: 2, repeat: 1 }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
