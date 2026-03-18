# V1 Smoke Checklist

## Goal

Run this checklist before merging the v1 demo branch into `main`.

## Automated Checks

### Frontend

```bash
cd frontend
npm run validate
npm run build
```

### Backend

```bash
cd backend
poetry run pytest \
  tests/app/test_documents_search.py \
  tests/app/test_search_autocomplete_integration.py \
  tests/app/test_documents_integration.py \
  tests/app/test_documents_metadata.py
```

## Manual Demo Path

### Landing

- Open `/` as an unauthenticated user.
- Confirm the primary CTA goes to `/search`.
- Confirm sample demo queries are visible.
- Confirm public navigation does not promote unfinished areas.

### Search

- Open `/search` without signing in.
- Run one Polish query: `frankowicze i abuzywne klauzule`.
- Run one English query: `murder conviction appeal`.
- Confirm loading, empty, and error states are readable.
- Confirm result cards show title, court, date, jurisdiction/language, and document type where available.

### Judgment detail

- Open one Polish result from search.
- Open one UK result from search.
- Confirm the detail page shows metadata and readable content.
- Confirm missing HTML/content falls back gracefully.
- Confirm source URL or source context is visible when available.

## Demo Dataset Readiness

- Confirm the chosen PL/UK demo corpus has been ingested.
- Confirm base-schema extraction has run on the demo subset.
- Confirm `docs/release/v1-demo-manifest.md` matches the release candidate dataset.
- Record:
  - total demo documents
  - completed base extractions
  - failed base extractions
  - skipped/already completed

## Sign-off

- Frontend checks passed.
- Backend checks passed.
- Manual landing -> search -> detail path passed.
- Demo corpus and extraction status recorded.
