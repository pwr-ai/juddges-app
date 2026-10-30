# Backfill UK `case_type` / `court_level`

UK judgments ingested before issue #799 were labelled `case_type = Civil` and
`court_level = Crown Court`/`Court` even though almost all are Court of Appeal
(`EWCA Crim`) decisions. Ingestion now derives both fields from the neutral
citation (`backend/app/utils/uk_classification.py`); existing rows need a
one-off backfill.

## Run

Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MEILISEARCH_URL`,
`MEILISEARCH_ADMIN_KEY`. Run in the backend container.

```bash
# 1. Dry run (default): prints before/after counts, writes nothing
python scripts/backfill_uk_case_type.py

# 2. Write Supabase, then partially update Meilisearch
python scripts/backfill_uk_case_type.py --apply
```

`--skip-meili` updates Supabase only; `--batch-size N` sets the Meili batch.
The Meili update sends only `id`, `case_type` and `court_level`
(`PUT /documents`), so embeddings are untouched. The script is idempotent and
leaves rows without a recognisable citation unchanged.

## Verify

- Meili facets with `filter: jurisdiction = "UK"` show `Criminal` for every
  `EWCA Crim` row and `court_level = Court of Appeal` (the PL appeal-court value).
- `documents/uk_case_type_contract` in the live e2e suite
  ([run-live-e2e-verification](run-live-e2e-verification.md)) passes. It fails
  on prod until the backfill is applied.

## After the backfill

- `case_type`: done. The backfill ran on prod (#803, #807), `case_type` is no
  longer in `NL_EXCLUDED_CORE_FIELDS`, and the NL filter translator emits
  `case_type: ["Criminal" | "Civil" | "Administrative"]`. The RPC
  `list_extracted_filter_matches` filters on it (migration
  `20261030000001_extracted_filter_case_type.sql`, case-insensitive match).
- `court_level`: still excluded. 52 UK rows carry `Appeal Court` where 6101
  carry `Court of Appeal`; normalise that, then remove `court_level` from
  `NL_EXCLUDED_CORE_FIELDS` in
  `backend/app/extraction_domain/nl_filter_generator.py`, add it to the RPC and
  update the tests.
