import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  onEnter: () => void;
}

const TITLE_CHARS = ['A', '.', 'R', '.', 'E', '.', 'N', '.', 'A', '.'];
const SUBTITLE = 'AI Rivalry Exhibition of Neural Agents';

export function SplashScreen({ onEnter }: SplashScreenProps) {
  const [phase, setPhase] = useState<'title' | 'subtitle' | 'ready'>('title');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('subtitle'), TITLE_CHARS.length * 120 + 400);
    const t2 = setTimeout(() => setPhase('ready'), TITLE_CHARS.length * 120 + 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-arena-base flex flex-col items-center justify-center overflow-hidden">
      {/* Animated grid background */}
      <div className="absolute inset-0 animate-grid-pulse" style={{
        backgroundImage: `
          linear-gradient(rgba(0,240,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,240,255,0.05) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }} />

      {/* Scanline */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-arena-cyan/20 to-transparent animate-scanline" />
      </div>

      {/* Vignette overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(10,10,15,0.8) 100%)',
      }} />

      {/* Title: A.R.E.N.A. */}
      <div className="relative z-10 flex items-center gap-0">
        {TITLE_CHARS.map((char, i) => {
          const isDot = char === '.';
          const isFirst = i === 0;
          const isLast = i === TITLE_CHARS.length - 2; // last letter before final dot

          return (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 20, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: i * 0.12,
                duration: 0.4,
                type: 'spring',
                stiffness: 200,
              }}
              className={`font-display font-bold select-none ${
                isDot
                  ? 'text-4xl md:text-6xl text-arena-text-muted mx-0.5'
                  : isFirst
                  ? 'text-6xl md:text-8xl text-arena-cyan animate-text-glow'
                  : isLast
                  ? 'text-6xl md:text-8xl text-arena-magenta'
                  : 'text-6xl md:text-8xl text-arena-text-bright'
              }`}
            >
              {char}
            </motion.span>
          );
        })}
      </div>

      {/* Subtitle */}
      <AnimatePresence>
        {(phase === 'subtitle' || phase === 'ready') && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative z-10 mt-4 text-arena-text-secondary text-sm md:text-base tracking-[0.2em] uppercase font-light"
          >
            {SUBTITLE}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Tagline */}
      <AnimatePresence>
        {(phase === 'subtitle' || phase === 'ready') && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="relative z-10 mt-2 text-arena-text-muted text-xs tracking-wide"
          >
            Where AI personalities clash. You decide who wins.
          </motion.p>
        )}
      </AnimatePresence>

      {/* Enter button */}
      <AnimatePresence>
        {phase === 'ready' && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            onClick={onEnter}
            className="relative z-10 mt-10 px-8 py-3 rounded-lg bg-arena-cyan text-arena-base font-display font-bold text-lg uppercase tracking-wider hover:brightness-110 transition-all animate-button-pulse cursor-pointer"
          >
            Enter the Arena
          </motion.button>
        )}
      </AnimatePresence>

      {/* Version badge */}
      <div className="absolute bottom-4 right-4 text-arena-text-muted/40 text-[10px] font-mono z-10">
        v0.1.0-alpha
      </div>

      {/* Decorative corner brackets */}
      <div className="absolute top-6 left-6 w-8 h-8 border-l-2 border-t-2 border-arena-cyan/20" />
      <div className="absolute top-6 right-6 w-8 h-8 border-r-2 border-t-2 border-arena-cyan/20" />
      <div className="absolute bottom-6 left-6 w-8 h-8 border-l-2 border-b-2 border-arena-cyan/20" />
      <div className="absolute bottom-6 right-6 w-8 h-8 border-r-2 border-b-2 border-arena-cyan/20" />
    </div>
  );
}
