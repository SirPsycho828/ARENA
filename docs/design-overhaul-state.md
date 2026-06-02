# Design Overhaul State

## Current Phase: 10 (Verify)
## Completed: [1, 2, 3, 4, 5, 6, 7, 8, 9]

## Phase 9 (Polish) — Complete
- [x] Step 1: prefers-reduced-motion CSS rule
- [x] Step 2: Focus-visible global styles (broadcast ring)
- [x] Step 3: Console branding (ASCII ARENA art + tagline)
- [x] Step 4: aria-labels on icon-only buttons (chaos trigger, close panel)
- [x] Step 5: active:scale-95 micro-interaction on chaos trigger
- [x] Step 6: Final anti-pattern sweep — ALL PASSED (AP-1 through AP-12)

## Phase 8 (Pages) — Complete
- [x] AgentPanel — lower-third name plate, broadcast status badges, new tokens
- [x] TranscriptFeed — chyron-style header, new tokens
- [x] AgentEntrance — broadcast intro graphics, lower-third name plate, new tokens
- [x] VictoryScreen — election-night results card, broadcast lower-third winner
- [x] ChaosPanel — broadcast control room, chyron header, new tokens
- [x] VoiceChallenger — broadcast recording indicator, chyron header, new tokens
- [x] QuickInjects — broadcast pill buttons, new tokens
- [x] AgentStats — broadcast bio card, lower-third header, new tokens
- [x] JudgePanel — accent blue terminal, new tokens
- [x] ReactionOverlay — broadcast-style reaction bar, new tokens

## Phase 7 (App Shell) — Complete
- [x] Step 1: Load references — Full Canvas archetype, anti-patterns
- [x] Step 2: Revisit Mobbin — Riverside panels, Twitch engagement overlay, WSJ hierarchy
- [ ] Step 3: 21st.dev search — skipped: custom broadcast components better fit
- [x] Step 4: Identify shell components — TopicBanner, SpectatorBar, ChaosStatusBar, UserBadge, LiveBadge, ShareButton, SoundToggle, App.tsx layout
- [x] Step 5: Redesign navigation — Full Canvas with edge-triggered right panel (no fixed sidebar)
- [x] Step 6: Redesign page layout — full-width content, p-3 padding, bg-background
- [x] Step 7: Redesign header — broadcast chyron with lower-third accent, topic display
- [ ] Step 8: Loading states — skipped: no standalone loading component exists
- [ ] Step 9: Error states — skipped: ErrorBoundary exists but is structural, not visual
- [ ] Step 10: Empty states — updated empty debate state with newsroom tokens
- [x] Step 11: Page transitions — AnimatePresence with camera-cut style fade
- [x] Step 12: Anti-pattern sweep — passed (AP-7, AP-8, AP-9, AP-10, AP-11)
- [x] Step 13: Update state

## App Shell Build Notes
**Archetype used:** Full Canvas
**Signature variation:** Edge-triggered panels — chaos controls slide in from right edge on all screen sizes
**Anti-pattern sweep:** Passed
**Mobbin influence:** Riverside clean panel layout, Twitch engagement as overlay, WSJ data strip hierarchy
**21st.dev components used:** N/A

## Phase 6 (Auth) — Complete
- [x] Step 1: Inventory auth pages — AuthModal (sign in/sign up modal), CreditShop (purchase modal)
- [x] Step 2: Choose layout — Centered card (modal overlay), broadcast lower-third header style
- [x] Step 3: Redesign AuthModal — new tokens, sharp radii, lower-third header, primary red CTA, accent blue links
- [x] Step 4: Redesign CreditShop — warning gold accent, credit cost reference grid, broadcast header
- [ ] Step 5: Password reset — skipped: not implemented in this app
- [ ] Step 6: Onboarding — skipped: not implemented in this app
- [x] Step 7: Responsive check — modals use max-w-sm with mx-4 mobile margin
- [x] Step 8: Update state

## Phase 5 (Landing Page) — Complete
- [x] Step 1: Load references and context — anti-patterns, landing-patterns, page archetypes
- [x] Step 2: Source visuals — 4 visual specimens (DebatePanel, ChaosPanel, VoiceChallenger, VoteTally)
- [x] Step 3: 21st.dev search — dark hero sections, cinematic landings referenced
- [x] Step 4: Revisit Mobbin — Riverside panel layout, Twitch engagement controls, WSJ editorial hierarchy
- [x] Step 5a: Routing — LandingPage replaces SplashScreen in App.tsx splash phase
- [x] Step 5b: Navigation — transparent minimal nav (logo + LIVE badge + single CTA)
- [x] Step 5c: Build sections — Hero (broadcast grid bg + scanline + vignette + corner brackets), Bento Features (4 visual specimens), Stats Strip, Agent Roster, Final CTA, Footer, News Ticker
- [x] Step 5d: Anti-pattern sweep — ALL PASSED (AP-1 through AP-12)
- [x] Step 6: Responsive check — responsive classes at all breakpoints
- [x] Step 7: Update state
- [x] Step 8: Report progress

## Phase 4 (Foundation) — Complete
- [x] Step 1: Git branch — using worktree at .worktrees/design-overhaul
- [x] Step 2: Install dependencies — Framer Motion already present, removed @fontsource packages
- [x] Step 3: Generate favicon — broadcast signal icon (red dot + radiating rings on navy)
- [x] Step 4: Update meta tags — theme-color updated to #0D1117
- [x] Step 5: Write global CSS — new @theme tokens + newsroom animations + legacy aliases
- [x] Step 6: Configure Tailwind — @theme block with full design system tokens
- [x] Step 7: Update state
- [x] Step 8: Report progress
- [x] Step 9: Load Phase 5

## Design System: docs/design-system.md

