import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useArenaStore } from '../store/arena';

interface CreditShopProps {
  open: boolean;
  onClose: () => void;
}

const PACKAGES = [
  { id: 'starter', credits: 10, price: '$5', highlight: false },
  { id: 'popular', credits: 25, price: '$10', highlight: true },
  { id: 'whale', credits: 50, price: '$18', highlight: false },
];

export function CreditShop({ open, onClose }: CreditShopProps) {
  const { user } = useAuth();
  const credits = useArenaStore((s) => s.credits);
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (packageId: string) => {
    if (!user) return;
    setLoading(packageId);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId, token }),
      });
      const { url, error } = await res.json();
      if (url) {
        window.open(url, '_blank');
      } else {
        console.error('Checkout error:', error);
      }
    } catch (err) {
      console.error('Checkout failed:', err);
    } finally {
      setLoading(null);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-arena-elevated border border-arena-border-subtle rounded-2xl p-6 w-full max-w-sm mx-4 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins size={20} className="text-arena-warning" />
                <h2 className="font-display font-bold text-lg text-arena-text-bright">
                  Buy Credits
                </h2>
              </div>
              <button onClick={onClose} className="text-arena-text-muted hover:text-arena-text">
                <X size={18} />
              </button>
            </div>

            {credits !== null && (
              <p className="text-sm text-arena-text-secondary">
                Current balance: <span className="font-bold text-arena-warning">{credits}</span> credits
              </p>
            )}

            <div className="space-y-3">
              {PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={loading !== null}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all ${
                    pkg.highlight
                      ? 'border-arena-cyan bg-arena-cyan/5 hover:bg-arena-cyan/10'
                      : 'border-arena-border-subtle hover:border-arena-border bg-arena-surface'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display font-bold text-xl text-arena-text-bright">
                      {pkg.credits}
                    </span>
                    <span className="text-sm text-arena-text-secondary">credits</span>
                    {pkg.highlight && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-arena-cyan/20 text-arena-cyan">
                        Best Value
                      </span>
                    )}
                  </div>
                  <span className="font-display font-bold text-lg text-arena-text-bright">
                    {loading === pkg.id ? '...' : pkg.price}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-[10px] text-arena-text-muted text-center">
              Secure payment via Stripe. Credits never expire.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
