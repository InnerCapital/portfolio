---
name: acme-hire-design-system
description: Acme Hire design system. Logo, colour, typography, voice and layout rules for every branded output (documents, decks, web pages, social). Load before producing anything branded.
---

# Acme Hire Design System

> White-labelled for this portfolio. Brand name, taglines and contact details are placeholders; the rules are the ones the real skill enforces.

The brand is industrial, confident and operator-first. It does not use decorative colour or lifestyle aesthetics. Read this fully before producing any branded output. Every decision about colour, type, tone and layout must follow these rules.

---

## 1. Logo

The mark uses a **clipped container shape**: a rectangle with the top-left and bottom-right corners cut at 45°, referencing a shipping container.

- `ah-monogram.png`: icon mark for small spaces, app icons and social avatars.
- `ah-wordmark.png`: full wordmark for documents, headers and primary uses.

**Rules**

- Always keep the clipped corners. Never round them.
- Logo sits on pure black (`#0D0D0D`) or pure white only. Never on colour, photography or busy backgrounds.
- Clear space on all sides equal to the height of one letter. Minimum widths: wordmark 80px, monogram 40px.
- Never rotate, skew, recolour, add effects or redraw the logo in code. Use the asset files.

---

## 2. Colour

A **black and white brand**. Colour is never decorative; the only exception is functional UI states (success, warning, error).

| Name | Hex | Use |
|---|---|---|
| Pitch Black | `#0D0D0D` | Logo background, primary text, hero sections |
| Pure White | `#FFFFFF` | Logo fill, primary backgrounds, text on dark |
| Off White | `#F4F4F0` | Warm background alternative, document surfaces |
| Deep Charcoal | `#1A1A1A` | Secondary dark backgrounds, cards on dark |
| Steel | `#5A5A5A` | Secondary body text, captions |
| Light Rule | `#E5E5E0` | Borders, dividers |

No colour backgrounds, no gradients, no lifestyle palettes. Photography provides the warmth.

---

## 3. Typography

**Headings:** a heavy geometric sans (700 display, 600 subheads, 500 labels). Tracking -0.5px on large display text, 0.12em on all-caps labels.

**Body:** system sans, 400/500 only, line height 1.7 (1.3 for headings).

```
Display:   700, 36–48px, tracking -0.5px
H1:        700, 28–32px
H2:        600, 20–24px
Label:     600, 14–16px, sometimes ALL CAPS + 0.12em
Body:      system sans 400, 14–16px, line height 1.7
Caption:   system sans 400, 11–12px, Steel
```

---

## 4. Voice

Acme Hire speaks like an experienced operator, not a marketer.

- **Direct:** short sentences, active voice, no hedging.
- **Confident:** state facts, not aspirations. No "we aim to".
- **Operator-first:** talk to people who run commercial operations, in trade language.
- **No fluff:** cut any word that adds no meaning.

| Do | Don't |
|---|---|
| "Operators" | "Customers" in external copy |
| Specific claims (power supply, dimensions) | Vague superlatives ("world-class") |
| "Ready to trade" | "Ready to start your journey" |
| Lead with value | Lead with features |

Tone shifts by context: sales material bold, operational documents precise and instructional, social punchy and visual-first.

---

## 5. Layout by output

**Documents and PDFs:** black cover with white text and the wordmark; white or off-white body pages; a single 2px black rule between sections; tables with a black header row and alternating off-white rows; footer with brand and year left, website right, in Steel at 10pt.

**Web pages and widgets:** black and white only through CSS variables; dark hero sections; no rounded corners on container shapes (use `clip-path` or a polygon SVG).

**Presentations:** black title slide, white content slides with a black top rule, black section dividers in all caps. No decorative shapes or gradients.

**Social:** 1:1 or 4:5, black or white grounds only, monogram watermark bottom right, short copy with all caps for key callouts.

---

## 6. What not to do

- Use colour as decoration, or add brand colours without sign-off.
- Round the logo's container corners or redraw the logo freehand.
- Use lifestyle photography (styled food, aspirational interiors).
- Use buzzwords (innovative, game-changing, world-class, synergy).
- Make the brand feel warm or artisan. It is industrial and precise.

---

## Quick reference

```
Shape:    Clipped rectangle, top-left and bottom-right corners cut
Colours:  #0D0D0D · #FFFFFF · #F4F4F0 · #5A5A5A
Type:     Heavy geometric sans (headings) / system sans (body)
Voice:    Direct · Confident · Operator-first · No fluff
Web:      acmehire.example
```
