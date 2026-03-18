# V1 Demo Manifest

## Purpose

This file defines the working release artifact for the first public demo.

It should answer:
- what corpus slice we are demonstrating
- which queries are known-good
- which result-to-detail paths are safe to show live

## Demo Corpus

### Target shape

- Polish judgments: release subset from the current demo database
- UK judgments: release subset from the current demo database
- Search-visible documents only
- Base-schema extraction applied to the chosen subset where possible

### Operational source of truth

- Judgment rows in `public.judgments`
- Extraction coverage on `base_extraction_status`
- Batch extraction run via `scripts/run_base_schema_extraction.py`

## Known-good Queries

### Polish

- `frankowicze i abuzywne klauzule`
- `skarga do sądu administracyjnego`

### English

- `murder conviction appeal`
- `consumer protection in financial services`

## Known-good Detail Paths

Fill these with stable release-candidate examples before final sign-off.

### Polish

- Query:
- Expected document:
- Expected route:

### UK

- Query:
- Expected document:
- Expected route:

## Release Notes

- Update this file after the final ingestion and extraction runs.
- Use this manifest together with `docs/release/v1-smoke-checklist.md` before merging to `main`.
