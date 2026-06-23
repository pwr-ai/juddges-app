# `/search/extractions` E2E

`extractions.spec.ts` covers the extracted-data search surface
(`frontend/app/search/extractions/page.tsx`) — the deferred test from PR #138
(issue #142).

## What it covers

1. **Happy path** — type a text query, select `offender_gender = gender_female`,
   set `co_def_acc_num` (Co-defendants count) min to `2`; asserts the result
   count chip updates at each step and that the URL serialises the query
   (`?q=…`) and the opaque filter blob (`?f=<base64-json>`).
2. **URL state restoration** — captures that URL, re-navigates to it, and
   asserts the text bar, active-filter chips, and drawer control selections are
   all rehydrated.
3. **Clear-all** — clicks "Clear all" and asserts the URL drops back to a bare
   `/search/extractions` and the baseline count returns.

## Running (mocked — default, fast, ≤30 s)

The spec mocks `POST /api/extractions/base-schema/filter` and the
`facets/[field]` endpoint at the network level (`route.fulfill`), so no live
FastAPI backend or seeded database is required. It still needs an authenticated
browser session because `/search/extractions` is behind the auth middleware:
the Playwright `setup` project performs one real Supabase login and stores the
session in `.auth/user.json`, which the `authenticatedPage` fixture loads.

```bash
cd frontend

# Requires TEST_USER_EMAIL / TEST_USER_PASSWORD and a real
# NEXT_PUBLIC_SUPABASE_URL in repo-root .env or frontend/.env.local
# (auto-loaded by playwright.config.ts).
npx playwright test tests/e2e/search/extractions.spec.ts
```

> CI note: the default CI workflow uses placeholder Supabase credentials, so the
> `setup` project (and therefore these browser specs) is skipped there. The
> spec runs in CI only when real `TEST_USER_*` + Supabase credentials are
> injected.

## Running against the real backend (real RPC + judgments)

To exercise the actual Postgres RPC `filter_documents_by_extracted_data`
instead of the mock, drop the `mockExtractionApis(...)` call in `beforeEach`,
point Playwright at a running dev stack, and ensure the database has judgments
with `base_extraction_status = 'completed'` and meaningful
`base_offender_gender` / `base_co_def_acc_num` values:

```bash
# 1. Bring up the dev stack (frontend :3007, backend :8004, Supabase, etc.)
docker compose -f docker-compose.dev.yml up --build

# 2. Run the spec against the running stack
cd frontend
E2E_BASE_URL=http://localhost:3007 \
E2E_BACKEND_BASE_URL=http://localhost:8004 \
  npx playwright test tests/e2e/search/extractions.spec.ts
```

When run against the real backend the hard-coded counts (120 / 80 / 50 / 40)
no longer hold — assert relative behaviour instead (count decreases as filters
are added; baseline returns after "Clear all"). A deterministic 20-row seed
fixture under `tests/e2e/fixtures/` is the preferred next step for stable
real-DB assertions (see issue #142, "Fixture requirements").
