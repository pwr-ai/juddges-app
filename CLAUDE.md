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
Uses **Supabase pgvector** (`vector(768)` column on `judgments`, HNSW index). Some legacy code paths may still reference Weaviate (`WEAVIATE_*` env vars, imports) — these are unused; when touching vector code, verify it goes through pgvector.

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

Canonical raw colour tokens live in `frontend/app/globals.css`:

| Token | Hex | Use |
|---|---|---|
| `--parchment` | `#F5F1E8` | Page surface |
| `--parchment-deep` | `#EFE9D8` | Tonal section bands |
| `--ink` | `#1A1A2E` | Primary text, strong rules |
| `--ink-soft` | `#5A5A75` | Secondary text |
| `--rule` | `#C9C2B0` | Hairline borders |
| `--rule-strong` | `#A89F88` | Medium dividers |
| `--oxblood` | `#8B1E3F` | Authority — primary action, italic emphasis |
| `--oxblood-deep` | `#6F1230` | Hover state for oxblood |
| `--gold` | `#B8954A` | Citation gold — markers, highlights |
| `--gold-soft` | `#E8DCB8` | Tinted accent backgrounds |

Typography: `Instrument Serif` (display) · `Geist Sans` (body) · `Geist Mono`
(citations / eyebrows / tabular numerals).

### Database
PostgreSQL via Supabase. Main schema: `supabase/migrations/20260209000001_create_judgments_table.sql` and follow-on migrations. The `judgments` table has full-text (GIN) and semantic (pgvector HNSW) indexes — combine for hybrid search.

## Branching & Release Flow

**Current mode: main-only (solo developer).** `develop` is paused; all work targets `main` directly until further notice.

- **`main`** is the only active branch. Feature/fix branches start from `main` and PR back into `main`. Production images are built **manually** from a clean `main` via `scripts/build_and_push_prod.sh`.
- When helping with branching commands, default to creating new branches from `main` (e.g. `git switch -c feat/foo origin/main`).
- Branch protection on `main` requires CI green on the 4 required checks (`Backend Lint`, `Backend Unit Tests`, `Frontend Lint & Typecheck`, `Frontend Unit Tests`). The "1 approving review" requirement was lifted while solo — re-add it before adding contributors. PRs can be merged via standard `gh pr merge --squash` once CI is green; `gh pr merge --admin` is only needed when an unrelated/non-required check is red (e.g. transient infra).
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

## Code Quality

- Backend: Ruff (format + lint).
- Frontend: ESLint + Next.js config; TypeScript strict mode.
- Conventional commits. **Do not** add Claude/co-author footers to commit messages.

## Legacy Code

A few areas may still carry old terminology or unused integrations: Weaviate vector store (`WEAVIATE_*` env vars), generic "documents" naming where `judgments` is now canonical. Prefer pgvector and `judgments`-based naming when extending.
