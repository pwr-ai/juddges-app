# How to test the base-schema filter RPC

This guide gives 10 worked example queries that exercise every tier of the
`filter_documents_by_extracted_data` RPC after the migration in
`supabase/migrations/20260505000001_extend_base_schema_filterable_searchable.sql`.

Each example shows:

- The natural-language **intent** a user would express.
- The **JSON `p_filters`** body to send to `POST /api/extractions/base-schema/filter`.
- The equivalent **direct SQL** for running via `psql`/Supabase SQL editor.

Run them after the migration has applied and at least a handful of rows have
`base_extraction_status = 'completed'`. All RPCs hard-filter to completed
extractions.

## Query 1 — Numeric `min` filter (Tier 1)

**Intent:** "List judgments with at least 2 co-defendants."

```json
{
  "filters": { "co_def_acc_num": { "min": 2 } },
  "limit": 50
}
```

```sql
SELECT id, case_number, title, decision_date
FROM filter_documents_by_extracted_data(
  '{"co_def_acc_num": {"min": 2}}'::jsonb, NULL, 50, 0
);
```

## Query 2 — Conjunction of new scalar enums (Tier 1)

**Intent:** "Cases where the offender was unemployed and homeless at the time of offence."

```json
{
  "filters": {
    "offender_job_offence": ["unemployed"],
    "offender_home_offence": ["homeless"]
  },
  "limit": 50
}
```

```sql
SELECT id, base_offender_job_offence, base_offender_home_offence
FROM filter_documents_by_extracted_data(
  '{"offender_job_offence": ["unemployed"], "offender_home_offence": ["homeless"]}'::jsonb,
  NULL, 50, 0
);
```

## Query 3 — Combined boolean + array (Tier 1)

**Intent:** "Cases with a victim impact statement where the victim was intoxicated by alcohol or drugs."

```json
{
  "filters": {
    "vic_impact_statement": true,
    "victim_intox_offence": ["intox_alcohol", "intox_drugs"]
  },
  "limit": 50
}
```

```sql
SELECT id, base_victim_intox_offence
FROM filter_documents_by_extracted_data(
  '{"vic_impact_statement": true, "victim_intox_offence": ["intox_alcohol", "intox_drugs"]}'::jsonb,
  NULL, 50, 0
);
```

## Query 4 — Aggravating + mitigating array overlap (Tier 1)

**Intent:** "Sentencing decisions citing both an aggravating factor of weapon use and a mitigating factor of guilty plea."

```json
{
  "filters": {
    "agg_fact_sent": ["weapon_used", "use_of_weapon"],
    "mit_fact_sent": ["guilty_plea"]
  },
  "limit": 50
}
```

```sql
SELECT id, base_agg_fact_sent, base_mit_fact_sent
FROM filter_documents_by_extracted_data(
  '{"agg_fact_sent": ["weapon_used", "use_of_weapon"], "mit_fact_sent": ["guilty_plea"]}'::jsonb,
  NULL, 50, 0
);
```

> Free-text array values (`agg_fact_sent`, `mit_fact_sent`, …) are not enum-constrained.
> Use `GET /api/extractions/base-schema/facets/agg_fact_sent` to discover real values.

## Query 5 — Offender–victim relationship + remand decision (Tier 1)

**Intent:** "Cases involving relatives where the offender was remanded in custody."

```json
{
  "filters": {
    "offender_victim_relationship": ["relative"],
    "remand_decision": ["remanded_in_custody"]
  },
  "limit": 50
}
```

```sql
SELECT id, base_offender_victim_relationship, base_remand_decision
FROM filter_documents_by_extracted_data(
  '{"offender_victim_relationship": ["relative"], "remand_decision": ["remanded_in_custody"]}'::jsonb,
  NULL, 50, 0
);
```

## Query 6 — Date range + multi-value appeal outcome

**Intent:** "Successful appeals (conviction quashed or sentence reduced) decided in 2025."

```json
{
  "filters": {
    "appeal_outcome": ["outcome_conviction_quashed", "outcome_sentence_more_lenient"],
    "date_of_appeal_court_judgment": { "from": "2025-01-01", "to": "2025-12-31" }
  },
  "limit": 100
}
```

```sql
SELECT id, base_appeal_outcome, base_date_of_appeal_court_judgment
FROM filter_documents_by_extracted_data(
  '{"appeal_outcome": ["outcome_conviction_quashed", "outcome_sentence_more_lenient"],
    "date_of_appeal_court_judgment": {"from": "2025-01-01", "to": "2025-12-31"}}'::jsonb,
  NULL, 100, 0
);
```

## Query 7 — Substring on judge name (Tier 3 — uses new trgm index)

**Intent:** "Cases heard by a judge whose name contains 'Edis'."

```json
{
  "filters": { "appeal_court_judges_names": "Edis" },
  "limit": 50
}
```

