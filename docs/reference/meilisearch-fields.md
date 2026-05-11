# Meilisearch Index Reference: `judgments`

> Authoritative list of every field synced into the Meilisearch `judgments`
> index, what each one does (searchable / filterable / sortable / displayed),
> and example filter expressions. Source of truth for the schema lives in
> [`backend/app/services/meilisearch_config.py`](../../backend/app/services/meilisearch_config.py)
> and the column projection in
> [`backend/app/tasks/meilisearch_sync.py`](../../backend/app/tasks/meilisearch_sync.py).

---

## Overview

- **Index name**: `judgments` (env `MEILISEARCH_INDEX_NAME`)
- **Primary key**: `id` (UUID, stringified)
- **Document count**: 12,307 (one row per Supabase `public.judgments` row)
- **Matching strategy used by autocomplete**: `last` (Meilisearch progressively
  drops the trailing words of the query until something matches)
- **Pagination cap**: `maxTotalHits = 1000` — `estimatedTotalHits` is capped at
  this value; raise the cap in `MEILISEARCH_INDEX_SETTINGS` if you need exact
  counts beyond 1000.
- **Refresh**: full sync runs every 6 h via Celery Beat
  (`meilisearch-full-sync-every-6h`); manual sync via
  `python scripts/sync_meilisearch.py --full-sync`.

## Field roles (Meilisearch terminology)

| Role | Meaning |
|---|---|
| **searchable** | Appears in `searchableAttributes` — used for full-text matching. Earlier position in the list = higher rank weight. |
| **filterable** | Appears in `filterableAttributes` — usable in the `filter` parameter (`=`, `!=`, `>`, `<`, `>=`, `<=`, `IN […]`, `TO`, `EXISTS`, `IS NULL`, `IS NOT NULL`). |
| **sortable** | Appears in `sortableAttributes` — usable in the `sort` parameter. |
| **displayed** | Appears in `displayedAttributes` — returned in search hits. Fields excluded from `displayedAttributes` can still be searched/filtered but won't come back in the response. |

---

## Core judgment fields

| Field | Type | Search | Filter | Sort | Display | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| `id` | string (UUID) | — | — | — | ✓ | Primary key |
| `title` | string | ✓ (rank 1) | — | — | ✓ | Highest ranking weight |
| `case_number` | string | ✓ (rank 2) | — | — | ✓ | Free-text case number |
| `summary` | string | ✓ (rank 3) | — | — | ✓ | |
| `court_name` | string | ✓ (rank 4) | — | — | ✓ | |
| `judges_flat` | string | ✓ (rank 5) | — | — | ✓ | Flattened from JSONB `judges` |
| `judges` | JSONB | — | — | — | ✓ | Structured judge data |
| `keywords` | string[] | ✓ (rank 6) | — | — | ✓ | Curated keywords |
| `legal_topics` | string[] | ✓ (rank 7) | — | — | ✓ | |
| `cited_legislation` | string[] | ✓ (rank 8) | — | — | ✓ | |
| `full_text` | string | ✓ (rank 9) | — | — | — | Searchable but *not displayed* (size) |
| `jurisdiction` | string | — | ✓ | — | ✓ | e.g. `PL`, `UK` |
| `court_level` | string | — | ✓ | — | ✓ | |
| `case_type` | string | — | ✓ | — | ✓ | |
| `decision_type` | string | — | ✓ | — | ✓ | |
| `outcome` | string | — | ✓ | — | ✓ | |
| `decision_date` | ISO date string | — | ✓ | ✓ | ✓ | |
| `publication_date` | ISO date string | — | — | — | ✓ | |
| `source_url` | string | — | — | — | ✓ | |
| `created_at` | ISO timestamp | — | — | ✓ | ✓ | |
| `updated_at` | ISO timestamp | — | — | ✓ | ✓ | |

## Base-schema extracted fields

These come from `BaseSchemaExtractor` and are promoted into typed Postgres
columns by
[`app.extraction_domain.base_schema_promote`](../../backend/app/extraction_domain/base_schema_promote.py),
then synced into Meilisearch.

| Field | Type | Search | Filter | Sort | Display | Notes |
|---|---|:-:|:-:|:-:|:-:|---|
| `base_extraction_status` | string | — | ✓ | — | — | `pending` / `completed` / `failed` |
| `base_num_victims` | integer | — | ✓ | — | — | Range filter capable |
| `base_victim_age_offence` | numeric | — | ✓ | — | — | Range filter capable |
| `base_case_number` | numeric | — | ✓ | — | — | Distinct from free-text `case_number` |
| `base_co_def_acc_num` | integer | — | ✓ | — | — | Co-defendant accuser count |
| `base_date_of_appeal_court_judgment` | ISO date string | — | — | — | — | Stored for display; use the `_ts` field for ranges |
| `base_date_of_appeal_court_judgment_ts` | epoch seconds (int) | — | ✓ | — | — | Numeric date for `>`/`<` range filters |

