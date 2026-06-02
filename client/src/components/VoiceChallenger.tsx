import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';

interface VoiceChallengerProps {
  agents: Array<{ id: string; name: string; color: string }>;
  isActive: boolean;
  onStart: (agentId: string, stream: MediaStream, viewerName?: string) => void;
  onEnd: () => void;
}

export function VoiceChallenger({ agents, isActive, onStart, onEnd }: VoiceChallengerProps) {
  const { user, displayName } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [bars, setBars] = useState<number[]>(Array(16).fill(4));
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!recording) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleStop();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

  // Waveform animation
  const updateBars = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const step = Math.floor(data.length / 16);
    const newBars = Array.from({ length: 16 }, (_, i) =>
      Math.max(4, (data[i * step] / 255) * 32)
    );
    setBars(newBars);
    animFrameRef.current = requestAnimationFrame(updateBars);
  }, []);

  const handleStart = async () => {
    if (!selectedAgent) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setRecording(true);
      setTimeLeft(60);
      onStart(selectedAgent, stream, displayName || user?.email?.split('@')[0] || 'Challenger');
      updateBars();
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  };

  const handleStop = () => {
    setRecording(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setBars(Array(16).fill(4));
    onEnd();
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="bg-arena-elevated rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-arena-hover/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Mic size={18} className="text-arena-magenta" />
          <h2 className="font-display font-semibold text-sm text-arena-text-bright">
            Voice Challenge
          </h2>
        </div>
        {expanded ? <ChevronUp size={16} className="text-arena-text-muted" /> : <ChevronDown size={16} className="text-arena-text-muted" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {!user ? (
                <>
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Lock size={20} className="text-arena-text-muted" />
                    <p className="text-xs text-arena-text-muted text-center">
                      Sign in to challenge agents directly
                    </p>
                    <button
                      onClick={() => setShowAuth(true)}
                      className="px-4 py-2 rounded-lg bg-arena-magenta text-white font-semibold text-sm hover:brightness-110 transition-all"
                    >
                      Sign In to Challenge
                    </button>
                  </div>
                  <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
                </>
              ) : !recording ? (
                <>
                  {/* Agent selector */}
                  <p className="text-xs text-arena-text-muted">Select an agent to challenge:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {agents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                          selectedAgent === agent.id
                            ? 'bg-arena-magenta/20 border border-arena-magenta/50 text-arena-text-bright'
                            : 'bg-arena-surface border border-arena-border-subtle text-arena-text-secondary hover:border-arena-border'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} />
                        {agent.name}
                      </button>
                    ))}
                  </div>

                  {/* Start button */}
                  <button
                    onClick={handleStart}
                    disabled={!selectedAgent || isActive}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-arena-magenta text-white font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Mic size={16} />
                    START CHALLENGE
                  </button>
                </>
              ) : (
                <>
                  {/* Live indicator */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-arena-live text-white animate-pulse-glow">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      LIVE
                    </span>
                    <span className="font-mono text-lg font-bold text-arena-text-bright">
                      {formatTime(timeLeft)}
                    </span>
                  </div>

                  {/* Waveform */}
                  <div className="flex items-end justify-center gap-[2px] h-8 bg-arena-base rounded-lg px-2 py-1">
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        className="w-[4px] rounded-full bg-arena-magenta transition-all duration-75"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>

                  {/* Stop button */}
                  <button
                    onClick={handleStop}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-arena-error text-white font-semibold text-sm hover:brightness-110 transition-all"
                  >
                    <MicOff size={16} />
                    END CHALLENGE
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
