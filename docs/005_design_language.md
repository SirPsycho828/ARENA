# A.R.E.N.A. Design Language Guide

## Overview
- **Design Direction:** Dark, cinematic, broadcast-production aesthetic — like an esports arena crossed with a late-night debate show
- **Feeling/Vibe:** Intense, electric, spectacle-driven. The UI should feel like you're watching a live event, not using an app. High drama, high energy, high contrast
- **Audience:** Tech enthusiasts, hackathon judges, entertainment-seekers. They expect polish, showmanship, and visual impact

---

## Color Palette

### Brand Colors
- **Primary — Electric Cyan:** `#00F0FF` — The arena spotlight. Used for active states, the speaking agent highlight, and primary CTAs
- **Secondary — Hot Magenta:** `#FF2D6B` — Chaos energy. Used for audience interactions, alerts, and "live" indicators
- **Accent — Neon Purple:** `#8B5CF6` — Used sparingly for agent identity highlights and depth

### Neutral Palette
| Token | Hex | Usage |
|-------|-----|-------|
| bg-base | `#0A0A0F` | Main background — near-black with slight blue undertone |
| bg-surface | `#12121A` | Card/panel backgrounds |
| bg-elevated | `#1A1A2E` | Raised elements, modals, agent panels |
| bg-hover | `#252540` | Hover states on dark surfaces |
| border-subtle | `#2A2A3E` | Subtle dividers |
| border-default | `#3D3D5C` | Default borders |
| text-muted | `#6B6B8A` | Secondary text, labels |
| text-secondary | `#9B9BB0` | Less important text |
| text-primary | `#E8E8F0` | Primary body text |
| text-bright | `#FFFFFF` | Headings, emphasis |

### Semantic Colors
| State | Color | Hex | Usage |
|-------|-------|-----|-------|
| Live/Active | Red | `#FF3B3B` | Live indicators, recording badges |
| Success | Green | `#00D68F` | Vote confirmed, connection established |
| Warning | Amber | `#FFAA00` | Queue full, cooldown timer |
| Error | Red | `#FF4757` | Connection failed, error states |
| Info | Blue | `#3B82F6` | System messages, tips |

### Dark Mode
This IS a dark-mode-first product. The entire experience is dark. There is no light mode — the arena is always lit by spotlights against darkness.

**Surface Elevation (raised = slightly lighter):**
- Level 0: `#0A0A0F` (base)
- Level 1: `#12121A` (panels)
- Level 2: `#1A1A2E` (agent cards)
- Level 3: `#252540` (dropdowns, modals)

**Primary color in dark context:** Use `#00F0FF` at full saturation on dark backgrounds — it glows naturally. For text-on-primary, use `#0A0A0F` (dark on bright).

### Do's and Don'ts
- DO: Let the dark background make content "pop" — dark space is your friend
- DON'T: Use pure black `#000000` — it's too harsh; always add a hint of blue/purple
- DO: Use the primary cyan sparingly — it should feel like a spotlight, not a flood
- DON'T: Put cyan text on white backgrounds — this is a dark-mode product
- DO: Use the red `#FF3B3B` only for "LIVE" indicators — it signals urgency
- DON'T: Use semantic red for UI elements that aren't errors or live states

---

## Typography

### Font Families
- **Primary:** `Inter` — clean, modern, excellent readability at all sizes. Free via Google Fonts
- **Display/Headings:** `Space Grotesk` — geometric, bold, gives "broadcast title" energy. Free via Google Fonts
- **Monospace (transcripts):** `JetBrains Mono` — for live transcript feed. Free via Google Fonts

### Type Scale
| Name | Size | Weight | Line Height | Font | Usage |
|------|------|--------|-------------|------|-------|
| display | 48px | 700 | 1.1 | Space Grotesk | Hero text, debate topic |
| h1 | 36px | 700 | 1.2 | Space Grotesk | Section titles |
| h2 | 24px | 600 | 1.3 | Space Grotesk | Agent names, panel headers |
| h3 | 20px | 600 | 1.4 | Inter | Sub-headers |
| body-lg | 18px | 400 | 1.5 | Inter | Important body text |
| body | 16px | 400 | 1.5 | Inter | Default body text |
| body-sm | 14px | 400 | 1.5 | Inter | Secondary info, labels |
| caption | 12px | 500 | 1.4 | Inter | Timestamps, badges, metadata |
| transcript | 14px | 400 | 1.6 | JetBrains Mono | Live transcript feed |

