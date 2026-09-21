# Design System — Editorial Jurisprudence, PWr edition

> **Status:** active · **Adopted:** 2026-05-07 · **PWr identity:** 2026-09-15 (#629) · **Owner:** frontend

The Juddges design system: the editorial framework of a legal periodical
(eyebrows, hairline rules, drop caps, square numerals, sharp paper edges)
carried in the visual identity of Politechnika Wrocławska — PWr red on white
paper, humanist display type, red header bars and square numerals — as
defined in the university's *System Identyfikacji Wizualnej* (SIW, edition
2025-12, <https://pwr.edu.pl/kontakt/logotyp>).

This is the source of truth. Tokens live in
[`frontend/app/globals.css`](../../frontend/app/globals.css) and React
primitives live in [`frontend/components/editorial/`](../../frontend/components/editorial).

---

## 1. Aesthetic principles

| Principle | What it means in practice |
|---|---|
| **Editorial, not SaaS** | Display headlines, drop caps, hairline rules, square numerals. No glassmorphism, no rainbow gradients, no rounded blob cards. |
| **PWr on paper** | White page, black text, Pantone 484 red for authority, sand for tinted accents, `#EFEFEF` panels for asides. The page should feel like a PWr document. |
| **Sharp paper edges** | Cards and buttons use 0–2 px radii. Curvature is reserved for pills and chips. |
| **Confident typography** | Tenor Sans (open substitute for the identity's Zapf Humanist / Optima) at large display sizes does the heavy lifting; emphasis is red, never faux-italic. Geist sans for body, Geist mono for citations and tabular numerals. |
| **Asymmetric layouts** | Break the grid. Lead with the most important card; demote secondary cards. Leave generous negative space. |
| **One memorable signature** | Each surface earns one distinctive moment — a drop cap, an oversized red-square numeral, a case-citation marker. Do not stack them. |

---

## 2. Palette

The PWr layer is the source of truth (`:root` in `globals.css`). Every
editorial name the app already uses is an **alias** of a PWr token, so
`bg-parchment`, `text-ink`, `text-oxblood` … keep working; new code should use
the `pwr-*` names.

| Token | Hex | Source (SIW 2025-12) | Use | Editorial alias |
|---|---|---|---|---|
| `--pwr-red` | `#9A342D` | Pantone 484 · C0 M95 Y100 K29 | Authority — primary action, emphasis, bars, card rule | `--oxblood` |
| `--pwr-red-deep` | `#7E2A25` | derived | Hover for red | `--oxblood-deep` |
| `--pwr-sand` | `#F1D1A2` | Pantone 156 · C0 M22 Y42 K0 | Tinted accents, meta on red | `--gold-soft` |
| `--pwr-gold` | `#B49A5E` | Pantone 873 (metallic), web approximation | Citation markers | `--gold` |
| `--pwr-black` | `#000000` | K100 | Text, strong rules, secondary button outline | `--ink` |
| `--pwr-grey` | `#5A5A5A` | derived | Secondary text | `--ink-soft` |
| `--pwr-paper` | `#FFFFFF` | white document surface | Page, cards | `--parchment` |
| `--pwr-panel` | `#EFEFEF` | SIW info panel | Tonal bands, flat cards, `--muted` | `--parchment-deep` |
| `--pwr-line` | `#D9D9D9` | derived | Hairline rules, card borders | `--rule` |
| `--pwr-line-strong` | `#9A9A9A` | derived | Medium dividers | `--rule-strong` |

### Tailwind class names

Each editorial token is exposed through Tailwind via `@theme inline`:

```html
<div class="bg-pwr-paper text-pwr-black border-pwr-line">…</div>
<span class="text-pwr-red">overruled</span>
<sup class="text-pwr-gold">¹</sup>
```

### Avoid

- ✗ Generic `purple`, `indigo`, `violet`, `blue` from Tailwind defaults.
- ✗ Tailwind `red` and `yellow` for status tints — errors are `--oxblood`, warnings `--gold`.
- ✗ `bg-purple-100`, `bg-indigo-100` icon-pill backgrounds.
- ✗ `bg-gradient-to-br from-primary to-purple-500` style gradients.
- ✗ `backdrop-blur-xl` "glass" effects on plain content cards.

---

## 3. Typography

```
--font-sans     = Geist Sans            (body, UI)
--font-display  = Tenor Sans            (display; --font-serif is an alias)
--font-mono     = Geist Mono            (citations, eyebrows, tabular numerals)
```

### Scale

| Use | Class / utility | Size | Notes |
|---|---|---|---|
| Hero display | `<Headline size="lg">` | 5xl → 7xl | Tenor Sans, red accents (upright — the face has no italic) |
| Section title | `<Headline size="md">` | 4xl → 5xl | Always paired with an eyebrow |
| Card title | `<EditorialCard title=…>` | 2xl display | Auto-applied (`font-serif`, aliasing Tenor Sans) |
| Body | default `<p>` | 16–17 px | `leading-[1.65]`, `text-ink-soft` for prose |
| Eyebrow | `<Eyebrow>` | 11 px mono | Letter-spacing `0.18em`, uppercase |
| Numeral | `editorial-numeral` | inherits | Tabular lining figures |
| Citation | `<Citation marker="¹" />` | 10 px mono | Gold, vertical-align super |

### Drop cap

Use `<DropCap>` (or `.editorial-dropcap`) **at most once per page** as the
opener of long-form copy. Renders the first letter as a 4.5em upright red
floated initial.

```tsx
<DropCap>The JuDDGES project aims to revolutionize…</DropCap>
```

---

## 3a. PWr patterns

| Pattern | Class / component | Rule |
|---|---|---|
| Red bar | `.pwr-bar`, `<Masthead>`, `<SectionHeader variant="bar">` | Full-width `--pwr-red` block, white display text, 0 px radius. One per surface. |
| Nameplate underline | `<Masthead ruled>` | 1 px black line under the bar — the SIW underline beneath the wordmark. |
| Square numeral | `<SectionHeader numeral="03">` | `--pwr-red` square, white Tenor Sans digit — the SIW page-number block. |
| Grey panel | `bg-pwr-panel`, `<PaperBackground deep>` | `#EFEFEF` aside, no border needed. |
| Card rule | `.editorial-card` | 2 px `--pwr-red` top rule, black on hover; 1 px `--pwr-line` elsewhere. |
| Corners / shadows | everywhere | ≤ 2 px (`--radius: 0.125rem`), none. Pills only on `QueryPill` and `Badge`. |
| Shadow tokens | `--shadow-2xs` … `--shadow-lg` | Layered, one light source, tinted with `--ink` via `color-mix`. `--shadow-xl`/`--shadow-2xl` alias `lg` — elevation caps there. |

### Logotype

**The PWr emblem and wordmark are not used in this product.** SIW requires
written permission from logotyp@pwr.edu.pl and forbids using any element of
the mark separately; no permission has been obtained. Express the identity
through palette, type and patterns only. Do not add the eagle, the compass or
the "Politechnika Wrocławska" wordmark to any surface.

---

## 4. Component primitives

All under `frontend/components/editorial/` and re-exported from the barrel
`@/components/editorial`.

| Primitive | Purpose |
|---|---|
| `<ChartFigure>` | Sharp-edged chart card with "FIG. nn" eyebrow, display title, caption + source line |
| `<Citation>` | Gold superscripted footnote marker |
| `<DropCap>` | Editorial drop-cap paragraph |
| `<DualStatCard>` | Bilateral KPI card — two values side-by-side with a hairline divider |
| `<EditorialButton>` | Sharp-edged action; `variant`: `primary` \| `secondary` \| `ghost` |
| `<EditorialCard>` | Sharp-edged card with eyebrow + title header; `flat` for a plain bordered card without the red top rule |
| `<Eyebrow>` | Small-caps section kicker with leading hairline |
| `<Headline>` | Tenor Sans display headline (h1–h4, 5 sizes, upright red accents) |
| `<Masthead>` | Top-of-page nameplate — the SIW red bar, white text, optional `ruled` underline |
| `<PaperBackground>` | White (or `deep` grey-panel) wrapper; `grain` prop is a no-op |
| `<QueryPill>` | Newsprint pill for demo queries |
| `<Rule>` | Hairline / medium / ink horizontal rules |
| `<Section>` | Numbered dashboard section wrapping `SectionHeader` + content |
| `<SectionHeader>` | Eyebrow + Headline + description; red square `numeral`, or full red bar via `variant="bar"` |
| `<Stat>` | Animated tabular numeral + label + optional citation marker |

### Importing

```tsx
import {
  EditorialCard,
  Eyebrow,
  Headline,
  SectionHeader,
  Stat,
  EditorialButton,
} from "@/components/editorial";
```

---

## 5. Patterns

### Hero

```tsx
<PaperBackground className="py-24">
  <Masthead badge="Est. 2024 · Wroclaw" meta="VOL I · NO 1" ruled />
  <Headline as="h1" size="lg">
    An open archive of <em>judicial reasoning</em>,
    read by machines.
  </Headline>
  <DropCap>An open-source research platform for…</DropCap>
  <div className="flex gap-3">
    <EditorialButton href="/search" arrow>Try search</EditorialButton>
    <EditorialButton variant="secondary" href="/auth/sign-up">Sign up</EditorialButton>
  </div>
  <div className="grid grid-cols-3">
    <Stat value={47000} suffix="+" label="Judgments" marker="¹" />
    <Stat value={2} static label="Jurisdictions" />
    <Stat value={0} static label="Free" />
  </div>
</PaperBackground>
```

`<PaperBackground>` no longer takes a `grain` prop effect — the paper is flat
white (or grey-panel with `deep`); the prop is accepted but is a no-op for
backwards compatibility.

### Section with red-square numeral

```tsx
<SectionHeader
  eyebrow="Capabilities"
  numeral="03"
  title={<>Three ways to <em>work</em> with legal data</>}
  description="Search, analyze, and extract structured information."
/>
```

The `numeral` renders as the SIW page-number block: a `--pwr-red` square with
a white Tenor Sans digit, not a marginal (out-of-flow) numeral.

### Card grid (asymmetric)

Use a 12-col grid and let one card take 7 cols (featured), the others 5 → 4 →
4. Reserve `featured` (black top mark) for the most important card on the
surface.

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-pwr-line">
  <div className="lg:col-span-7 bg-pwr-paper">
    <EditorialCard featured eyebrow="Database" title="Coverage" />
  </div>
  <div className="lg:col-span-5 bg-pwr-paper">
    <EditorialCard eyebrow="Recent" title="Conversations" />
  </div>
</div>
```

The `gap-px bg-pwr-line` trick paints hairline rules between cards without
extra borders.

---

## 6. Motion

Subtle, never bouncy. Editorial design moves like turning a page, not like a
juggler.

- **Page-load**: 600 ms fade + 32 px upward, easeOut, viewport-once.
- **Stat counter**: 1800 ms cubic ease-out, in-view trigger.
- **Hover**: 180 ms — translateY(-1px) on cards, translateX(2 px) on arrows.
- **No**: spring physics, scale > 1.02, infinite glow loops, parallax.

Use `framer-motion` (`motion`/`useInView`) for scroll-triggered reveals and
the existing primitives in this library for figure animation.

---

## 7. Accessibility

- Body copy at `--ink-soft` against `--parchment` is **WCAG AA at 17 px** but
  not AAA. Prefer `--ink` for any text < 16 px.
- `--oxblood` against `--parchment` is **WCAG AAA**.
- Focus rings use `--ring` (oxblood) at 2 px with 2 px offset.
- Drop caps are decorative; the first character must remain part of the
  underlying text node so screen readers read it correctly.

---

## 8. Migration

Pages that still use the legacy glassmorphism cards, purple gradients, or
`bg-indigo-100` icon-boxes should be migrated incrementally:

1. Swap `BaseCard` for `<EditorialCard>` (most APIs map directly). Until then,
   `BaseCard` and `LightCard` own their edges and surface: any `rounded-*` or
   `bg-*` class passed in `className` is stripped, so legacy call-site radii
   such as `rounded-[16px]` are inert and can be deleted when the page is
   migrated.
2. Replace `<h2 className="text-base font-semibold">` patterns with
   `<EditorialCard title=…>` or `<Headline as="h3" size="xs">`.
3. Replace icon-in-pastel-box motifs with the eyebrow + title pattern, or a
   small ink-only icon at 16 px.
4. Drop `glass-card`, `neo-chip`, and `glass-button` classes for editorial
   equivalents.
5. Leave Radix-based components (dialogs, popovers, dropdowns) alone — they
   inherit the new tokens through `--background` / `--foreground` and don't
   need refactoring.

---

## 9. References

- Tokens: [`frontend/app/globals.css`](../../frontend/app/globals.css)
- Components: [`frontend/components/editorial/`](../../frontend/components/editorial)
- Landing page implementation: [`frontend/components/landing/LandingPage.tsx`](../../frontend/components/landing/LandingPage.tsx)
- Dashboard implementation: [`frontend/app/page.tsx`](../../frontend/app/page.tsx)
- Politechnika Wrocławska, *System Identyfikacji Wizualnej*, ed. 2025-12 — <https://pwr.edu.pl/kontakt/logotyp>
