# AI-slop removal plan — finish the Editorial migration

> **Status:** active · **Date:** 2026-09-15 · **Epic:** #637 · **Phases:** #638 → #639 → #640 → #641 → #642
> Spec: [`docs/reference/DESIGN.md`](../reference/DESIGN.md). Review method: five read-only cluster reviews of `frontend/`, every "0 importers" and top-ranked claim re-verified by grep in the main thread. Importer greps covered `app components lib hooks` — **not** `tests/` / `__tests__/`; extend before deleting anything.

## 1. Summary

`frontend/` runs two design systems. Editorial Jurisprudence (adopted 2026-05-07) is imported by 13 files and is clean on its two reference surfaces (`app/page.tsx`, `components/landing/LandingPage.tsx` — zero CSS drift). Everything else still renders the pre-editorial "Legal Glassmorphism 2.0" layer in `lib/styles/components/` plus shadcn defaults in `components/ui/`.

Three facts decide the order of work:

1. **Gradients are already neutralised, not visible.** `app/globals.css:1102–1157` (commit `d12b3097`) applies `background-image: none !important` to every `bg-gradient-*`, `bg-clip-text text-transparent` and inline `gradient(`. ~240 gradient classes are dead weight. Remove the kill-switch **last** (#642) — earlier and every gradient reappears.
2. **The leverage layer is `lib/styles/components/`, not `components/ui/`.** Barrel `index.ts`: 135 exports, 55 used, 106 importing files, 21,118 LOC under `lib/styles/`. Six files feed ~150 call sites (§4). `page-container.tsx` → `.glass-page-background` hard-codes `#f8f7f4` on 41 pages.
3. **~6,700 LOC is dead** (0 importers, verified) after #635 already removed ~1,900 LOC of it.

What is visible today: `backdrop-blur` glass (132+ hits in `app`+`components`, more in `lib`), 16–24 px and `rounded-xl` radii (`--radius-xl` = 6 px escapes the 0–2 px rule), pastel `bg-{hue}-100` icon pills (187), `transition-all` (146), scale / `shadow-xl` hovers, Sparkles / Wand2 / Zap "AI" glyphs (52+), infinite motion (sidebar shimmer, logo ping, three `TypingHeader` variants, `FieldCard` 3 s pulse), sans `font-bold` headings where serif `Headline` is specified, 11 emoji icons, marketing copy. Initial counts over `app components` **undercount** because they skipped `lib/`.

## 2. Phases

| # | Issue | Scope | Files | Visual risk |
|---|---|---|---|---|
| 0 | #638 | Delete dead files + dead CSS; land `assert-no-banned-classes.js` as a ratchet in `npm run validate` | ~45 | none |
| 1 | #639 | Leverage layer: 6 lib primitives, `ui/button`, `ui/card`, `ui/sidebar`, `ui/logo`, `ui/command`; `.glass-page-background` → parchment; tinted shadow tokens; motion tokens; radius ruling; base `h1–h4` | ~12 | app-wide, intended |
| 2 | #640 | Shared semantics: status map, `FIELD_TYPE_MARKERS`, `EditorialCardSkeleton`, chart palette → `editorial-plot.ts` + `ChartFigure`, `AIBadge` as single AI marker, shared pagination | ~30 | localised |
| 3 | #641 | Per-surface long tail, one PR per surface | ~20 | per surface |
| 4 | #642 | Remove kill-switch, hard-fail lint, extend DESIGN.md | 3 | — |

Done before this plan: #634 / #635 — dashboard ×6, `auth/{AuthBanner,ConversionCTA}`, `VersionHistory`, `ui/skeleton-card`, footer trust badges, `glass-tabs`, `SchemaFilters`, `ViewModeToggle`.

## 3. Phase 0 — dead code (#638)

| Path | Note |
|---|---|
| `components/landing/{HeroSection,FeatureShowcase,ServicesGrid,ValuePropCard,CaseStudyCard,PricingSection,SecuritySection,DeploymentOptions,FAQSection,ContactSection,StatsGrid}.tsx` (~1,450 LOC) | `LandingPage.tsx:126` defines its own local `HeroSection` |
| `components/chat/{LoadingMessage,StreamingMessage,SourceCard,SourcesBadge}.tsx`; trim `chat/index.ts` (0 barrel consumers); dead imports `MessageSources.tsx:6-7` | `LoadingMessage`: emoji icons, 3 infinite orbit/dot animations; `SourceCard` imported but never rendered; `SourcesBadge` import commented `// DISABLED` |
| `components/current-user-avatar.tsx` | |
| `components/schema-chat/{SchemaChat,SchemaTestRunner}.tsx`, `components/schemas/{SchemaVersionHistory,SchemaFieldCard}.tsx`, `components/ExtractionProgress.tsx` (1,748 LOC) | superseded by `schema-studio/ChatPane`, `versions/VersionsTab`, `lib/…/schema-field-card`; the only `ui/card` users in that cluster |
| `components/similarity-viz/*`, `lib/hooks/{useGraphData,useNodeInteractions}.ts` + `__tests__` | only `index.ts` self re-export; hooks used only by their tests |
| `components/ui/toast/*` (`ToastProvider` never mounted), `ui/skeletons/*`, `ui/index.ts`, `ui/empty-state.tsx` (dup of lib `EmptyState`), `ui/{chart,pagination,data-table,date-range-picker}.tsx` | lib/styles has its own Pagination / DataTable / DateRangePicker |
| `lib/styles/components/search/SearchConfiguration.tsx` | only `glass-card` user; barrel-only export |
| `lib/styles/components/index.ts` | 80 of 135 exports have 0 consumers — trim, then 0-importer sweep of orphaned files |
| `app/globals.css` (~330 lines) | `.app-noise-overlay` (551–558), `.glass-card*` `.neo-chip*` (560–643), `.glass-search-input` (645–668), `.glass-button*` (670–772), `.example-card` (775–784), `shuffle-*` / `progress-shimmer` / `pulse-ring` keyframes + classes (849–905, 992–1010), `dropdown-enter/exit` (919–937), `.heading-serif .label-caps .text-legal .text-case-number .text-display .text-legal-dense .text-legal-expanded` (252–291), orphan RTL selectors in 1159–1342 (keep 1167–1192, 1201–1203, 1229–1271, 1328–1331; `html{transition:direction}` is not animatable), `.editorial-rule` (385–389; `Rule.tsx` inlines) |

### Banned-class ratchet

`frontend/scripts/assert-no-banned-classes.js`, wired into `npm run validate` (= CI `Frontend Lint`, `.github/workflows/ci.yml:253`). Precedent: `scripts/assert-retired-routes-absent.js`. Ratchet: committed per-pattern baseline in `scripts/banned-classes.baseline.json`; fail if any count rises; each later PR lowers it; #642 switches to hard-fail.

Patterns over `app components lib hooks` (`*.tsx *.ts *.css`; allowlist `components/editorial/**`, `components/ui/skeleton.tsx`):

```
backdrop-blur|glass-|bg-gradient-to-|bg-linear-to-|bg-clip-text
(bg|text|border|from|to|via|ring)-(purple|indigo|violet|fuchsia|blue|sky|cyan|teal|emerald|green|amber|orange|rose|pink|slate|gray)-\d
transition-all
rounded-(xl|2xl|3xl|\[\d+px\]|\[[\d.]+rem\])
hover:scale-|shadow-(xl|2xl)|animate-(ping|bounce|shimmer)
\bSparkles\b|\bWand2\b|repeat:\s*Infinity
```

Gate: `npm run typecheck && npm run test && npm run build`, `npm run test:e2e:route-contract`.

## 4. Phase 1 — leverage layer (#639)

### `lib/styles/components/`

| File | Consumers | Tell → change |
|---|---|---|
| `base-card.tsx:80+` | 25 | `rounded-[24px]`, `backdrop-blur-[32px] backdrop-saturate-[200%]`, `hover:scale-[1.04] hover:-translate-y-1.5`, blue glow `rgba(59,130,246,…)` → thin wrapper over `EditorialCard`: 0 radius, `border border-rule`, ink top rule, `hover:-translate-y-px` |
| `button-variants.ts:46-49,156` | 42 (`VariantButton`) | blue→indigo gradient primary + blur → primary `bg-oxblood text-parchment hover:bg-oxblood-deep`, secondary `border-ink` |
| `badge.tsx:61`, `badges.ts:25-27` | 33 | `backdrop-blur-sm` ×10, `transition-all`, gradient → drop |
| `error-card.tsx:115-173` | 25 | blur + 6 red/rose gradients → `EditorialCard` + `border-l-2 border-oxblood` |
| `empty-state.tsx:153-188` | 16 | gradient glow, gradient-text `to-purple-500` → flat parchment, 16 px ink icon, serif `Headline` |
| `loading-indicator.tsx:142-190` | 16 | blur-xl glow rings → `animate-pulse` skeleton or plain ink `Loader2` |
| `light-card.tsx:106`, `headers.ts:152` | 13 / 12 | blur, 6 gradients → drop |
| `page-container.tsx` → `.glass-page-background` | 41 pages | hard-coded `#f8f7f4` → `bg-background`; delete rule |
| `ai-badge.tsx` | 5 | `before:bg-gradient-to-r` + royal-blue Sparkles → single AI-provenance marker: gold ✦ + mono "AI" eyebrow |
| `juddges-logo.tsx:56-66` | 1 | `showGlow` default → false; drop `text-shimmer` |

### `components/ui/`

- `button.tsx:8` `transition-all duration-200 ease-out active:scale-[0.98]` → `transition-[color,background-color,border-color,box-shadow,transform]`; `:13,15,17,19` drop `hover:shadow-md`, keep `hover:-translate-y-px` (63 importers, 0 re-add these classes).
- `card.tsx:10` `rounded-xl shadow-sm` → `rounded-none border-t-2 border-t-ink`; `:35` `CardTitle` `font-serif font-normal` (30 importers / 66 sites; 60 inherit base).
- `sidebar.tsx:239` gradient (collapsible=none), `:327` `bg-[rgba(255,255,255,0.65)] backdrop-blur-[50px]`, `:366` trigger scale/shadow, `:593,813` `rounded-[0.75rem]`, `:814` `hover:scale-[1.04]` + 8 empty `hover:` / `data-[active=true]:` modifier tokens (bug); fold `globals.css:1419-1492` `!important` stroke rules into cva.
- `logo.tsx:94-95` blue→purple pulse/ping glow dot, `:106` `text-shimmer` → `text-ink font-serif` (duplicate of lib `juddges-logo`).
- `command.tsx:25-166` gradient / `shadow-2xl` / `scale-110` → `border-rule bg-parchment`, `data-[selected]:bg-gold-soft`, `transition-colors`.
- `progress.tsx:24`, `accordion.tsx:38` `transition-all` → explicit properties.

### `app/globals.css` tokens

Shadows (`89–96`) are all `hsl(0 0% 0%)` untinted; `--shadow-2xl` is single-layer and lighter than `xl`. Replace with an ink-tinted, layered set, one light source, capped at `lg` (DESIGN.md forbids `xl`/`2xl` on cards):

```css
--shadow-ink: 0.18 0.020 280;
--shadow-2xs: 0 1px 1px oklch(var(--shadow-ink) / 0.05);
--shadow-xs:  0 1px 2px oklch(var(--shadow-ink) / 0.06);
--shadow-sm:  0 1px 2px oklch(var(--shadow-ink) / 0.06), 0 2px 6px  -2px oklch(var(--shadow-ink) / 0.06);
--shadow:     var(--shadow-sm);
--shadow-md:  0 1px 2px oklch(var(--shadow-ink) / 0.07), 0 4px 12px -4px oklch(var(--shadow-ink) / 0.10);
--shadow-lg:  0 1px 2px oklch(var(--shadow-ink) / 0.08), 0 10px 24px -8px oklch(var(--shadow-ink) / 0.14);
--shadow-xl:  var(--shadow-lg);
--shadow-2xl: var(--shadow-lg);
```

Motion tokens — none exist today (`--ease-*`, `--duration-*`: 0 hits). Add to `@theme inline`:

```css
--default-transition-duration: 180ms;              /* overrides Tailwind 150ms for every transition-* */
--default-transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
--ease-out-editorial: cubic-bezier(0.22, 1, 0.36, 1);
--ease-stat: cubic-bezier(0.33, 1, 0.68, 1);
--duration-hover: 180ms; --duration-reveal: 600ms; --duration-stat: 1800ms;
```

Keep the reduced-motion block (`1083–1100`). Delete `shimmer-slide` / `text-shimmer` keyframes once their four users are fixed (`ui/logo.tsx:106`, `app-sidebar.tsx:137,212`, `juddges-logo.tsx:66`).

Radius: `--radius` = `0.125rem`, so `rounded-md`/`rounded-lg` resolve to 0–2 px (compliant) but `--radius-xl` = 6 px escapes. Set `--radius-xl: var(--radius)`; `rounded-2xl/3xl/[16px]/[24px]` stay lint-banned.

Base `h1–h4` (`222–244`) are sans `font-bold line-height:0.95` — contradicts serif `Headline`. Decide the un-classed default and record it in DESIGN.md.

## 5. Phase 2 — shared semantics (#640)

1. **Status map** — ink = ok/active/completed, gold = warn/pending/processing, oxblood = error/failed/deleted; text + `border-rule` pill, no tinted background. Replaces ≥3 disagreeing green/blue/red/yellow/amber maps: `app/extractions/page.tsx:52-63`, `ExtractionJobClient.tsx:78-80,464`, `ExtractionJobCard.tsx:22-52`, `BulkExtractionDialog.tsx:240-327`, `VersionsTab.tsx:57-64,289`, `extraction-results-table.tsx:76-102`, `reasoning-lines/page.tsx:749-775`, `reasoning-lines/[id]/page.tsx:198-206,592-679`, `precedents/page.tsx:36-38`, `app/admin/**` health pills ×8, `settings/page.tsx:52-62`, `components/status/StatusBadge.tsx:18-37` (11 importers), `components/legal/ai-disclaimer.tsx:18-68` (amber ×9, 13 importers), `blog-post-card.tsx:42-45`, `publication-card.tsx:36-46`.
2. **`FIELD_TYPE_MARKERS`** — one `Record<FieldType, { icon, label }>` beside the canonical `FieldType` in `types/schema-editor.ts`; 14 px ink icon + mono label, outline, no fill. Replaces five disagreeing maps: `components/schemas/SchemaFieldsTable.tsx:76-138` (30 hits — top file in repo), `lib/styles/components/schema-preview.tsx:35`, `components/schema-studio/types.ts:100`, `types/schema-editor.ts:943`, `lib/schema-editor/rjsf/rjsf-config.ts:449`; plus `FieldCard.tsx:300-303 TYPE_COLORS` (`visual_metadata.color` is read but never written). `text-gold` reserved for AI-created.
3. **`EditorialCardSkeleton`** — built on `ui/skeleton.tsx` (`animate-pulse rounded-md bg-muted`, compliant). Replaces three byte-identical gradient-shimmer copies: `CollectionLoadingSkeleton.tsx:12-67` (22 gradient bars; renders a banner the real page lacks, wrong grid cols, wrong radius), `DocumentsCardGrid.tsx:149-173`, `app/collections/page.tsx:279-308`; plus `search-page-skeleton.tsx:32-105` (rounded-3xl glass wrapper), `app/blog/page.tsx:369`.
4. **Chart palette** — use existing `lib/charts/editorial-plot.ts` (`editorialPalette`, `editorialCategorical`) + `<ChartFigure>`: `ReasoningDAG.tsx:32-44` (nodes active=oxblood, merged=ink, dormant=gold, superseded=hollow; edges add a dash channel — branch solid oxblood, merge solid ink, influence dashed ink-soft, drift dotted gold; drop `ctx.shadowColor`; legend `:291` → mono `Eyebrow`), `DriftChart.tsx:41-184`, `OutcomeTimeline.tsx:27-62`, `JudgeRadarChart.tsx:19-21`, `reasoning-lines/page.tsx:63-83 CLUSTER_COLORS` (20 pastel pairs → 6 colours × solid/dashed/hollow).
5. **Shared controls** — `EditorialPagination` (`DocumentsCardGrid.tsx:206-270` ≡ `collections/page.tsx:674-728`); `AIBadge` single home — keep semantic Sparkles at `FieldCard:448`, `FieldEditor:262`, `VersionsTab:46` (restyled); delete decorative Sparkles/Wand2/Zap at `extractions/page:409,454`, `BulkExtractionDialog:374,400`, `ExtractionConfigPanel:123,211`, `ChatPane:237`, `SchemaGenerator:311,417`, `extract/page:67,153`, `NlFilterDialog:13,126`, `blog/page:260,264`, `post-editor` ×4, `blog-post-card:82,204`, `navbar:307,314,330`, `about:33`, `precedents:5,394`, `reasoning-lines:938`, `LandingPage:478`, `embedding-models-section:127`, `login-form-enhanced:159`.

## 6. Phase 3 — long tail by surface (#641)

Line refs will drift after #638–#640; treat as anchors.

- **Schema studio** — `SchemaFieldsTable.tsx:490-582` glass shell / thead / rows / th scale, `:215`; `FieldEditor.tsx:254` `shadow-xl` on `DialogContent` (delete the override — §8.5 "leave Radix alone" means stop overriding), `:277-326` glass TabsList, `:356-736` `backdrop-blur-md backdrop-saturate-[180%]` ×14 inputs, `:336,542,569` BaseCard fieldsets → `<fieldset>` + Eyebrow legend; `FieldGroupDialog.tsx:137,152-190,218-391`; `FieldCard.tsx:332` 3 s pulse loop, `:349,359,475-523,604`; `SchemaCanvas.tsx:742-758` 80 px icon circle empty state, `:791-801,904`; `ChatPane.tsx:213,259,296` gradient pane + avatar circles; `SaveActions.tsx:93-96`; `SchemaDialogs.tsx:82-85,136`; `app/schema-chat/page.tsx:229,233,251-416,403,211,339`; `SchemaGenerator.tsx:319-363,255`; `CanvasPane.tsx:288`.
- **Extractions** — `app/extractions/page.tsx:425` gradient-text h1, `:60-63` per-status glow shadows, `:440,472-764`; `ExtractionJobClient.tsx:339,366,578` alert cards; `ExtractionJobCard.tsx:58-60`; `ExtractionConfigPanel.tsx:67,174,178-179`; `RecentExtractions.tsx:29`; `DocumentSelector.tsx:154`.
- **About** — `app/about/page.tsx:69-107,393-431` eight gradient stat cards → `<Stat>` / `<DualStatCard>`; `LightCard` ×5; icon pills ×6; `:277,280` flag emoji → mono "PL" / "E&W"; copy: `:51 "world-class"`, `:62 "cutting-edge"`, `:148 "innovative"`, `:210 "state-of-the-art"`, `:212 "revolutionize"`, `:237 "Empower"`, `:488 "AI-powered"`.
- **Reasoning lines + precedents** — `page.tsx:299-1065` BaseCard `rounded-[16px]` ×7, `:235-280` icon pill + sans h1 + segmented tabs, `:699,1193-1205`; `[id]/page.tsx:226,562,231-235,284-686,317`; `precedents/page.tsx:42,292,452,258,304-352,48,76`.
- **Collections + documents** — `collections/page.tsx:44-104` `TypingText` infinite cursor, `:573-579` hand-rolled glass cards, `:353` gradient DialogTitle, `:376,387` glass inputs, `:332 intent="glass"`, `:506-534`, `:394,652`; `DocumentsCardGrid.tsx:90-105` gradient error card; `DocumentsToolbar.tsx:89,105` `⏳` emoji spin, `:134-136`; `documents/[id]/_components/` — `KeyPointsPanel:49-50`, `AISummaryPanel:58-59,192`, `SummaryThesisSection:33-34` (the exact "Sparkles + pastel badge" motif ×3), `RelatedDocuments:109,132-142`, `DocumentHeader:58`; `document-metadata-view:617,215`; `collection-documents-table:141,246`.
- **Chat + search** — `app/chat/page.tsx:466-479` inline mesh gradient, `:534,544` glass tiles, `:355-358` hue category icons, `:18-76` `TypingHeader` → static `Headline`, `:526`; `ChatDetailClient.tsx:119,146,170`; `MessageSources.tsx:346-356,297,406`; `ExportChatDialog:113`; `app/search/page.tsx:406-462` "Clean Room Mesh Gradient" blur-100px blobs, `:471-474`; `ZeroResultsEmptyState.tsx:172-175` → `QueryPill`; `lib/styles/components/search/search-document-card.tsx` `rounded-xl`. **Additive:** make citations the chat signature — inline gold `<Citation n>` in assistant prose → numbered source list under a `Rule`, replacing the "N sources cited" button + generic `DocumentCard` grid (`<Citation>` exists in `components/editorial/`, 0 uses in chat).
- **Blog + publications** — `blog-post-card.tsx:81-82,103-104` gradient cover + Sparkles pulse, `:71,112-167,186,204-258`; `blog/page.tsx:452,260,264,369`; `post-editor.tsx:259-513`; `markdown-renderer.tsx:79,84,55`; `publication-card.tsx:5,78-79,105,36-46,182-216`; `publication-form.tsx:601-753,375`; `publications/admin/*:18-101`.
- **Auth + chrome** — `login-form-enhanced.tsx` (448 L; no plain `login-form.tsx` exists → rename) `:168-172` gradient side panel + dot grid, `:197-221` glass tiles + icon pills ×5, copy `:150,159-161,182-186` ("Lightning Fast", "cutting-edge AI", "AI-Powered Judgment Analysis", "Transform how you work"); `sign-up-form.tsx:144-213`; `forgot/update-password-form.tsx:12` `ui/card`; `navbar.tsx:215` `backdrop-blur-sm`, `:307,314,330` AIBadge ×3, `:587` gradient underline, `:363,380`; `app-sidebar.tsx:137,212` shimmer, `:141,216` `showGlow`, `:144,219`, `:449-455` "Legal Glass 2.0" ⌘K input; `welcome-modal.tsx:170,210`.
- **Settings + admin + misc** — `settings/page.tsx:14,427-481,178`; `embedding-models-section.tsx:127-238`; `app/admin/**` `rounded-2xl` ×12, `text-3xl font-semibold` numerals ×6 → `<Stat>`; `JudgeProfileCard:42,68-82`; `JudgeSearch:87,116`; `SaveSearchDialog:112-113`; `errors/ErrorBoundary:115-119`; `status/ServiceCard:58-66`; `legal/professional-acknowledgment:84-117`; emoji at `ChunkErrorBoundary:63,76`, `SchemaFieldsTable:529-530`, `chat-message-styles.tsx:240`.

### Keep — signature moments (DESIGN.md allows one per surface)

- `LandingPage.tsx` DropCap hero paragraph; `app/page.tsx:248` `marker="¹"` Stat with count-up.
- `globals.css:416-432` `.editorial-paper` feTurbulence grain; `caret-blink` (functional, reduced-motion guarded).
- `FieldCard.tsx:357` 3 px left type rule (reads as a ledger margin) — keep as `border-l-2` ink, oxblood when AI-created; drop the pulse and the hue.
- ReasoningDAG force canvas, recoloured with the dash channel.
- `NlFilterDialog` gold accent (drop the Sparkles glyph).

## 7. Phase 4 — kill-switch, lint, spec (#642)

1. Delete `globals.css:1102–1157` only when the ratchet reports 0 for `bg-gradient-to-|bg-linear-to-|bg-clip-text|gradient(`.
2. Switch `assert-no-banned-classes.js` to hard-fail; delete the baseline file.
3. Extend `DESIGN.md` with the sections all five reviews found missing: semantic status tokens; skeleton pattern; shadow scale + motion tokens (name `shimmer-slide` / `text-shimmer` / `ping` as forbidden); radius ruling on `rounded-xl` and arbitrary `rounded-[Npx]`; AI-provenance marker (`AIBadge` single home; Sparkles/Wand2/Zap as decoration forbidden); chat message anatomy (bubbles, streaming caret, "reading N judgments…" state, per-message numbered sources with inline `<Citation>`); categorical > 6 series via dash/hollow, canvas/Recharts hex via `editorial-plot.ts`; app chrome (sticky header blur ruling, sidebar logo, footer, ⌘K `<kbd>`); un-classed `h1–h4`; controls (pagination, segmented tabs, wizard steps, progress bar, drag state, dense TanStack table, alert/error panel, blog cover placeholder, prose heading scale, print stylesheet); and the rule **"delete, don't neutralise"** — no `:where([class*=…]) !important` kill-switches.

## 8. Verification per PR

- `npm run validate` (includes the ratchet) · `npm run test` · `npm run build` · `npm run test:e2e:smoke`; route-contract e2e for phase 0.
- PR description states banned-class counts before/after.
- Visual spot-check at 375 px and 1280 px on `/`, `/search`, `/chat`, `/schema-chat`, `/collections`, `/documents/[id]`, `/reasoning-lines` for phases 1–3.