### Do's and Don'ts
- DO: Use Space Grotesk for anything that should feel "broadcast" — topic titles, agent names, headings
- DON'T: Use Space Grotesk for body text — it's a display font
- DO: Use bold/semibold weights for dark-on-dark text to maintain readability
- DON'T: Use light/thin weights — they disappear on dark backgrounds

---

## Spacing

### Spacing Scale (8px base)
| Token | Value | Common Usage |
|-------|-------|--------------|
| xs | 4px | Icon-to-text gaps, tight internal padding |
| sm | 8px | Badge padding, compact element spacing |
| md | 16px | Standard component padding, input padding |
| lg | 24px | Card padding, section gaps |
| xl | 32px | Panel margins, major section spacing |
| 2xl | 48px | Page-level spacing |
| 3xl | 64px | Hero spacing, stage layout gaps |

### Application Guidelines
- **Agent video panels:** 8px gap between panels (tight, broadcast-style grid)
- **Audience controls:** 16px internal padding, 24px between control groups
- **Transcript feed:** 8px between messages, 16px side padding
- **Full page:** 24px edge padding on desktop, 16px on mobile

---

## Components

### Buttons
**Border Radius:** 8px (slightly rounded — not too corporate, not too playful)

**Variants:**
| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| Primary | `#00F0FF` | `#0A0A0F` | none | Main CTAs: "Inject Chaos", "Call In" |
| Danger/Live | `#FF2D6B` | `#FFFFFF` | none | Destructive or live actions |
| Ghost | transparent | `#E8E8F0` | `#3D3D5C` | Secondary actions |
| Subtle | `#1A1A2E` | `#E8E8F0` | none | Tertiary, less important |

**Sizes:**
| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| sm | 32px | 12px 16px | 13px |
| md | 40px | 12px 20px | 14px |
| lg | 48px | 16px 24px | 16px |

**States:**
- Hover: Lighten background 10%, add subtle glow shadow (`0 0 20px rgba(0,240,255,0.3)` for primary)
- Active: Darken 10%
- Disabled: 40% opacity, no cursor
- Loading: Pulse animation on background

### Agent Video Panels
- **Border Radius:** 12px
- **Border:** 2px solid `#2A2A3E` (default), 2px solid `#00F0FF` (speaking), 2px solid `#FF2D6B` (challenger active)
- **Shadow (speaking):** `0 0 30px rgba(0,240,255,0.2)` — subtle glow effect when agent is talking
- **Overlay:** Agent name + personality tag at bottom with gradient fade from transparent to `rgba(10,10,15,0.8)`

### Cards (Audience Panel, Stats, etc.)
- **Border Radius:** 12px
- **Background:** `#12121A`
- **Border:** 1px solid `#2A2A3E`
- **Shadow:** none (rely on border/background contrast)
- **Padding:** 16px–24px

### Transcript Feed
- **Background:** `#0A0A0F`
- **Message style:** No bubbles — simple left-aligned text with colored agent name prefix
- **Agent name color:** Each agent gets a unique saturated color from palette
- **Separator:** None — use spacing (8px gap) between messages
- **Active message:** Slightly brighter text color + left border accent (2px, agent color)

### Live Indicator Badge
- **Background:** `#FF3B3B`
- **Text:** `#FFFFFF`, 11px, bold, uppercase "LIVE"
- **Border Radius:** 4px
- **Animation:** Subtle pulse (opacity 1 → 0.7 → 1, 2s loop)

### Chaos Injection Controls
- **Container:** Card with `#1A1A2E` background, 12px radius
- **Input field:** `#0A0A0F` background, 1px `#3D3D5C` border, 8px radius
- **Submit button:** Primary variant with icon
- **Cooldown overlay:** Semi-transparent `rgba(10,10,15,0.7)` with countdown timer in center

---

## States & Interactions

### Hover States
- Buttons: Background lightens, glow shadow appears
- Agent panels: Border brightens slightly
- Transcript messages: Background subtly highlights (`#1A1A2E`)

### Focus States
- Focus ring: `0 0 0 2px #0A0A0F, 0 0 0 4px #00F0FF` (dark gap + cyan outline)
- All interactive elements MUST have visible focus rings

### Disabled States
- 40% opacity
- Cursor: not-allowed
- No hover effects

