# PWr Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Editorial Jurisprudence design system onto the Politechnika Wrocławska visual identity (Pantone 484 red, sand, black, white paper, grey panels, Tenor Sans display type, red bars and square numerals) with zero churn in existing token call sites, then re-sync claude.ai/design.

**Architecture:** A new `--pwr-*` token layer in `frontend/app/globals.css` becomes the source of truth; the existing editorial names (`--oxblood`, `--parchment`, …) become aliases so every current Tailwind utility keeps working. Display type switches by re-pointing `--font-serif` at Tenor Sans loaded through `next/font/google`. Three editorial components (`Masthead`, `SectionHeader`, `PaperBackground`) get the SIW shapes; everything else inherits through tokens. Docs and the design-sync inputs are updated in the same branch; the remote re-sync is the last step.

**Tech Stack:** Next.js 15 (App Router), Tailwind 4 CSS-first (`@theme inline`), `next/font/google`, Jest + `@testing-library/react`, design-sync converter staged in `.ds-sync/` (esbuild + Playwright/Chromium), `DesignSync` tool.

**Spec:** `docs/superpowers/specs/2026-09-15-pwr-restyle-design.md`

## Global Constraints

- Work only in the worktree `.worktrees/feat-629-pwr-restyle` (branch `feat/629-pwr-restyle`, base `origin/main`). All paths below are relative to that worktree root unless prefixed `frontend/`. Never `cd` into the main checkout.
- `frontend/node_modules` does not exist in the worktree: before the first `npx` run `ln -s ../../../frontend/node_modules frontend/node_modules` (symlink, gitignored).
- `docs/superpowers/` is gitignored but tracked → `git add -f` for files under it.
- Commit messages: Conventional Commits, `Refs #629`, no attribution footers.
- Colour values verbatim from the spec: `--pwr-red #9A342D`, `--pwr-red-deep #7E2A25`, `--pwr-sand #F1D1A2`, `--pwr-gold #B49A5E`, `--pwr-black #000000`, `--pwr-grey #5A5A5A`, `--pwr-paper #FFFFFF`, `--pwr-panel #EFEFEF`, `--pwr-line #D9D9D9`, `--pwr-line-strong #9A9A9A`.
- Never wrap a token in `oklch(var(--…))` (guard test from #622). Alpha on a token is `color-mix(in oklab, var(--x) N%, transparent)`.
- No PWr logotype/emblem anywhere. No new rounded corners. No shadows.
- Old token names stay (aliases); do not rename call sites.
- `rm`/`cp` are interactive aliases on this machine → `command rm -f`, `command cp -f`.

---

### Task 1: PWr token layer with editorial aliases

**Files:**
- Modify: `frontend/app/globals.css:8-26` (`:root` raw tokens), `:36-48` (`--card`, `--popover`, `--primary-foreground`, `--secondary`, `--muted`, `--accent-foreground`, `--destructive-foreground`), `:73-80` (`--sidebar*`), `:113-124` (`@theme inline` colours)
- Test: `frontend/tests/unit/app/globals-css-tokens.test.ts`

**Interfaces:**
- Produces: CSS custom properties `--pwr-red`, `--pwr-red-deep`, `--pwr-sand`, `--pwr-gold`, `--pwr-black`, `--pwr-grey`, `--pwr-paper`, `--pwr-panel`, `--pwr-line`, `--pwr-line-strong`; Tailwind utilities `{bg,text,border,…}-pwr-{red,red-deep,sand,gold,black,grey,paper,panel,line,line-strong}`.

- [ ] **Step 1: Extend the guard test with PWr token + alias assertions**

Append inside the existing `describe('globals.css colour tokens', …)` block in `frontend/tests/unit/app/globals-css-tokens.test.ts` (keep the existing `never wraps a token in oklch()` test):

```ts
  // The PWr layer (SIW 2025-12) is the source of truth; the editorial names
  // are aliases so the ~880 existing utilities keep working (#629).
  const PWR_TOKENS: Record<string, string> = {
    '--pwr-red': '#9A342D',
    '--pwr-red-deep': '#7E2A25',
    '--pwr-sand': '#F1D1A2',
    '--pwr-gold': '#B49A5E',
    '--pwr-black': '#000000',
    '--pwr-grey': '#5A5A5A',
    '--pwr-paper': '#FFFFFF',
    '--pwr-panel': '#EFEFEF',
    '--pwr-line': '#D9D9D9',
    '--pwr-line-strong': '#9A9A9A',
  };

  const ALIASES: Record<string, string> = {
    '--parchment': '--pwr-paper',
    '--parchment-deep': '--pwr-panel',
    '--ink': '--pwr-black',
    '--ink-soft': '--pwr-grey',
    '--rule': '--pwr-line',
    '--rule-strong': '--pwr-line-strong',
    '--oxblood': '--pwr-red',
    '--oxblood-deep': '--pwr-red-deep',
    '--gold': '--pwr-gold',
    '--gold-soft': '--pwr-sand',
  };

  const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));

  it.each(Object.entries(PWR_TOKENS))('defines %s as %s in :root', (token, hex) => {
    const re = new RegExp(`${token}:\\s*${hex}\\s*;`, 'i');
    expect(rootBlock).toMatch(re);
  });

  it.each(Object.entries(ALIASES))('aliases %s to %s', (alias, target) => {
    const re = new RegExp(`${alias}:\\s*var\\(${target}\\)\\s*;`);
    expect(rootBlock).toMatch(re);
  });

  it.each(Object.keys(PWR_TOKENS).map((t) => t.replace('--', '--color-')))(
    'exposes %s through @theme inline',
    (themeVar) => {
      expect(css).toMatch(new RegExp(`${themeVar}:\\s*var\\(${themeVar.replace('--color-', '--')}\\)\\s*;`));
    },
  );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:|✕" | head -5`
Expected: `Tests: 30 failed, 1 passed, 31 total` (10 token + 10 alias + 10 theme failures).

- [ ] **Step 3: Replace the raw editorial tokens with the PWr layer + aliases**

In `frontend/app/globals.css` replace lines 8–26 (from `:root {` through `--gold-soft: … /* tinted background */`) with:

```css
:root {
  /* ─────────────────────────────────────────────
     PWR IDENTITY — source of truth
     System Identyfikacji Wizualnej PWr, ed. 2025-12
     (https://pwr.edu.pl/kontakt/logotyp). Derived values are marked.
     See docs/reference/DESIGN.md for the full system.
     ───────────────────────────────────────────── */
  --pwr-red:          #9A342D;   /* Pantone 484 — authority, primary action */
  --pwr-red-deep:     #7E2A25;   /* derived — hover for --pwr-red */
  --pwr-sand:         #F1D1A2;   /* Pantone 156 — tinted accents */
  --pwr-gold:         #B49A5E;   /* Pantone 873 (metallic) — web approximation */
  --pwr-black:        #000000;   /* K100 — text, strong rules */
  --pwr-grey:         #5A5A5A;   /* derived — secondary text */
  --pwr-paper:        #FFFFFF;   /* white document surface */
  --pwr-panel:        #EFEFEF;   /* SIW info panel grey */
  --pwr-line:         #D9D9D9;   /* derived — hairline */
  --pwr-line-strong:  #9A9A9A;   /* derived — medium divider */

  /* Editorial aliases — the names the app's utilities use (bg-parchment,
     text-ink, text-oxblood, …). Kept so no call site changes; new code
     should use the pwr-* names. */
  --parchment:        var(--pwr-paper);
  --parchment-deep:   var(--pwr-panel);
  --ink:              var(--pwr-black);
  --ink-soft:         var(--pwr-grey);
  --rule:             var(--pwr-line);
  --rule-strong:      var(--pwr-line-strong);
  --oxblood:          var(--pwr-red);
  --oxblood-deep:     var(--pwr-red-deep);
  --gold:             var(--pwr-gold);
  --gold-soft:        var(--pwr-sand);
```

- [ ] **Step 4: Re-point the parchment-tuned semantic literals**

Still in `:root`, change these declarations (find each by name; leave the others untouched):

```css
  --card: var(--pwr-paper);
  --popover: var(--pwr-paper);
  --primary-foreground: var(--pwr-paper);
  --secondary: var(--pwr-panel);
  --muted: var(--pwr-panel);
  --accent-foreground: var(--pwr-red-deep);
  --destructive-foreground: var(--pwr-paper);
  --sidebar: var(--pwr-panel);
  --sidebar-primary-foreground: var(--pwr-paper);
  --sidebar-accent-foreground: var(--pwr-red-deep);
```

- [ ] **Step 5: Expose the PWr tokens through `@theme inline`**

In the `@theme inline` block, directly after `--color-gold-soft: var(--gold-soft);` add:

```css
  /* PWr identity tokens — bg-pwr-red, text-pwr-grey, border-pwr-line, … */
  --color-pwr-red: var(--pwr-red);
  --color-pwr-red-deep: var(--pwr-red-deep);
  --color-pwr-sand: var(--pwr-sand);
  --color-pwr-gold: var(--pwr-gold);
  --color-pwr-black: var(--pwr-black);
  --color-pwr-grey: var(--pwr-grey);
  --color-pwr-paper: var(--pwr-paper);
  --color-pwr-panel: var(--pwr-panel);
  --color-pwr-line: var(--pwr-line);
  --color-pwr-line-strong: var(--pwr-line-strong);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:"`
Expected: `Tests: 31 passed, 31 total`

- [ ] **Step 7: Commit**

```bash
git add frontend/app/globals.css frontend/tests/unit/app/globals-css-tokens.test.ts
git commit -m "feat(design): add PWr token layer with editorial aliases

Refs #629"
```

---

### Task 2: Tenor Sans display type

**Files:**
- Modify: `frontend/app/layout.tsx:4,30-35,169`
- Modify: `frontend/app/globals.css` (`--font-serif` in `:root`; `.editorial-display`, `.editorial-display em`, `.editorial-dropcap::first-letter`, `.editorial-numeral` in the `EDITORIAL UTILITIES` layer)
- Modify: `frontend/components/editorial/Headline.tsx:26` (JSDoc)
- Test: `frontend/tests/unit/app/globals-css-tokens.test.ts`

**Interfaces:**
- Produces: CSS variables `--font-tenor-sans` (set by `next/font`), `--font-display`; `--font-serif` now equals `var(--font-display)`.

- [ ] **Step 1: Add font assertions to the guard test**

Append inside the same `describe` block:

```ts
  it('routes display type through Tenor Sans', () => {
    expect(rootBlock).toMatch(/--font-display:\s*var\(--font-tenor-sans\),\s*Optima,\s*"URW Classico",\s*"Gill Sans",\s*sans-serif;/);
    expect(rootBlock).toMatch(/--font-serif:\s*var\(--font-display\);/);
    expect(css).not.toMatch(/instrument-serif|Instrument Serif|Iowan Old Style/);
  });

  it('keeps display emphasis upright (Tenor Sans has no italic)', () => {
    const emRule = css.slice(css.indexOf('.editorial-display em'), css.indexOf('}', css.indexOf('.editorial-display em')));
    expect(emRule).toMatch(/font-style:\s*normal;/);
    expect(emRule).toMatch(/color:\s*var\(--pwr-red\);/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:"`
Expected: `Tests: 2 failed, 31 passed, 33 total`

- [ ] **Step 3: Load Tenor Sans in `layout.tsx`**

Replace the import on line 4 and the `instrumentSerif` block (lines 30–35):

```ts
import { Tenor_Sans } from "next/font/google";
```

```ts
// Display face: Tenor Sans is the open substitute for Zapf Humanist / Optima,
// the PWr identity typeface (SIW 2025-12). Single weight, no italic.
const tenorSans = Tenor_Sans({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap", // Avoid invisible text (FOIT) while the display face loads
  variable: "--font-tenor-sans",
});
```

On line 169 replace `${instrumentSerif.variable}` with `${tenorSans.variable}`.

- [ ] **Step 4: Re-point the font stacks in `globals.css`**

In `:root` replace

```css
  --font-serif: var(--font-instrument-serif), "Iowan Old Style", Georgia, serif;
```

with

```css
  --font-display: var(--font-tenor-sans), Optima, "URW Classico", "Gill Sans", sans-serif;
  --font-serif: var(--font-display); /* alias — font-serif / .editorial-display keep working */
```

- [ ] **Step 5: Upright emphasis, open tracking, red drop cap**

In the `EDITORIAL UTILITIES` layer:

```css
  /* Display headlines — Tenor Sans (Optima-like), open tracking, red accents */
  .editorial-display {
    font-family: var(--font-display);
    font-weight: 400;
    font-style: normal;
    letter-spacing: 0;
    line-height: 1.02;
    color: var(--pwr-black);
  }

  /* Tenor Sans has no italic: emphasis is colour, never faux-italic */
  .editorial-display em,
  .editorial-display i {
    font-style: normal;
    color: var(--pwr-red);
  }
```

```css
  .editorial-dropcap::first-letter {
    font-family: var(--font-display);
    font-style: normal;
    font-weight: 400;
    float: left;
    font-size: 4.5em;
    line-height: 0.85;
    margin: 0.05em 0.08em -0.05em 0;
    color: var(--pwr-red);
  }
```

```css
  .editorial-numeral {
    font-family: var(--font-display);
    font-feature-settings: "tnum" 1, "lnum" 1;
    font-variant-numeric: tabular-nums lining-nums;
    letter-spacing: 0;
    color: var(--pwr-black);
  }
```

Also update the two remaining comments in `globals.css` that name the old face: line ~251 `/* Serif heading utility — for premium headings that use Instrument Serif */` → `/* Display heading utility — Tenor Sans, the PWr display face */`, and the `EDITORIAL UTILITIES` comment on `.editorial-display` (rewritten above). The test forbids the strings `Instrument Serif` / `Iowan Old Style` anywhere in the file.

In `frontend/components/editorial/Headline.tsx` line 26 change the JSDoc to ` * Editorial headline — Tenor Sans (PWr display face) with open tracking and confident`.

- [ ] **Step 6: Run the test and a type check**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:" && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/" | grep -c "error TS"`
Expected: `Tests: 33 passed, 33 total` and `0`.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/globals.css frontend/components/editorial/Headline.tsx frontend/tests/unit/app/globals-css-tokens.test.ts
git commit -m "feat(design): switch display type to Tenor Sans

Refs #629"
```

---

### Task 3: SIW patterns in CSS — red bar, card rule, eyebrow, buttons, no grain

**Files:**
- Modify: `frontend/app/globals.css` (`EDITORIAL UTILITIES` layer: `.editorial-eyebrow::before`, `.editorial-paper`, `.editorial-paper::before`, `.editorial-card`, `.editorial-card:hover`, `.editorial-button-primary`, `.editorial-button-primary:hover`, `.editorial-button-secondary:hover`; new `.pwr-bar`; `.app-noise-overlay` in the glassmorphism layer)
- Test: `frontend/tests/unit/app/globals-css-tokens.test.ts`

**Interfaces:**
- Produces: CSS class `.pwr-bar` (red block, white display text) used by Task 4.

- [ ] **Step 1: Add pattern assertions to the guard test**

Append inside the same `describe` block:

```ts
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('defines the SIW red bar', () => {
    const bar = rule('.pwr-bar');
    expect(bar).toMatch(/background:\s*var\(--pwr-red\);/);
    expect(bar).toMatch(/color:\s*var\(--pwr-paper\);/);
    expect(bar).toMatch(/font-family:\s*var\(--font-display\);/);
    expect(bar).toMatch(/border-radius:\s*0;/);
  });

  it('cards carry a red top rule that turns black on hover', () => {
    expect(rule('.editorial-card')).toMatch(/border-top:\s*2px solid var\(--pwr-red\);/);
    expect(rule('.editorial-card:hover')).toMatch(/border-top-color:\s*var\(--pwr-black\);/);
  });

  it('primary button is PWr red, secondary is black outline', () => {
    expect(rule('.editorial-button-primary')).toMatch(/background:\s*var\(--pwr-red\);/);
    expect(rule('.editorial-button-primary:hover')).toMatch(/background:\s*var\(--pwr-red-deep\);/);
    expect(rule('.editorial-button-secondary')).toMatch(/border:\s*1px solid var\(--pwr-black\);/);
  });

  it('paper grain and noise overlays are gone', () => {
    expect(css).not.toMatch(/feTurbulence/);
    expect(rule('.editorial-paper')).not.toMatch(/radial-gradient/);
    expect(css).not.toMatch(/\.editorial-paper::before/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:"`
Expected: `Tests: 4 failed, 33 passed, 37 total`

- [ ] **Step 3: Rewrite the pattern rules**

In the `EDITORIAL UTILITIES` layer:

```css
  .editorial-eyebrow::before {
    content: "";
    width: 1.75rem;
    height: 1px;
    background: var(--pwr-red);
  }
```

Replace the whole `.editorial-paper` + `.editorial-paper::before` pair (grain) with:

```css
  /* Paper surface — plain white per SIW; grain retired in #629. Kept as a
     class so PaperBackground's `grain` prop stays a harmless no-op. */
  .editorial-paper {
    position: relative;
    background-color: var(--pwr-paper);
  }
```

```css
  /* Editorial card — sharp edges, PWr red rule above (SIW header bar echo) */
  .editorial-card {
    background: var(--card);
    border: 1px solid var(--pwr-line);
    border-top: 2px solid var(--pwr-red);
    border-radius: 0;
    transition: border-color 180ms ease, transform 180ms ease;
  }

  .editorial-card:hover {
    border-top-color: var(--pwr-black);
  }
```

```css
  /* PWr red primary action — sharp, confident */
  .editorial-button-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: var(--pwr-red);
    color: var(--pwr-paper);
    border: 1px solid var(--pwr-red);
    border-radius: 0;
    font-family: var(--font-sans);
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    transition: background 180ms ease, transform 180ms ease;
  }

  .editorial-button-primary:hover {
    background: var(--pwr-red-deep);
    border-color: var(--pwr-red-deep);
    transform: translateY(-1px);
  }

  .editorial-button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: transparent;
    color: var(--pwr-black);
    border: 1px solid var(--pwr-black);
    border-radius: 0;
    font-family: var(--font-sans);
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    transition: all 180ms ease;
  }

  .editorial-button-secondary:hover {
    background: var(--pwr-black);
    color: var(--pwr-paper);
  }

  /* SIW red bar — full-bleed block with white display text (page headers,
     masthead, section bars). No radius, no shadow. */
  .pwr-bar {
    background: var(--pwr-red);
    color: var(--pwr-paper);
    font-family: var(--font-display);
    padding: 0.5rem 1.25rem;
    border-radius: 0;
  }
```

In the glassmorphism layer replace the `.app-noise-overlay` rule with:

```css
  /* Noise overlay retired in #629 (SIW: plain white paper). */
  .app-noise-overlay {
    display: none;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:"`
Expected: `Tests: 37 passed, 37 total`

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css frontend/tests/unit/app/globals-css-tokens.test.ts
git commit -m "feat(design): SIW patterns — red bar, red card rule, no paper grain

Refs #629"
```

---

### Task 4: Masthead, SectionHeader, PaperBackground

**Files:**
- Modify: `frontend/components/editorial/Masthead.tsx`
- Modify: `frontend/components/editorial/SectionHeader.tsx`
- Modify: `frontend/components/editorial/PaperBackground.tsx`
- Create: `frontend/tests/unit/components/editorial/Masthead.test.tsx`
- Create: `frontend/tests/unit/components/editorial/SectionHeader.test.tsx`

**Interfaces:**
- Consumes: `.pwr-bar` (Task 3).
- Produces: `MastheadProps` unchanged (`badge`, `meta`, `ruled`); `SectionHeaderProps` gains `variant?: "default" | "bar"`; `PaperBackgroundProps` unchanged (`grain` now a no-op).

- [ ] **Step 1: Write the failing Masthead test**

`frontend/tests/unit/components/editorial/Masthead.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { Masthead } from "@/components/editorial/Masthead";

describe("Masthead (PWr red bar)", () => {
  it("renders badge and meta inside the red bar", () => {
    const { container } = render(<Masthead badge="Est. 2024 · Wrocław" meta="Vol I · No 1" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain("pwr-bar");
    expect(screen.getByText("Est. 2024 · Wrocław")).toBeInTheDocument();
    expect(screen.getByText("Vol I · No 1").className).toContain("text-pwr-sand");
  });

  it("draws the nameplate underline only when ruled", () => {
    const ruled = render(<Masthead badge="A" ruled />).container.firstElementChild as HTMLElement;
    expect(ruled.className).toContain("border-b");
    const bare = render(<Masthead badge="A" ruled={false} />).container.firstElementChild as HTMLElement;
    expect(bare.className).not.toContain("border-b");
  });
});
```

- [ ] **Step 2: Write the failing SectionHeader test**

`frontend/tests/unit/components/editorial/SectionHeader.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { SectionHeader } from "@/components/editorial/SectionHeader";

describe("SectionHeader (PWr)", () => {
  it("renders the numeral as a red square block", () => {
    render(<SectionHeader numeral="03" title="Capabilities" />);
    const numeral = screen.getByText("03");
    expect(numeral.className).toContain("bg-pwr-red");
    expect(numeral.className).toContain("text-pwr-paper");
    expect(numeral.className).not.toContain("italic");
  });

  it("bar variant wraps the title in the red bar", () => {
    const { container } = render(<SectionHeader variant="bar" eyebrow="Coverage" title="Two jurisdictions" />);
    expect(container.querySelector(".pwr-bar")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Two jurisdictions");
  });

  it("default variant has no bar", () => {
    const { container } = render(<SectionHeader title="Plain" />);
    expect(container.querySelector(".pwr-bar")).toBeNull();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `cd frontend && npx jest tests/unit/components/editorial 2>&1 | grep -E "Tests:"`
Expected: `Tests: 5 failed, 5 total` (Masthead: no `pwr-bar` class; SectionHeader: numeral is italic serif, `variant` unknown).

- [ ] **Step 4: Implement Masthead**

Replace the body of `frontend/components/editorial/Masthead.tsx`:

```tsx
import React from "react";
import { cn } from "@/lib/utils";

interface MastheadProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Left tag — small caps, e.g. "EST. 2024 · WROCLAW". */
  badge?: React.ReactNode;
  /** Volume / issue / version label rendered on the right, in PWr sand. */
  meta?: React.ReactNode;
  /** Draw the SIW nameplate underline beneath the bar. */
  ruled?: boolean;
}

/**
 * Editorial masthead — the SIW red header bar: PWr red block, white
 * small-caps text, sand meta on the right, and the horizontal underline the
 * identity system places under the university wordmark.
 *
 * @example
 *   <Masthead badge="Est. 2024 · Wroclaw" meta="VOL I · NO 1" ruled />
 */
export function Masthead({
  badge,
  meta,
  ruled = true,
  className,
  ...props
}: MastheadProps) {
  return (
    <div
      className={cn(
        "pwr-bar flex items-center justify-between gap-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em]",
        ruled && "border-b border-pwr-black",
        className,
      )}
      {...props}
    >
      {badge && <span>{badge}</span>}
      {meta && <span className="text-pwr-sand">{meta}</span>}
    </div>
  );
}

export default Masthead;
```

- [ ] **Step 5: Implement SectionHeader**

Replace `frontend/components/editorial/SectionHeader.tsx`:

```tsx
import React from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./Eyebrow";
import { Headline } from "./Headline";

interface SectionHeaderProps {
  eyebrow?: string;
  /** May contain `<em>` for red emphasis. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Section number, e.g. `01`, `02`, … rendered as a PWr red square. */
  numeral?: string;
  /** Alignment — `start` (default) or `center`. */
  align?: "start" | "center";
  /** `bar` wraps eyebrow + title in the SIW red header bar. */
  variant?: "default" | "bar";
  /** Optional right-side action (e.g. CTA link). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Editorial section header — eyebrow + display title + description, with an
 * optional section number rendered as the SIW red square (the identity
 * system's page-number block). `variant="bar"` turns the header into the
 * full red bar used on SIW document pages.
 *
 * @example
 *   <SectionHeader
 *     eyebrow="Capabilities"
 *     numeral="03"
 *     title={<>Three ways to <em>work with</em> legal data</>}
 *     description="Search, analyze, and extract structured information."
 *   />
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  numeral,
  align = "start",
  variant = "default",
  action,
  className,
}: SectionHeaderProps) {
  const numeralBlock = numeral && (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center bg-pwr-red font-display text-sm leading-none text-pwr-paper",
        align === "center" && "mx-auto",
      )}
    >
      {numeral}
    </span>
  );

  const heading = (
    <Headline as="h2" size="md" className={variant === "bar" ? "text-pwr-paper" : undefined}>
      {title}
    </Headline>
  );

  return (
    <div
      className={cn(
        "relative",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-3xl",
        action && "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="relative z-10 flex flex-col gap-4">
        {variant === "bar" ? (
          <div className="pwr-bar flex flex-col gap-2 py-4">
            {eyebrow && (
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-pwr-sand">
                {eyebrow}
              </span>
            )}
            <div className="flex items-start gap-3">
              {numeralBlock}
              {heading}
            </div>
          </div>
        ) : (
          <>
            {numeralBlock}
            {eyebrow && (
              <Eyebrow as="span" tone="oxblood">
                {eyebrow}
              </Eyebrow>
            )}
            {heading}
          </>
        )}
        {description && (
          <p className="max-w-2xl text-[17px] leading-[1.65] text-pwr-grey">
            {description}
          </p>
        )}
      </div>
      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </div>
  );
}

export default SectionHeader;
```

`font-display` needs a Tailwind font utility: in `frontend/app/globals.css` `@theme inline`, after `--font-serif: var(--font-serif);` add `--font-display: var(--font-display);`.

In the bar variant the `Headline` is white; `Headline` applies `editorial-display` (colour black) — the `text-pwr-paper` className is passed through `cn` after it and wins because Tailwind utilities are emitted after `@layer components`. Verify in Step 7's probe.

- [ ] **Step 6: Make `grain` a no-op in PaperBackground**

Replace the JSDoc + `grain` prop doc in `frontend/components/editorial/PaperBackground.tsx`:

```tsx
interface PaperBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Accepted for backwards compatibility; paper grain was retired with the
   * PWr identity (#629). Has no visual effect.
   */
  grain?: boolean;
  /** Render with the SIW grey panel tone instead of white. */
  deep?: boolean;
}

/**
 * Surface wrapper that paints the PWr white paper (or the grey info panel
 * with `deep`). Use as a section wrapper for hero / immersive areas.
 *
 * @example
 *   <PaperBackground className="py-24"><HeroContent /></PaperBackground>
 */
```

and the className list becomes:

```tsx
      className={cn(
        "relative overflow-hidden",
        deep ? "bg-pwr-panel" : "bg-pwr-paper",
        className,
      )}
```

(`grain` stays destructured so it does not leak onto the DOM node; prefix it `grain: _grain` if ESLint flags the unused variable.)

- [ ] **Step 7: Run tests, lint, types**

Run: `cd frontend && npx jest tests/unit/components/editorial tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:" && npx eslint --max-warnings 0 components/editorial tests/unit/components/editorial && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/" | grep -c "error TS"`
Expected: `Tests: 42 passed, 42 total`, no lint output, `0`.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/editorial/Masthead.tsx frontend/components/editorial/SectionHeader.tsx frontend/components/editorial/PaperBackground.tsx frontend/app/globals.css frontend/tests/unit/components/editorial
git commit -m "feat(editorial): red-bar masthead, square numerals, bar section header

Refs #629"
```

---

### Task 5: Documentation — DESIGN.md, CLAUDE.md, doc↔CSS parity test

**Files:**
- Modify: `docs/reference/DESIGN.md` (title, §1 principles, §2 palette, §3 typography, new §"Patterns", §4 primitives list, new "Logotype" rule)
- Modify: `CLAUDE.md:84-96` (design-system section)
- Modify: `frontend/tests/unit/app/globals-css-tokens.test.ts`

- [ ] **Step 1: Add the parity test**

Append inside the same `describe` block:

```ts
  it('DESIGN.md palette table matches :root', () => {
    const md = readFileSync(join(__dirname, '../../../../docs/reference/DESIGN.md'), 'utf8');
    const rows = [...md.matchAll(/^\|\s*`(--pwr-[a-z-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/gm)];
    expect(rows.length).toBe(10);
    for (const [, token, hex] of rows) {
      expect(rootBlock).toMatch(new RegExp(`${token}:\\s*${hex}\\s*;`, 'i'));
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts -t "DESIGN.md" 2>&1 | grep -E "Tests:"`
Expected: `Tests: 1 failed, …` (0 rows found).

- [ ] **Step 3: Rewrite DESIGN.md header, §1, §2, §3**

Replace lines 1–9 (title through "subject.") with:

```markdown
# Design System — Editorial Jurisprudence, PWr edition

> **Status:** active · **Adopted:** 2026-05-07 · **PWr identity:** 2026-09-15 (#629) · **Owner:** frontend

The Juddges design system: the editorial framework of a legal periodical
(eyebrows, hairline rules, drop caps, marginal numerals, sharp paper edges)
carried in the visual identity of Politechnika Wrocławska — PWr red on white
paper, humanist display type, red header bars and square numerals — as
defined in the university's *System Identyfikacji Wizualnej* (SIW, edition
2025-12, <https://pwr.edu.pl/kontakt/logotyp>).
```

In §1 replace the **Ink on paper** and **Confident typography** rows with:

```markdown
| **PWr on paper** | White page, black text, Pantone 484 red for authority, sand for tinted accents, `#EFEFEF` panels for asides. The page should feel like a PWr document. |
| **Confident typography** | Tenor Sans (open substitute for the identity's Zapf Humanist / Optima) at large display sizes does the heavy lifting; emphasis is red, never faux-italic. Geist sans for body, Geist mono for citations and tabular numerals. |
```

Replace §2 from "## 2. Palette" through the `--gold-soft` row with:

```markdown
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
```

Update the Tailwind example under "### Tailwind class names" to:

```html
<div class="bg-pwr-paper text-pwr-black border-pwr-line">…</div>
<span class="text-pwr-red">overruled</span>
<sup class="text-pwr-gold">¹</sup>
```

Replace §3's font block and the two Instrument Serif mentions:

```
--font-sans     = Geist Sans            (body, UI)
--font-display  = Tenor Sans            (display; --font-serif is an alias)
--font-mono     = Geist Mono            (citations, eyebrows, tabular numerals)
```

Hero display row → `Tenor Sans, red accents (upright — the face has no italic)`. Drop cap paragraph → "Renders the first letter as a 4.5em upright red floated initial."

- [ ] **Step 4: Add the Patterns section and the logotype rule**

Insert before "## 4. Component primitives":

```markdown
## 3a. PWr patterns

| Pattern | Class / component | Rule |
|---|---|---|
| Red bar | `.pwr-bar`, `<Masthead>`, `<SectionHeader variant="bar">` | Full-width `--pwr-red` block, white display text, 0 px radius. One per surface. |
| Nameplate underline | `<Masthead ruled>` | 1 px black line under the bar — the SIW underline beneath the wordmark. |
| Square numeral | `<SectionHeader numeral="03">` | `--pwr-red` square, white Tenor Sans digit — the SIW page-number block. |
| Grey panel | `bg-pwr-panel`, `<EditorialCard flat>`, `<PaperBackground deep>` | `#EFEFEF` aside, no border needed. |
| Card rule | `.editorial-card` | 2 px `--pwr-red` top rule, black on hover; 1 px `--pwr-line` elsewhere. |
| Corners / shadows | everywhere | 0 px, none. Pills only on `QueryPill` and `Badge`. |

### Logotype

**The PWr emblem and wordmark are not used in this product.** SIW requires
written permission from logotyp@pwr.edu.pl and forbids using any element of
the mark separately; no permission has been obtained. Express the identity
through palette, type and patterns only. Do not add the eagle, the compass or
the "Politechnika Wrocławska" wordmark to any surface.
```

In §4 make sure the primitives list names all fifteen: `ChartFigure`, `Citation`, `DropCap`, `DualStatCard`, `EditorialButton` (`variant`: `primary` | `secondary` | `ghost`), `EditorialCard`, `Eyebrow`, `Headline`, `Masthead`, `PaperBackground`, `QueryPill`, `Rule`, `Section`, `SectionHeader`, `Stat`. Replace any "primary or outline" wording for `EditorialButton`.

- [ ] **Step 5: Update CLAUDE.md**

Replace the token table (lines 84–96) and the typography line with:

```markdown
Canonical tokens live in `frontend/app/globals.css` — the PWr identity layer
(SIW 2025-12); the editorial names are aliases kept for existing utilities:

| Token | Hex | Use | Alias |
|---|---|---|---|
| `--pwr-red` | `#9A342D` | Pantone 484 — authority, primary action, bars | `--oxblood` |
| `--pwr-red-deep` | `#7E2A25` | Hover for red | `--oxblood-deep` |
| `--pwr-sand` | `#F1D1A2` | Pantone 156 — tinted accents | `--gold-soft` |
| `--pwr-gold` | `#B49A5E` | Pantone 873 (web approx.) — citation markers | `--gold` |
| `--pwr-black` | `#000000` | Text, strong rules | `--ink` |
| `--pwr-grey` | `#5A5A5A` | Secondary text | `--ink-soft` |
| `--pwr-paper` | `#FFFFFF` | Page surface | `--parchment` |
| `--pwr-panel` | `#EFEFEF` | Grey info panels, `--muted` | `--parchment-deep` |
| `--pwr-line` | `#D9D9D9` | Hairline borders | `--rule` |
| `--pwr-line-strong` | `#9A9A9A` | Medium dividers | `--rule-strong` |

Typography: `Tenor Sans` (display, `--font-display`; `--font-serif` aliases
it) · `Geist Sans` (body) · `Geist Mono` (citations / eyebrows / tabular
numerals). The PWr logotype is **not** used (no permission) — palette, type
and patterns only.
```

- [ ] **Step 6: Run the parity test**

Run: `cd frontend && npx jest tests/unit/app/globals-css-tokens.test.ts 2>&1 | grep -E "Tests:"`
Expected: `Tests: 38 passed, 38 total`

- [ ] **Step 7: Commit**

```bash
git add docs/reference/DESIGN.md CLAUDE.md frontend/tests/unit/app/globals-css-tokens.test.ts
git commit -m "docs(design): document the PWr identity edition

Refs #629"
```

---

### Task 6: design-sync inputs — Tenor Sans, safelist, conventions, previews

**Files:**
- Create: `.design-sync/fonts/TenorSans-Regular-latin.woff2`, `.design-sync/fonts/TenorSans-Regular-latin-ext.woff2`
- Delete: `.design-sync/fonts/InstrumentSerif-*.woff2` (4 files)
- Modify: `.design-sync/fonts.css`, `.design-sync/tailwind.css`, `.design-sync/conventions.md`, `.design-sync/NOTES.md`
- Modify: `.design-sync/previews/Masthead.tsx`, `.design-sync/previews/SectionHeader.tsx`

- [ ] **Step 1: Vendor Tenor Sans (OFL) from Google Fonts**

```bash
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
curl -sA "$UA" 'https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap' -o /tmp/claude-1000/tenor.css
grep -n "unicode-range\|url(" /tmp/claude-1000/tenor.css
```

Copy the two `url(...)` values whose preceding comment is `/* latin */` and `/* latin-ext */`, then:

```bash
curl -s '<latin url>'     -o .design-sync/fonts/TenorSans-Regular-latin.woff2
curl -s '<latin-ext url>' -o .design-sync/fonts/TenorSans-Regular-latin-ext.woff2
file .design-sync/fonts/TenorSans-Regular-*.woff2   # both: "Web Open Font Format (Version 2)"
command rm -f .design-sync/fonts/InstrumentSerif-*.woff2
```

- [ ] **Step 2: Rewrite `.design-sync/fonts.css`**

Keep the two Geist `@font-face` rules; replace the four Instrument Serif rules and the header comment with:

```css
/* Brand fonts for the design-system bundle. The Next.js app loads these via
   next/font; Claude Design has no such loader, so ship real @font-face rules.
   Geist: repo files (frontend/app/fonts). Tenor Sans: SIL OFL 1.1, Google
   Fonts, latin + latin-ext (Polish diacritics) — open substitute for the PWr
   identity face Zapf Humanist / Optima. */
```

```css
@font-face {
  font-family: "Tenor Sans";
  src: url("./fonts/TenorSans-Regular-latin-ext.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: "Tenor Sans";
  src: url("./fonts/TenorSans-Regular-latin.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
```

(Use the `unicode-range` values printed by the Google CSS in Step 1 if they differ.)

- [ ] **Step 3: Update `.design-sync/tailwind.css`**

Replace `--font-instrument-serif: "Instrument Serif";` in `:root` with `--font-tenor-sans: "Tenor Sans";` and add two safelist lines after the existing `@source inline(...)` lines:

```css
@source inline("{bg,text,border,border-t,border-b,border-l,border-r,ring,fill,stroke,decoration,outline,divide,from,to}-pwr-{red,red-deep,sand,gold,black,grey,paper,panel,line,line-strong}");
@source inline("{hover,focus}:{bg,text,border}-pwr-{red,red-deep,sand,gold,black,grey,paper,panel,line,line-strong}");
@source inline("font-display pwr-bar");
```

- [ ] **Step 4: Rewrite the design-agent header `.design-sync/conventions.md`**

Replace the file content with:

```markdown
# Editorial Jurisprudence, PWr edition — how to build with this library

JuDDGES is a legal case-law research product (Polish + England & Wales judgments) from Politechnika Wrocławska. Its look is **PWr red on white paper**: humanist display type (Tenor Sans), hairline rules, 0 px corners, red header bars and square numerals, grey `#EFEFEF` panels. No glassmorphism, no gradients, no rounded pastel pills, no shadows. **Never draw the PWr emblem, eagle, compass or the "Politechnika Wrocławska" wordmark** — the identity is expressed only through palette, type and patterns.

## Setup — nothing to wrap

No provider is required. `styles.css` (imports `_ds_bundle.css` + `fonts/fonts.css`) already sets `body { background: var(--background); color: var(--foreground) }` — white page, black text — and ships the brand fonts as `@font-face`: **Tenor Sans** (display, `font-display` / `font-serif`), **Geist** (body, `font-sans`), **Geist Mono** (eyebrows, citations, tabular numerals, `font-mono`). Radix-based components (`Dialog`, `DropdownMenu`, `Select`, `Tooltip`, `Popover`, `Sheet`) need no theme provider; `Tooltip` needs a `TooltipProvider` ancestor, `Sidebar*` needs `SidebarProvider`, `useToast` needs `ToastProvider`.

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
- Cards & data: `EditorialCard` (`eyebrow`, `title`, `action`, `featured`, `flat`, `bare`), `Stat` (`value`, `label`, `suffix`, `marker`, `static`), `DualStatCard` (UK vs PL values), `ChartFigure` (FIG. nn frame around any chart).
- Actions: `EditorialButton` (`variant` primary|secondary|ghost, `size`, `arrow`, `href`), `QueryPill`. Use the shadcn `Button` only inside dense app UI (tables, dialogs).
- App UI (shadcn/Radix, themed with the same tokens; each wrapper accepts every native prop of its element — `placeholder`, `disabled`, `type`, `onClick`, `aria-*` — even though its `.d.ts` lists only the DS-specific ones): `Card*`, `Input`, `Textarea`, `Select*`, `Checkbox`, `Switch`, `Tabs*`, `Table*`, `Dialog*`, `DropdownMenu*`, `Tooltip*`, `Badge`, `Alert*`, `Accordion*`, `Breadcrumb`, `Pagination*`, `Progress`, `Slider`, `Avatar*`, `Skeleton*`, `EmptyState`, `Sidebar*`, `Toast`/`ToastProvider`.

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
```

- [ ] **Step 5: Update `.design-sync/NOTES.md` font notes**

In the `## Fonts` section replace the Instrument Serif sentence with: "Tenor Sans (SIL OFL 1.1, Google Fonts, latin + latin-ext, single weight 400, no italic) committed under `.design-sync/fonts/` as `TenorSans-Regular-{latin,latin-ext}.woff2` — the open substitute for the PWr identity face (Zapf Humanist / Optima), see #629." Replace `--font-instrument-serif` with `--font-tenor-sans` in the same section. In `## Known render warns` change `"Iowan Old Style"` to `Optima, "URW Classico", "Gill Sans"`. In `## Re-sync risks` change "Instrument Serif files are vendored" to "Tenor Sans files are vendored".

- [ ] **Step 6: Add `Bar` preview cells**

Append to `.design-sync/previews/Masthead.tsx`:

```tsx
export const OnPanel = () => (
  <div className="bg-pwr-panel p-6">
    <Masthead badge="Politechnika Wrocławska · JuDDGES" meta="SIW 2025-12" ruled={false} />
  </div>
);
```

and change the `OverHero` heading's `<em className="italic text-oxblood">` to `<em className="text-pwr-red">`.

Append to `.design-sync/previews/SectionHeader.tsx`:

```tsx
export const Bar = () => (
  <SectionHeader
    variant="bar"
    eyebrow="Coverage"
    numeral="02"
    title={<>Two jurisdictions, <em>one</em> archive</>}
    description="Polish common courts alongside the England and Wales Court of Appeal."
  />
);
```

- [ ] **Step 7: Verify the inputs compile**

```bash
ln -sfn ../../.ds-sync .ds-sync   # converter staged in the main checkout; symlink, gitignored
node .design-sync/build.mjs 2>&1 | tail -1
grep -c "Tenor Sans" frontend/.ds-pkg/dist/styles.css        # ≥ 1
grep -o "\.bg-pwr-red\b" frontend/.ds-pkg/dist/styles.css | head -1   # .bg-pwr-red
grep -c "Instrument" frontend/.ds-pkg/dist/styles.css        # 0
```

- [ ] **Step 8: Commit**

```bash
git add .design-sync/fonts .design-sync/fonts.css .design-sync/tailwind.css .design-sync/conventions.md .design-sync/NOTES.md .design-sync/previews/Masthead.tsx .design-sync/previews/SectionHeader.tsx
git commit -m "chore(design-sync): PWr tokens, Tenor Sans and bar previews

Refs #629"
```

---

### Task 7: Local bundle, computed-style probe, review sheets

**Files:**
- Uses: `.ds-sync/package-build.mjs`, `.ds-sync/package-validate.mjs`, `.ds-sync/package-capture.mjs` (staged converter, not committed)
- Create (scratch, not committed): `/tmp/claude-1000/-home-laugustyniak-github-legal-ai-juddges-app/2f25b9f4-bb97-4c34-a24e-c2296562ecd6/scratchpad/pwr-probe.mjs`
- Writes: `.design-sync/.cache/review/*.grade.json` (gitignored)

- [ ] **Step 1: Build and validate the bundle from the worktree**

```bash
node .design-sync/build.mjs 2>&1 | tail -1
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules frontend/node_modules --entry frontend/.ds-pkg/dist/index.js --out ./ds-bundle 2>&1 | tail -2
node .ds-sync/package-validate.mjs ./ds-bundle 2>&1 | grep -E "render check|✗|FONT_MISSING"
```

Expected: `render check: 187/187 previews render cleanly`; any `FONT_MISSING` lists only `"JetBrains Mono"`, `Optima`, `"URW Classico"`, `"Gill Sans"` (fallbacks); no `Instrument Serif`.

- [ ] **Step 2: Computed-style probe in headless Chromium**

Write the probe:

```js
import { chromium } from '/home/laugustyniak/github/legal-ai/juddges-app/.ds-sync/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const css = readFileSync('ds-bundle/_ds_bundle.css', 'utf8');
const fonts = readFileSync('ds-bundle/fonts/fonts.css', 'utf8').replaceAll('url("./', 'url("file:///home/laugustyniak/github/legal-ai/juddges-app/.worktrees/feat-629-pwr-restyle/ds-bundle/fonts/');
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(`<style>${fonts}${css}</style>
<div id=mh class="pwr-bar">masthead</div>
<h1 id=hl class="editorial-display">Open <em id=em>archive</em></h1>
<div id=card class="editorial-card">card</div>
<button id=btn class="editorial-button-primary">go</button>
<div id=panel class="bg-pwr-panel">panel</div>`);
await p.evaluate(() => document.fonts.ready);
const r = await p.evaluate(() => {
  const g = (id) => getComputedStyle(document.getElementById(id));
  return {
    body: getComputedStyle(document.body).backgroundColor,
    masthead: g('mh').backgroundColor,
    headlineFont: g('hl').fontFamily,
    emStyle: g('em').fontStyle, emColor: g('em').color,
    cardTop: g('card').borderTopColor,
    button: g('btn').backgroundColor,
    panel: g('panel').backgroundColor,
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
```

Run: `node /tmp/claude-1000/-home-laugustyniak-github-legal-ai-juddges-app/2f25b9f4-bb97-4c34-a24e-c2296562ecd6/scratchpad/pwr-probe.mjs`

Expected:

```
body      rgb(255, 255, 255)
masthead  rgb(154, 52, 45)
headlineFont contains "Tenor Sans"
emStyle   normal      emColor rgb(154, 52, 45)
cardTop   rgb(154, 52, 45)
button    rgb(154, 52, 45)
panel     rgb(239, 239, 239)
```

Any mismatch → fix the CSS in the task that owns the rule (1–4), rebuild, re-run.

- [ ] **Step 3: Capture and grade every authored preview**

`styleSha` changed, so nothing carries forward. Capture all 46 authored components (names = files in `.design-sync/previews/*.tsx`):

```bash
C=$(ls .design-sync/previews/*.tsx | xargs -n1 basename | sed 's/\.tsx$//' | paste -sd, -)
node .ds-sync/package-capture.mjs --out ./ds-bundle --components "$C" --spot-check-components "$C" 2>&1 | tail -3
```

Then for each `ds-bundle/_screenshots/review/<group>__<Name>.png`: Read the sheet, grade every cell on the absolute rubric (Styled / Complete / Plausible), and Write `.design-sync/.cache/review/<Name>.grade.json` with `{"<CellLabel>": "good" | "needs-work", …}`. Look specifically for: leftover parchment/oxblood/gold tints, italic `<em>`, invisible skeletons on white, red bars rendering, square numerals, white headline text inside the bar variant. A `needs-work` cell means a CSS/component fix in Tasks 1–4, rebuild, recapture — not a preview hack.

- [ ] **Step 4: Full frontend gates**

```bash
cd frontend && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:" && npm run validate 2>&1 | tail -3
```

Expected: all suites pass; validate exits 0.

- [ ] **Step 5: Commit any fixes; nothing new to commit if the sheets were clean**

```bash
git status --short   # only gitignored build output should remain
```

---

### Task 8: Remote re-sync, PR

> Runs in the main session (needs the `DesignSync` tool). Not delegable to a subagent.

**Files:**
- Uses: `.ds-sync/resync.mjs`, `ds-bundle/`, `.design-sync/config.json` (`projectId cf257da9-cdd2-47c0-99d6-a08ee168aaac`)

- [ ] **Step 1: Driver run with the remote anchor**

```bash
node .ds-sync/resync.mjs --remote --config .design-sync/config.json --node-modules frontend/node_modules --entry frontend/.ds-pkg/dist/index.js --out ./ds-bundle 2>&1 | tail -15
node -e "const v=require('./ds-bundle/.resync-verdict.json');console.log('pending',v.verification.pendingGrade.length,'upload',v.upload.any,'deletes',(v.upload.deletes||[]).length)"
```

Expected: `pending 0` (every sheet graded in Task 7). If not 0, grade the listed components first.

- [ ] **Step 2: Atomic upload (project pinned, non-empty)**

Per the design-sync skill's atomic path: `DesignSync(finalize_plan)` with `localDir: "./ds-bundle"` and the standard writes/deletes globs (`components/**`, `tokens/**`, `fonts/**`, `_vendor/**`, `_preview/**`, `guidelines/**`, `_ds_bundle.js`, `_ds_bundle.css`, `styles.css`, `README.md`, `_ds_sync.json`, `_ds_needs_recompile`); then in order: `write_files` `_ds_needs_recompile` → all content files in ≤256-file batches (fonts dir first; the four `InstrumentSerif-*.woff2` are deleted via `delete_files`) → `write_files` `_ds_needs_recompile` again → `write_files` `_ds_sync.json` last. Finish with `DesignSync(list_files)` and confirm no `InstrumentSerif` path and `fonts/TenorSans-Regular-latin.woff2` + `fonts/TenorSans-Regular-latin-ext.woff2` present. `report_validate` with the final `.render-check.json` counts.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/629-pwr-restyle
gh pr create --base main --title "feat(design): PWr visual identity for the design system" --body-file - <<'EOF'
## Summary

- New `--pwr-*` token layer (SIW 2025-12: Pantone 484 `#9A342D`, Pantone 156 `#F1D1A2`, black, Pantone 873 web approx., white paper, `#EFEFEF` panels); every editorial name (`--oxblood`, `--parchment`, …) is now an alias — no call-site churn.
- Display type: Tenor Sans (open Optima substitute) via `next/font/google`; `--font-serif` aliases `--font-display`. Emphasis is red and upright (the face has no italic).
- SIW patterns: `.pwr-bar`, red-bar `Masthead` with nameplate underline, `SectionHeader` red square numerals + `variant="bar"`, red card rule, grey panels, paper grain retired (`PaperBackground grain` is a no-op).
- Docs: `docs/reference/DESIGN.md` PWr edition (palette with Pantone sources, patterns, all 15 primitives, explicit no-logotype rule), `CLAUDE.md` token table.
- design-sync: Tenor Sans vendored, `pwr-*` safelist, conventions rewritten, bar previews; project re-synced.

Spec: `docs/superpowers/specs/2026-09-15-pwr-restyle-design.md` · Plan: `docs/superpowers/plans/2026-09-15-pwr-restyle.md`

## Verification

- `globals-css-tokens.test.ts`: 38 assertions — every `--pwr-*` hex, every alias, `@theme` exposure, font stacks, pattern rules, DESIGN.md ↔ `:root` parity, #622 guard.
- RTL tests for `Masthead` and `SectionHeader`.
- Headless Chromium computed styles: body `rgb(255,255,255)`, masthead/button/card rule `rgb(154,52,45)`, headline `Tenor Sans`, `em` upright.
- design-sync: 187/187 previews render clean; 46 authored previews re-graded on the new palette.
- jest full suite, `npm run validate`.

Closes #629
EOF
```

- [ ] **Step 4: Watch CI, merge on green**

```bash
gh pr checks <n> --required
gh pr merge <n> --merge --delete-branch
```
