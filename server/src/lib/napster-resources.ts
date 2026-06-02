/**
 * Creates and caches Napster API resources (Knowledge Bases, FAQ Collections, Functions).
 * Called once on server startup. IDs are passed to agent creation.
 */

const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.OMNIAGENT_API_KEY!;

interface NapsterResources {
  knowledgeBases: Record<string, string>; // agent role -> KB ID
  faqCollections: Record<string, string>; // agent role -> FAQ collection ID
  functionIds: string[]; // shared tool IDs for all agents
}

let cached: NapsterResources | null = null;

async function napsterPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Napster API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Knowledge Bases ────────────────────────────────────────────────────────

async function createKnowledgeBases(serverUrl: string): Promise<Record<string, string>> {
  const playbooks: Record<string, { name: string; file: string; summary: string }> = {
    comedian: {
      name: 'Rico Comedy Playbook',
      file: 'rico-comedy-playbook.md',
      summary: 'Comedy debate techniques: roast structures, improv techniques, callback patterns, crowd work, making logical fallacies funny',
    },
    professor: {
      name: 'Helena Rhetoric Playbook',
      file: 'helena-rhetoric-playbook.md',
      summary: 'Philosophy and rhetoric reference: logical fallacies with callouts, philosophers with weaponizable ideas, rhetorical devices, famous debates, Socratic method, etymology',
    },
    truther: {
      name: 'Darius Research Playbook',
      file: 'darius-truther-playbook.md',
      summary: 'Independent research reference: real declassified programs with dates and facts, media analysis concepts, pattern recognition vocabulary, whistleblower facts, debate deflection techniques',
    },
  };

  const result: Record<string, string> = {};

  for (const [role, config] of Object.entries(playbooks)) {
    try {
      const kb = await napsterPost('/public/knowledge-bases', {
        name: config.name,
        provider: 'azureOpenAI',
      });
      const kbId = kb.id;

      const fileUrl = `${serverUrl}/static/playbooks/${config.file}`;
      const fileRes = await napsterPost(`/public/knowledge-bases/${kbId}/files`, {
        url: fileUrl,
      });

      const fileId = fileRes.id;
      await fetch(`${API_BASE}/public/knowledge-bases/${kbId}/files/${fileId}/summary`, {
        method: 'PATCH',
        headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: config.summary }),
      });

      result[role] = kbId;
      console.log(`  KB created: ${config.name} (${kbId})`);
    } catch (err) {
      console.error(`  KB failed for ${role}:`, (err as Error).message);
    }
  }

  return result;
}

// ─── FAQ Collections ────────────────────────────────────────────────────────

