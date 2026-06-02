import { useState } from 'react';
import { Zap, MessageSquare, Sparkles, Send } from 'lucide-react';
import { useArenaStore } from '../store/arena';
import { QuickInjects } from './QuickInjects';

export function ChaosPanel() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'rule' | 'topic_change'>('rule');
  const [duration, setDuration] = useState(3);
  const injectChaos = useArenaStore((s) => s.injectChaos);
  const changeTopic = useArenaStore((s) => s.changeTopic);
  const activeRules = useArenaStore((s) => s.activeRules);
  const session = useArenaStore((s) => s.session);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    if (mode === 'topic_change') {
      changeTopic(text.trim());
    } else {
      injectChaos(text.trim(), 'rule', duration);
    }
    setText('');
  };

  const isActive = session?.status === 'active';

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
            <span className="text-[10px] text-arena-text-muted">turns</span>
          </div>
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
            disabled={!isActive || !text.trim()}
            className="px-3 py-2 rounded-lg bg-arena-cyan text-arena-base hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </form>
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
