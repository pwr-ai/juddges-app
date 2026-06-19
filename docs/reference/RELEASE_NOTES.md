# Release Notes

Versioned changelog for the Juddges App platform. Versions track annotated
git tags `prod-vX.Y.Z` and correspond to manually built/pushed Docker images.

---

## v1.3.0 — 2026-05-13

**Commits:** 10 commits since `prod-v1.2.1`

### Highlights

- **Meilisearch engine upgraded to v1.43** (from v1.13) across both dev and
  prod compose. Includes a documented dump-based migration runbook
  ([`docs/how-to/upgrade-meilisearch.md`](../how-to/upgrade-meilisearch.md))
  exercised end-to-end against a v1.13.3 snapshot before release.
- **Search topics are now durable in Supabase.** Meilisearch can be rebuilt
  from a Supabase snapshot — Supabase is the new ground truth for the
  autocomplete topics index.
- **Search analytics attribute to the logged-in user**, with a new
  `GET /api/search/analytics/history` endpoint so users can retrieve their
  own search history.
- **Three new CLI scripts** for topic operations: import, sync to Meili, and
  validate.
- **Highlight fix on document cards** — query matches stay visible even
  under the 3-line clamp.
- **Service-worker hardening (v3)** — RSC payloads no longer cached; fixes
  the stale auth-redirect issue from v1.2.1.

### Frontend Changes (`frontend/`)

#### New Features

##### Search proxies forward Supabase session for analytics attribution

- **Technical:** `frontend/app/api/search/{autocomplete,documents,topic-click}/route.ts`
  now forward the user's Supabase `Authorization: Bearer …` token to the
  backend, so analytics rows can be attributed to the authenticated user.
  Anonymous traffic is unchanged (NULL `user_id`).
- **Why:** Enables per-user search history and meaningful "your top
  searches" analytics — previously all traffic was anonymous in
  `search_analytics`.
- **Impact:** Foundation for personalized search history and account-level
  insights. *(Commit: `2c8722c`)*

#### Bug Fixes

##### Highlight stays visible under line-clamped document cards

- **Technical:** New `recenterHighlightSnippet` helper in
  `frontend/lib/highlight.ts` plus `ensureMarkVisible` prop on
  `QueryHighlight` shifts a snippet's mark close to the start before clamp
  truncation cuts it off. `DocumentCard` passes
  `ensureMarkVisible={!showExtended}`.
- **Why:** With 3-line clamping, the matched word often fell off the bottom
  — users couldn't see *why* a result was returned.
- **Impact:** Every result card now visibly proves its match.
  *(Commit: `819c084`)*

##### Service worker skips RSC payloads and narrows static cache (v3)

- **Technical:** `frontend/public/sw.js` bumped to `CACHE_VERSION = v3`.
  Never caches `?_rsc=` requests; static-asset cache limited to immutable
  build hashes; install/activate flow tightened.
- **Why:** Previous SW occasionally replayed middleware auth-redirects to
  logged-in users, sending them to the marketing home page after sign-in.
- **Impact:** Auth redirects behave correctly across reloads.
  *(Commit: `b4c6cab`)*

#### UI / Test Maintenance

- **"Preview Plan" subtext removed** from user-card popover
  (`frontend/lib/styles/components/user-card.tsx`). *(Commit: `e4559c3`)*
- **Drifted unit tests repaired** for landing page, schema editor, i18n,
  api, query-highlight, document-card, and collection-batch.
  *(Commit: `6837fd9`)*

### Backend Changes (`backend/`)

#### New Features

##### Persistent `search_topics` table — Supabase is the ground truth

- **Technical:** New migration
  `supabase/migrations/20260513000001_create_search_topics_table.sql` adds
  a `search_topics` table keyed by `run_id`. New
  `backend/app/services/search_topics_store.py` provides
  `persist_search_topics_run` and `load_latest_search_topics_run`.
  `scripts/generate_search_topics.py` now persists topic runs to Supabase,
  then rebuilds Meilisearch from that snapshot via the new
  `push_topics_run_to_meilisearch` helper.
- **Why:** Previously, Meili was the only home of generated topics —
  losing the Meili volume meant regenerating topics from scratch. This
  makes topics durable and auditable, and decouples regeneration from
  rebuild.
- **Usage:** Run `scripts/generate_search_topics.py` as before — it
  auto-persists. To rebuild Meili from the existing snapshot, run
  `scripts/sync_meilisearch_topics.py`.
- **Impact:** Faster recovery from Meili volume loss; topic runs are
  versioned and inspectable. *(Commit: `e42a525`)*

##### Search analytics attributed to user + history endpoint

- **Technical:** Migration
  `20260513000002_add_user_id_to_search_analytics.sql` adds nullable
  `user_id UUID` + partial index. `record_search_query` /
  `record_topic_click` accept `user_id`. `autocomplete`,
  `documents_search`, and `topic_click` endpoints capture it via
  `get_optional_user`. New migration
  `20260513000003_create_get_user_search_history.sql` exposes RPC
  `get_user_search_history` (auth-required, RLS-safe) backing
  `GET /api/search/analytics/history`.
- **Why:** Sets up a foundation for per-user history UX and meaningful
  engagement metrics.
- **Usage:** Logged-in users: `GET /api/search/analytics/history` returns
  their recent searches; anonymous calls return rows with `user_id = NULL`
  for aggregate analytics only.
- **Impact:** Personalized history is now possible; admin analytics
  dashboards can split traffic by anonymous vs authenticated.
  *(Commit: `2c8722c`)*

