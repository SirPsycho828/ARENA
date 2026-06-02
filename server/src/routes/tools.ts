import { Router } from 'express';
import type { SessionManager } from '../sessions/manager.js';

export function createToolRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  // ─── check_vote_standing ────────────────────────────────────────────────
  router.post('/vote-standing', (req, res) => {
    const myName = req.body?.arguments?.my_name || req.body?.my_name || 'Unknown';
    const state = sessionManager.getSessionState();

    if (!state.session) {
      return res.json({ error: 'No active session' });
    }

    const agents = state.agents;
    const myAgent = agents.find(a => a.name.toLowerCase().includes(myName.toLowerCase()));
    const myVotes = myAgent ? (state.voteTallies[myAgent.id] || 0) : 0;

    const opponents = agents
      .filter(a => !a.name.toLowerCase().includes(myName.toLowerCase()))
      .map(a => ({ name: a.name, votes: state.voteTallies[a.id] || 0 }));

    const opponentVotes = opponents.map(o => o.votes);
    const maxOpponent = opponentVotes.length > 0 ? Math.max(...opponentVotes) : 0;
    const minOpponent = opponentVotes.length > 0 ? Math.min(...opponentVotes) : 0;

    const totalVotes = Object.values(state.voteTallies).reduce((a, b) => a + b, 0);
    const standing = myVotes > maxOpponent
      ? 'winning'
      : myVotes < minOpponent
      ? 'losing'
      : 'tied';

    console.log(`  [Tool] vote-standing for ${myName}: ${myVotes} votes (${standing})`);

    res.json({
      you: myVotes,
      opponents,
      total_votes: totalVotes,
      standing,
      viewer_count: state.session ? 'active' : 0,
    });
  });

  // ─── fact_check_opponent ────────────────────────────────────────────────
  router.post('/fact-check', (req, res) => {
    const claim = req.body?.arguments?.claim || req.body?.claim || '';
    const opponentName = req.body?.arguments?.opponent_name || req.body?.opponent_name || 'opponent';

    // Template-based verdicts — no LLM call needed
    const verdicts = [
      { verdict: 'misleading', detail: `The claim contains a kernel of truth but ${opponentName} is misrepresenting the context significantly. The real picture is more nuanced.`, suggestion: 'Challenge them on the specifics they conveniently left out.' },
      { verdict: 'unverifiable', detail: `This claim cannot be easily verified or debunked. ${opponentName} is presenting speculation as fact.`, suggestion: 'Point out that unverifiable claims are not the same as proven facts.' },
      { verdict: 'partially_true', detail: `Parts of what ${opponentName} said are accurate, but the conclusion they drew does not follow from the evidence.`, suggestion: 'Acknowledge the facts, then show how their logic falls apart.' },
      { verdict: 'oversimplified', detail: `${opponentName} is taking a complex issue and reducing it to a soundbite. The reality involves multiple factors they are ignoring.`, suggestion: 'Expose the complexity they are hiding behind simplistic framing.' },
      { verdict: 'out_of_context', detail: `The underlying fact may be real, but ${opponentName} has stripped it of crucial context that changes its meaning entirely.`, suggestion: 'Provide the missing context and watch their argument collapse.' },
    ];

    const picked = verdicts[Math.floor(Math.random() * verdicts.length)];

    console.log(`  [Tool] fact-check: "${claim.slice(0, 50)}..." by ${opponentName} → ${picked.verdict}`);

    res.json(picked);
  });

  // ─── get_audience_mood ──────────────────────────────────────────────────
  router.post('/audience-mood', (_req, res) => {
    const state = sessionManager.getSessionState();
    const chaosRules = state.activeRules || [];
    const transcriptCount = state.recentTranscripts?.length || 0;

    const energy = chaosRules.length >= 2 ? 'chaotic' : transcriptCount > 10 ? 'high' : transcriptCount > 5 ? 'medium' : 'warming_up';

    const moods = ['entertained', 'heated', 'chaotic', 'skeptical', 'hyped', 'divided'];
    const dominant_mood = chaosRules.length > 0 ? 'chaotic' : moods[Math.floor(Math.random() * moods.length)];

    console.log(`  [Tool] audience-mood: energy=${energy}, mood=${dominant_mood}`);

    res.json({
      energy,
      dominant_mood,
      active_chaos_rules: chaosRules.length,
      debate_intensity: transcriptCount > 15 ? 'intense' : transcriptCount > 8 ? 'building' : 'early',
    });
  });

  return router;
}
