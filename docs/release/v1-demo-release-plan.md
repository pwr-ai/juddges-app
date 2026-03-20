# v1 Demo Release Plan

## Scope

The v1 demo release targets a representative subset of Polish and UK court judgments with:

- **Corpus**: ~3,000 PL + ~3,000 UK judgments (6K+ total)
- **Search**: Hybrid search (text + semantic) via Supabase pgvector
- **Enrichment**: Base-schema extraction on the full demo corpus
- **UI**: Search, document viewer, and extraction results browsing

## Milestones

### 1. Data Ingestion
- Ingest PL and UK judgments via `scripts/ingest_judgments.py`
- Generate embeddings for all documents
- Verify full-text search indexes

### 2. Base-Schema Extraction
- Run `scripts/run_base_extraction.py` on full demo corpus
- Checkpoint progress and retry failures
- Target: >95% coverage (completed extractions / total corpus)
- Report: `data/extraction_report_*.json`

### 3. Search & UI Validation
- Verify hybrid search returns relevant results for PL and UK queries
- Test extraction facets and filters
- Validate document detail view with extraction data

### 4. Smoke Testing
- Run through `docs/release/v1-smoke-checklist.md`
- All critical paths pass

## Known Limitations

- Extraction schema is English-centric; PL schema mirrors EN fields
- No user accounts in demo (public access)
- UMAP visualization coordinates not yet computed
- Extraction covers base schema only (no custom schemas)

## Deployment

Production deployment via `scripts/build_and_push_prod.sh` and `scripts/deploy_prod.sh`.
See CLAUDE.md for full deployment workflow.
