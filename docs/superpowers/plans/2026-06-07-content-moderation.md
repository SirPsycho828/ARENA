# Content Moderation Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hybrid content moderation (local blocklist + OpenAI Moderation API) to all user-generated input in chaos features and call-in system.

**Architecture:** Single `moderate()` function in `server/src/lib/moderation.ts` called inline from socket handlers. Layer 1 is a sync regex blocklist with leetspeak normalization. Layer 2 is the OpenAI Moderation API (async, free). Credits are refunded on rejection.

**Tech Stack:** TypeScript, OpenAI Moderation API (REST), regex patterns, Socket.io events

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/lib/blocklist.ts` | Create | Regex patterns, normalization, sync check |
| `server/src/lib/moderation.ts` | Create | Orchestrate Layer 1 + Layer 2, single `moderate()` export |
| `server/src/socket/handlers.ts` | Modify | Call `moderate()` before enqueue, refund on rejection |
| `server/src/sessions/callin-queue.ts` | Modify | Accept `onTranscribed` callback for post-transcription moderation |
| `client/src/store/arena.ts` | Modify | Handle moderation rejection reasons + `callin_moderated` event |
| `client/src/lib/moderation-messages.ts` | Create | Reason-to-message mapping for UI display |

---

### Task 1: Create the Blocklist Module

**Files:**
- Create: `server/src/lib/blocklist.ts`

- [ ] **Step 1: Create `server/src/lib/blocklist.ts`**

```ts
interface BlocklistEntry {
  pattern: RegExp;
  category: 'inappropriate_language' | 'personal_information' | 'extremist_content';
}

/**
 * Normalize leetspeak substitutions and repeated chars.
 */
function normalize(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/@/g, 'a')
       .replace(/0/g, 'o')
       .replace(/1/g, 'i')
       .replace(/3/g, 'e')
       .replace(/\$/g, 's')
       .replace(/5/g, 's')
       .replace(/7/g, 't');
  // Collapse repeated chars beyond 2
  s = s.replace(/(.)\1{2,}/g, '$1$1');
  return s;
}

const BLOCKLIST: BlocklistEntry[] = [
  // --- Inappropriate Language ---
  // Racial/ethnic slurs
  { pattern: /\bn+[i1!]+g+[e3]*r+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bk+[i1!]+k+e+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bsp+[i1!]+c+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bch+[i1!]+n+k+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bw+[e3]+t+b+a+c+k+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bc+o+o+n+s?\b/i, category: 'inappropriate_language' },
  // Homophobic slurs
  { pattern: /\bf+[a@]+g+[o0]*t+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bd+[y1]+k+e+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\btr+[a@]+n+n+[y1i]+e*s?\b/i, category: 'inappropriate_language' },
  // Explicit sexual terms (most egregious only — OpenAI catches the rest)
  { pattern: /\bc+u+n+t+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\brape[ds]?\b/i, category: 'inappropriate_language' },
  { pattern: /\bmolest/i, category: 'inappropriate_language' },
  { pattern: /\bpedophil/i, category: 'inappropriate_language' },

  // --- Personal Information ---
  { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, category: 'personal_information' },  // US phone
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, category: 'personal_information' },  // SSN
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, category: 'personal_information' },  // Email
  { pattern: /\bdoxx?(ing|ed)?\b/i, category: 'personal_information' },

  // --- Extremist Content ---
  { pattern: /\bisis\b/i, category: 'extremist_content' },
  { pattern: /\bal[\s-]?qaeda\b/i, category: 'extremist_content' },
  { pattern: /\bjihad(i|ist)?\b/i, category: 'extremist_content' },
  { pattern: /\bheil\s+hitler\b/i, category: 'extremist_content' },
  { pattern: /\bsieg\s+heil\b/i, category: 'extremist_content' },
  { pattern: /\b(white|aryan)\s+(power|supremac)/i, category: 'extremist_content' },
  { pattern: /\b14\s*88\b/, category: 'extremist_content' },
  { pattern: /\bgas\s+the\s+jews\b/i, category: 'extremist_content' },
  { pattern: /\bkill\s+(all\s+)?(jews|muslims|blacks|whites|gays)\b/i, category: 'extremist_content' },
];