## Phase 1 (Audit) — Complete
- [x] Step 1: Read project identity — ARENA, entertainment/live media, consumer app
- [x] Step 2: Detect tech stack — React 19, Vite 8, Tailwind v4, Framer Motion, Lucide, Zustand
- [x] Step 3: Inventory existing pages — SPA with phase-based nav (splash, entrance, arena, modals)
- [x] Step 4: Assess current design — Space Grotesk + Inter + JetBrains Mono, dark esports palette, glow animations
- [x] Step 5: Check existing assets — monogram favicon, OG tags present, no landing page
- [x] Step 6: Output audit summary — presented to user
- [x] Step 7: Update state — this file
- [x] Step 8: Load Phase 2

## Phase 2 (Direction) — Complete
- [x] Step 1: Load references — font pairings, color palettes, page archetypes, app shell archetypes, anti-patterns
- [x] Step 1b: Mobbin research — Riverside (multi-participant live video), Twitch (live chat overlay), Discord, WSJ (news editorial)
- [x] Step 1c: 21st.dev research — dark hero sections, cinematic landings, banner/ticker components
- [x] Step 2: Select archetypes — Cinematic (landing), Full Canvas (shell)
- [x] Step 3: Design three directions — The Newsroom, Fight Night, Channel Surf
- [x] Step 4: Present to user
- [x] Step 5: Process user choice — user chose Direction A: "The Newsroom"
- [x] Step 6: Update state — this file
- [x] Step 7: Load Phase 3

## Project
- **Name:** A.R.E.N.A. — AI Rivalry Exhibition of Neural Agents
- **Domain:** Entertainment / Live Media
- **Type:** consumer-app
- **Framework:** React 19 + Vite 8
- **CSS:** Tailwind CSS v4 (@theme directive)
- **Component Library:** None (custom components)
- **Animation:** Framer Motion
- **Icons:** Lucide React
- **State:** Zustand
- **Package Manager:** npm

## Page Inventory
| Page | Route | File | Status |
|------|-------|------|--------|
| Landing Page | / (phase: splash) | LandingPage.tsx | DONE |
| Agent Entrance | / (phase: entrance) | AgentEntrance.tsx | pending |
| Arena (main) | / (phase: arena) | App.tsx | pending |
| Auth Modal | overlay | AuthModal.tsx | pending |
| Credit Shop | overlay | CreditShop.tsx | pending |
| Victory Screen | overlay | VictoryScreen.tsx | pending |
| Judge Panel | overlay (?judge) | JudgePanel.tsx | pending |

## Design Direction
**Chosen:** The Newsroom
**Vibe:** Cable news war room meets late-night panel comedy — Anderson Cooper's set redesigned by the SNL graphics team
**Typography:** Anton (display, condensed all-caps, billboard-impact) + Rubik (body, slightly rounded, friendly)
**Primary:** #0D1117 (deep broadcast navy)
**Accent:** #E63946 (news-alert red)
**Secondary:** #3B9AE1 (informational blue / broadcast blue)
**Foreground:** #F0F4F8 (bright white-blue)
**Surface:** #161D27 (dark navy card)
**Signature:** Animated lower-third name plates, scrolling news ticker, "BREAKING" flash alerts on chaos events
**Layout:** Full-bleed broadcast frame, split-screen agent panels, persistent lower-third chyron

## Page Archetype
**Landing:** The Cinematic — full-viewport immersive broadcast experience, edge-to-edge sections, "tonight on ARENA" energy
**Rationale:** Matches the cable news broadcast metaphor. Every section feels like a different camera angle or segment of a TV show.

## App Shell Archetype
**Shell:** Full Canvas — debate fills the screen, contextual controls, top chyron bar
**Rationale:** Real TV broadcasts fill the frame. No persistent sidebar/nav. The content IS the interface.

## Mobbin Research
- **Riverside:** Multi-participant live video panels on dark background. Clean panel layout with participant names. Closest to our agent grid layout.
- **Twitch:** Live streaming with chat overlay, dark theme, audience engagement controls. Inspiration for the chaos panel / audience interaction sidebar.
- **Discord:** Community platform, dark theme, channel-based organization. Inspiration for viewer community feel.
- **WSJ:** News editorial layout, serif headlines, structured content hierarchy. Inspiration for the "newsroom" editorial authority feel.

## 21st.dev Research
- **Phase 5 (landing):** Dark hero sections with dramatic gradients, cinematic video backgrounds, animated text reveals
- **Phase 7 (shell):** Banner/ticker components for news-style overlays, dark accordion panels for controls
- **Phase 8 (pages):** Card components with animation, news-card layouts

## Landing Page Build Notes
**Archetype used:** The Cinematic
**Patterns used:** Broadcast hero (grid bg + scanline + vignette) + Bento grid with visual specimens + Stats strip + Agent roster cards + News ticker
**Anti-pattern sweep:** Passed — all AP-1 through AP-12 clean
**Mobbin influence:** Riverside panel layout for agent grid structure, WSJ editorial hierarchy for section headers, Twitch engagement controls for chaos specimen
**21st.dev components used:** N/A (built custom broadcast-themed components)

## Anti-Pattern Sweeps
### Phase 5 (Landing Page) — All Passed
- AP-1: Single CTA + broadcast chrome distinguishes from generic hero
- AP-2: Bento grid with varied sizes + visual specimens
- AP-13: No alternating rows
- AP-3: No how-it-works section
- AP-4: Solid dark bg, no gradient
- AP-5: No testimonials
- AP-6: No floating mockups
- AP-9: Red primary (#E63946), not generic blue
- AP-10: Sharp broadcast radii (2-4px), mixed per element
- AP-11: Varied spacing (py-16, py-24, py-32)
- AP-12: Dark bg, Anton font, red accent, broadcast elements = not SaaS
