# Editorial Jurisprudence, PWr edition — how to build with this library

JuDDGES is a legal case-law research product (Polish + England & Wales judgments) from Politechnika Wrocławska. Its look is **PWr red on white paper**: humanist display type (Tenor Sans), hairline rules, 0 px corners, red header bars and square numerals, grey `#EFEFEF` panels. No glassmorphism, no gradients, no rounded pastel pills, no shadows. **Never draw the PWr emblem, eagle, compass or the "Politechnika Wrocławska" wordmark** — the identity is expressed only through palette, type and patterns.

## Setup — nothing to wrap

No provider is required. `styles.css` (imports `_ds_bundle.css` + `fonts/fonts.css`) already sets `body { background: var(--background); color: var(--foreground) }` — white page, black text — and ships the brand fonts as `@font-face`: **Tenor Sans** (display, `font-display` / `font-serif`), **Geist** (body, `font-sans`), **Geist Mono** (eyebrows, citations, tabular numerals, `font-mono`). Radix-based components (`Dialog`, `DropdownMenu`, `Select`, `Tooltip`, `Popover`, `Sheet`) need no theme provider; `Tooltip` needs a `TooltipProvider` ancestor, `Sidebar*` needs `SidebarProvider`.

## Styling idiom — Tailwind 4 utilities + PWr tokens

Style layout glue with Tailwind utility classes. Colour ONLY through these tokens — never Tailwind's default palette (`bg-blue-500`, `text-gray-600`…):

| Family | Utilities | Meaning |
|---|---|---|
| Surface | `bg-pwr-paper` `bg-pwr-panel` | white page / grey info panel |
| Text | `text-pwr-black` `text-pwr-grey` | primary / secondary copy |
| Rules | `border-pwr-line` `border-pwr-line-strong` `divide-pwr-line` | hairline / medium dividers |
| Authority | `bg-pwr-red` `text-pwr-red` `bg-pwr-red-deep` `border-pwr-red` | bars, primary action, emphasis, hover |
| Accent | `bg-pwr-sand` `text-pwr-sand` `text-pwr-gold` `border-pwr-gold` | tinted accents, meta on red, citation markers |
| Editorial aliases | `bg-parchment` `text-ink` `text-ink-soft` `border-rule` `text-oxblood` `text-gold` `bg-gold-soft` | the older names — same colours, still valid |
| Semantic aliases | `bg-background` `text-foreground` `bg-card` `bg-muted` `text-muted-foreground` `bg-primary` `text-primary-foreground` `border-border` `ring-ring` | the shadcn-style names, mapped onto the same tokens |

Every family also exists as `hover:`/`focus:` variants and as `var(--pwr-red)`, `var(--pwr-sand)`, `var(--pwr-black)`, `var(--pwr-grey)`, `var(--pwr-paper)`, `var(--pwr-panel)`, `var(--pwr-line)` for arbitrary values.

Editorial CSS classes (in `_ds_bundle.css`, use directly when no component fits): `pwr-bar` (red block, white display text), `editorial-display` (Tenor Sans headline, `<em>` = red upright), `editorial-eyebrow` (mono small caps with red leading hairline), `editorial-dropcap` (4.5em red initial), `editorial-numeral` (tabular figures), `editorial-card` (white card, 2 px red rule on top), `editorial-button-primary` (red) / `editorial-button-secondary` (black outline), `editorial-rule` / `editorial-rule-strong`.

Conventions that make it read as *this* brand: **one** red bar per surface (`Masthead` at the top, or a `SectionHeader variant="bar"`); headlines in `Headline` (Tenor Sans) with one `<em>` for red emphasis; a mono `Eyebrow` above section titles; section numbers as red squares (`SectionHeader numeral`); hairline `Rule`s instead of box shadows; `gap-px bg-pwr-line` grids to paint rules between cards; `rounded-none` on cards and buttons, pills only for `QueryPill`/`Badge`; one signature moment per surface (a `DropCap`, an oversized numeral, a `Citation` marker) — never stacked.

