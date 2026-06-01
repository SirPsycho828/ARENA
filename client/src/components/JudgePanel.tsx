import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useArenaStore } from '../store/arena';

interface DebugEvent {
  type: string;
  agentId?: string;
  agentName?: string;
  detail?: string;
  timestamp: number;
}

const EVENT_COLORS: Record<string, string> = {
  turn_start: '#00F0FF',
  speech_end: '#34D399',
  injection: '#FBBF24',
  relay: '#A78BFA',
  challenger: '#FF2D6B',
  topic_change: '#FF8C00',
  session: '#6B6B8A',
};

export function JudgePanel() {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const socket = useArenaStore((s) => s.socket);
  const session = useArenaStore((s) => s.session);
  const agents = useArenaStore((s) => s.agents);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const voteTallies = useArenaStore((s) => s.voteTallies);
  const activeRules = useArenaStore((s) => s.activeRules);
  const spectatorCount = useArenaStore((s) => s.spectatorCount);

  useEffect(() => {
    if (!socket) return;

    const handler = (event: DebugEvent) => {
      setEvents((prev) => [...prev.slice(-99), event]);
    };

    (socket as any).on('debug_event', handler);
    return () => { (socket as any).off('debug_event', handler); };
  }, [socket]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, collapsed]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const currentAgent = agents.find((a) => a.id === currentSpeaker);

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-0 inset-x-0 z-30 bg-[#0c0c14] border-t-2 border-arena-purple/50 font-mono text-xs"
      style={{ maxHeight: collapsed ? '40px' : '320px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-arena-purple/10 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2 text-arena-purple">
          <Terminal size={14} />
          <span className="font-bold uppercase tracking-wider">Judge Mode</span>
          <span className="text-arena-text-muted">— Orchestration Debug</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-arena-text-muted">{events.length} events</span>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {!collapsed && (
        <div className="flex h-[calc(100%-40px)]">
          {/* Event log */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {events.length === 0 && (
              <p className="text-arena-text-muted">Waiting for events...</p>
            )}
            {events.map((event, i) => (
              <div key={i} className="flex gap-2 leading-tight">
                <span className="text-arena-text-muted shrink-0">{formatTime(event.timestamp)}</span>
                <span
                  className="shrink-0 uppercase font-bold w-24"
                  style={{ color: EVENT_COLORS[event.type] || '#6B6B8A' }}
                >
                  [{event.type}]
                </span>
                {event.agentName && (
                  <span className="text-arena-text-secondary shrink-0">{event.agentName}:</span>
                )}
                <span className="text-arena-text truncate">{event.detail || ''}</span>
              </div>
            ))}
          </div>

          {/* State panel */}
          <div className="w-56 border-l border-arena-border-subtle p-3 overflow-y-auto space-y-3">
            <div>
              <p className="text-arena-text-muted uppercase text-[10px] mb-1">Session</p>
              <p className="text-arena-text-secondary">
                {session ? `${session.status} — ${session.topic.slice(0, 40)}...` : 'None'}
              </p>
            </div>
            <div>
              <p className="text-arena-text-muted uppercase text-[10px] mb-1">Current Speaker</p>
              <p style={{ color: currentAgent?.color || '#6B6B8A' }}>
                {currentAgent?.name || 'None'}
              </p>
            </div>
            <div>
              <p className="text-arena-text-muted uppercase text-[10px] mb-1">Votes</p>
              {agents.map((a) => (
                <div key={a.id} className="flex justify-between text-arena-text-secondary">
                  <span style={{ color: a.color }}>{a.name.split(' ').pop()}</span>
                  <span>{voteTallies[a.id] || 0}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-arena-text-muted uppercase text-[10px] mb-1">Active Rules</p>
              {activeRules.length === 0 ? (
                <p className="text-arena-text-muted">None</p>
              ) : (
                activeRules.map((r, i) => (
                  <p key={i} className="text-arena-warning truncate">{r}</p>
                ))
              )}
            </div>
            <div>
              <p className="text-arena-text-muted uppercase text-[10px] mb-1">Spectators</p>
              <p className="text-arena-text-secondary">{spectatorCount}</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
