import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FloatingEmoji {
  emoji: string;
  id: string;
  x: number;
  rotation: number;
}

interface ReactionOverlayProps {
  onReaction: (emoji: string) => void;
  incomingReactions: Array<{ emoji: string; id: string; x?: number }>;
}

const EMOJI_OPTIONS = ['🔥', '😂', '🤯', '👏', '💀', '🎤'];

export function ReactionOverlay({ onReaction, incomingReactions }: ReactionOverlayProps) {
  const [localEmojis, setLocalEmojis] = useState<FloatingEmoji[]>([]);

  const handleClick = useCallback((emoji: string) => {
    const id = `local_${Date.now()}_${Math.random()}`;
    const newEmoji: FloatingEmoji = {
      emoji,
      id,
      x: 40 + Math.random() * 20,
      rotation: (Math.random() - 0.5) * 30,
    };
    setLocalEmojis((prev) => [...prev.slice(-14), newEmoji]);
    onReaction(emoji);

    // Cleanup after animation
    setTimeout(() => {
      setLocalEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2000);
  }, [onReaction]);

  const allFloating = [
    ...localEmojis,
    ...incomingReactions.map((r) => ({
      emoji: r.emoji,
      id: r.id,
      x: r.x ?? Math.random() * 80 + 10,
      rotation: (Math.random() - 0.5) * 30,
    })),
  ];

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Floating emojis */}
      <AnimatePresence>
        {allFloating.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{
              opacity: 0,
              y: -300,
              scale: 0.6,
              rotate: item.rotation,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: 'easeOut' }}
            className="absolute bottom-24 text-3xl"
            style={{ left: `${item.x}%` }}
          >
            {item.emoji}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Reaction bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-arena-base/70 backdrop-blur-md border border-arena-border-subtle/50">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleClick(emoji)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-arena-hover/80 hover:scale-110 active:scale-95 transition-all"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
