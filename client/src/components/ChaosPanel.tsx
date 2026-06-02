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
      {/* Main chaos controls */}
      <div className="bg-arena-elevated rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-arena-magenta" />
          <h2 className="font-display font-semibold text-base text-arena-text-bright">
            Chaos Controls
          </h2>
        </div>

        {!user ? (
          <>
            <div className="flex flex-col items-center gap-2 py-3">
              <Lock size={20} className="text-arena-text-muted" />
              <p className="text-xs text-arena-text-muted text-center">
                Sign in to inject chaos into the debate
              </p>
              <button
                onClick={() => setShowAuth(true)}
                className="px-4 py-2 rounded-lg bg-arena-magenta text-white font-semibold text-sm hover:brightness-110 transition-all"
              >
                Sign In to Inject
              </button>
            </div>
            <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
          </>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="flex gap-1 bg-arena-base rounded-lg p-1">
              <button
                onClick={() => setMode('rule')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  mode === 'rule'
                    ? 'bg-arena-hover text-arena-cyan'
                    : 'text-arena-text-muted hover:text-arena-text'
                }`}
              >
                <Sparkles size={14} />
                Add Rule
              </button>
              <button
                onClick={() => setMode('topic_change')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  mode === 'topic_change'
                    ? 'bg-arena-hover text-arena-cyan'
                    : 'text-arena-text-muted hover:text-arena-text'
                }`}
              >
                <MessageSquare size={14} />
                New Topic
              </button>
            </div>

            {/* Duration selector (rule mode only) */}
            {mode === 'rule' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-arena-text-muted">Duration:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((t) => (
                    <button
                      key={t}
                      onClick={() => setDuration(t)}
                      className={`w-7 h-7 rounded text-xs font-bold transition-colors ${
                        duration === t
                          ? 'bg-arena-cyan text-arena-base'
                          : 'bg-arena-surface text-arena-text-muted hover:text-arena-text border border-arena-border-subtle'
                      }`}
                    >
                      {t}t
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-arena-text-muted">
                  = {duration} credit{duration !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Cost label for topic mode */}
            {mode === 'topic_change' && (
              <p className="text-[10px] text-arena-text-muted">5 credits per topic suggestion</p>
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
                className="flex-1 px-3 py-2 rounded-lg bg-arena-base border border-arena-border-subtle text-arena-text text-sm placeholder:text-arena-text-muted focus:outline-none focus:ring-2 focus:ring-arena-cyan/50 disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={!isActive || !text.trim() || !canAfford}
                title={!canAfford ? 'Not enough credits' : undefined}
                className="px-3 py-2 rounded-lg bg-arena-cyan text-arena-base hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </form>

            {/* Insufficient credits warning */}
            {credits !== null && !canAfford && (
              <p className="text-[10px] text-arena-error">
                Not enough credits ({credits} available, {cost} needed)
              </p>
            )}
          </>
        )}
      </div>

      {/* Quick inject presets */}
      <div className="bg-arena-elevated rounded-xl p-4">
        <QuickInjects />
      </div>

      {/* Active rules */}
      {activeRules.length > 0 && (
        <div className="bg-arena-elevated rounded-xl p-4 space-y-2">
          <p className="text-xs text-arena-text-muted uppercase tracking-wide font-semibold">
            Active Rules
          </p>
          {activeRules.map((rule, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-lg bg-arena-magenta/10 border border-arena-magenta/30 text-xs text-arena-text-secondary leading-relaxed"
            >
              {rule}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
