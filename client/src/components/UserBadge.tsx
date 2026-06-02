import { useState } from 'react';
import { User, LogOut, Coins } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useArenaStore } from '../store/arena';
import { AuthModal } from './AuthModal';
import { CreditShop } from './CreditShop';

export function UserBadge() {
  const { user, displayName, signOut } = useAuth();
  const credits = useArenaStore((s) => s.credits);
  const [showAuth, setShowAuth] = useState(false);
  const [showShop, setShowShop] = useState(false);

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowAuth(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-muted border border-border text-muted-foreground text-xs font-body hover:text-accent hover:border-accent/40 transition-colors cursor-pointer"
        >
          <User size={14} />
          Sign In
        </button>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Credit balance */}
        <button
          onClick={() => setShowShop(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-sm bg-muted border border-border hover:border-warning/40 transition-colors cursor-pointer"
          title="Buy credits"
        >
          <Coins size={11} className="text-warning" />
          <span className="text-[10px] font-mono font-bold text-warning">
            {credits ?? '...'}
          </span>
        </button>

        {/* User info */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-muted border border-border">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="w-4 h-4 rounded-sm" />
          ) : (
            <div className="w-4 h-4 rounded-sm bg-accent/20 flex items-center justify-center text-[9px] font-bold text-accent">
              {(displayName || user.email || '?')[0].toUpperCase()}
            </div>
          )}
          <span className="text-[10px] font-mono text-muted-foreground max-w-[80px] truncate hidden sm:inline">
            {displayName || user.email?.split('@')[0] || 'User'}
          </span>
        </div>
        <button
          onClick={() => signOut()}
          className="p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Sign out"
        >
          <LogOut size={12} />
        </button>
      </div>
      <CreditShop open={showShop} onClose={() => setShowShop(false)} />
    </>
  );
}
