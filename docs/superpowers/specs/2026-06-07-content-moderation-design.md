# Content Moderation Guardrails — Design Spec

## Overview

Add content moderation to all user-generated input in ARENA's chaos features and call-in system. Prevents inappropriate submissions (hate speech, slurs, sexual content, personal attacks, violence, extremism, self-harm) from reaching the debate agents or other viewers.

## Architecture

**Approach:** Hybrid two-layer moderation called inline in socket handlers (Approach A).

**Module:** `server/src/lib/moderation.ts` — single exported function:

```ts
async function moderate(text: string): Promise<{ ok: true } | { ok: false; reason: string }>
```

### Layer 1: Local Blocklist (sync, <1ms)

- File: `server/src/lib/blocklist.ts`
- ~50-80 regex patterns covering obvious violations
- Case-insensitive matching against both original and leetspeak-normalized text
- Returns immediately with category-based reason on match

**Leetspeak normalization** (applied before matching):
- `@` -> `a`, `0` -> `o`, `1` -> `i`/`l`, `3` -> `e`, `$` -> `s`, `5` -> `s`, `7` -> `t`
- Strip repeated characters beyond 2 (e.g., `fuuuuck` -> `fuuck`)
- Match against both original and normalized text

**Blocklist categories:**

| Category | What it catches |
|----------|----------------|
| `inappropriate_language` | Racial/ethnic slurs, homophobic slurs, explicit sexual terms |
| `personal_information` | Phone numbers, emails, SSN patterns, doxxing attempts |
| `extremist_content` | Known extremist group names, radicalization phrases, terrorism keywords |

**Pattern structure:**

```ts
interface BlocklistEntry {
  pattern: RegExp;
  category: 'inappropriate_language' | 'personal_information' | 'extremist_content';
}
```

### Layer 2: OpenAI Moderation API (async, ~200-400ms)

- Only called if Layer 1 passes
- Endpoint: `POST https://api.openai.com/v1/moderations`
- Free to use, purpose-built for content classification
- Env var: `OPENAI_API_KEY` (if missing, falls back to blocklist-only with console warning)

**Flagged categories:**
- `hate`, `hate/threatening`
- `harassment`, `harassment/threatening`
- `self-harm`, `self-harm/intent`, `self-harm/instructions`
- `sexual`, `sexual/minors`
- `violence`, `violence/graphic`

**Category mapping to user-friendly reasons:**

| OpenAI category | Reason code |
|----------------|-------------|
| `hate`, `hate/threatening` | `hate_speech` |
| `harassment`, `harassment/threatening` | `harassment` |
| `self-harm`, `self-harm/intent`, `self-harm/instructions` | `self_harm` |
| `sexual`, `sexual/minors` | `sexual_content` |
| `violence`, `violence/graphic` | `violence` |

## Integration Points

### Text Submissions (chaos_inject, topic_change, voice_challenge)

```
auth check -> credit deduction -> moderate(text) -> enqueue
                                       | (fail)
                                 refund credits -> emit injection_rejected { reason }
```

- Moderation runs AFTER credit deduction (enables refund on rejection)
- Quick chaos presets are server-defined text — skip moderation
- Only user free-text is moderated

### Call-In Audio (callin_submit)

```
auth check -> reject if audio >60s -> moderate(topic) -> credit deduction -> enqueue (transcribing)
                                           | (fail)                                       |
                                     emit callin_rejected                    transcription completes
                                                                                          |
                                                                            moderate(transcript)
                                                                                  | (fail)
                                                                            eject from queue
                                                                            refund credits
                                                                            emit callin_moderated
```

- The typed `topic` field is moderated immediately (before credit charge)
- Post-transcription moderation: `CallInQueue.submit()` accepts an optional `onTranscribed(entry)` callback. The socket handler passes a callback that runs `moderate(transcript)` and ejects + refunds + emits on failure. This keeps moderation logic in the handler layer (Approach A) while hooking into the async transcription lifecycle.
- If the call-in is already `active` (being played to agents) when moderation returns — let it through (edge case)
- New socket event `callin_moderated` notifies the user their call was dropped

## Rejection UX

### Event Payloads

**Existing event (extended with moderation reasons):**

```ts
socket.emit('injection_rejected', {
  reason: 'inappropriate_language' | 'hate_speech' | 'harassment' | 'sexual_content' |
          'violence' | 'self_harm' | 'personal_information' | 'extremist_content',
  remainingMs: 0
});
```

**New event for call-in post-transcription ejection:**

```ts
socket.emit('callin_moderated', {
  callId: string,
  reason: string  // same reason values as above
});
```

### Client-Side Message Mapping

```ts
const MODERATION_MESSAGES: Record<string, string> = {
  inappropriate_language: "Submission rejected: contains inappropriate language",
  hate_speech: "Submission rejected: contains hate speech",
  harassment: "Submission rejected: contains harassment",
  sexual_content: "Submission rejected: contains sexual content",
  violence: "Submission rejected: contains violent content",
  self_harm: "Submission rejected: references self-harm",
  personal_information: "Submission rejected: contains personal information",
  extremist_content: "Submission rejected: contains extremist content",
};
```

### Credit Refund

- Happens server-side before the rejection event emits
- User's Firestore balance updates in real-time via existing `onSnapshot` listener
- Refund uses existing `creditService.addCredits()` with reason `refund_moderation_{timestamp}`

## Files to Create/Modify

### New files:
- `server/src/lib/moderation.ts` — `moderate()` function (Layer 1 + Layer 2 orchestration)
- `server/src/lib/blocklist.ts` — regex patterns and normalization logic

### Modified files:
- `server/src/socket/handlers.ts` — add moderation calls to `chaos_inject`, `topic_change`, `callin_submit` handlers
- `server/src/sessions/callin-queue.ts` — add post-transcription moderation hook + queue ejection
- `client/src/store/arena.ts` (or relevant component) — handle `callin_moderated` event, display rejection toast
- Client chaos/topic components — display moderation rejection messages using reason mapping

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Recommended | Powers Layer 2 moderation. If absent, blocklist-only mode with console warning |

## Edge Cases

1. **OpenAI API down/timeout:** Fall back to blocklist-only (log warning, don't block submissions entirely)
2. **Call-in already active when moderation returns:** Let it through — too late to pull back
3. **Quick chaos presets:** Skip moderation — server-defined, trusted text
4. **Empty/whitespace text:** Already handled by existing validation (before moderation runs)
5. **Rate limiting on OpenAI:** The moderation endpoint is free and generous; unlikely to hit limits at hackathon scale
