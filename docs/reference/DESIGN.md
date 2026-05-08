# Design System — Editorial Jurisprudence

> **Status:** active · **Adopted:** 2026-05-07 · **Owner:** frontend

The Juddges design system. A scholarly, editorial aesthetic inspired by legal
periodicals and case reporters — confident serif typography, ink-and-parchment
palette, rule-driven hierarchy, density that respects the seriousness of the
subject.

This is the source of truth. Tokens live in
[`frontend/app/globals.css`](../../frontend/app/globals.css) and React
primitives live in [`frontend/components/editorial/`](../../frontend/components/editorial).

---

## 1. Aesthetic principles

| Principle | What it means in practice |
|---|---|
| **Editorial, not SaaS** | Serif headlines, drop caps, hairline rules, marginal numerals. No glassmorphism, no rainbow gradients, no rounded blob cards. |
| **Ink on paper** | Parchment background, deep-ink text, oxblood for authority. The page should feel like a printed document. |
| **Sharp paper edges** | Cards and buttons use 0–2 px radii. Curvature is reserved for pills and chips. |
| **Confident typography** | Instrument Serif at large display sizes does the heavy lifting. Geist sans for body, Geist mono for citations and tabular numerals. |
| **Asymmetric layouts** | Break the grid. Lead with the most important card; demote secondary cards. Leave generous negative space. |
| **One memorable signature** | Each surface earns one distinctive moment — a drop cap, an oversized italic numeral, a case-citation marker. Do not stack them. |

---

## 2. Palette

The canonical raw tokens are defined in `:root` in `globals.css` and re-exposed
through `--background`, `--foreground`, `--primary`, etc. Always reference the
**raw editorial token** when you mean an editorial color.

| Token | Hex (approx.) | OKLCH | Use |
|---|---|---|---|
| `--parchment` | `#F5F1E8` | `oklch(0.96 0.012 85)` | Page surface |
| `--parchment-deep` | `#EFE9D8` | `oklch(0.93 0.018 82)` | Tonal section bands |
| `--ink` | `#1A1A2E` | `oklch(0.18 0.020 280)` | Primary text, strong rules |
| `--ink-soft` | `#5A5A75` | `oklch(0.36 0.018 275)` | Secondary text |
| `--rule` | `#C9C2B0` | `oklch(0.82 0.018 80)` | Hairline rules, card borders |
| `--rule-strong` | `#A89F88` | `oklch(0.70 0.020 78)` | Medium dividers, eyebrow rules |
| `--oxblood` | `#8B1E3F` | `oklch(0.42 0.135 12)` | Authority — primary action, italic emphasis, the "judges' robes" colour |
| `--oxblood-deep` | `#6F1230` | `oklch(0.34 0.135 14)` | Hover state for oxblood |
| `--gold` | `#B8954A` | `oklch(0.68 0.105 80)` | Citation gold — markers, highlights |
| `--gold-soft` | `#E8DCB8` | `oklch(0.86 0.055 85)` | Tinted backgrounds, accent fills |

### Tailwind class names

Each editorial token is exposed through Tailwind via `@theme inline`:

```html
<div class="bg-parchment text-ink border-rule">…</div>
<span class="text-oxblood">overruled</span>
<sup class="text-gold">¹</sup>
```

### Avoid

- ✗ Generic `purple`, `indigo`, `violet`, `blue` from Tailwind defaults.
- ✗ `bg-purple-100`, `bg-indigo-100` icon-pill backgrounds.
- ✗ `bg-gradient-to-br from-primary to-purple-500` style gradients.
- ✗ `backdrop-blur-xl` "glass" effects on plain content cards.

---

## 3. Typography

```
--font-sans   = Geist Sans            (body, UI)
--font-serif  = Instrument Serif      (display, italic emphasis)
--font-mono   = Geist Mono            (citations, eyebrows, tabular numerals)
```

### Scale

| Use | Class / utility | Size | Notes |
|---|---|---|---|
| Hero display | `<Headline size="lg">` | 5xl → 7xl | Instrument Serif, italic accents in oxblood |
| Section title | `<Headline size="md">` | 4xl → 5xl | Always paired with an eyebrow |
| Card title | `<EditorialCard title=…>` | 2xl serif | Auto-applied |
| Body | default `<p>` | 16–17 px | `leading-[1.65]`, `text-ink-soft` for prose |
| Eyebrow | `<Eyebrow>` | 11 px mono | Letter-spacing `0.18em`, uppercase |
| Numeral | `editorial-numeral` | inherits | Tabular lining figures |
| Citation | `<Citation marker="¹" />` | 10 px mono | Gold, vertical-align super |

### Drop cap

Use `<DropCap>` (or `.editorial-dropcap`) **at most once per page** as the
opener of long-form copy. Renders the first letter as a 4.5em italic
oxblood floated initial.

```tsx
<DropCap>The JuDDGES project aims to revolutionize…</DropCap>
```

---

## 4. Component primitives

All under `frontend/components/editorial/` and re-exported from the barrel
`@/components/editorial`.

| Primitive | Purpose |
|---|---|
| `<Masthead>` | Top-of-page nameplate strip — small caps + ink rule |
| `<Eyebrow>` | Small-caps section kicker with leading hairline |
| `<Headline>` | Serif display headline (h1–h4, 5 sizes, italic accents) |
| `<SectionHeader>` | Eyebrow + Headline + description, with optional marginal numeral |
| `<DropCap>` | Editorial drop-cap paragraph |
| `<Rule>` | Hairline / medium / ink horizontal rules |
| `<Stat>` | Animated tabular numeral + label + optional citation marker |
| `<Citation>` | Gold superscripted footnote marker |
| `<EditorialCard>` | Sharp-edged card with eyebrow + title header |
| `<QueryPill>` | Newsprint pill for demo queries |
| `<EditorialButton>` | Sharp ink/oxblood primary or outline action |
| `<PaperBackground>` | Parchment wrapper with optional paper-grain noise |

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
<PaperBackground grain className="py-24">
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

### Section with marginal numeral

```tsx
<SectionHeader
  eyebrow="Capabilities"
  numeral="03"
  title={<>Three ways to <em>work</em> with legal data</>}
  description="Search, analyze, and extract structured information."
/>
```

### Card grid (asymmetric)

Use a 12-col grid and let one card take 7 cols (featured), the others 5 → 4 →
4. Reserve `featured` (oxblood top mark) for the most important card on the
surface.

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-rule">
  <div className="lg:col-span-7 bg-parchment">
    <EditorialCard featured eyebrow="Database" title="Coverage" />
  </div>
  <div className="lg:col-span-5 bg-parchment">
    <EditorialCard eyebrow="Recent" title="Conversations" />
  </div>
</div>
```

The `gap-px bg-rule` trick paints hairline rules between cards without extra
borders.

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

1. Swap `BaseCard` for `<EditorialCard>` (most APIs map directly).
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
