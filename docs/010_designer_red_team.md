# Designer Red Team Review: A.R.E.N.A.

## Health Check Summary

**Overall Assessment:** The design language is strong — the dark cinematic aesthetic with cyan/magenta accents perfectly matches the "esports broadcast" concept. The color system is cohesive and accessible. However, the actual UI layout and interaction design needs more specification. The design language tells us WHAT things look like but not HOW they're arranged, how information hierarchy works across the page, or how the experience degrades on different screen sizes.

### Issues Summary

| # | Severity | Issue | Category |
|---|----------|-------|----------|
| 1 | High | Page layout / information hierarchy not defined | Layout |
| 2 | High | Agent panel design doesn't account for speaking vs. idle cognitive load | UX |
| 3 | High | Chaos injection panel competes visually with the main event | Hierarchy |
| 4 | Medium | Mobile layout with 4 video panels will be unusable | Responsive |
| 5 | Medium | Color assignment for 4+ agents risks confusion | Color System |
| 6 | Medium | Transcript feed readability at speed | Typography |
| 7 | Medium | No empty/loading/error state designs specified | States |
| 8 | Low | Accessibility: reliance on glow effects for "speaking" indicator | A11y |
| 9 | Low | Animation performance with 4 video panels + CSS effects | Performance |
| 10 | Low | No micro-copy / writing guidelines for UI text | Content |

---

## High Priority Issues

### Issue 1: Page layout undefined
**The problem:** The design language defines tokens (colors, spacing, radii) but doesn't define the actual page composition. Where does each element sit? What's the proportional split between video panels vs. sidebar vs. controls? What's the visual hierarchy?

**Suggested layout specification:**

```
Desktop (1024px+):
┌──────────────────────────────────────────────────────────────┐
│ [Topic Bar — full width, h2, centered]                        │
├────────────────────────────────────────────��──┬──────────────┤
│                                               │              │
│    ┌────��────────┐  ┌─────────────┐          │  Transcript  │
│    │  Agent A    │  │  Agent B    │          │  Feed        │
│    │  (video)    │  │  (video)    │          │  (scrolling) │
│    └─────────────┘  └─────────────┘          │              │
│    ┌─────────────┐  ┌─────────────┐          │              │
│    │  Agent C    │  │  Agent D    │          │              │
│    │  (video)    │  │  (video)    │          │              │
│    └─────────────┘  └─────────────┘          │              │
│                                               │              │
│    70% width                                  │  30% width   │
├───────────────────────────────────────────────┴──────────────┤
│ [Audience Controls — full width bar: Chaos | Vote | Call-In] │
└──────────────────────────────────────────────────────────────┘

Proportions: Video grid 60vh, Controls bar 15vh, Topic bar 5vh
```

### Issue 2: Agent panels — active vs. idle
**The problem:** The design specifies a 2px cyan border and glow for the "speaking" agent. But with 4 agents, 3 are always idle. The idle panels need to feel alive (not dead/disconnected) while being clearly subordinate to the active speaker.

**Suggested approach:**
- **Speaking:** Cyan border glow + slightly larger (scale 1.02) + name label fully bright
- **Idle but reactive:** Subtle breathing animation on border (opacity pulse), agent video still playing, name label at 70% opacity
- **Waiting to respond:** Brief amber flash when they receive the transcript relay ("thinking")
- **Disconnected:** Grayscale video still frame + "reconnecting..." text

### Issue 3: Chaos panel visual competition
**The problem:** The chaos injection panel is exciting for users BUT it shouldn't compete visually with the debate itself. If the controls are too visually prominent (bright colors, large buttons, glowing elements), viewers will stare at the controls instead of watching the agents.

