# Re-enable Meilisearch hybrid search

**Status:** TODO — temporarily reverted on 2026-05-11. Keyword search is the
active mode in production until this is followed up on.

## Why it's off

The hybrid (keyword + BGE-M3 vector) infrastructure was built end-to-end but
the user-facing autocomplete was reverted to pure keyword search so we could
ship the rest of the work without committing to the hybrid rollout. All the
plumbing is on `main`; only the default flag was flipped.

Reverted in commit `f812f48` —
[`feat(meilisearch): default autocomplete to pure keyword`](../../).

## Pre-flight checklist

- [ ] BGE-M3 TEI server reachable at `$TEI_EMBEDDING_URL` (1024-dim output).
- [ ] Meilisearch v1.13+ running and admin key configured.
- [ ] `MEILI_MAX_INDEXING_MEMORY` ≥ 1536 MiB (current default is fine for
      ~12K judgments — ~48 MB of vectors).
- [ ] Backfill window of ~5–10 min during which sync writes are paused or
      tolerated (the backfill upserts overwrite existing docs).

## Steps to re-enable

### 1. Flip the default in `backend/app/services/search.py`

```python
async def autocomplete(
    self,
    query: str,
    limit: int = 10,
    filters: str | None = None,
    semantic_ratio: float = 0.3,   # was 0.0
) -> dict[str, Any]:
```

Update the corresponding test
`backend/tests/app/test_meilisearch_service.py::TestAutocompleteHybrid::test_default_is_pure_keyword`
to assert the new default (rename + flip assertions).

### 2. Register the `bge-m3` embedder on the live index

The `embedders` block already exists in `MEILISEARCH_INDEX_SETTINGS` but
hasn't been pushed to the running Meilisearch. Run:

```bash
docker compose -f docker-compose.dev.yml exec backend \
    poetry run celery -A app.workers call meilisearch.setup_index
```

Verify:

```bash
curl -H "Authorization: Bearer $MEILI_MASTER_KEY" \
     http://localhost:7700/indexes/judgments/settings/embedders
# expected: {"bge-m3":{"source":"userProvided","dimensions":1024}}
```

### 3. Backfill vectors for the existing corpus

```bash
# Preview first (no writes)
docker compose -f docker-compose.dev.yml exec backend \
    poetry run python scripts/backfill_meilisearch_embeddings.py --dry-run

# Real run (~5 min for ~12K rows)
docker compose -f docker-compose.dev.yml exec backend \
    poetry run python scripts/backfill_meilisearch_embeddings.py
```

The backfill is idempotent and uses the `attach_embeddings_batch` helper
(one TEI call per page of 64 docs).

### 4. Smoke test

```bash
# Cross-lingual semantic match (would miss with pure keyword)
curl -s -H "X-API-Key: $BACKEND_API_KEY" \
     'http://localhost:8004/api/search/autocomplete?q=sentence%20reduction&limit=5' \
     | jq '.hits[] | {case_number, title: (.title[:80])}'
```

A Polish "złagodzenie wyroku" judgment should now surface for the English
query.

## What's already in place

These pieces were built and stay in `main`, dormant until the steps above run:

- `MEILISEARCH_INDEX_SETTINGS["embedders"]["bge-m3"]` (userProvided, 1024-d).
- `attach_embedding` + `attach_embeddings_batch` in
  `backend/app/services/meilisearch_embeddings.py` — handles opt-out null
  semantics required by `userProvided` embedders.
- Both Celery sync paths (`sync_judgment_to_meilisearch`,
  `full_sync_judgments_to_meilisearch`) already emit `_vectors`.
- `scripts/backfill_meilisearch_embeddings.py` with Rich progress + dry-run.
- `MeiliSearchService.autocomplete` query-side hybrid payload + TEI-failure
  fallback to pure keyword.
- Unit tests cover all of the above; an opt-in
  `@pytest.mark.integration` test
  (`backend/tests/app/test_search_hybrid_integration.py`) exercises the live
  hybrid path.

## Open follow-ups before re-enabling

- `backend/app/services/search.py:134` hardcodes `"bge-m3"` — should use
  `EMBEDDER_NAME` from `meilisearch_embeddings` for a single source of truth.
- The `documents_search` endpoint (full results page) is keyword-only.
  Decide whether it should also accept a `semantic_ratio` query param or
  stay keyword-only by design.
- `title` / `summary` columns on `judgments` are truncated `full_text`
  boilerplate (verified 2026-05-11). Independent of this work — Meilisearch
  keyword ranking still weights this content. Track separately.

## Design + plan references

- Design: `.context/2026-05-11-meilisearch-hybrid-vector-search-design.md`
- Plan: `.context/plans/2026-05-11-meilisearch-hybrid-vector-search-plan.md`
