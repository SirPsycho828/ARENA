import { LiveBadge } from './LiveBadge';
import { SoundToggle } from './SoundToggle';
import { ShareButton } from './ShareButton';
import { UserBadge } from './UserBadge';
import { useArenaStore } from '../store/arena';
import { Wifi, WifiOff, Terminal } from 'lucide-react';

interface TopicBannerProps {
  judgeMode?: boolean;
  onToggleJudge?: () => void;
}

export function TopicBanner({ judgeMode, onToggleJudge }: TopicBannerProps) {
  const session = useArenaStore((s) => s.session);
  const connected = useArenaStore((s) => s.connected);

  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/95 backdrop-blur-sm">
      {/* Left: Logo + Live badge */}
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="font-display text-lg tracking-wider text-foreground">
          <span className="text-primary">A</span>
          <span className="text-muted-foreground">.</span>
          <span>R</span>
          <span className="text-muted-foreground">.</span>
          <span>E</span>
          <span className="text-muted-foreground">.</span>
          <span>N</span>
          <span className="text-muted-foreground">.</span>
          <span className="text-primary">A</span>
          <span className="text-muted-foreground">.</span>
        </h1>
        {session?.status === 'active' && <LiveBadge />}
      </div>

      {/* Center: Topic chyron */}
      <div className="flex-1 flex items-center justify-center px-4 min-w-0">
        {session ? (
          <div className="flex items-center gap-2 max-w-xl">
            <div className="w-1 h-5 bg-primary shrink-0 animate-lower-third-bar" />
            <h2 className="font-display text-sm sm:text-base tracking-wider text-foreground truncate animate-lower-third-text">
              {session.topic}
            </h2>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs font-mono tracking-wider">
            NO ACTIVE DEBATE
          </p>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onToggleJudge && (
          <button
            onClick={onToggleJudge}
            className={`p-1.5 rounded-sm transition-colors cursor-pointer ${
              judgeMode ? 'text-[#8B5CF6] bg-[#8B5CF6]/10' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Judge Mode"
          >
            <Terminal size={14} />
          </button>
        )}
        <UserBadge />
        <ShareButton />
        <SoundToggle />
        {connected ? (
          <div className="flex items-center gap-1 text-success text-[10px] font-mono">
            <Wifi size={12} />
            <span className="hidden sm:inline tracking-wider">OK</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-warning text-[10px] font-mono">
            <WifiOff size={12} className="animate-pulse" />
          </div>
        )}
      </div>
    </header>
  );
}
