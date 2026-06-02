import { useState } from 'react';
import { Zap, MessageSquare, Sparkles, Send, Lock } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { QuickInjects } from './QuickInjects';

export function ChaosPanel() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'rule' | 'topic_change'>('rule');
  const [duration, setDuration] = useState(3);
  const [showAuth, setShowAuth] = useState(false);
  const { user } = useAuth();
  const injectChaos = useArenaStore((s) => s.injectChaos);
  const changeTopic = useArenaStore((s) => s.changeTopic);
  const activeRules = useArenaStore((s) => s.activeRules);
  const session = useArenaStore((s) => s.session);
  const credits = useArenaStore((s) => s.credits);

  const isActive = session?.status === 'active';
  const cost = mode === 'topic_change' ? 5 : duration;
  const canAfford = credits !== null && credits >= cost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const token = await user.getIdToken();
    if (mode === 'topic_change') {
      changeTopic(text.trim(), token);
    } else {
      injectChaos(text.trim(), 'rule', duration, token);
    }
    setText('');
  };

  return (
    <div className="space-y-4">
      {/* Main chaos controls — broadcast control room */}
      <div className="bg-card rounded-sm overflow-hidden">
        {/* Chyron header */}
        <div className="h-[3px] bg-primary" />
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <Zap size={16} className="text-primary" />
          <h2 className="font-display text-sm text-foreground uppercase tracking-wider">
            Chaos Controls
          </h2>
        </div>

        <div className="p-4 space-y-4">
          {!user ? (
            <>
              <div className="flex flex-col items-center gap-2 py-3">
                <Lock size={20} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground text-center">
                  Sign in to inject chaos into the debate
                </p>
                <button
                  onClick={() => setShowAuth(true)}
                  className="px-4 py-2 rounded-sm bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all"
                >
                  Sign In to Inject
                </button>
              </div>
              <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
            </>
          ) : (
            <>
              {/* Mode toggle */}
              <div className="flex gap-1 bg-background rounded-sm p-1">
                <button
                  onClick={() => setMode('rule')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-sm transition-colors ${
                    mode === 'rule'
                      ? 'bg-muted text-accent'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles size={14} />
                  Add Rule
                </button>
                <button
                  onClick={() => setMode('topic_change')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-sm transition-colors ${
                    mode === 'topic_change'
                      ? 'bg-muted text-accent'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MessageSquare size={14} />
                  New Topic
                </button>
              </div>

              {/* Duration selector */}
              {mode === 'rule' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((t) => (
                      <button
                        key={t}
                        onClick={() => setDuration(t)}
                        className={`h-7 px-2 rounded-sm text-xs font-bold transition-colors ${
                          duration === t
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground border border-border'
                        }`}
                      >
                        {t} {t === 1 ? 'turn' : 'turns'}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    = {duration} credit{duration !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {mode === 'topic_change' && (
                <p className="text-[10px] text-muted-foreground font-mono">5 credits per topic suggestion</p>
              )}

              {/* Input */}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    mode === 'rule'
                      ? 'e.g. "Everyone must speak in rhymes"'
                      : 'e.g. "Is cereal a soup?"'
                  }
                  maxLength={200}
                  disabled={!isActive}
                  className="flex-1 px-3 py-2 rounded-sm bg-background border border-input text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-40"
                />
                <button
                  type="submit"
                  disabled={!isActive || !text.trim() || !canAfford}
                  title={!canAfford ? 'Not enough credits' : undefined}
                  className="px-3 py-2 rounded-sm bg-accent text-accent-foreground hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              </form>

              {credits !== null && !canAfford && (
                <p className="text-[10px] text-destructive font-mono">
                  Not enough credits ({credits} available, {cost} needed)
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quick inject presets */}
      <div className="bg-card rounded-sm overflow-hidden">
        <div className="h-[2px] bg-accent/40" />
        <div className="p-4">
          <QuickInjects />
        </div>
      </div>

      {/* Active rules — broadcast alert style */}
      {activeRules.length > 0 && (
        <div className="bg-card rounded-sm overflow-hidden">
          <div className="h-[2px] bg-warning/60" />
          <div className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-display">
              Active Rules
            </p>
            {activeRules.map((rule, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-sm bg-primary/10 border border-primary/30 text-xs text-secondary-foreground leading-relaxed"
              >
                {rule}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
