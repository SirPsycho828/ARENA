import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, ChevronDown, ChevronUp, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useArenaStore } from '../store/arena';
import { AuthModal } from './AuthModal';

export function CallInPanel() {
  const { user, displayName: authDisplayName } = useAuth();
  const callInState = useArenaStore((s) => s.callInState);
  const callInQueuePosition = useArenaStore((s) => s.callInQueuePosition);
  const callInActive = useArenaStore((s) => s.callInActive);
  const submitCallIn = useArenaStore((s) => s.submitCallIn);
  const resetCallInState = useArenaStore((s) => s.resetCallInState);
  const credits = useArenaStore((s) => s.credits);

  const [showAuth, setShowAuth] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [topic, setTopic] = useState('');
  const [recording, setRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [bars, setBars] = useState<number[]>(Array(16).fill(4));

  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordStartRef = useRef<number>(0);

  useEffect(() => {
    if (authDisplayName && !displayName) {
      setDisplayName(authDisplayName);
    }
  }, [authDisplayName]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          handleStopAndSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

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

  const handleStartRecording = async () => {
    if (!user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();

      setRecording(true);
      setTimeLeft(30);
      updateBars();
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  };

  const handleStopAndSubmit = async () => {
    if (!recorderRef.current || !user) return;

    const recorder = recorderRef.current;
    const durationMs = Date.now() - recordStartRef.current;

    recorder.stop();
    setRecording(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current = null;
    setBars(Array(16).fill(4));

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
    });

    const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
    const arrayBuffer = await blob.arrayBuffer();
    const token = await user.getIdToken();

    submitCallIn(arrayBuffer, displayName, topic, durationMs, token);
  };

  const handleCancel = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    setRecording(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current = null;
    setBars(Array(16).fill(4));
    resetCallInState();
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const canAfford = credits !== null && credits >= 10;
  const formReady = displayName.trim().length > 0 && topic.trim().length > 0 && canAfford;

  return (
    <div className="bg-card rounded-sm overflow-hidden">
      <div className="h-[3px] bg-accent" />
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Phone size={16} className="text-accent" />
          <h2 className="font-display text-sm text-foreground uppercase tracking-wider">
            Call In
          </h2>
        </div>
        {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
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
            <div className="px-4 pb-4 space-y-3 border-t border-border">
              {!user ? (
                <>
                  <div className="flex flex-col items-center gap-2 py-3">
                    <Lock size={20} className="text-muted-foreground" />
                    <p className="text-xs text-muted-foreground text-center">
                      Sign in to call in to the debate
                    </p>
                    <button
                      onClick={() => setShowAuth(true)}
                      className="px-4 py-2 rounded-sm bg-accent text-white font-semibold text-sm hover:brightness-110 transition-all"
                    >
                      Sign In to Call In
                    </button>
                  </div>
                  <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
                </>
              ) : callInState === 'idle' && !recording ? (
                <>
                  <p className="text-xs text-muted-foreground pt-3">
                    Record a message for the panel <span className="text-accent font-mono">(10 credits)</span>
                  </p>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                    className="w-full px-3 py-2 rounded-sm bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="What's your topic? (e.g. Rico is wrong about...)"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    maxLength={100}
                    className="w-full px-3 py-2 rounded-sm bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={handleStartRecording}
                    disabled={!formReady || !!callInActive}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-accent text-white font-display text-sm uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Phone size={16} />
                    START RECORDING
                  </button>
                  {!canAfford && credits !== null && (
                    <p className="text-xs text-destructive text-center">Not enough credits</p>
                  )}
                </>
              ) : recording ? (
                <>
                  <div className="flex items-center justify-between pt-3">
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-live text-white animate-live-pulse tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      REC
                    </span>
                    <span className="font-mono text-lg font-bold text-foreground tabular-nums">
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                  <div className="flex items-end justify-center gap-[2px] h-8 bg-background rounded-sm px-2 py-1">
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        className="w-[4px] rounded-full bg-accent transition-all duration-75"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-muted text-muted-foreground font-display text-sm uppercase tracking-wider hover:brightness-110 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleStopAndSubmit}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-primary text-primary-foreground font-display text-sm uppercase tracking-wider hover:brightness-110 transition-all"
                    >
                      <PhoneOff size={16} />
                      Submit
                    </button>
                  </div>
                </>
              ) : callInState === 'queued' ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 size={20} className="text-accent animate-spin" />
                  <p className="text-sm text-foreground font-medium">Your call is queued...</p>
                  <p className="text-xs text-muted-foreground">
                    {callInQueuePosition === 1 ? "You're next!" : `${callInQueuePosition - 1} ahead of you`}
                  </p>
                </div>
              ) : callInState === 'on_air' ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-bold uppercase bg-live text-white animate-live-pulse tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-white" />
                    YOU'RE ON AIR
                  </span>
                  <p className="text-xs text-muted-foreground">Everyone is hearing your call!</p>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
