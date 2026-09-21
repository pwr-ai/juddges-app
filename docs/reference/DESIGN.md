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

## 2a. Semantic status

Status is carried by **one of three inks plus a rule**, never by a tinted
background. There is no success-green, no warning-amber and no error-red: the
Tailwind `red`, `yellow`, `green` and `amber` families are gate failures.

| Meaning | Token | Use |
|---|---|---|
| Error, destructive, overruled | `--oxblood` | Error panels, delete confirmations, failed jobs |
| Advisory, AI-generated, caution, matched text | `--gold` / `--gold-soft` | AI provenance, warnings, search-hit highlight |
| Neutral, informational | `--ink` / `--ink-soft` on `--parchment-deep` | Empty states, counts, secondary notices |

The canonical notice is a **left rule on a grey panel** — no fill tint, no
rounded corners, no icon pill:

```html
<div class="border-l-2 border-l-oxblood bg-parchment-deep px-4 py-3 text-sm text-ink">
  Extraction failed. The document was not modified.
</div>
```

Swap `border-l-oxblood` for `border-l-gold` to downgrade an error to an
advisory. A status **pill** is text plus `border-rule`, never a filled chip:
`border border-rule px-2 py-0.5 font-mono text-xs uppercase tracking-wider`.

Reference: `components/error-boundary.tsx`, `lib/styles/components/ai-disclaimer-badge.tsx`.

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

## 3b. Un-classed headings

`h1`–`h4` carry editorial defaults in the base layer, so Markdown, MDX, blog
prose and any heading that ships without a `className` are already correct.
Do not re-specify these values at call sites.

| Element | Size | Letter-spacing | Line-height |
|---|---|---|---|
| `h1` | `text-4xl` bold | `-0.02em` | `0.95` |
| `h2` | `text-3xl` semibold | `-0.02em` | `1.1` |
| `h3` | `text-2xl` semibold | `-0.015em` | `1.15` |
| `h4` | `text-xl` semibold | `-0.01em` | `1.2` |

`p` gets `leading-7` and `letter-spacing: 0`. Negative tracking is a display
treatment: it tightens as the type grows and reaches zero for body copy.

Use `<Headline>` when you want the Tenor Sans display face and its red upright
accents; use a bare `h2`/`h3` when you want the default and nothing else.
Reaching for `<h2 className="text-base font-semibold">` is the pattern §8 asks
you to replace.

Source: `frontend/app/globals.css` `@layer base`.

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

## 4a. Skeletons and loading

One skeleton primitive: `<Skeleton>` in `components/ui/skeleton.tsx`, which is
`animate-pulse rounded-md bg-muted`. It is the **only** allowlisted exception
in the banned-class gate, so a bespoke shimmer bar is both off-spec and a build
failure.

- **Pulse, never shimmer.** `animate-shimmer`, `animate-ping` and
  `animate-bounce` are gate failures. A sweeping highlight is decoration that
  implies progress it does not have; the removed `shimmer` keyframes also ran
  `infinite`, which §6 forbids.
- **Mirror the real layout.** A skeleton exists to prevent layout shift, so its
  bars must match the shape and count of the content replacing them.
  `<EditorialCardSkeleton>` is the worked example: eyebrow bar, title bar,
  `lines` body bars with the last at `w-2/3`, and a footer above a
  `border-rule` divider.
- **Delay ~200 ms.** A skeleton that flashes on a fast response reads as a
  glitch. Render the loading state only once the wait is perceptible.
- **Sharp edges.** Skeletons inherit the radius ladder in §6b like everything
  else.

```tsx
import { EditorialCardSkeleton } from "@/components/editorial";

{isLoading
  ? <EditorialCardSkeleton lines={4} hasAction={false} />
  : <EditorialCard title={doc.title}>…</EditorialCard>}
```

---

## 4b. AI-provenance marker

`<AIBadge>` is the single home for "a machine wrote this": a gold ✦ followed by
a mono uppercase `AI` eyebrow. It is not decoration and it is not a brand mark —
it is a provenance claim, so it appears exactly where generated content starts
and nowhere else.

- **Never use an icon to mean "AI".** `Sparkles` and `Wand2` are gate failures
  (`ai-glyph`). `Zap` is not currently in the pattern but is equally forbidden
  as an AI glyph; it happens to be unused today.
