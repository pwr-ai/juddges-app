# v1 Demo Smoke Checklist

## Pre-release Checks

### Infrastructure
- [ ] PostgreSQL/Supabase accessible
- [ ] Backend API responds on `/health`
- [ ] Frontend loads without errors
- [ ] Redis available for Celery worker

### Data Integrity
- [ ] `judgments` table has expected row count (~6K)
- [ ] PL judgments present: `SELECT count(*) FROM judgments WHERE jurisdiction = 'PL'`
- [ ] UK judgments present: `SELECT count(*) FROM judgments WHERE jurisdiction = 'UK'`
- [ ] Embeddings populated: `SELECT count(*) FROM judgments WHERE embedding IS NOT NULL`

### Base-Schema Extraction Coverage
- [ ] Run extraction report: `python scripts/run_base_extraction.py --dry-run`
- [ ] Review completion report: `data/extraction_report_*.json`
- [ ] Coverage target met (>95% completed):
  ```sql
  SELECT base_extraction_status, count(*)
  FROM judgments
  GROUP BY base_extraction_status;
  ```
- [ ] At least one PL batch completed successfully
- [ ] At least one UK batch completed successfully
- [ ] Failed extractions reviewed and retried: `python scripts/run_base_extraction.py --failed-only`

### Search
- [ ] Text search returns results for Polish query
- [ ] Text search returns results for English query
- [ ] Semantic search returns results
- [ ] Hybrid search combines both modalities
- [ ] Search pagination works

### Extraction Browsing
- [ ] `/extractions/base-schema/definition` returns schema
- [ ] `/extractions/base-schema/filter` returns filtered results
- [ ] Faceted filters work for enum fields
- [ ] Export to CSV/XLSX works

### UI
- [ ] Homepage loads
- [ ] Search page renders results
- [ ] Document detail page shows judgment text
- [ ] Extraction data visible on document page

## Post-release
- [ ] Monitor error rates in Langfuse
- [ ] Check backend logs for exceptions: `docker compose logs backend`
- [ ] Verify no rate-limit errors in worker: `docker compose logs backend-worker`