#### API Changes

- **New endpoint:** `GET /api/search/analytics/history` — returns the
  authenticated user's recent searches (RLS-enforced).
- **Analytics endpoints** (`/autocomplete`, `/documents`, `/topic-click`)
  now optionally accept Bearer auth and attribute rows to the
  authenticated user.

### Scripts & Tooling

##### Three new search-topics CLI tools

- `scripts/sync_meilisearch_topics.py` — re-publish the latest persisted
  Supabase snapshot to Meilisearch (no regeneration).
- `scripts/import_search_topics_snapshot.py` — load a snapshot from JSON
  into the `search_topics` table.
- `scripts/validate_search_topics.py` — validate a topic run for
  completeness, doc counts, and schema conformance.

**Usage:**

```bash
docker compose run --rm backend python scripts/sync_meilisearch_topics.py
docker compose run --rm backend python scripts/import_search_topics_snapshot.py <path.json>
docker compose run --rm backend python scripts/validate_search_topics.py
```

*(Commit: `d9a7be7`)*

### Infrastructure & DevOps

##### Meilisearch bumped to v1.43 (dev + prod)

- **Technical:** `docker-compose.dev.yml` and `docker-compose.yml` both
  pinned to `getmeili/meilisearch:v1.43.0`. The prod service image is
  parameterized via `${MEILISEARCH_IMAGE_TAG:-v1.43.0}` so rollback to
  v1.13 is a one-line `.env` edit + recreate. Memory ceiling and `nofile`
  ulimits unchanged.
- **Why:** Older v1.13 line is no longer current; the v1.43 line includes
  performance and stability improvements relevant to hybrid vector indexes.
- **How to migrate prod:** follow the dump-based runbook at
  `docs/how-to/upgrade-meilisearch.md`. The procedure was exercised on
  2026-05-13 against a local v1.13.3 snapshot (12,307 judgments + 149
  topics) and validated end-to-end before this release. Acceptance checks
  include `/version`, document counts, embedder config preservation,
  direct keyword search, and backend autocomplete with `<mark>`
  highlighting.
- **Impact:** Engine upgrade is decoupled from any schema or product
  change. Phase 2 (judgments_pl / judgments_en index split) and Phase 3
  (multi-search query path) are tracked separately.
  *(Commits: `3f0fdfb`, prod compose update in this release.)*

### Documentation

- **Dataset citation cleanup:** `README.md`, `docs/architecture/*`,
  `docs/getting-started/*`, `docs/open-science/*`,
  `docs/how-to/data-ingestion.md` plus new ecosystem and home-page
  references — cite JuDDGES HF datasets with DOIs and drop the
  `HFforLegal/case-law` reference. *(Commit: `9f57061`)*
- **`populate-search-topics` runbook** updated to document the Supabase
  ground-truth flow and the `sync_meilisearch_topics.py` rebuild path.
  *(Commit: `e42a525`)*

### Breaking Changes

**None at the public API level.** A few internal notes for operators:

- **Meilisearch on-disk format is not backward-compatible** v1.13 → v1.43.
  A direct image tag bump without a dump-based migration will fail at
  boot. The migration runbook is mandatory; see Migration Notes below.
- `search_analytics` rows written before this release have
  `user_id = NULL` permanently — the column is nullable on purpose.
- Topic regeneration (`generate_search_topics.py`) now writes to Supabase
  first; if `SUPABASE_SERVICE_ROLE_KEY` is missing in the run environment,
  the script will fail before touching Meili. Old behavior (Meili-only)
  is no longer supported.

### Migration Notes

1. **Upgrade Meilisearch from v1.13 → v1.43** *(do this first; it
   requires a dump-based migration)*. Follow
   `docs/how-to/upgrade-meilisearch.md` step-by-step. The pre-existing
   prod data volume **cannot** be reused as-is across the v1.13 → v1.43
   gap; the new container will refuse to boot.
2. **Run new Supabase migrations** (auto-applied by your normal deploy):
   - `20260513000001_create_search_topics_table.sql`
   - `20260513000002_add_user_id_to_search_analytics.sql`
   - `20260513000003_create_get_user_search_history.sql`
3. **Bootstrap topic snapshot** (one time, after deploy):

   ```bash
   docker compose run --rm backend python scripts/generate_search_topics.py
   ```

   This populates `search_topics` and rebuilds Meili in one pass.
4. **Verify** with `scripts/validate_search_topics.py` and check
   `/api/v1/search/autocomplete?q=fraud`.

### Known Issues

- **Meili settings atomic-apply at prod startup** still occasionally drifts
  on the bge-m3 embedders block. Verify `filterableAttributes` /
  `synonyms` post-deploy.

### Full Commit Log

```
6837fd9 test(frontend): repair drifted unit tests for landing, schema editor, i18n, api, and collection-batch
819c084 fix(search): recenter snippet so highlight survives line-clamp in document cards
3f0fdfb chore(infra): bump dev Meilisearch to v1.43
d9a7be7 feat(search-topics): add CLI tools to sync, import, and validate topic snapshots
e42a525 feat(search-topics): persist topic runs in Supabase and rebuild Meili from snapshot
9f57061 docs(datasets): cite JuDDGES HF datasets with DOIs, drop HFforLegal/case-law
2c8722c feat(search): attribute analytics to user + add history endpoint
b4c6cab fix(sw): skip RSC payloads, narrow static cache, bump CACHE_VERSION v3
e4559c3 chore(navbar): drop "Preview Plan" subtext from user-card popover
```