- **One marker per generated region**, not per paragraph.
- For a longer notice with a link to the disclaimer, use
  `<AIDisclaimerBadge>`: gold left rule on `--parchment-deep`, `AlertTriangle`
  in `--gold`, oxblood link. Gold rather than oxblood is deliberate — generated
  content is *advisory*, not an error (§2a).

Sources: `lib/styles/components/ai-badge.tsx`,
`lib/styles/components/ai-disclaimer-badge.tsx`.

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

## 5a. Controls

Every control is **sharp-edged, hairline-bordered, mono-labelled**. The shared
shape is `border border-rule bg-parchment font-mono text-xs uppercase
tracking-wider rounded-none`, with `hover:bg-parchment-deep` and
`focus-visible:ring-1 focus-visible:ring-ink`. Selected state inverts to
`bg-parchment-deep text-ink border-ink`.

| Control | Treatment |
|---|---|
| Buttons | `<EditorialButton>` — `primary` \| `secondary` \| `ghost`. Helpers: `getActiveButtonStyle` / `getInactiveButtonStyle` |
| Segmented tabs | `<EditorialTabs>` — ruled container, parchment active indicator behind ink type. (Renamed from `GlassTabs` in #676.) |
| Pagination | Parchment bar on a hairline rule, full width; page input is a bordered sharp field, not a pill |
| Table | Ruled `thead` on `--parchment-deep`, `divide-rule` row hairlines, `hover:bg-parchment-deep`, ink cell text. No zebra striping |
| Progress / step indicator | Ink fill on a `--rule` track, square ends |
| Drag state | `border-ink` and `bg-parchment-deep`; never a coloured glow or scale |
| Alert / error panel | The §2a left-rule notice |
| Checkbox / switch / accordion | Borders on `--rule` / `--rule-strong`; `transition-colors`, never `transition-all` |

Focus is always a **1 px ink ring**, not a coloured halo, and never removed
without a replacement.

---

## 5b. Chat message anatomy

A chat transcript is a document, not a messaging app: no speech bubbles, no
avatars-with-gradients, no alternating pastel fills.

- **User message** — boxed and right-aligned: `ml-auto max-w-[70%]`,
  `bg-parchment-deep border border-rule`. Editable in place.
- **Assistant message** — unboxed: `max-w-4xl`, `bg-transparent`, no border.
  The answer is the page, not a card on it. This asymmetry is the point — the
  reader's own words are quoted back in a box; the system's reply is the
  document.
- **Error message** — boxed on `--parchment-deep` with `border-oxblood/40`,
  per §2a.
- **Provenance** — `<AIDisclaimerBadge>` sits beneath an assistant body, but
  only on a *finished*, non-error turn: while `isStreaming` is true, or when
  the turn errored, it is suppressed. Provenance is claimed only for content
  that actually landed.

The above is implemented in `lib/styles/components/chat/chat-message.tsx`.

**Not yet built — specified here so the first implementation is consistent:**

- **Streaming** — a caret at the insertion point. No pulsing dots, no
  "thinking" spinner, no skeleton.
- **Retrieval state** — a mono eyebrow reading `READING N JUDGMENTS…`, replaced
  by the answer. It states what is happening rather than animating, which is
  what §6 asks for in place of an indefinite loop.
- **Sources** — a numbered list under the message, each entry an inline
  `<Citation>` gold marker plus the case reference. Sources belong to the
  message that used them, not to the conversation.

---

## 5c. App chrome

- **Header** — `bg-parchment border-b border-rule sticky top-0 z-30`, height
  `h-16`. **Opaque, never blurred**: `backdrop-blur` is a gate failure, and a
  translucent bar over scrolling text is exactly the glassmorphism this system
  replaced. A sticky `thead` follows the same rule with `bg-parchment-deep`.
- **Sidebar** — ink-on-parchment, hairline right rule, mono uppercase section
  labels. Icons are stroke-based at 20 px, `fill="none"`,
  `stroke="currentColor"`, stroke width 1.5 idle.
- **Footer** — `--ink-soft` on `--parchment`, hairline top rule, mono legal
  line.
- **Command palette hint** — a real `<kbd>`: `border border-rule
  bg-parchment-deep px-1.5 font-mono text-[10px] text-ink-soft`. Not an image,
  not a styled `span`.

Source: `components/navbar.tsx`, `components/layouts/AppLayoutWrapper.tsx`.

### Print

A judgment is something lawyers print. The rules in `globals.css`
`@media print` currently cover extraction panels and tables — they repeat
`thead` across pages (`display: table-header-group`), avoid breaking rows, and
hide interactive controls. Extend that block rather than adding `print:` classes
at call sites, and keep the same instincts: chrome and controls disappear,
content keeps its rules and type, nothing relies on a background colour
surviving.

---

## 5d. Data visualisation

Charts use **literal hex from `editorialPalette`**, not CSS custom properties:
Recharts and canvas write colours into SVG attributes and `ctx.fillStyle`,
where `var(--ink)` does not resolve. Import from
`lib/charts/editorial-plot.ts`; never hand-write a hex at a call site.

- **Two series** — `editorialSeries`: ink and oxblood.
- **Up to 6–8 series** — `editorialCategorical`, a monochromatic ramp
  (ink, oxblood, gold, ink-soft, oxblood-deep, rule-strong, gold-soft,
  parchment-deep). It replaces the Tailwind rainbow.
- **Beyond the ramp, add channels rather than hues.** Six colours × solid /
  dashed / hollow gives eighteen distinguishable series without inventing a
  colour. `DAG_EDGE_STYLE` is the worked example: dash patterns carry the event
  type so four types survive a three-colour palette. `DAG_NODE_STYLE` uses a
  hollow fill (`parchment` on `ruleStrong`) for superseded nodes.
- **Axis text is `--ink`, not `--ink-soft`.** Tick labels render at 12 px or
  smaller, where ink-soft drops below WCAG AA on parchment (§7). Axis lines and
  grid rules stay on the rule tokens — they are decorative.
- If a chart needs more than eight series, the chart is wrong: aggregate, facet
  or let the reader filter.

Sources: `lib/charts/editorial-plot.ts`, `lib/charts/reasoning-palette.ts`.

---

## 6. Motion

Subtle, never bouncy. Editorial design moves like turning a page, not like a
juggler.

- **Page-load**: 600 ms fade + 32 px upward, easeOut, viewport-once.
- **Stat counter**: 1800 ms cubic ease-out, in-view trigger.
- **Hover**: 180 ms — translateY(-1px) on cards, translateX(2 px) on arrows.
- **Colour change**: 150 ms — `transition-colors`, never `transition-all`.
- **No**: spring physics, scale > 1.02, infinite loops, parallax.

Use `framer-motion` (`motion`/`useInView`) for scroll-triggered reveals and
the existing primitives in this library for figure animation.

### Forbidden animations

These are gate failures, not preferences:

| Name | Why |
|---|---|
| `animate-shimmer`, `shimmer-slide`, `text-shimmer` | A sweeping highlight implies progress it does not have. Removed from `globals.css` in #642 |
| `animate-ping` | A radar pulse on a static element is noise |
| `animate-bounce` | The juggler |
| `repeat: Infinity` (framer-motion) | Nothing in a document should move forever |
| `transition-all` | Animates properties you did not choose, including layout ones. Name the property |

`animate-pulse` is permitted, and only for skeletons (§4a).

**Anything that loops forever is forbidden.** A reader's eye is drawn to
movement; perpetual movement means perpetual distraction on a page meant for
close reading. If motion is needed to show that work is happening, state it in
words instead — see the `READING N JUDGMENTS…` eyebrow in §5b.

Respect `prefers-reduced-motion: reduce` for every reveal: replace movement
with a cross-fade, never with nothing.

---

## 6a. Shadow scale

Shadows are **ink-tinted, layered, and lit from directly above**. Every step is
`color-mix(in oklab, var(--ink) N%, transparent)` — never pure black, never a
hue — and every horizontal offset is `0`, so the whole app shares one light
source.

| Token | Composition | Use |
|---|---|---|
| `--shadow-2xs` / `--shadow-xs` | single 1 px layer, 5–6 % ink | Inputs, resting controls |
| `--shadow-sm` (= `--shadow`) | 2 layers, 6 % | Buttons, small surfaces |
| `--shadow-md` | 2 layers, 7 % + 10 % | Dropdowns, popovers |
| `--shadow-lg` | 2 layers, 8 % + 14 % | Dialogs, modals — **the ceiling** |
| `--shadow-xl`, `--shadow-2xl` | aliased to `--shadow-lg` | Do not use |

`shadow-xl` and `shadow-2xl` are gate failures as **utility classes**. The
`--shadow-xl` / `--shadow-2xl` *token definitions* in `globals.css` are the cap
that makes any stray usage render at `lg`, so the gate's `hover-fx` pattern
carries a `(?<!-)` lookbehind to tell the two apart — the cap is the fix, not a
violation.

Elevation is meaning, not decoration: a shadow says "this floats above the
page". Prefer a hairline rule to a shadow whenever the element does not float.

---

## 6b. Radius ladder

`--radius` is **`0.125rem` (2 px)** — effectively a sharpened corner, not a
rounded one. The ladder deliberately refuses to grow:

| Class | Resolves to |
|---|---|
| `rounded-sm` / `rounded-md` | `calc(--radius - 4px)` / `- 2px` → square |
| `rounded-lg` | `--radius` (2 px) |
| `rounded-xl` | `--radius` (2 px) — aliased, not banned |
| `rounded-2xl`, `rounded-3xl` | **forbidden** — undefined, so they fall back to Tailwind's 16 px / 24 px |
| `rounded-[Npx]`, `rounded-[Nrem]` | **forbidden** — an arbitrary radius is a call site opting out of the system |

`rounded-2xl`, `rounded-3xl` and arbitrary radii are gate failures. `rounded-xl`
is permitted only because `--radius-xl` is aliased down; prefer `rounded-none`
where you mean square, so the intent survives a future token change.

Pills (`rounded-full`) are reserved for avatars and the switch thumb — anything
genuinely circular. A pill-shaped *button* is off-system.

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
   equivalents. `GlassTabs` became `<EditorialTabs>` in #676 — a module and
   symbol rename, since its styling had already been migrated and only the
   name still carried the old motif.
5. Replace Tailwind status tints (`bg-red-50`, `text-yellow-700`) with the
   §2a left-rule notice. Errors are `--oxblood`; advisories are `--gold`.
6. Leave Radix-based components (dialogs, popovers, dropdowns) alone — they
   inherit the new tokens through `--background` / `--foreground` and don't
   need refactoring.

As of #642 the banned-class count is zero across `app/`, `components/`,
`lib/` and `hooks/`, and the gate is a hard failure rather than a ratchet.
The list above now applies to *new* code and to anything reintroduced, not to
a remaining backlog.

### Delete, don't neutralise

While the migration ran, `globals.css` carried a kill-switch: a
`:where([class*="bg-gradient"]) { background-image: none !important }` block and
five siblings that flattened every decorative gradient in the app. It bought
time, and it was removed in #642 once the last gradient class was gone.

**Do not add another one.** A blanket `!important` override is not a fix:

- it hides the violation instead of removing it, so the count never falls;
- it costs every page a selector that matches nothing once the work is done;
- it makes the offending class *look* harmless at the call site, so it spreads;
- it cannot be reasoned about locally — a component's styles now depend on a
  rule 700 lines away in a global stylesheet.

The gate in `frontend/scripts/assert-no-banned-classes.js` is a **hard
failure** with no baseline to raise (#642). When it fires, change the call
site. If a pattern is genuinely wrong — as `hover-fx` was, matching the
`--shadow-xl` token definitions that *cap* the shadow — fix the pattern and pin
the distinction with a test in
`frontend/__tests__/scripts/assert-no-banned-classes.test.ts`. Do not add an
allowlist entry to make a red build green.

---

---

## 9. References

- Tokens: [`frontend/app/globals.css`](../../frontend/app/globals.css)
- Components: [`frontend/components/editorial/`](../../frontend/components/editorial)
- Landing page implementation: [`frontend/components/landing/LandingPage.tsx`](../../frontend/components/landing/LandingPage.tsx)
- Dashboard implementation: [`frontend/app/page.tsx`](../../frontend/app/page.tsx)
- Politechnika Wrocławska, *System Identyfikacji Wizualnej*, ed. 2025-12 — <https://pwr.edu.pl/kontakt/logotyp>
