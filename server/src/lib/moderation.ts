import { checkBlocklist, type ModerationCategory } from './blocklist.js';

export type ModerationReason =
  | ModerationCategory
  | 'hate_speech'
  | 'harassment'
  | 'sexual_content'
  | 'violence'
  | 'self_harm';

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: ModerationReason };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('  [Moderation] OPENAI_API_KEY not set — falling back to blocklist-only mode');
}

/**
 * Map OpenAI category names to our user-facing reason codes.
 */
const OPENAI_CATEGORY_MAP: Record<string, ModerationReason> = {
  'hate': 'hate_speech',
  'hate/threatening': 'hate_speech',
  'harassment': 'harassment',
  'harassment/threatening': 'harassment',
  'self-harm': 'self_harm',
  'self-harm/intent': 'self_harm',
  'self-harm/instructions': 'self_harm',
  'sexual': 'sexual_content',
  'sexual/minors': 'sexual_content',
  'violence': 'violence',
  'violence/graphic': 'violence',
};

/**
 * Call OpenAI Moderation API. Returns first flagged reason or null.
 */
async function checkOpenAI(text: string): Promise<ModerationReason | null> {
  if (!OPENAI_API_KEY) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text }),
    });

    if (!res.ok) {
      console.warn(`  [Moderation] OpenAI API returned ${res.status} — skipping Layer 2`);
      return null;
    }

    const data = await res.json() as {
      results: Array<{ categories: Record<string, boolean> }>;
    };

    const categories = data.results[0]?.categories;
    if (!categories) return null;

    for (const [cat, flagged] of Object.entries(categories)) {
      if (flagged && OPENAI_CATEGORY_MAP[cat]) {
        return OPENAI_CATEGORY_MAP[cat];
      }
    }
    return null;
  } catch (err) {
    console.warn('  [Moderation] OpenAI API error — skipping Layer 2:', (err as Error).message);
    return null;
  }
}

/**
 * Run hybrid moderation: blocklist (sync) then OpenAI (async).
 * Returns { ok: true } if content is acceptable, { ok: false, reason } if not.
 */
export async function moderate(text: string): Promise<ModerationResult> {
  // Layer 1: Local blocklist (instant)
  const blocklistHit = checkBlocklist(text);
  if (blocklistHit) {
    console.log(`  [Moderation] Blocked by blocklist: "${text.slice(0, 40)}..." → ${blocklistHit}`);
    return { ok: false, reason: blocklistHit };
  }

  // Layer 2: OpenAI Moderation API
  const openaiHit = await checkOpenAI(text);
  if (openaiHit) {
    console.log(`  [Moderation] Blocked by OpenAI: "${text.slice(0, 40)}..." → ${openaiHit}`);
    return { ok: false, reason: openaiHit };
  }

  return { ok: true };
}