> All 51 base-schema fields are written into Postgres as typed columns. Only
> the six fields above are currently exposed in Meilisearch. Add the rest by
> extending `_JUDGMENT_SYNC_COLS` in
> [`backend/app/tasks/meilisearch_sync.py`](../../backend/app/tasks/meilisearch_sync.py)
> and `filterableAttributes` in
> [`backend/app/services/meilisearch_config.py`](../../backend/app/services/meilisearch_config.py).

---

## Autocomplete defaults (`MeiliSearchService.autocomplete`)

The `/api/search/autocomplete` endpoint locks autocomplete to a curated subset
to keep latency low and results tight:

- `attributesToSearchOn`: `title`, `case_number`, `keywords`, `legal_topics`,
  `court_name`, `summary`
- `attributesToHighlight`: `title`, `summary`, `case_number`, `court_name`
- `attributesToCrop`: `summary` (24-token crop)
- `attributesToRetrieve`: `id`, `title`, `summary`, `case_number`,
  `jurisdiction`, `court_name`, `decision_date`, `case_type`, `keywords`
- `highlightPreTag` / `highlightPostTag`: `<mark>` / `</mark>`
- `matchingStrategy`: `last`

The `filter` query param is passed through verbatim — full Meilisearch filter
syntax is available.

---

## Filter syntax cheatsheet

```text
# Equality / set membership
jurisdiction = "UK"
jurisdiction IN ["UK","PL"]
jurisdiction != "UK"

# Numeric ranges
base_num_victims >= 1
base_num_victims >= 2 AND base_num_victims <= 5
base_num_victims 1 TO 5
base_victim_age_offence < 18

# Date — use the `_ts` epoch field
base_date_of_appeal_court_judgment_ts > 1577836800   # > 2020-01-01

# Presence
base_num_victims EXISTS
base_num_victims IS NOT NULL
base_num_victims IS NULL

# Combinations
base_extraction_status = "completed" AND base_num_victims = 1
(jurisdiction = "UK" OR jurisdiction = "PL") AND base_num_victims > 0
```

## End-to-end examples

```bash
# Backend (FastAPI) — autocomplete with prefilter
curl "http://localhost:8004/api/search/autocomplete?q=appeal&limit=5\
&filters=base_num_victims%20%3E%3D%201%20AND%20base_num_victims%20%3C%3D%205" \
  -H "X-API-Key: $BACKEND_API_KEY"

# Direct Meilisearch (admin) — count by status
curl -s -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:7700/indexes/judgments/search \
  -d '{"q":"","limit":0,"filter":"base_extraction_status = \"completed\""}'

# Show index stats
curl -s -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  http://localhost:7700/indexes/judgments/stats | jq
```

## Operational commands

```bash
# Apply settings + full sync (idempotent — re-applies filterable/searchable/etc.)
python scripts/sync_meilisearch.py --all

# Settings only (after touching MEILISEARCH_INDEX_SETTINGS)
python scripts/sync_meilisearch.py --setup

# Re-upsert every document (after touching transform or sync columns)
python scripts/sync_meilisearch.py --full-sync

# Backfill typed base_* columns from base_raw_extraction JSONB
python scripts/backfill_base_extractions.py --dry-run --limit 5
python scripts/backfill_base_extractions.py            # all rows
python scripts/backfill_base_extractions.py --only-empty
```

## How a new base-schema field gets exposed

1. Add the column to `_JUDGMENT_SYNC_COLS` in
   [`backend/app/tasks/meilisearch_sync.py`](../../backend/app/tasks/meilisearch_sync.py).
2. Map it in `transform_judgment_for_meilisearch`
   ([`backend/app/services/meilisearch_config.py`](../../backend/app/services/meilisearch_config.py)) —
   keep numbers numeric, dates ISO + epoch.
3. Declare it in the appropriate
   `searchableAttributes` / `filterableAttributes` /
   `sortableAttributes` / `displayedAttributes` block.
4. Re-run `python scripts/sync_meilisearch.py --all` — `--setup` reapplies
   settings, `--full-sync` re-upserts every doc.

## Notes & gotchas

- **Meilisearch strips `null` keys from search hits**. Fields that are NULL on
  most rows look "missing" in `/search` responses; the raw `/documents` endpoint
  shows them as `null`. Use `IS NULL` / `IS NOT NULL` to filter on presence.
- **Date string vs. timestamp**. `decision_date` is filterable as a string
  (ISO-8601 sorts lexicographically), but `base_date_of_appeal_court_judgment`
  is exposed only via `_ts` (epoch seconds) for safer numeric range filters.
- **Cap on `estimatedTotalHits`**. The `pagination.maxTotalHits = 1000` setting
  in `MEILISEARCH_INDEX_SETTINGS` caps the reported count. Lift it if you need
  exact totals.
- **Forward-write fix**. As of the 2026-05 backfill,
  [`results_router.py`](../../backend/app/extraction_domain/results_router.py)
  promotes extracted JSONB into typed columns on every write, so the manual
  backfill should not need to run again. Re-run only if the base schema or the
  `promote_to_typed_columns` helper changes.
