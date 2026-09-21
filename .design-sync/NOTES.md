# design-sync notes — juddges-app

Repo-specific gotchas for the claude.ai/design sync. Project: `JuDDGES Design System`
(`projectId` in config.json). First sync 2026-09-15.

## Shape and build

- The frontend is a Next.js app, not a published package: no `dist/`, no `.d.ts`.
  `cfg.buildCmd` (`node .design-sync/build.mjs`) materialises `frontend/.ds-pkg/`
  (gitignored) — entry re-exporting `components/editorial` + `components/ui/*.tsx`,
  `tsc --emitDeclarationOnly` declarations, and a Tailwind 4 compile
  of `.design-sync/tailwind.css` into `dist/styles.css`. Run it before the converter.
- Converter invocation (from repo root):
  `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules frontend/node_modules --entry frontend/.ds-pkg/dist/index.js --out ./ds-bundle`
- `.ds-sync/` needs `esbuild ts-morph @types/react typescript @tailwindcss/cli playwright@<frontend playwright-core version>`.
  `@tailwindcss/cli` must match `frontend/node_modules/tailwindcss` (4.3.3 at first sync).
  `package-validate.mjs` imports `playwright` from `.ds-sync/node_modules`; chromium cache lives at `/mnt/ai-data/.cache/ms-playwright` (chromium-1243 for playwright 1.63).
- `next/link` and `next/image` are shimmed to `<a>`/`<img>` for the esbuild bundle via
  `.design-sync/tsconfig.json` paths (`cfg.tsconfig`). tsc uses the real `next` types
  (rootDir forbids the shims) — keep the two tsconfigs separate.
- `components/ui/logo.tsx` is excluded from the entry (renders an app-relative brand
  asset through next/image; also the converter's tsconfig-paths plugin resolves
  `@/lib/brand` to the directory before `index.ts`). `ui/skeletons/` ships via its
  barrel since #657 (it was excluded while `skeleton-card.tsx` exported a duplicate
  `SkeletonCard`; #635 deleted that file). Star re-exports drop ambiguous names silently,
  so a new `ui/*` export must not reuse `SkeletonCard`/`SkeletonText` (the barrel) or
  `Skeleton` (`ui/skeleton.tsx`). The
  nested dir makes the converter group them as `skeletons` (last non-generic path segment).
- `srcDir: ../components` (relative to `.ds-pkg`) gives JSDoc + grouping; `ui` is a
  generic dir name so shadcn primitives land in group `general`, editorial in `editorial`.
