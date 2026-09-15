# PWr restyle of the design system — design spec

> **Status:** approved for planning · **Date:** 2026-09-15 · **Issue:** #629 · **Owner:** frontend

Move *Editorial Jurisprudence* onto the visual identity of Politechnika
Wrocławska as defined in the university's *System Identyfikacji Wizualnej*
(SIW, edition 2025-12, downloaded from <https://pwr.edu.pl/kontakt/logotyp>).
Palette, typeface and shapes change; the editorial framework (eyebrows, rules,
drop caps, numerals, sharp corners) stays.

## 1. Goals and non-goals

**Goals**

- The app reads as a PWr product: Pantone 484 red, sand, black, white paper,
  grey panels, humanist sans display type, red bars and square numerals.
- Zero churn in the ~880 existing token usages: new `--pwr-*` tokens are the
  source of truth, old names become aliases.
- Docs, `CLAUDE.md`, design-sync inputs and the claude.ai/design project all
  reflect the new identity after one PR + one re-sync.

**Non-goals**

- Using the PWr logotype (emblem + wordmark + underline). SIW requires written
  permission from logotyp@pwr.edu.pl; none was obtained. The spec forbids it
  explicitly so nobody adds the emblem "for completeness".
- Migrating call sites from `oxblood`/`parchment`/… to `pwr-*` (separate issue).
- Faculty colours (W1–W14N), #626 (gradient-button specificity), dark mode.

## 2. Source facts (SIW 2025-12)

| SIW element | Value | Page |
|---|---|---|
| Pantone 484 (main red) | C0 M95 Y100 K29 · `#9A342D` | 16 |
| Pantone 156 (sand) | C0 M22 Y42 K0 · `#F1D1A2` | 16 |
| Black | K100 · `#000000` | 16 |
| Pantone 873 (gold, metallic) | no RGB/hex given | 16 |
| Base typeface | Zapf Humanist Normal (= Optima); documents: Times, Garamond, Arial, Calibri | 28 |
| Emblem geometry | eagle in an open compass, inscribed in a 10A × 10A square; wordmark with a horizontal underline; no element used separately | 7–8 |
| Document furniture | full-width red header bar with white title, red square page-number block, grey `#EFEFEF` info panels on white | 5–8 |

Derived values (not in SIW, documented as ours): red hover `#7E2A25`,
secondary grey text `#5A5A5A`, hairlines `#D9D9D9` / `#9A9A9A`, web
approximation of Pantone 873 `#B49A5E`.

## 3. Tokens

`frontend/app/globals.css` `:root` gains a PWr layer; the existing editorial
names become aliases so every current class keeps working.

```css
:root {
  /* PWr identity — source of truth (SIW 2025-12) */
  --pwr-red: #9A342D;         /* Pantone 484 */
  --pwr-red-deep: #7E2A25;    /* derived hover */
  --pwr-sand: #F1D1A2;        /* Pantone 156 */
  --pwr-gold: #B49A5E;        /* Pantone 873, web approximation */
  --pwr-black: #000000;       /* K100 */
  --pwr-grey: #5A5A5A;        /* derived, secondary text */
  --pwr-paper: #FFFFFF;
  --pwr-panel: #EFEFEF;       /* SIW info panel */
  --pwr-line: #D9D9D9;
  --pwr-line-strong: #9A9A9A;

  /* Editorial aliases — keep existing utilities alive */
  --parchment: var(--pwr-paper);
  --parchment-deep: var(--pwr-panel);
  --ink: var(--pwr-black);
  --ink-soft: var(--pwr-grey);
  --rule: var(--pwr-line);
  --rule-strong: var(--pwr-line-strong);
  --oxblood: var(--pwr-red);
  --oxblood-deep: var(--pwr-red-deep);
  --gold: var(--pwr-gold);
  --gold-soft: var(--pwr-sand);
}
```

- Semantic tokens (`--background`, `--foreground`, `--primary`, `--muted`,
  `--border`, …) already point at the editorial names and need no edit. Any
  semantic token that today holds a literal oklch value tuned to parchment
  (e.g. `--muted: oklch(0.93 0.015 82)`) is re-pointed at a `--pwr-*` token.
- `@theme inline` adds `--color-pwr-red`, `--color-pwr-red-deep`,
  `--color-pwr-sand`, `--color-pwr-gold`, `--color-pwr-black`,
  `--color-pwr-grey`, `--color-pwr-paper`, `--color-pwr-panel`,
  `--color-pwr-line`, `--color-pwr-line-strong` → utilities `bg-pwr-red`,
  `text-pwr-grey`, `border-pwr-line`, ….
- New code uses `pwr-*` names. Old names are documented as aliases, not
  deprecated yet.

## 4. Typography

- `frontend/app/layout.tsx`: replace `Instrument_Serif` with
  `Tenor_Sans({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-tenor-sans" })`.
- `globals.css`: `--font-display: var(--font-tenor-sans), Optima, "URW Classico", "Gill Sans", sans-serif;`
  and `--font-serif: var(--font-display);` so `font-serif`, `.editorial-display`,
  `Headline`, `DropCap` switch without component edits. `--font-sans` (Geist)
  and `--font-mono` (Geist Mono) unchanged.
- Tenor Sans ships one weight and no italic. `.editorial-display em/i` becomes
  `font-style: normal; color: var(--pwr-red)`. `letter-spacing: -0.025em` on
  `.editorial-display` becomes `0` (flared humanist forms need air).
- `DropCap` initial: Tenor Sans, `--pwr-red`, upright.

## 5. Shapes and patterns

| Pattern | Spec |
|---|---|
| **Red bar** `.pwr-bar` | `background: var(--pwr-red); color: #fff; font-family: var(--font-display); padding: 0.5rem 1.25rem; border-radius: 0`. Used by `Masthead` and `SectionHeader variant="bar"`. |
| **Nameplate underline** | `Masthead`: 1 px `--pwr-black` line under the nameplate row, full width of the nameplate (SIW's "pozioma linia podkreślająca"). Inside a red bar the line is white. |
| **Square numeral** | `SectionHeader` numeral: `--pwr-red` square, white Tenor Sans digit, `1.75rem` side, no radius (SIW page-number block). |
| **Grey panel** | `EditorialCard flat`, `bg-parchment-deep`, `--muted` all resolve to `#EFEFEF`. — *Implementation note (2026-09-15): `EditorialCard flat` renders a white bordered card in code; the docs follow the code, grey panels come from `bg-pwr-panel` / `PaperBackground deep`.* |
| **Card rule** | `.editorial-card`: `border-top: 2px solid var(--pwr-red)`, hover `border-top-color: var(--pwr-black)` (inverse of today). Body border `1px solid var(--pwr-line)`. |
| **Eyebrow** | leading hairline `--pwr-red` instead of gold; text `--pwr-grey`. |
| **Buttons** | `.editorial-button-primary` fill `--pwr-red`, hover `--pwr-red-deep`, text white; `.editorial-button-secondary` `1px solid var(--pwr-black)`, text black, hover fill black/text white; ghost unchanged. |
| **Paper grain** | `.editorial-paper` loses the radial gradients and the `::before` noise; `.app-noise-overlay` emptied. `PaperBackground` keeps the `grain` prop as a documented no-op so previews and the DS `.d.ts` stay valid. |
| **Corners** | 0 px everywhere; `QueryPill`/`Badge` pills remain the only rounded elements. |
| **Shadows** | none (unchanged). |

## 6. Components touched

| File | Change |
|---|---|
| `frontend/app/globals.css` | tokens (§3), fonts (§4), `.pwr-bar`, `.editorial-*` edits (§5) |
| `frontend/app/layout.tsx` | Tenor Sans font loading |
| `frontend/components/editorial/Masthead.tsx` | red bar background, white text, `meta` in `--pwr-sand`, underline |
| `frontend/components/editorial/SectionHeader.tsx` | square numeral; new prop `variant?: "default" \| "bar"` |
| `frontend/components/editorial/PaperBackground.tsx` | `grain` no-op + JSDoc note |
| `frontend/components/ui/*` | untouched — inherit via semantic tokens |
| `.design-sync/previews/Masthead.tsx`, `SectionHeader.tsx` | add a `Bar` cell |

## 7. Documentation and design-sync

- `docs/reference/DESIGN.md` rewritten: title "Editorial Jurisprudence — PWr
  edition", §2 palette as Pantone / hex / token / alias table with the SIW
  source, §3 typography Tenor Sans, new §"Patterns" (bar, square numeral,
  panel, underline), primitives list corrected to all 15 (`ChartFigure`,
  `DualStatCard`, `Section` added; `EditorialButton` variants
  `primary|secondary|ghost`), explicit "no PWr logotype" rule with the reason.
- `CLAUDE.md` design section: token table → `pwr-*` with aliases; typography line.
- `.design-sync/fonts.css`: Tenor Sans latin + latin-ext woff2 vendored to
  `.design-sync/fonts/` (Google Fonts, OFL); Instrument Serif `@font-face`
  and files removed. `tailwind.css` `:root` sets `--font-tenor-sans: "Tenor Sans"`;
  `@source inline` safelist extended with `{bg,text,border,hover:bg,hover:text}-pwr-{red,red-deep,sand,gold,black,grey,paper,panel,line,line-strong}`.
- `.design-sync/conventions.md`: token table → PWr names, red-bar pattern,
  "never place the PWr emblem" rule.
- `.design-sync/NOTES.md`: font vendoring note updated.
- Re-sync: `node .ds-sync/resync.mjs --remote …`. `styleSha` changes, so every
  authored preview (46) is re-captured and re-graded from its sheet — no
  carry-forward on a palette change. Atomic upload (project pinned, non-empty),
  `_ds_sync.json` last.

## 8. Verification

- **Unit (jest):** extend `frontend/tests/unit/app/globals-css-tokens.test.ts`:
  every `--pwr-*` row in `DESIGN.md` §2 exists in `globals.css` `:root` with the
  same hex; every editorial alias resolves to a `--pwr-*` var; the `oklch(var(--…))`
  guard from #622 stays.
- **Computed styles (headless Chromium, design-sync bundle):** `Headline`
  `font-family` contains "Tenor Sans"; `Masthead` background `rgb(154, 52, 45)`;
  `.editorial-display em` `font-style: normal`; `EditorialCard` `border-top-color`
  `rgb(154, 52, 45)`; body background `rgb(255, 255, 255)`.
- **Suites:** `npm run validate`, jest (195 suites), route-contract E2E in CI.
- **Visual:** design-sync review sheets for Masthead, SectionHeader, Headline,
  EditorialCard, EditorialButton, DropCap, Eyebrow, Stat; screenshots of `/`
  and `/search` from local `next dev`.

## 9. Risks

- Tenor Sans single weight: headings that relied on italic emphasis read
  flatter; mitigated by colour emphasis and size hierarchy. Revisit if it
  looks weak on the sheets.
- White paper exposes any component still hard-coding parchment-ish oklch
  literals; the jest alias test plus the sheets catch them.
- `--muted` on white: `#EFEFEF` is the SIW panel grey; skeletons (#622) stay
  visible.
