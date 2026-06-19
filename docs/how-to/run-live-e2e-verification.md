# Run live end-to-end verification

This guide shows how to verify the whole search stack works against a **real
running backend and a real Supabase corpus** — not mocks, not unit tests. Use
it after a deploy, before a release, or whenever you need to confirm that
search, embeddings, Meilisearch, document retrieval and the supporting
endpoints actually work together on live data.

The engine lives at `backend/tests/e2e_live/` and is **read-only by design**
(only `GET` and read-only search/rewrite `POST`s), so it is safe to point at
production.

## What it checks

22 checks across 8 features, all against the live backend:

| Feature | Checks |
|---|---|
| `search` | 5 representative Polish legal queries (from `tests/fixtures/search_queries.yaml`) asserting recall (`min_hits`), a live embedding path (`vector_fallback=false`, `embedding_ms>0`) and query-type routing; plus offset pagination and `case_number` routing |
| `documents` | search → fetch the returned `document_id` from Supabase (the real round-trip proof), metadata, similar docs, facets, embedding coverage |
| `health` | `/health`, `/health/status`, `/health/dependencies` |
| `autocomplete` | topic autocomplete + topics metadata |
| `rewrite` | LLM query rewrite + structured filter extraction |
| `meili` | Meilisearch keyword and hybrid (`semantic_ratio=0.5`) search |
| `validation` | a >2000-char query is rejected with `400` |
| `auth` | a request missing `X-API-Key` is blocked (`401/403`) |

The 5 `search` queries come from the same fixture file that powers
`scripts/search_benchmark.py` and the pytest integration suite, so the three
stay in sync.

## Prerequisites

- A running backend (local dev on `:8004`, or a deployed URL) wired to real
  Supabase + Meilisearch + TEI embeddings.
- `BACKEND_API_KEY` — every `/documents/*` and `/api/search/*` endpoint is
  auth-gated. The repo-root `.env` is loaded automatically, or pass `--key`.

## Run it

```bash
cd backend

# All checks against local dev (defaults to http://localhost:8004)
poetry run poe e2e-live

# Against a deployed environment
poetry run poe e2e-live --url https://your-backend.example.com

# A subset by feature, and write a machine-readable report
poetry run poe e2e-live --only search,documents --json e2e-report.json

# List every check without running, or show help
poetry run poe e2e-live --list
poetry run poe e2e-live --help
```

You can also invoke the module directly: `python -m tests.e2e_live ...`.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--url` | `BENCHMARK_API_URL` / `JUDDGES_BENCHMARK_API_URL` / `http://localhost:8004` | Backend base URL |
| `--key` | `BACKEND_API_KEY` env | API key for the gated endpoints |
| `--only` | all | Comma-separated feature filter (e.g. `search,health`) |
| `--limit-docs` | `50` | Page size sent to `/documents/search` |
| `--json` | — | Also write a JSON report to this path |
| `--list` / `--help` | — | List cases / show usage and exit |

### Exit codes

- `0` — all checks passed (skips are allowed, e.g. when the corpus is too small
  to paginate).
- `1` — at least one check failed or errored.
- `2` — configuration error (missing API key, no cases matched `--only`).

## Reading the output

Each check prints a live line and a final grouped table. The most important
signals:

- **`vector_fallback`** must be `false` on the search checks. `true` means the
  TEI embedding server failed and you are silently getting keyword-only
  results — the single most important thing to watch.
- **`documents/roundtrip`** passing proves a `document_id` returned by search
  resolves to a real Supabase row (a `404` here means a Meili↔Supabase id
  mismatch).
- **`documents/embedding_coverage`** surfaces how much of the corpus is actually
  embedded.

## Run it as a gated pytest (CI / nightly)

A pytest bridge drives the same cases but is **skipped unless `RUN_E2E_LIVE=1`**,
so normal unit CI stays hermetic:

```bash
RUN_E2E_LIVE=1 BACKEND_API_KEY=... \
  JUDDGES_BENCHMARK_API_URL=http://localhost:8004 \
  poetry run pytest -v -m integration tests/e2e_live/test_e2e_live.py
```

## Related

- `docs/how-to/benchmark-search-performance.md` — latency/recall benchmarking
- `backend/tests/integration/` — narrower live integration tests (search
  quality, pgvector contract, RLS policies)