- shadcn sub-parts (`CardHeader`, `DialogTitle`, …) are flat exports, not `Card.Header`,
  so the converter treats all exports (187 at #629, 162 after #645, 168 after #657) as roots — most ship the floor card by design.

## Fonts

- `next/font` sets `--font-geist-sans/--font-geist-mono/--font-tenor-sans` at
  runtime; the bundle defines them in `.design-sync/tailwind.css` `:root` and ships
  `@font-face` via `cfg.extraFonts` → `.design-sync/fonts.css`. Geist from
  `frontend/app/fonts/*.woff`; Tenor Sans (SIL OFL 1.1, Google Fonts, latin + latin-ext,
  single weight 400, no italic) committed under `.design-sync/fonts/` as
  `TenorSans-Regular-{latin,latin-ext}.woff2` — the open substitute for the PWr
  identity face (Zapf Humanist / Optima), see #629.

## Known render warns (validate)

- `[FONT_MISSING] "JetBrains Mono", Optima, "URW Classico", "Gill Sans"` — these are the app's own
  *fallback* families in `--font-mono` / `--font-serif` stacks, never shipped by the
  app either. Accepted; nothing to source.
- `tokens: 1 missing, below threshold` — informational.

## Re-sync risks

- Tailwind compile scans all of `frontend/` (cwd) — utilities present in the bundle
  track what the app uses plus the `@source inline(...)` safelists in
  `.design-sync/tailwind.css`. A design-agent utility the app never uses is silently
  absent; extend the safelist rather than the app. Consequence: a peer PR landing
  mid-resync can move `styleSha` without touching a DS component — after every
  `git merge origin/main` rebuild + compare, and re-push styling + sidecar if it moved
  (the driver then anchors no-change and skips render; `--render-sample 0` forces it).
- `frontend/package.json` `version` becomes the DS version in README.
- Tenor Sans files are vendored; if the app switches faces, update
  `.design-sync/fonts.css` + `tailwind.css` `:root` vars.
- Grades follow the preview `.tsx`, not the CSS (driver keys on `sourceKeys`; a `styleSha`
  change alone keeps grades). A CSS-only change that could move a preview is not re-graded
  automatically — spot-check explicitly:
  `node .ds-sync/package-capture.mjs --out ./ds-bundle --components Button,Alert,Badge,Skeleton,Stat --spot-check-components Button,Alert,Badge,Skeleton,Stat`
- `guidelines/DESIGN.md` (= `docs/reference/DESIGN.md`) §4 lists 12 of the 15 editorial
  primitives (missing `ChartFigure`, `DualStatCard`, `Section`) and calls `EditorialButton`
  "primary or outline" (actual `primary|secondary|ghost`). Docs drift, fix in the repo doc.
- Converter version staged in `.ds-sync/` is copied from the bundled skill each run;
  a stale copy runs an old converter.

## Capture harness gotchas

- `package-capture.mjs` pins the page clock (`page.clock.setFixedTime`), so framer-motion
  `initial={{opacity:0}}` wrappers never settle — `Stat` (and anything composing it)
  screenshots blank. Previews wrap such cells in a scoped
  `.ds-stat-settled [style*="opacity"]{opacity:1!important;transform:none!important}` style.
  Not a component bug; the live product animates normally.
- `SectionHeader`/`Section` place the numeral watermark at `-top-10`; previews add
  `style={{paddingTop:56}}` so it isn't clipped inside a card.
- Missing Tailwind utilities fail silently. Spacing/layout/type scales are now
  force-generated by `@source inline(...)` in `.design-sync/tailwind.css`; extend there.

## App bug surfaced by the sync (not fixed here)

- `frontend/app/globals.css` lines ~979, 1111, 1135, 1145, 1155, 1351 use
  `oklch(var(--muted) / 0.3)`; `--muted` is already a full `oklch(...)` colour, so the
  declaration is invalid and dropped. Combined with the "flatten decorative gradients"
  rule (~1103) that kills `bg-gradient-*`, every Skeleton (`Skeleton`, `SidebarMenuSkeleton`,
  `SkeletonExtractionCard`, `SkeletonSearch`) renders fully transparent — in the app
  too (verified in headless Chromium). Fix in the app: `color-mix(in oklab, var(--muted) 30%, transparent)`.
  Those four previews graded `needs-work` on 2026-09-15 (faithful, not hacked). Fixed in #622 / synced via #627; `SkeletonExtractionCard` and `SkeletonSearch` were later deleted with `skeleton-card.tsx` in #635 (resynced in #653).

## Preview-authoring conventions used

- Overlay components (`Dialog`, `Tooltip`, `DropdownMenu`) render `open` and use
  `cfg.overrides.<Name> = {cardMode:"single", viewport:"900x700"}`.
- `Select` shows the closed trigger with `defaultValue` (items kept in the tree so the
  label resolves); the open list portals outside the card.
- `SidebarInput`/`SidebarMenuSkeleton` are composed in `SidebarProvider` + `Sidebar collapsible="none"`.
- Card page ground in the generated html is white, not parchment; `Loader secondary`
  is a dark-surface variant and is shown on an oxblood panel.
- Emitted `.d.ts` drop React/DOM-inherited props by converter design (`Input` shows no
  `placeholder`/`disabled`); runtime accepts them — the design agent should treat
  `Input`/`Textarea`/`Button` as their native elements.