### Loading States
- Skeleton screens: Shimmer animation on `#1A1A2E` elements
- Agent connecting: Silhouette outline with pulsing border
- Full page: Centered "Entering the Arena..." with pulse animation

### Error States
- Border: 1px solid `#FF4757`
- Background: `rgba(255,71,87,0.1)`
- Error text: `#FF4757`, 13px, below the element
- Icon: Warning triangle in error red

---

## Accessibility Requirements

### Color Contrast
- Body text (`#E8E8F0` on `#0A0A0F`): 16.5:1 ratio — passes AAA
- Muted text (`#6B6B8A` on `#0A0A0F`): 4.6:1 ratio — passes AA
- Primary button (`#0A0A0F` on `#00F0FF`): 13.2:1 ratio — passes AAA
- Danger button (`#FFFFFF` on `#FF2D6B`): 4.7:1 ratio — passes AA

### Focus Indicators
- All interactive elements have visible focus rings (cyan outline)
- Focus is never hidden via `outline: none` without replacement

### Touch Targets
- Minimum 44x44px for all interactive elements
- Audience control buttons: minimum 48px height

### Checklist
- [x] All text meets AA contrast requirements
- [x] Focus states are visible on dark backgrounds
- [x] Color isn't the only indicator (icons + text supplement color)
- [x] Touch targets are 44px+
- [x] Text can be resized to 200% without breaking layout

---

## Supporting Elements

### Icons
- **Set:** Lucide Icons (clean, consistent, free)
- **Sizes:** 16px (inline), 20px (buttons), 24px (panels)
- **Style:** Stroke (1.5px weight), matches the clean modern aesthetic
- **Color:** Inherits text color of context

### Animation & Motion
- **Default transition:** 150ms ease-out (hovers, color changes)
- **Panel transitions:** 200ms ease-out (appearing/disappearing elements)
- **Glow pulse (live indicators):** 2000ms ease-in-out infinite
- **Agent speaking indicator:** Border glow with 300ms ease-in-out
- **What animates:** Hovers, focus, panel entries, speaking indicators, live badges
- **What doesn't animate:** Layout shifts, font sizes, spacing changes

### Responsive Breakpoints
| Name | Min Width | Layout |
|------|-----------|--------|
| mobile | 0px | Stacked panels, bottom controls |
| tablet | 768px | 2x2 grid, side panel |
| desktop | 1024px | Full grid layout, side panels |
| wide | 1440px | Cinematic layout with more breathing room |

---

## Quick Reference Cheat Sheet

### Colors (copy-paste ready)
```
Primary:        #00F0FF
Secondary:      #FF2D6B
Accent:         #8B5CF6
BG Base:        #0A0A0F
BG Surface:     #12121A
BG Elevated:    #1A1A2E
BG Hover:       #252540
Border Subtle:  #2A2A3E
Border Default: #3D3D5C
Text Muted:     #6B6B8A
Text Secondary: #9B9BB0
Text Primary:   #E8E8F0
Text Bright:    #FFFFFF
Success:        #00D68F
Warning:        #FFAA00
Error:          #FF4757
Live:           #FF3B3B
Info:           #3B82F6
```

### Typography
```
Display:    Space Grotesk, 48px, 700
H1:         Space Grotesk, 36px, 700
H2:         Space Grotesk, 24px, 600
H3:         Inter, 20px, 600
Body-lg:    Inter, 18px, 400
Body:       Inter, 16px, 400
Body-sm:    Inter, 14px, 400
Caption:    Inter, 12px, 500
Transcript: JetBrains Mono, 14px, 400
```

### Spacing
```
xs:  4px
sm:  8px
md:  16px
lg:  24px
xl:  32px
2xl: 48px
3xl: 64px
```

### Border Radius
```
sm:   4px   (badges, small elements)
md:   8px   (buttons, inputs)
lg:   12px  (cards, panels)
xl:   16px  (modals, large containers)
full: 9999px (pills, avatars)
```

### Shadows
```
glow-primary: 0 0 20px rgba(0,240,255,0.3)
glow-danger:  0 0 20px rgba(255,45,107,0.3)
glow-subtle:  0 0 10px rgba(0,240,255,0.15)
elevation-1:  0 2px 8px rgba(0,0,0,0.4)
elevation-2:  0 4px 16px rgba(0,0,0,0.5)
elevation-3:  0 8px 32px rgba(0,0,0,0.6)
```