**Suggested fix:**
- Controls bar uses `bg-surface` (#12121A) — receding, not attention-grabbing
- Buttons are `ghost` variant by default (subtle borders, not filled)
- Only the "Inject" submit button uses primary color
- Active rules display is overlay text ON the video grid (like a sports score bug), not in the control panel
- The panel "folds down" to a minimal state when not being used, expanding on hover/click

---

## Medium Priority Issues

### Issue 4: Mobile is broken with 4 video panels
**The problem:** 4 video panels in a 2x2 grid on a 375px wide phone screen = each video is ~175px wide. That's too small to see facial expressions or read name labels.

**Suggested mobile approach:**
- Show ONLY the active speaker full-width (large)
- Small thumbnail strip at bottom showing other agents (tappable to "focus")
- Transcript below the video
- Controls as a bottom sheet (swipe up)
- This changes the experience from "broadcast panel" to "switching between speakers" — which is actually fine on mobile

### Issue 5: Agent color assignment
**The problem:** The design language assigns each agent a "unique saturated color" for transcript attribution. With 4 agents, you need 4 colors that are all:
- Distinguishable from each other
- Legible on dark backgrounds
- Not confused with semantic colors (red = error, green = success)

**Suggested agent palette:**
| Agent | Color | Hex | Notes |
|-------|-------|-----|-------|
| Agent A | Electric Cyan | `#00F0FF` | Primary brand color = lead character |
| Agent B | Violet | `#A78BFA` | Distinct from cyan, good contrast |
| Agent C | Amber | `#FBBF24` | Warm contrast against cool scheme |
| Agent D | Lime | `#84CC16` | Distinct from all above, not "success green" |

Avoid: pure red (reads as error/live), pure magenta (reads as "danger"), pure blue (reads as info/links).

### Issue 6: Transcript feed at speed
**The problem:** With 4 agents responding every few seconds, the transcript feed scrolls fast. At 14px JetBrains Mono, lines are dense. Users can't track multiple conversation threads simultaneously.

**Suggested improvements:**
- Increase transcript font to 15-16px
- Add 12px vertical gap between messages (not 8px)
- Show agent name as a colored pill/badge before their text (not just colored text)
- Auto-scroll BUT lock scroll position if user scrolls up (with "New messages ↓" indicator)
- Fade older messages to 60% opacity to focus attention on latest 2-3

### Issue 7: Empty/loading/error states
**The problem:** The design language defines component tokens but not the actual screens for:
- Page loading (before any agents connect)
- Agent connecting (1 of 4 loaded)
- All agents disconnected (session ended)
- No active debates available
- Audience action rejected (cooldown)

**Suggested fix:** Define these key states:
- **Initial load:** Dark background + centered pulsing "ARENA" logo + "Preparing the combatants..." text
- **Partial connection:** Show connected agent panels + pulsing border outlines for pending agents
- **Session ended:** Freeze last frame + overlay "DEBATE ENDED" with final vote results
- **Error:** Toast notification at top (not a full-page error) — the show must go on

---

## Low Priority Issues

### Issue 8: Speaking indicator accessibility
**The problem:** The "glow" effect (box-shadow) is subtle and relies on color perception. Users with color vision deficiency may not distinguish the speaking agent from idle ones.

**Suggested fix:** Add a secondary indicator: a small animated "soundwave" icon or "SPEAKING" text badge that appears on the active panel. This provides a non-color signal.

### Issue 9: Animation performance
**The problem:** Four video panels + glow animations + framer-motion transitions + transcript auto-scroll = potential jank on mid-range devices.

**Suggested fix:**
- Use `will-change: transform` on animated elements
- Glow effects via `box-shadow` (GPU-accelerated) not `filter: drop-shadow` (CPU)
- Test on a mid-range laptop (not just a dev machine with a discrete GPU)
- Add a "reduced motion" fallback that removes glow/pulse, keeping only static border highlights

### Issue 10: UI writing/micro-copy
**The problem:** Button labels, placeholder text, empty states, and error messages aren't specified. "Inject Chaos" is evocative but is it clear enough for first-time users?

**Suggested guidelines:**
- Button text: imperative verb + context ("Inject Rule", "Change Topic", "Call In")
- Placeholder text: example of what to type ("e.g., Everyone must speak in questions only")
- Feedback messages: active voice, present tense ("Rule applied!" not "Your rule has been applied")
- Error messages: what went wrong + what to do ("Cooldown active — try again in 12s")

---

## Top 3 Design Priorities Before Building

1. **Define the page layout** — proportions, hierarchy, and the relationship between video grid, transcript, and controls
2. **Design the "speaking" vs "idle" agent panel states** — this is what users stare at 90% of the time
3. **Design the mobile experience** — single-speaker focus mode, not a miniaturized desktop
