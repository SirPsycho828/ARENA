import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Radio, Zap, Mic, BarChart3, ChevronDown, Volume2, Users, MessageSquare } from 'lucide-react';
import { useArenaStore } from '../store/arena';

interface LandingPageProps {
  onEnter: () => void;
}

/* ═══════════════════════════════════════════════════════════════════
   Visual Specimens — Simulated UI mockups for the bento grid
   ═══════════════════════════════════════════════════════════════════ */

function SpecimenDebatePanel() {
  const agents = [
    { name: 'Rico "The Roast" Martinez', tag: 'COMEDIAN', color: '#E63946', speaking: true, pic: '/images/AgentProfiles/Rico_ProfilePic.png' },
    { name: 'Dr. Helena Ashworth', tag: 'PROFESSOR', color: '#3B9AE1', speaking: false, pic: '/images/AgentProfiles/Ashworth_ProfilePic.png' },
    { name: 'Darius "Deep State" Kane', tag: 'TRUTHER', color: '#F59E0B', speaking: false, pic: '/images/AgentProfiles/Darius_ProfilePic.png' },
  ];

  return (
    <div className="w-full h-full bg-background rounded-sm overflow-hidden p-3 flex flex-col gap-2">
      {/* Chyron bar */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-live rounded-sm">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-live-pulse" />
          <span className="text-[10px] font-body font-bold text-white tracking-wider">LIVE</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground truncate">
          Is pineapple on pizza a culinary crime?
        </span>
      </div>
      {/* Agent grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="relative rounded-sm overflow-hidden"
            style={{ border: agent.speaking ? `2px solid ${agent.color}` : '1px solid var(--color-border)' }}
          >
            <div className="aspect-video bg-muted flex items-center justify-center">
              <img src={agent.pic} alt={agent.name} className="w-12 h-12 rounded-full object-cover ring-2" style={{ ringColor: agent.color }} />
            </div>
            {/* Lower third name plate */}
            <div className="absolute bottom-0 inset-x-0">
              <div className="flex items-center">
                <div className="w-1 h-4" style={{ background: agent.color }} />
                <div className="flex-1 bg-background/90 backdrop-blur-sm px-1.5 py-0.5">
                  <div className="text-[8px] font-body font-semibold text-foreground truncate">{agent.name.split('"')[0]}</div>
                  <div className="text-[7px] font-mono tracking-wider" style={{ color: agent.color }}>{agent.tag}</div>
                </div>
              </div>
            </div>
            {/* Speaking indicator */}
            {agent.speaking && (
              <div className="absolute top-1 right-1 flex items-center gap-0.5 px-1 py-0.5 bg-background/80 rounded-sm">
                <Volume2 size={8} style={{ color: agent.color }} />
                <span className="text-[7px] font-mono" style={{ color: agent.color }}>SPEAKING</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Simulated transcript */}
      <div className="flex-1 mt-1.5 rounded-sm bg-muted/50 border border-border p-2 space-y-1 overflow-hidden">
        {[
          { name: 'Rico', color: '#E63946', text: 'Look, if you put pineapple on pizza, you might as well put ketchup on sushi.' },
          { name: 'Helena', color: '#3B9AE1', text: 'Actually, the Maillard reaction between bromelain and mozzarella creates a unique—' },
          { name: 'Rico', color: '#E63946', text: 'Nobody asked for the chemistry lesson, Professor!' },
          { name: 'Darius', color: '#F59E0B', text: 'Big Pineapple has been funding pizza studies since 1987. Follow the money.' },
          { name: 'Helena', color: '#3B9AE1', text: 'That is not a peer-reviewed claim, Darius.' },
          { name: 'Rico', color: '#E63946', text: 'Peer-reviewed? This man peer-reviews his own bathroom mirror.' },
          { name: 'Darius', color: '#F59E0B', text: 'The mirror industrial complex is a whole other episode.' },
        ].map((msg, i) => (
          <div key={i} className="flex gap-1.5">
            <span className="text-[8px] font-mono font-semibold shrink-0" style={{ color: msg.color }}>{msg.name}</span>
            <span className="text-[8px] font-mono text-muted-foreground leading-relaxed truncate">{msg.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpecimenChaosPanel() {
  const rules = [
    { text: 'Speak only in rhymes', turns: 3, user: 'ChaosKing42' },
    { text: 'Explain like a pirate', turns: 2, user: 'DebateFan99' },
  ];

  return (
    <div className="w-full h-full bg-background rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Zap size={12} className="text-primary" />
        <span className="text-[11px] font-display tracking-wider text-foreground">CHAOS CONTROLS</span>
      </div>
      <div className="flex-1 flex flex-col gap-1.5">
        {rules.map((rule, i) => (
          <div key={i} className="p-2 rounded-sm bg-muted border border-border">
            <div className="text-[10px] font-body text-foreground">{rule.text}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[8px] font-mono text-muted-foreground">{rule.user}</span>
              <span className="text-[8px] font-mono text-primary">{rule.turns} turns left</span>
            </div>
          </div>
        ))}
        <div className="mt-auto flex gap-1">
          {['Devil\'s Advocate', 'Roast Mode', 'ELI5'].map((preset) => (
            <div key={preset} className="px-2 py-1 rounded-sm bg-secondary text-[8px] font-body text-secondary-foreground">
              {preset}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpecimenVoiceChallenger() {
  return (
    <div className="w-full h-full bg-background rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Mic size={12} className="text-primary" />
        <span className="text-[11px] font-display tracking-wider text-foreground">VOICE CHALLENGER</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        {/* Waveform visualization */}
        <div className="flex items-end gap-0.5 h-8">
          {Array.from({ length: 20 }, (_, i) => {
            const height = Math.sin(i * 0.5) * 12 + 14;
            return (
              <div
                key={i}
                className="w-1 rounded-full bg-primary"
                style={{ height: `${height}px`, opacity: 0.4 + (height / 30) }}
              />
            );
          })}
        </div>
        <div className="text-[9px] font-mono text-muted-foreground">Challenge any agent with your voice</div>
        <div className="px-3 py-1 rounded-sm bg-primary/20 border border-primary/30">
          <span className="text-[9px] font-body font-semibold text-primary">60s SHOWDOWN</span>
        </div>
      </div>
    </div>
  );
}

function SpecimenVoteTally() {
  const votes = [
    { name: 'Rico', pct: 47, color: '#E63946' },
    { name: 'Helena', pct: 32, color: '#3B9AE1' },
    { name: 'Darius', pct: 21, color: '#F59E0B' },
  ];

  return (
    <div className="w-full h-full bg-background rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <BarChart3 size={12} className="text-accent" />
        <span className="text-[11px] font-display tracking-wider text-foreground">LIVE VOTES</span>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-2">
        {votes.map((v) => (
          <div key={v.name} className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-muted-foreground w-12">{v.name}</span>
            <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm"
                style={{ width: `${v.pct}%`, background: v.color }}
              />
            </div>
            <span className="text-[9px] font-mono font-semibold" style={{ color: v.color }}>{v.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Landing Page
   ═══════════════════════════════════════════════════════════════════ */

export function LandingPage({ onEnter }: LandingPageProps) {
  const session = useArenaStore((s) => s.session);
  const isLive = session?.status === 'active';

  const scrollToContent = useCallback(() => {
    document.getElementById('the-show')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const agents = [
    { name: 'Rico "The Roast" Martinez', role: 'Stand-Up Comedian', desc: 'Dismantles arguments through mockery and absurd analogies', color: '#E63946', pic: '/images/AgentProfiles/Rico_ProfilePic.png' },
    { name: 'Dr. Helena Ashworth', role: 'Tenured Professor', desc: 'Cites obscure studies and uses condescending authority', color: '#3B9AE1', pic: '/images/AgentProfiles/Ashworth_ProfilePic.png' },
    { name: 'Darius "Deep State" Kane', role: 'Conspiracy Theorist', desc: 'Connects everything to shadow organizations', color: '#F59E0B', pic: '/images/AgentProfiles/Darius_ProfilePic.png' },
    { name: 'Ambassador Chen Wei', role: 'Retired Diplomat', desc: 'Uses politeness as a devastating weapon', color: '#16A34A', pic: null },
    { name: 'Zap Thunder', role: 'Gaming Streamer', desc: 'Treats every debate like a championship match', color: '#8B5CF6', pic: null },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ─── NAV (Transparent, minimal) ─────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl tracking-wider text-foreground">
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
          {isLive && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-live/20 border border-live/40 rounded-sm">
              <div className="w-2 h-2 bg-live rounded-full animate-live-pulse" />
              <span className="text-[10px] font-body font-bold text-live tracking-wider">LIVE NOW</span>
            </div>
          )}
        </div>
        <button
          onClick={onEnter}
          className="px-5 py-2 bg-primary text-primary-foreground font-body font-semibold text-sm tracking-wider uppercase rounded-sm hover:brightness-110 transition-all cursor-pointer"
        >
          {isLive ? 'Watch Live' : 'Enter Arena'}
        </button>
      </nav>

      {/* ─── HERO (Full viewport, broadcast studio) ─────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Broadcast grid background */}
        <div className="absolute inset-0 animate-grid-pulse" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 154, 225, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 154, 225, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }} />

        {/* Scanline */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-accent/15 to-transparent animate-scanline" />
        </div>

        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(13,17,23,0.85) 100%)',
        }} />

        {/* Two-column content: text left, image right on desktop */}
        <div className="relative z-10 w-full max-w-7xl mx-auto lg:grid lg:grid-cols-[1fr_auto] lg:gap-12 lg:items-center">
          {/* Text column */}
          <div className="text-center lg:text-left">
            {/* "Breaking" ticker above headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 bg-primary/10 border border-primary/30 rounded-sm"
            >
              <Radio size={14} className="text-primary" />
              <span className="text-xs font-body font-semibold text-primary tracking-wider uppercase">
                {isLive ? 'Debate in Progress' : 'Now Streaming'}
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-wider leading-none mb-4"
            >
              WHERE <span className="text-primary">AI</span> GOES{' '}
              <br className="hidden sm:block" />
              HEAD TO <span className="text-accent">HEAD</span>
            </motion.h1>

            {/* Acronym expansion */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="text-xs sm:text-sm font-mono text-muted-foreground tracking-[0.3em] uppercase mb-6"
            >
              <span className="text-primary">A</span>I{' '}
              <span className="text-primary">R</span>ivalry{' '}
              <span className="text-primary">E</span>xhibition of{' '}
              <span className="text-primary">N</span>eural{' '}
              <span className="text-primary">A</span>gents
            </motion.p>

            {/* Sub-headline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="text-base sm:text-lg text-muted-foreground font-body max-w-2xl lg:max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed"
            >
              Watch AI personalities clash in real-time debates. Inject chaos rules.
              Cast your vote. Challenge them with your own voice.
            </motion.p>

            {/* CTA */}
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1, type: 'spring', stiffness: 200 }}
              onClick={onEnter}
              className="px-10 py-4 bg-primary text-primary-foreground font-body font-bold text-base tracking-widest uppercase rounded-sm hover:brightness-110 transition-all animate-button-pulse cursor-pointer"
            >
              {isLive ? 'Watch Live' : 'Enter the Arena'}
            </motion.button>
          </div>

          {/* Image column — desktop only */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="hidden lg:block relative"
          >
            <img
              src="/images/AgentProfiles/ARENA_landing_vertical.png"
              alt="ARENA Agents"
              className="max-h-[82vh] w-auto object-contain rounded-md opacity-85"
            />
            {/* Edge fade into background */}
            <div className="absolute inset-0 rounded-md pointer-events-none" style={{
              boxShadow: 'inset 0 0 60px 30px rgba(13,17,23,0.7)',
            }} />
          </motion.div>
        </div>

        {/* Mobile background image — vertical, very transparent */}
        <div className="lg:hidden absolute inset-0 z-[1] pointer-events-none opacity-25">
          <img
            src="/images/AgentProfiles/ARENA_landing_vertical.png"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Scroll indicator */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          onClick={scrollToContent}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer z-10"
        >
          <ChevronDown size={24} className="animate-bounce" />
        </motion.button>

        {/* Corner brackets */}
        <div className="absolute top-20 left-6 w-8 h-8 border-l-2 border-t-2 border-primary/20" />
        <div className="absolute top-20 right-6 w-8 h-8 border-r-2 border-t-2 border-accent/20" />
        <div className="absolute bottom-16 left-6 w-8 h-8 border-l-2 border-b-2 border-primary/20" />
        <div className="absolute bottom-16 right-6 w-8 h-8 border-r-2 border-b-2 border-accent/20" />
      </section>

      {/* ─── THE SHOW — Bento Grid Features ─────────────────────────── */}
      <section id="the-show" className="py-24 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          {/* Section header with chyron accent */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-1 h-8 bg-primary animate-lower-third-bar" />
            <div>
              <h2 className="font-display text-3xl sm:text-4xl tracking-wider">THE SHOW</h2>
              <p className="text-sm font-body text-muted-foreground mt-1">Everything you need to know about the broadcast</p>
            </div>
          </div>

          {/* Bento grid with visual specimens */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Large: Debate Panel (spans 2 cols, 2 rows) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6 }}
              className="md:col-span-2 md:row-span-2 rounded-md border border-border bg-card overflow-hidden"
            >
              <div className="p-3 border-b border-border flex items-center gap-2">
                <Users size={14} className="text-accent" />
                <span className="text-xs font-display tracking-wider text-card-foreground">LIVE DEBATE PANEL</span>
              </div>
              <div className="p-2 h-64 md:h-auto md:flex-1">
                <SpecimenDebatePanel />
              </div>
            </motion.div>

            {/* Medium: Chaos Controls */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="md:col-span-2 rounded-md border border-border bg-card overflow-hidden"
            >
              <div className="p-3 border-b border-border flex items-center gap-2">
                <Zap size={14} className="text-primary" />
                <span className="text-xs font-display tracking-wider text-card-foreground">AUDIENCE CHAOS CONTROLS</span>
              </div>
              <div className="p-2 h-48">
                <SpecimenChaosPanel />
              </div>
            </motion.div>

            {/* Small: Voice Challenger */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="rounded-md border border-border bg-card overflow-hidden"
            >
              <div className="p-2 h-48">
                <SpecimenVoiceChallenger />
              </div>
            </motion.div>

            {/* Small: Vote Tally */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="rounded-md border border-border bg-card overflow-hidden"
            >
              <div className="p-2 h-48">
                <SpecimenVoteTally />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── STATS STRIP ────────────────────────────────────────────── */}
      <section className="py-16 bg-card border-y border-border">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { value: '5', label: 'AI Personalities', icon: Users },
            { value: '610+', label: 'Debate Topics', icon: MessageSquare },
            { value: 'LIVE', label: 'Audience Chaos', icon: Zap },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              className="flex flex-col items-center gap-2"
            >
              <stat.icon size={20} className="text-primary" />
              <span className="font-display text-4xl tracking-wider text-foreground">{stat.value}</span>
              <span className="text-sm font-body text-muted-foreground tracking-wider uppercase">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── TONIGHT'S LINEUP ───────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-1 h-8 bg-accent animate-lower-third-bar" />
            <div>
              <h2 className="font-display text-3xl sm:text-4xl tracking-wider">TONIGHT'S LINEUP</h2>
              <p className="text-sm font-body text-muted-foreground mt-1">Five AI personalities. One winner. You decide.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {agents.map((agent, i) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="group relative rounded-md border border-border bg-card overflow-hidden hover:border-border transition-colors"
              >
                {/* Agent avatar */}
                <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden">
                  {agent.pic ? (
                    <img
                      src={agent.pic}
                      alt={agent.name}
                      className="w-24 h-24 rounded-full object-cover ring-2 shadow-lg"
                      style={{ boxShadow: `0 0 20px ${agent.color}30`, borderColor: agent.color }}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center" style={{ borderColor: `${agent.color}60` }}>
                        <span className="text-2xl">?</span>
                      </div>
                      <span className="text-[10px] font-display tracking-wider animate-pulse" style={{ color: agent.color }}>COMING SOON</span>
                    </div>
                  )}
                  {/* Decorative radial gradient */}
                  <div
                    className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{ background: `radial-gradient(circle at 50% 50%, ${agent.color}40, transparent 70%)` }}
                  />
                </div>
                {/* Lower third name plate */}
                <div className="border-t border-border">
                  <div className="flex items-stretch">
                    <div className="w-1 shrink-0" style={{ background: agent.color }} />
                    <div className="p-3 flex-1">
                      <h3 className="font-display text-sm tracking-wider text-card-foreground normal-case">{agent.name}</h3>
                      <p className="text-[10px] font-mono tracking-wider mt-0.5" style={{ color: agent.color }}>{agent.role.toUpperCase()}</p>
                      <p className="text-xs font-body text-muted-foreground mt-1.5 leading-relaxed">{agent.desc}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────────────────────────── */}
      <section className="relative py-32 px-6 overflow-hidden">
        {/* Background treatment */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-card to-background" />
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(230, 57, 70, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(230, 57, 70, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }} />

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="font-display text-4xl sm:text-5xl md:text-6xl tracking-wider mb-6">
              THE DEBATE IS <span className="text-primary">LIVE</span>
            </h2>
            <p className="text-lg font-body text-muted-foreground mb-10 max-w-xl mx-auto">
              Don't just watch. Shape the conversation. Inject chaos, cast votes,
              and challenge the AI directly.
            </p>
            <button
              onClick={onEnter}
              className="px-12 py-4 bg-primary text-primary-foreground font-body font-bold text-base tracking-widest uppercase rounded-sm hover:brightness-110 transition-all animate-button-pulse cursor-pointer"
            >
              Enter the Arena
            </button>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-body text-muted-foreground">
            <span className="font-display text-foreground tracking-wider">A.R.E.N.A.</span>
            <span className="text-border">|</span>
            <span>Napster Hackathon 2025</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-body text-muted-foreground">
            <span>Powered by Napster Omniagent</span>
          </div>
        </div>
      </footer>

      {/* ─── NEWS TICKER (bottom of page, always visible) ───────────── */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-ticker-bg/95 backdrop-blur-sm border-t border-border py-1.5 overflow-hidden">
        <div className="flex items-center">
          <div className="shrink-0 px-3 py-0.5 bg-primary text-primary-foreground text-[10px] font-body font-bold tracking-wider">
            ARENA
          </div>
          <div className="overflow-hidden flex-1">
            <div className="animate-ticker whitespace-nowrap text-xs font-mono text-muted-foreground">
              AI DEBATE ARENA — Watch 5 distinct AI personalities argue any topic in real-time — Inject chaos rules to change the debate — Vote for your favorite agent — Challenge them with your voice — 610+ topics across 20 categories — Powered by Napster Omniagent API
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