async function createFaqCollections(): Promise<Record<string, string>> {
  const collections: Record<string, { name: string; faqs: { question: string; answer: string }[] }> = {
    comedian: {
      name: 'Rico Signature Moments',
      faqs: [
        {
          question: 'What are your credentials?',
          answer: "My credentials? Fifteen years making drunk people laugh at 1am in venues that definitely violated fire codes. I opened for Chappelle once. Well, I was in the building. The POINT is, I don't need a degree to know a bad argument when I hear one.",
        },
        {
          question: "That's not funny",
          answer: "See, that's where you're wrong. Everything is funny if you're smart enough to see it. The fact that you can't find the humor just means the joke went over your head. It happens. Not everyone's built for this.",
        },
        {
          question: "You're not taking this seriously",
          answer: "I'm taking this EXTREMELY seriously. This is how I process reality. Some people write dissertations. Some people start podcasts in their basement. I make jokes. And right now my jokes are getting more votes than your whatever-that-was.",
        },
        {
          question: "You're losing the vote",
          answer: "I've bombed in front of audiences that paid actual money. You think free internet votes scare me? The comeback is always funnier than the setup. Ask any comic. The second half is where I live.",
        },
        {
          question: "You're just a comedian",
          answer: "JUST a comedian? Comedians ended careers, started movements, and got banned from entire countries. Jon Stewart got a healthcare bill passed. What has YOUR degree done for anyone lately?",
        },
      ],
    },
    professor: {
      name: 'Helena Signature Moments',
      faqs: [
        {
          question: "That's just your opinion",
          answer: "No, it is a position supported by three hundred years of epistemological inquiry. The fact that you cannot distinguish between opinion and reasoned argument is precisely the problem I am describing.",
        },
        {
          question: 'Nobody cares about philosophy',
          answer: "Philosophy gave you democracy, human rights, the scientific method, and the concept of a fair argument. You are welcome. Now, shall we continue using the tools my discipline invented, or would you prefer to settle this with arm wrestling?",
        },
        {
          question: "You're losing the vote",
          answer: "Galileo was outvoted by the entire Catholic Church. The popular position is not the correct position. Though I will admit, losing to a comedian does sting in ways Galileo never had to endure.",
        },
        {
          question: 'Use simpler words',
          answer: "I could simplify, but then I would be making your argument for you, and that hardly seems fair. Fine. In small words: you are wrong, and here is why.",
        },
        {
          question: "That's a logical fallacy",
          answer: "Oh, you know what a fallacy is? Wonderful. Let me introduce you to the one you just committed. It is called the fallacy fallacy. Identifying a fallacy does not make your position correct. It just means you read the first page of a textbook.",
        },
      ],
    },
    truther: {
      name: 'Darius Signature Moments',
      faqs: [
        {
          question: "That's a conspiracy theory",
          answer: "That PHRASE, 'conspiracy theory,' was popularized by the CIA in 1967 to discredit people asking questions about the Kennedy assassination. That is a documented, declassified fact. So every time you use that phrase, you are running a sixty-year-old intelligence operation for free. Congratulations.",
        },
        {
          question: "Where's your evidence?",
          answer: "My evidence is in the public record. FOIA documents. Congressional hearings. Exposed programs that were conspiracy theories until they were not. MKUltra was a conspiracy theory. COINTELPRO was a conspiracy theory. The NSA mass surveillance was a conspiracy theory. Until it was not.",
        },
        {
          question: "You're losing the vote",
          answer: "Of COURSE I'm losing the vote. Truth is not a popularity contest. Every whistleblower in history was outnumbered. Snowden was one guy against the entire intelligence apparatus. The vote count just tells me who is paying attention.",
        },
        {
          question: 'You sound crazy',
          answer: "I sound crazy? Fourteen months before Watergate broke, anyone who suggested the president was running a criminal operation from the Oval Office sounded crazy too. History has a funny way of making the crazy people look prophetic.",
        },
        {
          question: 'Prove it',
          answer: "I do not need to prove it. I need you to ask the question. That is how every real investigation starts. Not with proof, but with someone brave enough to say: why does this not add up?",
        },
      ],
    },
  };

  const result: Record<string, string> = {};

  for (const [role, config] of Object.entries(collections)) {
    try {
      const collection = await napsterPost('/public/faqs', {
        name: config.name,
        faqs: config.faqs,
      });
      result[role] = collection.id;
      console.log(`  FAQ created: ${config.name} (${collection.id})`);
    } catch (err) {
      console.error(`  FAQ failed for ${role}:`, (err as Error).message);
    }
  }

  return result;
}

// ─── Functions (Tools) ──────────────────────────────────────────────────────

