# prod-v1.4.0

> Release Notes for Version 1.4.0

_Written by hand on 2026-08-25 from `prod-v1.3.0..HEAD` (352 non-merge commits). The usual generator (`scripts/generate_release_notes.py`) could not run — the OpenAI key returned `429 insufficient_quota`._

## Summary

The first production build in three months. `prod-v1.3.0` was tagged on 2026-05-15; `main` had accumulated 352 non-merge commits since, none of them deployed. This release is that backlog, not a feature drop: 139 fixes, 73 test commits, 16 security commits, 20 features.

Anyone reasoning about production behaviour before this tag should assume it was running May code.

## Highlights

- **`/history` no longer 404s.** The page and its API client shipped without the Next route they call; the route is now present (#528, refs #228).
- **Accessibility.** `prefers-reduced-motion` is honoured globally, pinch-zoom is re-enabled, and mobile form controls have a 16px floor.
- **Error handling.** A root-level global error boundary, and real HTTP status codes from the dynamic detail pages instead of client-rendered empty states returning 200.
- **Search.** Analytics attributed to users, a history endpoint, topic-snapshot tooling, and Meilisearch on v1.43.
- **Dependencies.** Grouped minor/patch bumps across both stacks (#534, #535) — including `next`, `@supabase/supabase-js`, `zustand`, `@sentry/nextjs`, the TipTap suite, `litellm`, `strawberry-graphql`, `ruff`, `uvicorn`.

## Breakdown by type

| Type | Commits |
|---|---:|
| `fix` | 139 |
| `test` | 73 |
| `chore` | 58 |
| `feat` | 20 |
| `security` | 16 |
| `refactor` | 12 |
| `perf` | 11 |
| `docs` | 8 |

## Known limitations carried into this release

These are documented rather than fixed here; see `docs/reference/APP_STATUS_2026-08-21.md`.

- **Anonymous visitors still cannot search.** `/search`, `/chat` and `/documents/[id]` redirect to `/auth/login`, while the corpus itself is world-readable by policy (#510).
- **Meilisearch hybrid search remains off** — the `bge-m3` embedder is not registered on the live index (#200). Text (keyword) and Vector (pgvector) modes both work.
- **The OpenAI key has no remaining credit.** Every LLM-backed surface — chat/RAG, precedent finding, argumentation analysis, schema generation, extraction — will fail until billing is restored. This blocked release-note generation for this very tag.
- **Search results display raw document boilerplate** rather than the `base_case_name` already extracted for the whole corpus.
- **`blog_posts` and `publications` have RLS enabled with zero policies**, so those pages stay empty regardless of row count.

## Deploy

Images are on Docker Hub as `laugustyniak/juddges-frontend:1.4.0` and `laugustyniak/juddges-backend:1.4.0` (both also `:latest`).

```bash
./scripts/deploy_prod.sh 1.4.0
curl -s https://juddges.augustyniak.ai/api/health/status | jq '.version, .status'
```

Note that `/api/health/status` currently reports `version: "unknown"`; until that is wired to `VERSION`, the health endpoint cannot confirm which build is live.