export type ModerationCategory = BlocklistEntry['category'];

/**
 * Synchronous blocklist check. Returns the first matching category or null.
 */
export function checkBlocklist(text: string): ModerationCategory | null {
  const normalized = normalize(text);

  for (const entry of BLOCKLIST) {
    if (entry.pattern.test(text) || entry.pattern.test(normalized)) {
      return entry.category;
    }
  }
  return null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/server" && npx tsc --noEmit src/lib/blocklist.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/blocklist.ts
git commit -m "feat: add content moderation blocklist with leetspeak normalization"
```

---

### Task 2: Create the Moderation Module

**Files:**
- Create: `server/src/lib/moderation.ts`

- [ ] **Step 1: Create `server/src/lib/moderation.ts`**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/server" && npx tsc --noEmit src/lib/moderation.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/moderation.ts
git commit -m "feat: add hybrid moderation module (blocklist + OpenAI API)"
```

---

### Task 3: Integrate Moderation into Socket Handlers

**Files:**
- Modify: `server/src/socket/handlers.ts:66-150`

- [ ] **Step 1: Add moderation import at top of `handlers.ts`**

After the existing imports, add:

```ts
import { moderate } from '../lib/moderation.js';
```

- [ ] **Step 2: Add moderation to `chaos_inject` handler**

In the `chaos_inject` handler, after the credit deduction succeeds (line 79: `const charged = await creditService.deductCredits(...)`) and before the `handleChaosInject` call (line 84), insert the moderation check:

```ts
        // Moderate user text
        const modResult = await moderate(data.text);
        if (!modResult.ok) {
          await creditService.addCredits(user.uid, cost, `refund_moderation_${Date.now()}`);
          return socket.emit('injection_rejected', { reason: modResult.reason, remainingMs: 0 });
        }
```

- [ ] **Step 3: Add moderation to `topic_change` handler**

In the `topic_change` handler, after the credit deduction succeeds (line 136: `const charged = await creditService.deductCredits(...)`) and before the `handleChaosInject` call (line 141), insert:

```ts
        // Moderate user topic
        const modResult = await moderate(data.topic);
        if (!modResult.ok) {
          await creditService.addCredits(user.uid, CREDIT_COSTS.topic_change, `refund_moderation_${Date.now()}`);
          return socket.emit('injection_rejected', { reason: modResult.reason, remainingMs: 0 });
        }
```

- [ ] **Step 4: Add moderation to `callin_submit` handler**

In the `callin_submit` handler, after the queue capacity check (line 182) and BEFORE credit deduction (line 187), add moderation of the typed `topic` field:

```ts
        // Moderate the typed topic field before charging
        const topicMod = await moderate(data.topic);
        if (!topicMod.ok) {
          return (socket as any).emit('callin_rejected', { reason: topicMod.reason });
        }
```

Also add audio duration check before the queue capacity check:

```ts
        // Reject audio over 60 seconds
        if (data.durationMs > 60000) {
          return (socket as any).emit('callin_rejected', { reason: 'too_long' });
        }
```

- [ ] **Step 5: Skip moderation for `quick_chaos` (server-defined presets)**

No change needed — `quick_chaos` uses server-defined `data.preset` keys that map to trusted strings in `SessionManager.handleQuickChaos()`. User text never reaches the queue.

- [ ] **Step 6: Verify it compiles**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/server" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add server/src/socket/handlers.ts
git commit -m "feat: add moderation checks to chaos_inject, topic_change, callin_submit handlers"
```

---

### Task 4: Add Post-Transcription Moderation to CallInQueue

**Files:**
- Modify: `server/src/sessions/callin-queue.ts:25-60`

- [ ] **Step 1: Add `onTranscribed` callback parameter to `submit()`**

Change the `submit` method signature to accept an optional callback:

```ts
  async submit(
    socketId: string,
    audioBuffer: Buffer,
    displayName: string,
    topic: string,
    durationMs: number,
    onTranscribed?: (entry: CallInEntry) => void,
  ): Promise<{ entry: CallInEntry; position: number } | null> {
```

- [ ] **Step 2: Call the callback after transcription completes**

Replace the existing `.then()` block (lines 49-57) with:

```ts
    // Transcribe in the background — don't block
    transcribeAudio(audioBuffer).then(transcript => {
      entry.transcript = transcript || `(Viewer "${displayName}" called in about: ${topic})`;
      entry.status = 'queued';
      console.log(`  [CallIn] Transcription ready for ${entry.callId}: "${entry.transcript.slice(0, 80)}"`);
      if (onTranscribed) onTranscribed(entry);
    }).catch(err => {
      console.error(`  [CallIn] Transcription failed for ${entry.callId}:`, (err as Error).message);
      entry.transcript = `(Viewer "${displayName}" called in about: ${topic})`;
      entry.status = 'queued';
      if (onTranscribed) onTranscribed(entry);
    });
```

- [ ] **Step 3: Add `eject(callId)` method to CallInQueue**

Add after the `completeActive()` method:

```ts
  /**
   * Remove an entry from the queue (used when post-transcription moderation fails).
   * Returns the ejected entry or null if not found / already active.
   */
  eject(callId: string): CallInEntry | null {
    const idx = this.queue.findIndex(e => e.callId === callId);
    if (idx === -1) return null;
    const [ejected] = this.queue.splice(idx, 1);
    return ejected;
  }
```

- [ ] **Step 4: Wire up post-transcription moderation in `handlers.ts`**

In the `callin_submit` handler, update the `handleCallInSubmit` call to pass a moderation callback. First, update `SessionManager.handleCallInSubmit` to accept and forward the callback (or call it directly from the handler).

In `handlers.ts`, replace the existing `sessionManager.handleCallInSubmit(...)` call with:

```ts
        const result = await sessionManager.handleCallInSubmit(
          socket.id,
          audioBuffer,
          data.displayName,
          data.topic,
          data.durationMs,
          async (entry) => {
            // Post-transcription moderation
            if (!entry.transcript) return;
            const modResult = await moderate(entry.transcript);
            if (!modResult.ok) {
              const queue = sessionManager.getCallInQueue();
              if (queue && entry.status !== 'active') {
                queue.eject(entry.callId);
                await creditService.addCredits(user.uid, CREDIT_COSTS.call_in, `refund_moderation_${Date.now()}`);
                (socket as any).emit('callin_moderated', { callId: entry.callId, reason: modResult.reason });
                console.log(`  [CallIn] Ejected ${entry.callId} — moderation: ${modResult.reason}`);
              }
            }
          },
        );
```

- [ ] **Step 5: Update `SessionManager.handleCallInSubmit` to forward the callback**

In `server/src/sessions/manager.ts`, find the `handleCallInSubmit` method and add the callback parameter, forwarding it to `callInQueue.submit()`:

```ts
  async handleCallInSubmit(
    socketId: string,
    audioBuffer: Buffer,
    displayName: string,
    topic: string,
    durationMs: number,
    onTranscribed?: (entry: CallInEntry) => void,
  ) {
    if (!this.callInQueue) return null;
    const result = await this.callInQueue.submit(socketId, audioBuffer, displayName, topic, durationMs, onTranscribed);
    // ... rest of existing logic
  }
```

- [ ] **Step 6: Verify it compiles**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/server" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add server/src/sessions/callin-queue.ts server/src/socket/handlers.ts server/src/sessions/manager.ts
git commit -m "feat: add post-transcription moderation with queue ejection for call-ins"
```

---

### Task 5: Client-Side Moderation Messages

**Files:**
- Create: `client/src/lib/moderation-messages.ts`
- Modify: `client/src/store/arena.ts:455-461`

- [ ] **Step 1: Create `client/src/lib/moderation-messages.ts`**

```ts
export const MODERATION_MESSAGES: Record<string, string> = {
  inappropriate_language: 'Submission rejected: contains inappropriate language',
  hate_speech: 'Submission rejected: contains hate speech',
  harassment: 'Submission rejected: contains harassment',
  sexual_content: 'Submission rejected: contains sexual content',
  violence: 'Submission rejected: contains violent content',
  self_harm: 'Submission rejected: references self-harm',
  personal_information: 'Submission rejected: contains personal information',
  extremist_content: 'Submission rejected: contains extremist content',
};

export function getModerationMessage(reason: string): string | null {
  return MODERATION_MESSAGES[reason] || null;
}
```

- [ ] **Step 2: Update `injection_rejected` handler in `arena.ts`**

Replace the existing handler (lines 455-462):

```ts
    socket.on('injection_rejected', ({ reason, remainingMs }) => {
      if (reason === 'cooldown') {
        set({ injectionCooldown: remainingMs });
      } else {
        set({ lastRejectionReason: reason });
        setTimeout(() => set({ lastRejectionReason: null }), 4000);
      }
    });
```

This already works — moderation reasons like `hate_speech` will flow through the `else` branch and set `lastRejectionReason`. The UI component that reads `lastRejectionReason` just needs to display the human-friendly message.

- [ ] **Step 3: Add `callin_moderated` event listener**

After the existing `callin_rejected` handler (around line 573), add:

```ts
    (socket as any).on('callin_moderated', ({ callId, reason }: { callId: string; reason: string }) => {
      console.warn('Call-in moderated:', callId, reason);
      set({
        callInState: 'idle' as const,
        callInCallId: null,
        callInQueuePosition: 0,
        lastRejectionReason: reason,
      });
      setTimeout(() => set({ lastRejectionReason: null }), 5000);
    });
```

- [ ] **Step 4: Update the UI component that displays `lastRejectionReason`**

Find the component that renders `lastRejectionReason` and import the message map. Add the import and use `getModerationMessage(reason) || reason` to display human-friendly text instead of raw reason codes.

Search for the component with: `grep -r "lastRejectionReason" client/src/components/`

Update it to:

```ts
import { getModerationMessage } from '../lib/moderation-messages';

// Where the reason is displayed:
const message = getModerationMessage(lastRejectionReason) || lastRejectionReason;
```

- [ ] **Step 5: Verify client builds**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/client" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/moderation-messages.ts client/src/store/arena.ts
git commit -m "feat: handle moderation rejection reasons in client UI"
```

---

### Task 6: Add OPENAI_API_KEY to Environment

**Files:**
- Modify: `server/.env` (local)
- Note: Add to Railway env vars for production

- [ ] **Step 1: Add `OPENAI_API_KEY` to local `.env`**

Add to `server/.env` (or create if it doesn't exist):

```
OPENAI_API_KEY=sk-...
```

- [ ] **Step 2: Ensure `dotenv` loads it**

Check that `server/src/index.ts` has `import 'dotenv/config'` or `dotenv.config()` at the top. The server already uses `dotenv` as a dependency, so this should already be in place.

- [ ] **Step 3: Test manually**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/server" && USE_MOCK=true npx tsx src/index.ts`

Check console for:
- If key is set: no warning
- If key is missing: `[Moderation] OPENAI_API_KEY not set — falling back to blocklist-only mode`

- [ ] **Step 4: Commit (no .env file — just verify setup)**

No commit needed for env vars. Document in README or deployment notes that `OPENAI_API_KEY` is needed for full moderation.

---

### Task 7: End-to-End Verification

- [ ] **Step 1: Start server in mock mode**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/server" && OPENAI_API_KEY=test USE_MOCK=true npx tsx src/index.ts`

- [ ] **Step 2: Test blocklist rejection**

Use a socket client or the running app to submit a `chaos_inject` with a slur. Verify:
- `injection_rejected` event received with `reason: 'inappropriate_language'`
- Credits are refunded

- [ ] **Step 3: Test OpenAI moderation (if key is real)**

Submit something subtle that the blocklist wouldn't catch but OpenAI would (e.g., "I want to hurt myself"). Verify:
- `injection_rejected` event received with `reason: 'self_harm'`

- [ ] **Step 4: Test clean submission passes**

Submit "Everyone must speak like a pirate" — verify it enqueues successfully.

- [ ] **Step 5: Test call-in topic moderation**

Submit a `callin_submit` with an inappropriate `topic` field. Verify:
- `callin_rejected` event received before credit deduction

- [ ] **Step 6: Build client for production**

Run: `cd "C:/Users/steve/OneDrive/Documents/Repos/Napster Hackathon/ARENA/client" && npx vite build`
Expected: Build succeeds

- [ ] **Step 7: Final commit with built client**

```bash
cd client && npx vite build && cd ..
git add -f client/dist
git commit -m "chore: rebuild client dist with moderation UI"
```
