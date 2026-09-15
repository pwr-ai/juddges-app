# Editorial Jurisprudence — how to build with this library

JuDDGES is a legal case-law research product (Polish + England & Wales judgments). Its look is **ink on parchment**: serif display type, hairline rules, sharp 0–2 px corners, oxblood for authority, gold for citations. No glassmorphism, no purple/indigo gradients, no rounded pastel icon pills, no `shadow-xl` cards.

## Setup — nothing to wrap

No provider is required. `styles.css` (imports `_ds_bundle.css` + `fonts/fonts.css`) already sets `body { background: var(--background); color: var(--foreground) }` — parchment page, ink text — and ships the three brand fonts as `@font-face`: **Instrument Serif** (display), **Geist** (body), **Geist Mono** (eyebrows, citations, tabular numerals). Use them through `font-serif`, `font-sans`, `font-mono` or `var(--font-serif|--font-sans|--font-mono)`. Radix-based components (`Dialog`, `DropdownMenu`, `Select`, `Tooltip`, `Popover`, `Sheet`) need no theme provider; `Tooltip` needs a `TooltipProvider` ancestor, `Sidebar*` needs `SidebarProvider`, `useToast` needs `ToastProvider`.

## Styling idiom — Tailwind 4 utilities + editorial tokens

Style layout glue with Tailwind utility classes (the compiled stylesheet covers the whole app's utility set). Colour ONLY through these tokens — never Tailwind's default palette (`bg-blue-500`, `text-gray-600`…):

| Family | Utilities | Meaning |
|---|---|---|
| Surface | `bg-parchment` `bg-parchment-deep` | page / tonal section band |
| Text | `text-ink` `text-ink-soft` | primary / secondary copy |
| Rules | `border-rule` `border-rule-strong` `divide-rule` | hairline / medium dividers |
| Authority | `text-oxblood` `bg-oxblood` `bg-oxblood-deep` `border-oxblood` | primary action, italic emphasis, hover |
| Citation | `text-gold` `bg-gold-soft` `border-gold` | footnote markers, tinted accents |
| Semantic aliases | `bg-background` `text-foreground` `bg-card` `bg-muted` `text-muted-foreground` `bg-primary` `text-primary-foreground` `border-border` `ring-ring` | the shadcn-style names, mapped onto the same tokens |

Every family also exists as `hover:`/`focus:` variants and as `var(--parchment)`, `var(--ink)`, `var(--ink-soft)`, `var(--rule)`, `var(--rule-strong)`, `var(--oxblood)`, `var(--oxblood-deep)`, `var(--gold)`, `var(--gold-soft)` for arbitrary values like `text-[color:var(--oxblood)]`.

Editorial CSS classes (in `_ds_bundle.css`, use directly when no component fits): `editorial-display` (serif headline), `editorial-eyebrow` (mono small caps with leading hairline), `editorial-dropcap` (4.5em italic oxblood initial), `editorial-numeral` (tabular figures), `editorial-card` (paper card, ink rule on top), `editorial-button-primary` / `editorial-button-secondary`, `editorial-rule` / `editorial-rule-strong` (hairline / ink `<hr>`).

Conventions that make it read as *this* brand: headlines in `Headline` (Instrument Serif) with one `<em>` for oxblood italic emphasis; a mono `Eyebrow` above every section title; hairline `Rule`s instead of box shadows; `gap-px bg-rule` grids to paint rules between cards; radius 0 (`rounded-none`) on cards and buttons, pills only for `QueryPill`/`Badge`; **one** signature moment per surface (a `DropCap`, an oversized numeral, a `Citation` marker) — never stacked.

## Which component

- Page furniture: `Masthead` (nameplate strip), `PaperBackground` (parchment wrapper, `grain`), `Section` / `SectionHeader` (eyebrow + numeral + title + description), `Rule`.
- Type: `Headline` (`as`, `size` xs–xl, `tone`, `italic`), `Eyebrow`, `DropCap`, `Citation` (`marker="¹"`).
- Cards & data: `EditorialCard` (`eyebrow`, `title`, `action`, `featured`, `flat`, `bare`), `Stat` (`value`, `label`, `suffix`, `marker`, `static`), `DualStatCard` (UK vs PL values), `ChartFigure` (FIG. nn frame around any chart).
- Actions: `EditorialButton` (`variant` primary|secondary|ghost, `size`, `arrow`, `href`), `QueryPill` (newsprint chip). Use the shadcn `Button` only inside dense app UI (tables, dialogs); prefer `EditorialButton` on marketing/reading surfaces.
- App UI (shadcn/Radix, already themed with the same tokens; each wrapper accepts every native prop of its element — `placeholder`, `disabled`, `type`, `onClick`, `aria-*` — even though its `.d.ts` lists only the DS-specific ones): `Card*`, `Input`, `Textarea`, `Select*`, `Checkbox`, `Switch`, `Tabs*`, `Table*`, `Dialog*`, `DropdownMenu*`, `Tooltip*`, `Badge`, `Alert*`, `Accordion*`, `Breadcrumb`, `Pagination*`, `Progress`, `Slider`, `Avatar*`, `Skeleton*`, `EmptyState`, `Sidebar*`, `Toast`/`ToastProvider`.

## Where the truth lives

Read `styles.css` → `_ds_bundle.css` (tokens are the `:root` custom properties; every utility above is defined there) and `guidelines/DESIGN.md` (the full design spec: principles, palette, type scale, patterns, motion, accessibility). Per-component API is `components/<group>/<Name>/<Name>.d.ts`; usage examples are in `<Name>.prompt.md`.

## Idiomatic snippet

```tsx
import { PaperBackground, Masthead, Headline, DropCap, EditorialButton, Stat, EditorialCard } from "@juddges/design-system";

<PaperBackground grain className="px-8 py-24">
  <Masthead badge="Est. 2024 · Wrocław" meta="VOL I · NO 1" ruled />
  <Headline as="h1" size="lg" className="mt-10 max-w-3xl">
    An open archive of <em>judicial reasoning</em>, read by machines.
  </Headline>
  <DropCap className="mt-8 max-w-2xl text-[17px] leading-[1.65] text-ink-soft">
    JuDDGES indexes 47,000+ judgments from Polish common courts and the England &amp; Wales Court of Appeal…
  </DropCap>
  <div className="mt-8 flex gap-3">
    <EditorialButton href="/search" arrow>Try search</EditorialButton>
    <EditorialButton variant="secondary" href="/sign-up">Sign up</EditorialButton>
  </div>
  <div className="mt-16 grid grid-cols-1 gap-px bg-rule lg:grid-cols-3">
    <div className="bg-parchment p-6"><Stat static value={47000} suffix="+" label="Judgments" marker="¹" /></div>
    <div className="bg-parchment p-6"><Stat static value={2} label="Jurisdictions" /></div>
    <div className="bg-parchment p-6"><EditorialCard bare eyebrow="Open" title="Free for research" /></div>
  </div>
</PaperBackground>
```
