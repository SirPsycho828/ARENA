# Design System — A.R.E.N.A.

> The Newsroom: Cable news war room meets late-night panel comedy

## Design Direction

**Direction:** The Newsroom — Anderson Cooper's set redesigned by the SNL graphics team
**Signature Element:** Animated lower-third name plates, scrolling news ticker, "BREAKING" flash alerts on chaos events

---

## Typography

### Fonts
- **Heading:** Anton (400 — inherently ultra-bold condensed, ALL CAPS)
- **Body:** Rubik (300–700, slightly rounded, friendly)
- **Mono:** JetBrains Mono (400–700, data displays, ticker)

### Import
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Rubik:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
```

### Scale
| Level | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|-------|------|------|--------|-------------|----------------|-------|
| h1 | Anton | 3.5rem (56px) | 400 | 1.05 | 0.04em | ALL CAPS — breaking news headline |
| h2 | Anton | 2.5rem (40px) | 400 | 1.1 | 0.03em | ALL CAPS — section headers |
| h3 | Anton | 1.75rem (28px) | 400 | 1.2 | 0.02em | ALL CAPS — card titles |
| h4 | Rubik | 1.25rem (20px) | 600 | 1.4 | 0 | Mixed case — subsections |
| body | Rubik | 1rem (16px) | 400 | 1.6 | 0 | Standard paragraph |
| body-sm | Rubik | 0.875rem (14px) | 400 | 1.5 | 0 | Secondary text, chyrons |
| caption | Rubik | 0.75rem (12px) | 500 | 1.4 | 0.03em | Labels, metadata, ticker |
| button | Rubik | 0.875rem (14px) | 600 | 1 | 0.05em | UPPERCASE buttons |

---

## Color Palette

### Core
| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| --primary | 355 78% 56% | #E63946 | News-alert red, BREAKING badges, primary CTAs |
| --primary-foreground | 0 0% 100% | #FFFFFF | Text on primary |
| --secondary | 215 30% 15% | #1A2332 | Secondary buttons, subtle backgrounds |
| --secondary-foreground | 210 18% 82% | #C8D1DB | Text on secondary |
| --accent | 209 73% 55% | #3B9AE1 | Broadcast blue — links, info highlights, focus |
| --accent-foreground | 0 0% 100% | #FFFFFF | Text on accent |

### Surfaces
| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| --background | 215 28% 7% | #0D1117 | Deep broadcast navy (the studio) |
| --foreground | 210 33% 96% | #F0F4F8 | Primary text |
| --card | 215 25% 12% | #161D27 | Card/panel backgrounds |
| --card-foreground | 213 18% 93% | #E8ECF1 | Text on cards |
| --muted | 215 28% 16% | #1E2736 | Disabled, secondary elements |
| --muted-foreground | 215 14% 55% | #7B8A9E | Secondary text, timestamps |

### Borders & Input
| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| --border | 215 25% 22% | #2A3545 | Dividers, card borders |
| --input | 215 25% 22% | #2A3545 | Form input borders |
| --ring | 209 73% 55% | #3B9AE1 | Focus ring color (broadcast blue) |

### Semantic
| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| --destructive | 0 72% 51% | #DC2626 | Error, delete, danger |
| --destructive-foreground | 0 0% 100% | #FFFFFF | Text on destructive |
| --success | 142 72% 37% | #16A34A | Success, complete, active |
| --warning | 38 92% 50% | #F59E0B | Caution, pending, attention |

### Newsroom-Specific
| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| --live | 0 100% 62% | #FF3B3B | LIVE badge, on-air indicator |
| --ticker-bg | 215 30% 10% | #131A24 | Ticker bar background |
| --chyron-bg | 355 78% 56% | #E63946 | Lower-third accent bar |
| --breaking-flash | 45 100% 50% | #FFC800 | Breaking news flash overlay |

---

## Spacing

Base unit: 4px. Standard density — broadcast UI is information-dense but hierarchically clear.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 0.25rem (4px) | Tight gaps, badge padding |
| --space-2 | 0.5rem (8px) | Component internal padding |
| --space-3 | 0.75rem (12px) | Between related elements |
| --space-4 | 1rem (16px) | Standard gap |
| --space-6 | 1.5rem (24px) | Section padding |
| --space-8 | 2rem (32px) | Section margins |
| --space-12 | 3rem (48px) | Large section gaps |
| --space-16 | 4rem (64px) | Page section separation |
| --space-24 | 6rem (96px) | Hero/major section gaps |

---

## Border Radius

Sharp broadcast graphics. News chyrons have crisp edges.

| Token | Value | Usage |
|-------|-------|-------|
| --radius-sm | 2px | Small elements (badges, chips) |
| --radius-md | 4px | Buttons, inputs |
| --radius-lg | 6px | Cards, panels |
| --radius-xl | 8px | Modals, large containers |
| --radius-full | 9999px | Pills, live badges, avatars |

---

## Shadows

Blue-tinted depth for general UI. Red/colored glow for live/breaking elements.

| Token | Value | Usage |
|-------|-------|-------|
| --shadow-sm | 0 1px 3px rgba(13, 17, 23, 0.5) | Subtle depth (cards at rest) |
| --shadow-md | 0 4px 12px rgba(13, 17, 23, 0.6) | Interactive hover states |
| --shadow-lg | 0 8px 24px rgba(13, 17, 23, 0.7) | Elevated (dropdowns, modals) |
| --shadow-xl | 0 12px 40px rgba(13, 17, 23, 0.8) | Prominent (floating elements) |
| --shadow-live | 0 0 20px rgba(255, 59, 59, 0.4) | Live/on-air glow |
| --shadow-accent | 0 0 16px rgba(59, 154, 225, 0.3) | Accent/focus glow |

---

## Animation

| Token | Value | Usage |
|-------|-------|-------|
| --duration-fast | 150ms | Micro-interactions (hover, focus) |
| --duration-normal | 250ms | State transitions |
| --duration-slow | 400ms | Page transitions, reveals |
| --easing-default | cubic-bezier(0.4, 0, 0.2, 1) | General motion |
| --easing-spring | cubic-bezier(0.34, 1.56, 0.64, 1) | Bouncy entrances |
| --easing-out | cubic-bezier(0, 0, 0.2, 1) | Exit animations |
| --easing-broadcast | cubic-bezier(0.22, 0.61, 0.36, 1) | Lower-third slide-in (ease-out-cubic) |

**Signature Animation:** Lower-third slide-in — a red accent bar (4px wide) slides in from the left edge over 300ms, immediately followed by the text content sliding in from the left over 250ms with a slight delay. Mimics CNN/MSNBC name plates. Speaker transitions use camera-cut style (quick 100ms opacity swap, no crossfade). The ticker scrolls continuously at 60px/s. "BREAKING" alerts flash with a red-to-yellow pulse at 1.5s interval.

---

## CSS Custom Properties

```css
@theme {
  /* Typography */
  --font-display: 'Anton', sans-serif;
  --font-body: 'Rubik', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Colors — Core */
  --color-primary: #E63946;
  --color-primary-foreground: #FFFFFF;
  --color-secondary: #1A2332;
  --color-secondary-foreground: #C8D1DB;
  --color-accent: #3B9AE1;
  --color-accent-foreground: #FFFFFF;

  /* Colors — Surfaces */
  --color-background: #0D1117;
  --color-foreground: #F0F4F8;
  --color-card: #161D27;
  --color-card-foreground: #E8ECF1;
  --color-muted: #1E2736;
  --color-muted-foreground: #7B8A9E;

  /* Colors — Borders */
  --color-border: #2A3545;
  --color-input: #2A3545;
  --color-ring: #3B9AE1;

  /* Colors — Semantic */
  --color-destructive: #DC2626;
  --color-success: #16A34A;
  --color-warning: #F59E0B;

  /* Colors — Newsroom-Specific */
  --color-live: #FF3B3B;
  --color-ticker-bg: #131A24;
  --color-chyron: #E63946;
  --color-breaking: #FFC800;

  /* Radius */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-xl: 8px;
}
```
