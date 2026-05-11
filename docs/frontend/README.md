# Frontend Documentation

Persistent frontend documentation for the Juddges App.

## Documents

- [styling-guide/](./styling-guide/) — legacy "Legal Glass 2.0" styling notes. The canonical design system is **Editorial Jurisprudence** — see [`../reference/DESIGN.md`](../reference/DESIGN.md) and the shared primitives in `frontend/components/editorial/`.

Dated planning artifacts (Feb 2026 UX/UI review, testing strategy roadmap, component implementation templates) were archived to `.context/`:

- `.context/ux-ui-review.md`
- `.context/plans/frontend-testing-strategy.md`
- `.context/plans/component-implementation-guide.md`

## Tech stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 19, Radix UI primitives, Tailwind CSS 4
- **State**: Zustand (UI) + React Query (server state)
- **Forms**: React Hook Form + Zod
- **Rich text**: TipTap
- **Testing**: Jest + React Testing Library + Playwright

## Design system

**Editorial Jurisprudence** — full spec in [`../reference/DESIGN.md`](../reference/DESIGN.md). Use shared primitives in `frontend/components/editorial/` (re-exported from `@/components/editorial`). Do **not** introduce new glassmorphism cards, purple gradients, or `bg-{indigo,purple,violet}-100` icon-pill motifs.

Canonical raw colour tokens live in `frontend/app/globals.css` (`--parchment`, `--ink`, `--oxblood`, `--gold`, …).

## Dev workflow

```bash
cd frontend
npm run dev          # dev server on :3026 (Turbopack)
npm run validate     # lint + type checks
npm run test         # unit
npm run test:e2e     # Playwright
```

## Responsive breakpoints

```css
sm: 640px   /* mobile landscape */
md: 768px   /* tablet */
lg: 1024px  /* desktop */
xl: 1280px  /* large desktop */
2xl: 1536px /* extra large */
```

## See also

- [Setup Guide](../getting-started/setup-guide.md)
- [Testing](../testing/TESTING.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [API Reference](../api/API_REFERENCE.md)
