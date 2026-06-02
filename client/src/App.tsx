import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useArenaStore } from './store/arena';
import { useAuth } from './contexts/AuthContext';
import { LandingPage } from './components/LandingPage';
import { AgentEntrance } from './components/AgentEntrance';
import { TopicBanner } from './components/TopicBanner';
import { SpectatorBar } from './components/SpectatorBar';
import { AgentPanel } from './components/AgentPanel';
import { TranscriptFeed } from './components/TranscriptFeed';
import { ChaosPanel } from './components/ChaosPanel';
import { ChaosStatusBar } from './components/ChaosStatusBar';
import { ReactionOverlay } from './components/ReactionOverlay';
import { VoiceChallenger } from './components/VoiceChallenger';
import { VictoryScreen } from './components/VictoryScreen';
import { JudgePanel } from './components/JudgePanel';
import { ToolEffects } from './components/ToolEffects';
import { TopicReveal } from './components/TopicReveal';
import { sounds } from './lib/sounds';
import { Zap, X } from 'lucide-react';

type Phase = 'splash' | 'entrance' | 'arena';

function App() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [judgeMode, setJudgeMode] = useState(() =>
    new URLSearchParams(window.location.search).has('judge')
  );
  const [chaosDrawer, setChaosDrawer] = useState(false);
  const [creditSuccess, setCreditSuccess] = useState(false);
  const { user } = useAuth();
  const connect = useArenaStore((s) => s.connect);
  const disconnect = useArenaStore((s) => s.disconnect);
  const listenCredits = useArenaStore((s) => s.listenCredits);
  const stopListeningCredits = useArenaStore((s) => s.stopListeningCredits);
  const session = useArenaStore((s) => s.session);
  const agents = useArenaStore((s) => s.agents);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const incomingReactions = useArenaStore((s) => s.incomingReactions);
  const sendReaction = useArenaStore((s) => s.sendReaction);
  const challengerActive = useArenaStore((s) => s.challengerActive);
  const startChallenge = useArenaStore((s) => s.startChallenge);
  const endChallenge = useArenaStore((s) => s.endChallenge);
  const victoryData = useArenaStore((s) => s.victoryData);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Credit listener lifecycle
  useEffect(() => {
    if (user) {
      listenCredits(user.uid);
    } else {
      stopListeningCredits();
    }
    return () => stopListeningCredits();
  }, [user, listenCredits, stopListeningCredits]);

  // Handle Stripe success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credits') === 'success') {
      setCreditSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setCreditSuccess(false), 3000);
    }
  }, []);

  const handleEnterArena = useCallback(() => {
    sounds.arenaEnter();
    if (agents.length > 0) {
      setPhase('entrance');
    } else {
      setPhase('arena');
    }
  }, [agents.length]);

  const handleEntranceComplete = useCallback(() => {
    setPhase('arena');
  }, []);

  const handleReaction = useCallback((emoji: string) => {
    sendReaction(emoji);
    sounds.reaction();
  }, [sendReaction]);

  const handleChallengeStart = useCallback((agentId: string, stream: MediaStream, viewerName?: string, token?: string) => {
    startChallenge(agentId, stream, viewerName, token);
  }, [startChallenge]);

  const handleChallengeEnd = useCallback(() => {
    endChallenge();
  }, [endChallenge]);

  return (
    <>
      {/* Landing page overlay */}
      <AnimatePresence>
        {phase === 'splash' && (
          <motion.div
            key="splash"
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.6 }}
          >
            <LandingPage onEnter={handleEnterArena} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent entrance sequence */}
      <AnimatePresence>
        {phase === 'entrance' && agents.length > 0 && (
          <motion.div
            key="entrance"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <AgentEntrance agents={agents} onComplete={handleEntranceComplete} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ FULL CANVAS ARENA ═══ */}
      {phase === 'arena' && <div className="flex flex-col h-screen bg-background relative z-0 transition-opacity duration-500">
        {/* Broadcast chyron bar */}
        <TopicBanner judgeMode={judgeMode} onToggleJudge={() => setJudgeMode((j) => !j)} />
        <SpectatorBar />

        {/* Main stage + persistent sidebar */}
        <div className="flex-1 flex min-h-0">
          <main className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto">
            {/* Empty state */}
            {!session && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <h2 className="font-display text-3xl tracking-wider text-foreground">
                    WELCOME TO THE ARENA
                  </h2>
                  <p className="text-sm font-body text-muted-foreground max-w-md mx-auto leading-relaxed">
                    A live multi-agent debate arena where AI personalities argue in real-time.
                    A debate will start automatically — hang tight.
                  </p>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-mono tracking-wider">
                    <div className="w-2 h-2 bg-accent rounded-full animate-live-pulse" />
                    WAITING FOR DEBATE...
                  </div>
                </div>
              </div>
            )}

            {session && (
              <>
                {/* Agent video grid */}
                <div className={`grid gap-2 ${
                  agents.length <= 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : agents.length === 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : agents.length === 4
                    ? 'grid-cols-2 lg:grid-cols-4'
                    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
                }`}>
                  {agents.map((agent) => (
                    <AgentPanel
                      key={agent.id}
                      id={agent.id}
                      name={agent.name}
                      personality={agent.personality}
                      color={agent.color}
                    />
                  ))}
                </div>

                <ChaosStatusBar />

                {/* Transcript feed — min-height ensures it's usable on mobile */}
                <div className="flex-1 min-h-[300px] sm:min-h-0 bg-card rounded-md border border-border overflow-hidden">
                  <TranscriptFeed />
                </div>
              </>
            )}
          </main>

          {/* Persistent chaos sidebar — xl+ only */}
          <aside className="hidden xl:flex xl:flex-col w-96 shrink-0 border-l border-border bg-card overflow-y-auto">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted sticky top-0 z-10">
              <div className="w-1 h-5 bg-primary animate-lower-third-bar" />
              <Zap size={14} className="text-primary" />
              <span className="font-display text-sm tracking-wider">CHAOS CONTROLS</span>
            </div>
            <div className="p-4 space-y-4">
              <ChaosPanel />
              {session?.status === 'active' && (
                <VoiceChallenger
                  agents={agents}
                  isActive={challengerActive}
                  onStart={handleChallengeStart}
                  onEnd={handleChallengeEnd}
                />
              )}
            </div>
          </aside>
        </div>
      </div>}

      {/* ═══ FLOATING CHAOS TRIGGER (Full Canvas: edge-triggered) ═══ */}
      {phase === 'arena' && session && (
        <button
          onClick={() => setChaosDrawer(true)}
          aria-label="Open chaos controls"
          className="fixed bottom-6 right-6 z-20 xl:hidden w-12 h-12 rounded-sm bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95 transition-all cursor-pointer animate-button-pulse"
        >
          <Zap size={20} />
        </button>
      )}

      {/* ═══ CHAOS PANEL — Edge-triggered slide-in (Full Canvas) ═══ */}
      <AnimatePresence>
        {chaosDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm"
            onClick={() => setChaosDrawer(false)}
          >
            {/* Right-edge panel on desktop, bottom sheet on mobile */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-card border-l border-border overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-primary animate-lower-third-bar" />
                  <Zap size={14} className="text-primary" />
                  <span className="font-display text-sm tracking-wider">CHAOS CONTROLS</span>
                </div>
                <button
                  onClick={() => setChaosDrawer(false)}
                  aria-label="Close chaos panel"
                  className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <ChaosPanel />
                {session?.status === 'active' && (
                  <VoiceChallenger
                    agents={agents}
                    isActive={challengerActive}
                    onStart={handleChallengeStart}
                    onEnd={handleChallengeEnd}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reaction overlay */}
      {phase === 'arena' && (
        <ReactionOverlay
          onReaction={handleReaction}
          incomingReactions={incomingReactions}
        />
      )}

      {/* Agent tool visual effects (dramatic_pause, crowd_appeal, mic_drop) */}
      {phase === 'arena' && <ToolEffects />}

      {/* Dramatic topic change reveal */}
      {phase === 'arena' && <TopicReveal />}

      {/* Victory screen */}
      <AnimatePresence>
        {victoryData && phase === 'arena' && (
          <VictoryScreen data={victoryData} />
        )}
      </AnimatePresence>

      {/* Judge Mode debug panel */}
      <AnimatePresence>
        {judgeMode && phase === 'arena' && <JudgePanel />}
      </AnimatePresence>

      {/* Credit purchase success toast */}
      <AnimatePresence>
        {creditSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-sm bg-success text-white font-body font-semibold text-sm"
          >
            Credits added successfully!
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
