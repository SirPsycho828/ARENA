import { useState } from 'react';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';

export function UserBadge() {
  const { user, displayName, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowAuth(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-arena-surface border border-arena-border-subtle text-arena-text-secondary text-xs hover:text-arena-cyan hover:border-arena-cyan/40 transition-colors"
        >
          <User size={14} />
          Sign In
        </button>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-arena-surface border border-arena-border-subtle">
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className="w-5 h-5 rounded-full" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-arena-cyan/20 flex items-center justify-center text-[10px] font-bold text-arena-cyan">
            {(displayName || user.email || '?')[0].toUpperCase()}
          </div>
        )}
        <span className="text-xs text-arena-text-secondary max-w-[100px] truncate">
          {displayName || user.email?.split('@')[0] || 'User'}
        </span>
      </div>
      <button
        onClick={() => signOut()}
        className="text-arena-text-muted hover:text-arena-text transition-colors"
        title="Sign out"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
