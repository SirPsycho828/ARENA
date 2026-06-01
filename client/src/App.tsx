import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useArenaStore } from './store/arena';
import { SplashScreen } from './components/SplashScreen';
import { TopicBanner } from './components/TopicBanner';
import { SpectatorBar } from './components/SpectatorBar';
import { AgentPanel } from './components/AgentPanel';
import { TranscriptFeed } from './components/TranscriptFeed';
import { ChaosPanel } from './components/ChaosPanel';
import { ReactionOverlay } from './components/ReactionOverlay';
import { VoiceChallenger } from './components/VoiceChallenger';
import { sounds } from './lib/sounds';

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const connect = useArenaStore((s) => s.connect);
  const disconnect = useArenaStore((s) => s.disconnect);
  const session = useArenaStore((s) => s.session);
  const agents = useArenaStore((s) => s.agents);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const incomingReactions = useArenaStore((s) => s.incomingReactions);
  const sendReaction = useArenaStore((s) => s.sendReaction);
  const challengerActive = useArenaStore((s) => s.challengerActive);
  const startChallenge = useArenaStore((s) => s.startChallenge);
  const endChallenge = useArenaStore((s) => s.endChallenge);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Sound effects on state changes
  const prevSpeaker = useArenaStore((s) => s.currentSpeaker);
  useEffect(() => {
    if (prevSpeaker && !showSplash) {
      sounds.turnChange();
    }
  }, [currentSpeaker]);

  const handleEnterArena = useCallback(() => {
    setShowSplash(false);
    sounds.arenaEnter();
  }, []);

  const handleReaction = useCallback((emoji: string) => {
    sendReaction(emoji);
    sounds.reaction();
  }, [sendReaction]);

  const handleChallengeStart = useCallback((agentId: string, stream: MediaStream) => {
    startChallenge(agentId, stream);
  }, [startChallenge]);

  const handleChallengeEnd = useCallback(() => {
    endChallenge();
  }, [endChallenge]);

  return (
    <>
      {/* Splash screen overlay */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash"
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.6 }}
          >
            <SplashScreen onEnter={handleEnterArena} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main arena */}
      <div className={`flex flex-col h-screen bg-arena-base ${showSplash ? 'opacity-0' : 'opacity-100'} transition-opacity duration-500`}>
        <TopicBanner />
        <SpectatorBar />

        <div className="flex-1 flex overflow-hidden">
          {/* Main stage */}
          <main className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            {!session && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <h2 className="font-display text-3xl font-bold text-arena-text-bright">
                    Welcome to the Arena
                  </h2>
                  <p className="text-arena-text-secondary max-w-md mx-auto">
                    A live multi-agent debate arena where AI personalities argue in real-time.
                    Start a session via the API to begin.
                  </p>
                  <div className="inline-block px-4 py-2 rounded-lg bg-arena-surface border border-arena-border-subtle">
                    <p className="text-arena-text-muted text-sm font-mono">
                      POST /api/sessions {`{ "topic": "...", "agentCount": 3 }`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {session && (
              <>
                {/* Agent video grid */}
                <div className={`grid gap-3 ${
                  agents.length <= 2
                    ? 'grid-cols-2'
                    : agents.length === 3
                    ? 'grid-cols-3'
                    : agents.length === 4
                    ? 'grid-cols-2 lg:grid-cols-4'
                    : 'grid-cols-3 lg:grid-cols-5'
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

                {/* Transcript feed */}
                <div className="flex-1 min-h-0 bg-arena-surface rounded-xl border border-arena-border-subtle overflow-hidden">
                  <TranscriptFeed />
                </div>
              </>
            )}
          </main>

          {/* Sidebar */}
          <aside className="w-80 border-l border-arena-border-subtle bg-arena-surface/50 p-4 overflow-y-auto hidden lg:flex flex-col gap-4">
            <ChaosPanel />

            {/* Voice Challenger */}
            {session?.status === 'active' && (
              <VoiceChallenger
                agents={agents}
                isActive={challengerActive}
                onStart={handleChallengeStart}
                onEnd={handleChallengeEnd}
              />
            )}
          </aside>
        </div>
      </div>

      {/* Reaction overlay (always on top) */}
      {!showSplash && (
        <ReactionOverlay
          onReaction={handleReaction}
          incomingReactions={incomingReactions}
        />
      )}
    </>
  );
}

export default App;