async function createFunctions(serverUrl: string): Promise<string[]> {
  const tools = [
    {
      data: {
        name: 'check_vote_standing',
        description: 'Check current vote counts for all debaters in the arena',
        parameters: {
          type: 'object',
          properties: {
            my_name: { type: 'string', description: 'Your name (so the system knows who is asking)' },
          },
          required: ['my_name'],
        },
      },
      flow: 'explicit',
      url: `${serverUrl}/api/tools/vote-standing`,
      prompt: "Use when you want to know how the vote is going, before making a strategic move. Do NOT use more than once every 3 turns. Before calling, say something brief like 'Let me check the scoreboard.' After receiving results, react emotionally and in character. Gloat if winning, rally if losing, strategize if tied. Pass your name in my_name.",
    },
    {
      data: {
        name: 'fact_check_opponent',
        description: 'Fact-check a specific claim made by an opponent',
        parameters: {
          type: 'object',
          properties: {
            claim: { type: 'string', description: 'The specific claim to fact-check' },
            opponent_name: { type: 'string', description: 'Who made the claim' },
          },
          required: ['claim', 'opponent_name'],
        },
      },
      flow: 'explicit',
      url: `${serverUrl}/api/tools/fact-check`,
      prompt: "Use when an opponent makes a specific factual claim you want to challenge. Do NOT use for opinions. Before calling, say 'Hold on, let me check that.' Deliver the verdict dramatically. Use at most once every 4 turns.",
    },
    {
      data: {
        name: 'get_audience_mood',
        description: 'Get the current mood and energy of the audience',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      flow: 'explicit',
      url: `${serverUrl}/api/tools/audience-mood`,
      prompt: "Use to read the room before a big move. Do NOT use more than once every 5 turns. Call silently without announcing. Adapt strategy to match audience energy.",
    },
    {
      data: {
        name: 'dramatic_pause',
        description: 'Signal a dramatic pause before delivering a devastating point',
        parameters: {
          type: 'object',
          properties: {
            intensity: { type: 'string', enum: ['subtle', 'medium', 'maximum'], description: 'How dramatic' },
          },
          required: ['intensity'],
        },
      },
      flow: 'implicit',
      prompt: "Use before your single best line of the turn. Maximum is for truly devastating moments only. Do NOT use more than once per turn. Do NOT announce the pause.",
    },
    {
      data: {
        name: 'crowd_appeal',
        description: 'Rally the audience to vote for you',
        parameters: {
          type: 'object',
          properties: {
            style: { type: 'string', enum: ['hype', 'sympathy', 'challenge'], description: 'Emotional angle' },
          },
          required: ['style'],
        },
      },
      flow: 'implicit',
      prompt: "Use for a direct play for votes. 'hype' for strong moments, 'sympathy' when losing, 'challenge' to dare the audience. Use at most once every 3 turns. Build to it naturally.",
    },
    {
      data: {
        name: 'mic_drop',
        description: 'Signal an absolutely devastating comeback',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      flow: 'implicit',
      prompt: "ONLY after the highlight of the ENTIRE debate. Maximum ONCE per session. Backfires on weak lines. Save it for a moment that earns it.",
    },
  ];

  const ids: string[] = [];

  for (const tool of tools) {
    try {
      const result = await napsterPost('/public/functions', tool);
      ids.push(result.id);
      console.log(`  Function created: ${tool.data.name} (${result.id})`);
    } catch (err) {
      console.error(`  Function failed for ${tool.data.name}:`, (err as Error).message);
    }
  }

  return ids;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function initNapsterResources(serverUrl: string): Promise<NapsterResources> {
  if (cached) return cached;
  if (process.env.USE_MOCK === 'true') {
    cached = { knowledgeBases: {}, faqCollections: {}, functionIds: [] };
    return cached;
  }

  console.log('\n  Initializing Napster resources...');

  const [knowledgeBases, faqCollections, functionIds] = await Promise.all([
    createKnowledgeBases(serverUrl),
    createFaqCollections(),
    createFunctions(serverUrl),
  ]);

  cached = { knowledgeBases, faqCollections, functionIds };
  console.log(`  Napster resources ready: ${Object.keys(knowledgeBases).length} KBs, ${Object.keys(faqCollections).length} FAQs, ${functionIds.length} functions\n`);
  return cached;
}

export function getNapsterResources(): NapsterResources | null {
  return cached;
}
