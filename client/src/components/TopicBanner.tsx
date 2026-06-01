import { LiveBadge } from './LiveBadge';
import { SoundToggle } from './SoundToggle';
import { useArenaStore } from '../store/arena';
import { Wifi, WifiOff } from 'lucide-react';

export function TopicBanner() {
  const session = useArenaStore((s) => s.session);
  const connected = useArenaStore((s) => s.connected);

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-arena-border-subtle bg-arena-surface/90 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="font-display font-bold text-xl text-arena-text-bright tracking-tight">
          <span className="text-arena-cyan">A</span>
          <span className="text-arena-text-muted">.</span>
          <span className="text-arena-text-bright">R</span>
          <span className="text-arena-text-muted">.</span>
          <span className="text-arena-text-bright">E</span>
          <span className="text-arena-text-muted">.</span>
          <span className="text-arena-text-bright">N</span>
          <span className="text-arena-text-muted">.</span>
          <span className="text-arena-magenta">A</span>
          <span className="text-arena-text-muted">.</span>
        </h1>
        {session?.status === 'active' && <LiveBadge />}
      </div>

      <div className="flex-1 text-center px-4">
        {session ? (
          <h2 className="font-display font-semibold text-lg text-arena-cyan truncate">
            {session.topic}
          </h2>
        ) : (
          <p className="text-arena-text-muted text-sm">
            No active debate
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <SoundToggle />
        {connected ? (
          <div className="flex items-center gap-1.5 text-arena-success text-xs">
            <Wifi size={14} />
            <span className="hidden sm:inline">Connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-arena-error text-xs">
            <WifiOff size={14} />
            <span className="hidden sm:inline">Disconnected</span>
          </div>
        )}
      </div>
    </header>
  );
}