## Which component

- Page furniture: `Masthead` (red nameplate bar with underline), `PaperBackground` (white / `deep` grey panel wrapper), `Section` / `SectionHeader` (eyebrow + red square numeral + title + description; `variant="bar"` for the red header bar), `Rule`.
- Type: `Headline` (`as`, `size` xs–xl, `tone`), `Eyebrow`, `DropCap`, `Citation` (`marker="¹"`).
- Cards & data: `EditorialCard` (`eyebrow`, `title`, `action`, `featured`, `flat`, `bare`), `Stat` (`value` number or verbatim string, `label`, `suffix`, `marker`, `static`), `DualStatCard` (UK vs PL values), `ChartFigure` (FIG. nn frame around any chart), `EditorialPagination` (`currentPage`, `totalPages`, `onPageChange`, optional `totalItems`/`itemsPerPage` summary).
- Status & type markers: `StatusBadge` (`status` → ink/gold/oxblood tone, `size`, `showDot`, `label`), `FieldTypeBadge` (`type`, `isAiCreated` gold outline).
- Loading placeholders: `EditorialCardSkeleton` (editorial card shape, `lines`, `hasEyebrow`/`hasAction`/`hasFooter`), `SkeletonCard` / `SkeletonText` (plain card and text lines), `Skeleton` (raw bar).
- Actions: `EditorialButton` (`variant` primary|secondary|ghost, `size`, `arrow`, `href`), `QueryPill`. Use the shadcn `Button` only inside dense app UI (tables, dialogs).
- App UI (shadcn/Radix, themed with the same tokens; each wrapper accepts every native prop of its element — `placeholder`, `disabled`, `type`, `onClick`, `aria-*` — even though its `.d.ts` lists only the DS-specific ones): `Card*`, `Input`, `Textarea`, `Select*`, `Checkbox`, `Switch`, `Tabs*`, `Table*`, `Dialog*`, `DropdownMenu*`, `Tooltip*`, `Badge`, `Alert*`, `Accordion*`, `Breadcrumb`, `Progress`, `Slider`, `Avatar*`, `Skeleton`, `SkeletonCard`, `SkeletonText`, `EmptyState`, `Sidebar*`.

## Where the truth lives

Read `styles.css` → `_ds_bundle.css` (tokens are the `:root` custom properties) and `guidelines/DESIGN.md` (the full spec: principles, palette with Pantone sources, type scale, PWr patterns, the no-logotype rule). Per-component API is `components/<group>/<Name>/<Name>.d.ts`; usage examples are in `<Name>.prompt.md`.

## Idiomatic snippet

```tsx
import { PaperBackground, Masthead, Headline, DropCap, EditorialButton, Stat, EditorialCard } from "@juddges/design-system";

<PaperBackground className="px-8 py-24">
  <Masthead badge="Est. 2024 · Wrocław" meta="VOL I · NO 1" ruled />
  <Headline as="h1" size="lg" className="mt-10 max-w-3xl">
    An open archive of <em>judicial reasoning</em>, read by machines.
  </Headline>
  <DropCap className="mt-8 max-w-2xl text-[17px] leading-[1.65] text-pwr-grey">
    JuDDGES indexes 47,000+ judgments from Polish common courts and the England &amp; Wales Court of Appeal…
  </DropCap>
  <div className="mt-8 flex gap-3">
    <EditorialButton href="/search" arrow>Try search</EditorialButton>
    <EditorialButton variant="secondary" href="/sign-up">Sign up</EditorialButton>
  </div>
  <div className="mt-16 grid grid-cols-1 gap-px bg-pwr-line lg:grid-cols-3">
    <div className="bg-pwr-paper p-6"><Stat static value={47000} suffix="+" label="Judgments" marker="¹" /></div>
    <div className="bg-pwr-paper p-6"><Stat static value={2} label="Jurisdictions" /></div>
    <div className="bg-pwr-paper p-6"><EditorialCard bare eyebrow="Open" title="Free for research" /></div>
  </div>
</PaperBackground>
```
