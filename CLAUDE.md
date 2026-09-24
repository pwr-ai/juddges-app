# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project Overview

Juddges App is an AI-powered judicial decision search and analysis platform for Polish and UK court judgments, built for legal case-law research with semantic search.

**Stack:**
- Frontend: Next.js 15 (App Router), React 19, Tailwind 4, Zustand, React Query
- Backend: FastAPI (Python 3.12+), Celery + Redis
- Data: Supabase (PostgreSQL + pgvector), Supabase Auth
- AI/ML: LangChain, OpenAI, Langfuse

## Repository Layout

Monorepo:
- `frontend/` — Next.js 15 app (App Router)
- `backend/` — FastAPI app; reusable sub-packages under `backend/packages/`
- `supabase/migrations/` — schema and search functions
- `scripts/` — ingestion + production build/deploy scripts
- `docs/` — Diátaxis-organized docs (`tutorials/`, `how-to/`, `reference/`, `explanation/`)

## Running Locally

Source-of-truth for commands: `frontend/package.json` scripts and `backend/pyproject.toml` `[tool.poe.tasks]`. Use `npm run <task>` or `poetry run poe <task>`.

Dependencies are pinned by committed lockfiles: `backend/poetry.lock` and `frontend/package-lock.json`. When changing backend deps, edit `backend/pyproject.toml`, run `poetry lock`, and commit both files — CI installs from the lock and fails if it is out of sync (`poetry check --lock` verifies locally). `poetry.lock` is exempt from the pre-commit large-file check.

