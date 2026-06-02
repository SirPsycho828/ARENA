import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Zap, Mic, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useArenaStore } from '../store/arena';

interface CreditShopProps {
  open: boolean;
  onClose: () => void;
}

const PACKAGES = [
  { id: 'starter', credits: 10, price: '$5', label: 'STARTER', highlight: false },
  { id: 'popular', credits: 25, price: '$10', label: 'POPULAR', highlight: true },
  { id: 'whale', credits: 50, price: '$18', label: 'WHALE', highlight: false },
];

const COSTS = [
  { icon: Zap, label: 'Chaos Rule', cost: '1/turn', color: 'text-primary' },
  { icon: Zap, label: 'Quick Chaos', cost: '3', color: 'text-primary' },
  { icon: MessageSquare, label: 'Topic', cost: '5', color: 'text-accent' },
  { icon: Mic, label: 'Voice Challenge', cost: '3', color: 'text-accent' },
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-card border border-border rounded-md w-full max-w-sm mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — broadcast lower-third style */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-warning animate-lower-third-bar" />
                <Coins size={16} className="text-warning" />
                <h2 className="font-display text-lg tracking-wider text-card-foreground">
                  CREDIT SHOP
                </h2>
              </div>
              <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Balance display */}
              {credits !== null && (
                <div className="flex items-center justify-between px-3 py-2 rounded-sm bg-muted border border-border">
                  <span className="text-xs font-body text-muted-foreground tracking-wider uppercase">Balance</span>
                  <span className="font-display text-xl tracking-wider text-warning">{credits}</span>
                </div>
              )}

              {/* Credit packages */}
              <div className="space-y-2">
                {PACKAGES.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={loading !== null}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-sm border transition-all disabled:opacity-50 cursor-pointer ${
                      pkg.highlight
                        ? 'border-accent bg-accent/5 hover:bg-accent/10'
                        : 'border-border bg-muted hover:bg-muted/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-display text-2xl tracking-wider text-card-foreground">
                        {pkg.credits}
                      </span>
                      <div className="text-left">
                        <span className="text-xs font-body text-muted-foreground">credits</span>
                        {pkg.highlight && (
                          <div className="mt-0.5">
                            <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold tracking-wider bg-accent/20 text-accent">
                              BEST VALUE
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-display text-lg tracking-wider text-card-foreground">
                      {loading === pkg.id ? '...' : pkg.price}
                    </span>
                  </button>
                ))}
              </div>

              {/* Cost reference */}
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase mb-2">CREDIT COSTS</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {COSTS.map((cost) => (
                    <div key={cost.label} className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <cost.icon size={10} className={cost.color} />
                      <span>{cost.label}</span>
                      <span className="ml-auto text-card-foreground">{cost.cost}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] font-mono text-muted-foreground text-center tracking-wider">
                Secure payment via Stripe. Credits never expire.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
