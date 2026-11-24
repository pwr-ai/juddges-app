# Topic extraction schemas

Proposed extraction schemas for contested areas of Polish (and paired UK) case
law, each with the queries that build the judgment collection it is meant to
run on. Files live in
`backend/packages/juddges_search/config/schema/topics/`:

- `<slug>.yaml` — the extraction schema, an OpenAI-compatible JSON Schema
  written as YAML. It passes `validate_openai_schema` and follows the field
  rules in [schema generation](../explanation/schema-generation.md): flat,
  aggregatable types, `not_stated` values and `<field>_stated` companions.
- `<slug>_uk.yaml` — the parallel English schema for cross-lingual topics.
- `<slug>.queries.yaml` — how to build the collection. It contains:
  - `search_v2`: request bodies for `POST /search/v2`, the full PL corpus. There
    are several queries per topic because `limit` is at most 50.
  - `curated_sql`: a read-only `SELECT` over `public.judgments`.
  - `filters`: case-number and court filters.
  - `inclusion_gate`: the field and value that remove false positives after
    extraction.
  - `negative_markers` and `analyses`.
  - `uk_side` and `field_mapping`, for cross-lingual topics only.

These schemas are not registered in `SYSTEM_SCHEMAS`. To use one, import it
through Schema Studio or add it as a system schema.

## Conventions

- The first property is always the inclusion gate (`<topic>_dotyczy` /
  `<topic>_applies`). Its values are `tak`/`nie`/`niejasne` for PL schemas and
  `yes`/`no`/`unclear` for UK schemas. Quote `yes`/`no` in YAML, otherwise
  PyYAML loads them as booleans.
- Each schema has a field listing the key rulings it cites and a field recording
  how the judgment treats them (applies, distinguishes, disagrees). These fields
  let the reasoning line (linia orzecznicza) be tracked over time.
- Rulings that were not verified against a primary source are marked `[?]` in
  each file's header comment.

## Topics

| Slug | Jurisdiction | Corpus | Fields | Collection period |
|---|---|---|---|---|
| `pl_skd_sankcja_kredytu_darmowego` | PL (+UK motor finance mapping) | ordinary_court | 30 | 2022–2026 |
| `pl_frankowe_v2_po_2026` | PL, delta to `swiss_franc_loans.yaml` | ordinary_court + CHF line | 24 | 2025–2026 + existing line |
| `pl_wibor_klauzula_zmiennego_oprocentowania` | PL | ordinary_court | 29 | 2022–2026 |
| `pl_wadliwosc_skladu_neosedziowie` | PL | ordinary + administrative | 23 | 2019–2026 |
| `pl_cudzoziemcy_bezczynnosc_wojewody` | PL | administrative_court | 28 | 2022–2026 |
| `pl_oze_wiatraki_planowanie` | PL | administrative_court | 26 | 2020–2026 |
| `kwalifikacja_umowy_stosunek_pracy` (+`_uk`) | PL + UK | ordinary_court / UK curated | 25 + 25 | 2020–2026 |
| `rodo_odszkodowanie_art82` (+`_uk`) | PL + UK | ordinary + administrative / UK curated | 26 + 26 | 2019–2026 |
| `pl_wymiar_kary_178a` | PL (+UK sentencing mapping) | ordinary_court | 30 | 2022–2026 |
| `linia_orzecznicza_tracker` | PL, topic-agnostic meta schema | any collection | 24 | 2018–2026 |

## Limits

- The Sąd Najwyższy (SN) and UK judgments are not in the Weaviate v2 corpus,
  which holds only common courts and NSA/WSA. They are reachable only through
  `curated_sql`.
- Judgments found through `search_v2` that have no `judgments` row have to be
  ingested before they can be extracted or added to a collection.
  `scripts/ingest_chf_judgments.py` does this for the CHF set.
- The `curated_sql` queries and the size estimates have not been run against
  the database.
