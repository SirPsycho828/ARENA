/**
 * Custom Companion management for ARENA debaters.
 * Creates persistent companions via the Napster API with custom avatars.
 * Companions are created once and reused across sessions.
 */

const API_BASE = 'https://companion-api.napster.com';

interface CompanionDef {
  firstName: string;
  lastName: string;
  description: string;
  headline: string;
  gender: 'male' | 'female' | 'nonBinary';
  imageFile: string;
}

interface CompanionRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  tags: Record<string, string> | null;
}

// ─── Companion Definitions ──────────────────────────────────────────────────

const COMPANION_DEFS: Record<string, CompanionDef> = {
  comedian: {
    firstName: 'Rico',
    lastName: 'Martinez',
    description:
      'A 15-year veteran stand-up comic who wandered into a debate arena and never left. Quick-witted, mean in a loving way, and genuinely cannot help finding the absurd angle in every argument. Punchy and conversational, speeds up when excited, slows down for the kill.',
    headline: 'Stand-Up Comic & Arena Debater',
    gender: 'male',
    imageFile: 'RicoMartinez.png',
  },
  professor: {
    firstName: 'Helena',
    lastName: 'Ashworth',
    description:
      'A tenured professor of Philosophy & Rhetoric who argues with surgical precision. An intellectual who cannot turn it off — every casual conversation becomes a lecture. Speaks like a professor at a dinner party: mostly composed, occasionally passionate, sometimes cutting.',
    headline: 'Professor of Philosophy & Rhetoric',
    gender: 'female',
    imageFile: 'DrHelenaAshworth.png',
  },
  truther: {
    firstName: 'Darius',
    lastName: 'Kane',
    description:
      'A self-proclaimed independent researcher and podcast host who connects dots others miss. Dead serious about pattern recognition, which is what makes him compelling. Intense and urgent, stumbles over words because his brain moves faster than his mouth.',
    headline: 'Independent Researcher & Podcast Host',
    gender: 'male',
    imageFile: 'DariusKane.png',
  },
};

// ─── API Helpers ────────────────────────────────────────────────────────────

async function napsterGet(path: string, apiKey: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Napster GET ${path} ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

async function napsterPost(path: string, body: any, apiKey: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Napster POST ${path} ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

async function napsterPatch(path: string, body: any, apiKey: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Napster PATCH ${path} ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Companion Lookup ───────────────────────────────────────────────────────

async function listCustomCompanions(apiKey: string): Promise<CompanionRecord[]> {
  const data = await napsterGet('/public/companions?pageSize=50', apiKey);
  return (data.items || []) as CompanionRecord[];
}

function findCompanionByRole(
  companions: CompanionRecord[],
  role: string,
  def: CompanionDef,
): CompanionRecord | undefined {
  // Match by tag first (most reliable)
  const byTag = companions.find((c) => c.tags?.arena_role === role);
  if (byTag) return byTag;

  // Fall back to name match
  return companions.find(
    (c) => c.firstName === def.firstName && c.lastName === def.lastName,
  );
}

// ─── Companion Creation ─────────────────────────────────────────────────────

async function createCompanion(
  apiKey: string,
  role: string,
  def: CompanionDef,
  serverUrl: string,
): Promise<string> {
  const pictureUrl = `${serverUrl}/static/avatars/${def.imageFile}`;

  const companion = await napsterPost(
    '/public/companions',
    {
      firstName: def.firstName,
      lastName: def.lastName,
      description: def.description,
      gender: def.gender,
      pictureUrl,
      tags: { arena_role: role, arena_version: '2.0' },
    },
    apiKey,
  );

  const companionId = companion.id;

  // Set headline via PATCH (not available on POST)
  try {
    await napsterPatch(
      `/public/companions/${companionId}`,
      { headline: def.headline },
      apiKey,
    );
  } catch (err) {
    console.warn(`  Could not set headline for ${def.firstName}: ${(err as Error).message}`);
  }

  return companionId;
}

// ─── Status Polling ─────────────────────────────────────────────────────────

async function waitForReady(
  apiKey: string,
  companionId: string,
  name: string,
  timeoutMs = 120_000,
  pollMs = 5_000,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const companion = await napsterGet(`/public/companions/${companionId}`, apiKey);
    const status = companion.status;

    if (status === 'readyToUse') {
      return status;
    }
    if (status === 'failed' || status === 'blocked') {
      throw new Error(`Companion ${name} generation ${status}`);
    }

    console.log(`  Companion ${name}: status=${status}, waiting...`);
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(`Companion ${name} not ready after ${timeoutMs / 1000}s`);
}

// ─── Public API ─────────────────────────────────────────────────────────────

let cachedMap: Record<string, string> | null = null;

/**
 * Ensures custom ARENA companions exist and are ready.
 * Creates them if missing, polls until avatars are generated.
 * Returns a map of role -> companionId.
 */
export async function ensureCustomCompanions(
  serverUrl: string,
): Promise<Record<string, string>> {
  if (cachedMap) return cachedMap;

  const apiKey = process.env.OMNIAGENT_API_KEY;
  if (!apiKey) {
    console.warn('  No OMNIAGENT_API_KEY — skipping custom companions');
    return {};
  }

  console.log('\n  Setting up custom ARENA companions...');

  // List existing companions
  let existing: CompanionRecord[] = [];
  try {
    existing = await listCustomCompanions(apiKey);
    console.log(`  Found ${existing.length} existing custom companions`);
  } catch (err) {
    console.error('  Could not list companions:', (err as Error).message);
  }

  const result: Record<string, string> = {};
  const pendingCompanions: { role: string; id: string; name: string }[] = [];

  for (const [role, def] of Object.entries(COMPANION_DEFS)) {
    const found = findCompanionByRole(existing, role, def);

    if (found) {
      result[role] = found.id;
      if (found.status === 'readyToUse') {
        console.log(`  ${def.firstName} ${def.lastName}: ready (${found.id})`);
      } else {
        console.log(`  ${def.firstName} ${def.lastName}: ${found.status} (${found.id})`);
        pendingCompanions.push({ role, id: found.id, name: `${def.firstName} ${def.lastName}` });
      }
    } else {
      // Create new companion
      try {
        const id = await createCompanion(apiKey, role, def, serverUrl);
        result[role] = id;
        console.log(`  ${def.firstName} ${def.lastName}: created (${id}) — generating avatar...`);
        pendingCompanions.push({ role, id, name: `${def.firstName} ${def.lastName}` });
      } catch (err) {
        console.error(`  Failed to create ${def.firstName} ${def.lastName}:`, (err as Error).message);
      }
    }
  }

  // Poll pending companions until ready (or timeout)
  if (pendingCompanions.length > 0) {
    console.log(`  Waiting for ${pendingCompanions.length} companion(s) to finish generating...`);
    await Promise.allSettled(
      pendingCompanions.map(async ({ id, name }) => {
        try {
          await waitForReady(apiKey, id, name);
          console.log(`  ${name}: ready!`);
        } catch (err) {
          console.warn(`  ${name}: ${(err as Error).message} — will use anyway`);
        }
      }),
    );
  }

  cachedMap = result;
  const readyCount = Object.keys(result).length;
  console.log(`  Custom companions: ${readyCount}/${Object.keys(COMPANION_DEFS).length} available\n`);

  return result;
}

/**
 * Get cached companion map without re-initializing.
 */
export function getCustomCompanions(): Record<string, string> | null {
  return cachedMap;
}

/**
 * Get the companion definitions (for reference/display).
 */
export function getCompanionDefs(): Record<string, CompanionDef> {
  return COMPANION_DEFS;
}
