import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentInfo {
  id: string;
  name: string;
  personality: string;
  color: string;
}

const PROFILE_PICS: Record<string, string> = {
  rico: '/images/AgentProfiles/Rico_ProfilePic.png',
  ashworth: '/images/AgentProfiles/Ashworth_ProfilePic.png',
  darius: '/images/AgentProfiles/Darius_ProfilePic.png',
};

function getProfilePic(name: string): string | null {
  const lower = name.toLowerCase();
  for (const key of Object.keys(PROFILE_PICS)) {
    if (lower.includes(key)) return PROFILE_PICS[key];
  }
  return null;
}

interface AgentEntranceProps {
  agents: AgentInfo[];
  onComplete: () => void;
}

export function AgentEntrance({ agents, onComplete }: AgentEntranceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (currentIndex < agents.length) {
      const timer = setTimeout(() => setCurrentIndex((i) => i + 1), 1500);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setDone(true), 600);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, agents.length]);

  useEffect(() => {
    if (done) onComplete();
  }, [done, onComplete]);

  const current = agents[currentIndex];

  return (
    <div className="fixed inset-0 z-40 bg-background/95 flex items-center justify-center overflow-hidden">
      {/* Grid background — broadcast control room */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `linear-gradient(rgba(59,154,225,0.15) 1px, transparent 1px),
          linear-gradient(90deg, rgba(59,154,225,0.15) 1px, transparent 1px)`,
        backgroundSize: '80px 80px',
      }} />

      {/* VS watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[120px] md:text-[200px] font-display text-border/20 select-none">
          VS
        </span>
      </div>

      {/* Agent entrance — broadcast intro */}
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ x: -200, opacity: 0, scale: 0.8 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 200, opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="relative z-10 flex flex-col items-center gap-4"
          >
            {/* Glow flash */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 0.6, 0], scale: [0.5, 1.5, 2] }}
              transition={{ duration: 0.8 }}
              className="absolute w-64 h-64 rounded-full blur-3xl"
              style={{ backgroundColor: current.color }}
            />

            {/* Avatar circle */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 300 }}
              className="relative w-28 h-28 rounded-full flex items-center justify-center text-5xl font-bold border-4 overflow-hidden"
              style={{
                backgroundColor: current.color + '15',
                color: current.color,
                borderColor: current.color + '60',
              }}
            >
              {getProfilePic(current.name) ? (
                <img
                  src={getProfilePic(current.name)!}
                  alt={current.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                current.name.split(' ').pop()?.[0] || current.name[0]
              )}
            </motion.div>

            {/* Lower-third name plate — broadcast style */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="w-80 origin-left"
            >
              <div className="h-[3px]" style={{ backgroundColor: current.color }} />
              <div className="bg-card/90 backdrop-blur-sm px-5 py-3">
                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 }}
                  className="font-display text-3xl md:text-4xl uppercase text-center"
                  style={{ color: current.color }}
                >
                  {current.name}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 }}
                  className="text-muted-foreground text-sm tracking-widest uppercase text-center"
                >
                  {current.personality}
                </motion.p>
              </div>
              <div className="h-[2px]" style={{ backgroundColor: current.color, opacity: 0.4 }} />
            </motion.div>

            {/* Panelist number */}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-muted-foreground text-sm font-mono tracking-wider"
            >
              PANELIST {currentIndex + 1} OF {agents.length}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute bottom-8 flex gap-3">
        {agents.map((a, i) => (
          <div
            key={a.id}
            className="w-3 h-3 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i <= currentIndex ? a.color : 'rgba(123,138,158,0.3)',
              boxShadow: i === currentIndex ? `0 0 12px ${a.color}` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