On the frontend, `npm run deps:check` compares `node_modules/.package-lock.json` (what npm actually installed) against `package-lock.json` and fails naming the drifted packages. It runs automatically before `npm run dev` and as the first step of `npm run validate`. A stale local install is invisible otherwise — CI uses `npm ci`, so it stays green while local type errors and test results diverge (see #360). The fix it prints is always `npm ci`.

Most-used:
```bash
# Frontend
cd frontend && npm run dev           # Dev server on :3026 (Turbopack)
npm run validate                     # Lint + type checks

# Backend
cd backend && poetry run uvicorn app.server:app --reload --port 8004
poetry run poe check-all             # Lint + format check + tests

# Docker
docker compose -f docker-compose.dev.yml up --build   # dev with hot reload
docker compose up -d                                  # prod (local build)
```

## Ports (different in dev vs prod)

- Frontend: **3026** dev / **3006** prod
- Backend: **8004** dev / **8002** prod
- Backend docs: `http://localhost:8004/docs` (Swagger), `/redoc`

## Architecture Notes

### Backend sub-packages (`backend/packages/`)
- `juddges_search` — RAG search (LangChain + Supabase pgvector), chat/QA chains. Imported as `from juddges_search.chains.chat import chat_chain`.
- `schema_generator_agent` — LangGraph agent for extracting structured data from legal documents.

Both are installed editable via Poetry (`develop = true`).

### Vector search
Uses **Supabase pgvector** (`vector(1024)` columns on `judgments` and `document_chunks`, HNSW index — BGE-M3 dimension; `EMBEDDER_DIMENSIONS` in `backend/app/services/meilisearch_embeddings.py` is the single source of truth, guarded by `backend/tests/app/test_embedding_dimension_contract.py`). Some legacy code paths may still reference Weaviate (`WEAVIATE_*` env vars, imports) — these are unused; when touching vector code, verify it goes through pgvector.

### FastAPI server (`backend/app/server.py`)
Router-per-domain (`documents.py`, `collections.py`, `analytics.py`, `feedback.py`, …) registered with URL prefixes. LangServe exposes LangChain chains as HTTP endpoints. Celery handles async work; tasks live in `backend/app/workers.py`.

### Frontend state
- Zustand for UI/global state
- React Query (`@tanstack/react-query`) for server state, fetching, caching
- Radix UI primitives + custom components; TipTap for rich-text annotations

### Frontend design system — *Editorial Jurisprudence*

Full spec: [`docs/reference/DESIGN.md`](docs/reference/DESIGN.md). Use the
shared primitives in `frontend/components/editorial/` (barrel re-export at
`@/components/editorial`) for all new surfaces — do not introduce new
glassmorphism cards, purple gradients, or `bg-{indigo,purple,violet}-100`
icon-pill motifs.

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

### Database
PostgreSQL via Supabase. Main schema: `supabase/migrations/20260209000001_create_judgments_table.sql` and follow-on migrations. The `judgments` table has full-text (GIN) and semantic (pgvector HNSW) indexes — combine for hybrid search.

## Branching & Release Flow

**Current mode: main-only (solo developer).** `develop` is paused; all work targets `main` directly until further notice.

- **`main`** is the only active branch. Feature/fix branches start from `main` and PR back into `main`. Production images are built **manually** from a clean `main` via `scripts/build_and_push_prod.sh`.
- When helping with branching commands, default to creating new branches from `main` (e.g. `git switch -c feat/foo origin/main`).
- Branch protection on `main` requires CI green on seven checks: `Backend Lint`, `Backend Unit Tests`, `Frontend Lint`, `Frontend Unit Tests`, `Frontend E2E Smoke (UI-only)`, `Database Contract`, `Frontend Route Contract (Chromium)`. Use those names exactly — they are the context strings branch protection matches.
- Required checks are **strict**: a PR must be up to date with `main` before it can merge, so the checks re-run against the merged content. This is what catches a semantic conflict between two PRs that were each green on their own. Expect to `git merge origin/main` into a branch that has sat for a while and wait for a second run.
- The "1 approving review" requirement was lifted while solo — re-add it before adding contributors.
- Merge with `gh pr merge <n> --merge --delete-branch`. Squash and rebase merges are **disabled repo-side**, so `--squash` fails: every PR lands as a merge commit, which keeps the branch as its own lane in the graph and makes `git log --first-parent main` read one line per PR. `gh pr merge --admin` is only for when an unrelated, non-required check is red (e.g. transient infra).
- Releasing: tag a clean `main` and run `./scripts/build_and_push_prod.sh` (or pass `minor` / explicit version). The script bumps version, builds + pushes images, tags `prod-vX.Y.Z`. No release PR is needed in main-only mode.
- `develop` branch still exists but is dormant. Do **not** open new PRs against it; if you find one, repoint to `main`. Re-enable two-branch flow only when more contributors join.

## Production Deploy

Docker images live on Docker Hub as `${DOCKER_USERNAME}/juddges-{frontend,backend}`.

- Two images built; `backend-worker` and `backend-beat` reuse `juddges-backend` with different commands.
- Required services (deploy script health-checks): `frontend`, `backend`, `meilisearch`, `backend-worker`, `backend-beat`.
- `docker-compose.yml` declares both `image:` (Hub pulls) and `build:` (local builds).
- Image tag controlled by `JUDDGES_IMAGE_TAG` (default `latest`).

**Versioning:** annotated git tags `prod-v<semver>` (e.g. `prod-v0.1.3`) are the source of truth. `scripts/build_and_push_prod.sh` reads the latest, auto-bumps, syncs `VERSION` / `backend/pyproject.toml` / `frontend/package.json` / `.env.example`, builds + pushes, then tags.

```bash
./scripts/build_and_push_prod.sh           # patch bump
./scripts/build_and_push_prod.sh minor     # minor bump
./scripts/build_and_push_prod.sh 2.1.0     # explicit version
./scripts/deploy_prod.sh                   # deploy :latest
./scripts/deploy_prod.sh --yes             # deploy :latest, non-interactive
./scripts/deploy_prod.sh --rollback        # roll back
```

> Docker images are built **manually** via these scripts — not in GitHub Actions.

## Environment

Required `.env` keys:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (service role: backend only)
- `OPENAI_API_KEY`, `BACKEND_API_KEY`
- `DATABASE_URL` (PostgreSQL — used by the persistent checkpointer)

Optional: `LANGFUSE_*` (observability), `REDIS_*` (Celery + guest sessions). `WEAVIATE_*` is legacy and unused.

## Testing

- Backend: `pytest`. Mark tests with `@pytest.mark.unit` or `@pytest.mark.integration`. Integration tests need real services (DB, Redis, OpenAI).
- Frontend: Jest (unit) + Playwright (E2E).

## Finishing a frontend change

A `Stop` hook (`.claude/settings.json` → `scripts/verify-frontend-evidence.sh
--check`) refuses to end a turn while `frontend/` differs from `origin/main`
and no evidence marker matches the current diff hash. Produce the marker with
the **frontend-verify** skill (`bash scripts/verify-frontend-evidence.sh
--record`): it builds with the route-contract env, runs
`npm run test:e2e:route-contract`, and seals
`frontend/test-results/.last-verify.json` only if the suite is green. Any later
edit under `frontend/` re-arms the gate. `SKIP_FRONTEND_VERIFY=1` disables the
check for sessions that cannot run the suite — say so in the reply when used.

## Agent browser verification (MCP)

`.mcp.json` registers a project-scoped `playwright` MCP server
(`@playwright/mcp`, pinned; `--headless --isolated`). It runs locally next to
the dev server, so an agent can drive the real UI before claiming a
frontend change is done. The Claude-in-Chrome extension is **not** a
substitute: it runs on a remote machine and cannot reach `localhost`.

- **When:** any change under `frontend/` that alters what a user sees or
  clicks. Start the dev server (`cd frontend && npm run dev`, `:3026`) and
  drive the changed flow via the `playwright` tools (`browser_navigate`,
  `browser_snapshot`, `browser_click`, …). The default mode reads the
  accessibility tree, not screenshots — assert on roles and names, the same
  locators the specs use.
- **Not a gate:** a manual pass through MCP is evidence for the PR
  description; it does not replace a route-contract spec
  (`frontend/tests/route-contract-e2e/`) for a flow that must stay green on
  every PR — that is what the Stop hook above checks. Turn a repeated
  exploration into a spec.
- **Why `--isolated`:** the profile lives in memory, so cookies and
  localStorage from one run never leak into the next and nothing is written
  to disk. Two sessions in two worktrees can run it concurrently (verified
  with two servers in parallel).
- **Signed-in flows:** pass `--storage-state=<file>` (see `STORAGE_STATE` in
  `frontend/tests/e2e/auth.setup.ts`) when the flow is behind the login wall
  on the dev server. The route-contract stub's synthetic session is only for
  the `:3006` standalone build, not for `:3026`.
- **Origins:** `--allowed-origins` is deliberately not set. The browser
  Supabase client calls the project's Supabase origin directly, so a
  localhost-only allowlist would break every signed-in flow. Do not follow
  external links during verification; the dev server is the target.

## Playwright test agents (planner / generator / healer)

`.mcp.json` also registers `playwright-test`
(`npx playwright run-test-mcp-server --config
frontend/playwright.route-contract.config.ts`), a second, distinct MCP
server from the `playwright` browser-verification one above — it drives the
test runner, not a bare browser, and is pinned to the route-contract config
so exploration targets the deterministic stub app on `:3006`, not the live
suite behind real Supabase creds (#575). `.claude/agents/playwright-test-{planner,generator,healer}.md`
were generated by `npx playwright init-agents --loop=claude` (see
`frontend/specs/README.md` for planner output, `frontend/tests/route-contract-e2e/seed.spec.ts`
for the generator's seed). Invoke them as subagents to turn an exploration
into a spec under `frontend/tests/route-contract-e2e/`, or to attempt a fix
on a failing one.

**Hard rule, no exceptions:** every spec the generator writes and every
patch the healer produces goes through review — a human or a second agent
reading the diff — before it merges; neither is ever auto-merged. A healer
patch that changes a locator, wait, or assertion without explaining *why the
UI changed* is rejected outright — a passing patch with no explanation can
be hiding a real regression instead of a stale selector.

## Code Quality

- Backend: Ruff (format + lint).
- Frontend: ESLint + Next.js config; TypeScript strict mode.
- Conventional commits. **Do not** add Claude/co-author footers to commit messages.

## Legacy Code

A few areas may still carry old terminology or unused integrations: Weaviate vector store (`WEAVIATE_*` env vars), generic "documents" naming where `judgments` is now canonical. Prefer pgvector and `judgments`-based naming when extending.
