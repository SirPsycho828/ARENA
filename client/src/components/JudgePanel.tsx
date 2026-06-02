import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useArenaStore } from '../store/arena';

interface DebugEvent {
  type: string;
  agentId?: string;
  agentName?: string;
  detail?: string;
  timestamp: number;
}

const EVENT_COLORS: Record<string, string> = {
  turn_start: '#3B9AE1',
  speech_end: '#16A34A',
  injection: '#F59E0B',
  relay: '#8B5CF6',
  challenger: '#E63946',
  topic_change: '#FF8C00',
  session: '#7B8A9E',
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
      className="fixed bottom-0 inset-x-0 z-30 bg-background border-t-2 border-accent/50 font-mono text-xs"
      style={{ maxHeight: collapsed ? '40px' : '320px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-accent/10 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2 text-accent">
          <Terminal size={14} />
          <span className="font-bold uppercase tracking-wider">Judge Mode</span>
          <span className="text-muted-foreground">-- Orchestration Debug</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground tabular-nums">{events.length} events</span>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {!collapsed && (
        <div className="flex h-[calc(100%-40px)]">
          {/* Event log */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {events.length === 0 && (
              <p className="text-muted-foreground">Waiting for events...</p>
            )}
            {events.map((event, i) => (
              <div key={i} className="flex gap-2 leading-tight">
                <span className="text-muted-foreground shrink-0 tabular-nums">{formatTime(event.timestamp)}</span>
                <span
                  className="shrink-0 uppercase font-bold w-24"
                  style={{ color: EVENT_COLORS[event.type] || '#7B8A9E' }}
                >
                  [{event.type}]
                </span>
                {event.agentName && (
                  <span className="text-secondary-foreground shrink-0">{event.agentName}:</span>
                )}
                <span className="text-foreground truncate">{event.detail || ''}</span>
              </div>
            ))}
          </div>

          {/* State panel */}
          <div className="w-56 border-l border-border p-3 overflow-y-auto space-y-3">
            <div>
              <p className="text-muted-foreground uppercase text-[10px] mb-1 tracking-wider">Session</p>
              <p className="text-secondary-foreground">
                {session ? `${session.status} -- ${session.topic.slice(0, 40)}...` : 'None'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase text-[10px] mb-1 tracking-wider">Current Speaker</p>
              <p style={{ color: currentAgent?.color || '#7B8A9E' }}>
                {currentAgent?.name || 'None'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase text-[10px] mb-1 tracking-wider">Votes</p>
              {agents.map((a) => (
                <div key={a.id} className="flex justify-between text-secondary-foreground">
                  <span style={{ color: a.color }}>{a.name.split(' ').pop()}</span>
                  <span className="tabular-nums">{voteTallies[a.id] || 0}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-muted-foreground uppercase text-[10px] mb-1 tracking-wider">Active Rules</p>
              {activeRules.length === 0 ? (
                <p className="text-muted-foreground">None</p>
              ) : (
                activeRules.map((r, i) => (
                  <p key={i} className="text-warning truncate">{r}</p>
                ))
              )}
            </div>
            <div>
              <p className="text-muted-foreground uppercase text-[10px] mb-1 tracking-wider">Spectators</p>
              <p className="text-secondary-foreground tabular-nums">{spectatorCount}</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