```sql
SELECT id, base_appeal_court_judges_names
FROM filter_documents_by_extracted_data(
  '{"appeal_court_judges_names": "Edis"}'::jsonb, NULL, 50, 0
);

-- Verify the trigram index is used:
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM judgments
WHERE base_extraction_status = 'completed'
  AND base_appeal_court_judges_names ILIKE '%Edis%';
```

## Query 8 — Indexed FTS via `base_search_tsv` (Tier 2)

**Intent:** "Find judgments mentioning robbery and a knife."

```json
{
  "filters": {},
  "text_query": "robbery knife",
  "limit": 50
}
```

```sql
SELECT id, case_number, title
FROM filter_documents_by_extracted_data(
  '{}'::jsonb, 'robbery knife', 50, 0
);

-- Verify the GIN index on base_search_tsv is used:
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM judgments
WHERE base_extraction_status = 'completed'
  AND base_search_tsv @@ websearch_to_tsquery('simple', 'robbery knife');
```

Before this migration the same query did `to_tsvector(...) @@ ...` inline at
query time — full table scan. After: GIN index lookup.

## Query 9 — Cross-tier composite (Tier 1 + 2 + 3)

**Intent:** "Female offender, drugs intoxicated, at least 1 co-defendant, search text 'firearm', heard by Lord Justice Holroyde, decided 2024 onwards."

```json
{
  "filters": {
    "offender_gender": ["gender_female"],
    "offender_intox_offence": ["intox_drugs"],
    "co_def_acc_num": { "min": 1 },
    "appeal_court_judges_names": "Holroyde",
    "date_of_appeal_court_judgment": { "from": "2024-01-01" }
  },
  "text_query": "firearm",
  "limit": 50
}
```

```sql
SELECT id, base_case_name, base_appeal_court_judges_names, base_co_def_acc_num
FROM filter_documents_by_extracted_data(
  '{
    "offender_gender": ["gender_female"],
    "offender_intox_offence": ["intox_drugs"],
    "co_def_acc_num": {"min": 1},
    "appeal_court_judges_names": "Holroyde",
    "date_of_appeal_court_judgment": {"from": "2024-01-01"}
  }'::jsonb,
  'firearm', 50, 0
);
```

## Query 10 — Pagination + total count

**Intent:** "Page 3 (rows 100–149) of all completed extractions, with the global total count."

```json
{
  "filters": {},
  "limit": 50,
  "offset": 100
}
```

```sql
SELECT id, total_count
FROM filter_documents_by_extracted_data('{}'::jsonb, NULL, 50, 100);
```

`total_count` is computed via `COUNT(*) OVER()` so you get the unpaginated
total on every row — useful for rendering a paginator without a second
round-trip.

---

## Smoke-test snippet

Run all 10 in one psql session:

```sql
\echo 'Q1: co-defendants ≥ 2'
SELECT count(*) FROM filter_documents_by_extracted_data('{"co_def_acc_num":{"min":2}}'::jsonb, NULL, 1000, 0);

\echo 'Q2: unemployed + homeless'
SELECT count(*) FROM filter_documents_by_extracted_data('{"offender_job_offence":["unemployed"],"offender_home_offence":["homeless"]}'::jsonb, NULL, 1000, 0);

\echo 'Q3: vis + intoxicated victim'
SELECT count(*) FROM filter_documents_by_extracted_data('{"vic_impact_statement":true,"victim_intox_offence":["intox_alcohol","intox_drugs"]}'::jsonb, NULL, 1000, 0);

\echo 'Q4: aggravating + mitigating'
SELECT count(*) FROM filter_documents_by_extracted_data('{"agg_fact_sent":["weapon_used"],"mit_fact_sent":["guilty_plea"]}'::jsonb, NULL, 1000, 0);

\echo 'Q5: relative + custody'
SELECT count(*) FROM filter_documents_by_extracted_data('{"offender_victim_relationship":["relative"],"remand_decision":["remanded_in_custody"]}'::jsonb, NULL, 1000, 0);

\echo 'Q6: 2025 successful appeals'
SELECT count(*) FROM filter_documents_by_extracted_data('{"appeal_outcome":["outcome_conviction_quashed","outcome_sentence_more_lenient"],"date_of_appeal_court_judgment":{"from":"2025-01-01","to":"2025-12-31"}}'::jsonb, NULL, 1000, 0);

\echo 'Q7: judge ILIKE'
SELECT count(*) FROM filter_documents_by_extracted_data('{"appeal_court_judges_names":"Edis"}'::jsonb, NULL, 1000, 0);

\echo 'Q8: FTS robbery knife'
SELECT count(*) FROM filter_documents_by_extracted_data('{}'::jsonb, 'robbery knife', 1000, 0);

\echo 'Q9: composite'
SELECT count(*) FROM filter_documents_by_extracted_data('{"offender_gender":["gender_female"],"offender_intox_offence":["intox_drugs"],"co_def_acc_num":{"min":1}}'::jsonb, 'firearm', 1000, 0);

\echo 'Q10: pagination'
SELECT id, total_count FROM filter_documents_by_extracted_data('{}'::jsonb, NULL, 50, 100);
```
