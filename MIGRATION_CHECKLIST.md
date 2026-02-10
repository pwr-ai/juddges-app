# Enhanced Filtering Migration Checklist

Use this checklist to apply the enhanced filtering implementation to your Juddges App instance.

## Pre-Migration

- [ ] **Backup database** (critical!)
  ```bash
  # Via Supabase CLI
  npx supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql

  # Or via pg_dump
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **Verify current state**
  ```sql
  -- Check judgment count
  SELECT COUNT(*) FROM judgments;

  -- Check existing indexes
  \di public.idx_judgments*

  -- Verify embeddings exist
  SELECT COUNT(*) FROM judgments WHERE embedding IS NOT NULL;
  ```

- [ ] **Test on staging first** (if available)
  - Clone production database to staging
  - Apply migration to staging
  - Run verification tests
  - Benchmark performance

## Migration Steps

### 1. Apply Database Migration

- [ ] **Option A: Using Supabase CLI** (recommended)
  ```bash
  cd supabase
  npx supabase db push
  ```

- [ ] **Option B: Manual SQL execution**
  ```bash
  psql $DATABASE_URL < supabase/migrations/20260209000002_extend_judgments_filtering.sql
  ```

- [ ] **Verify no errors**
  - Check migration output for errors
  - Confirm all indexes created
  - Verify functions exist

### 2. Verify Database Changes

- [ ] **Check indexes created**
  ```sql
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'judgments' AND schemaname = 'public'
  ORDER BY indexname;
  ```

  Expected: Should see 9 new indexes including:
  - `idx_judgments_case_type`
  - `idx_judgments_full_text_search_pl`
  - `idx_judgments_full_text_search_en`
  - etc.

- [ ] **Verify functions exist**
  ```sql
  \df public.search_judgments_hybrid
  \df public.get_judgment_facets
  ```

- [ ] **Test search function**
  ```sql
  SELECT id, title, combined_score
  FROM search_judgments_hybrid(
      search_text := 'prawo',
      search_language := 'polish',
      filter_jurisdictions := ARRAY['PL'],
      result_limit := 5
  );
  ```

- [ ] **Test facets function**
  ```sql
  SELECT facet_type, facet_value, facet_count
  FROM get_judgment_facets()
  WHERE facet_type = 'case_type'
  ORDER BY facet_count DESC
  LIMIT 5;
  ```

### 3. Deploy Backend Changes

- [ ] **Verify Python syntax**
  ```bash
  python3 -m py_compile backend/app/models.py
  python3 -m py_compile backend/app/documents.py
  ```

- [ ] **Option A: Docker deployment**
  ```bash
  cd backend
  docker compose up --build backend
  ```

- [ ] **Option B: Development deployment**
  ```bash
  cd backend
  poetry install
  poetry run uvicorn app.server:app --reload --port 8004
  ```

- [ ] **Check backend logs**
  ```bash
  # Docker
  docker compose logs -f backend

  # Or check terminal output for errors
  ```

### 4. Run Verification Tests

- [ ] **Install test dependencies**
  ```bash
  pip install supabase loguru requests
  ```

- [ ] **Set environment variables**
  ```bash
  export SUPABASE_URL="your-supabase-url"
  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
  export BACKEND_URL="http://localhost:8004"  # Or production URL
  ```

- [ ] **Run verification script**
  ```bash
  python scripts/verify_filtering_implementation.py
  ```

- [ ] **All tests pass?**
  - Database Connection: ✓
  - Indexes: ✓
  - Search Function: ✓
  - Facets Function: ✓
  - Hybrid Search with Filters: ✓
  - Polish Full-Text Search: ✓
  - Backend API Endpoints: ✓

### 5. Manual API Testing

- [ ] **Test search endpoint with filters**
  ```bash
  curl -X POST http://localhost:8004/documents/search \
    -H "Content-Type: application/json" \
    -d '{
      "query": "prawa człowieka",
      "alpha": 0.7,
      "jurisdictions": ["PL"],
      "case_types": ["Criminal"],
      "limit_docs": 5
    }'
  ```

- [ ] **Test facets endpoint**
  ```bash
  curl "http://localhost:8004/documents/facets?jurisdiction=PL"
  ```

- [ ] **Verify response structure**
  - Search returns: chunks, documents, timing_breakdown, pagination
  - Facets returns: facets grouped by type with counts

### 6. Performance Verification

- [ ] **Benchmark search performance**
  ```sql
  \timing on
  SELECT * FROM search_judgments_hybrid(
      search_text := 'prawo karne',
      filter_jurisdictions := ARRAY['PL'],
      filter_case_types := ARRAY['Criminal'],
      result_limit := 20
  );
  ```

  Expected: <200ms for 100k judgments

- [ ] **Benchmark faceting performance**
  ```sql
  \timing on
  SELECT * FROM get_judgment_facets(
      pre_filter_jurisdictions := ARRAY['PL']
  );
  ```

  Expected: <300ms for 100k judgments

- [ ] **Check index usage**
  ```sql
  EXPLAIN (ANALYZE, BUFFERS)
  SELECT * FROM judgments
  WHERE case_type = 'Criminal' AND jurisdiction = 'PL'
  ORDER BY decision_date DESC LIMIT 20;
  ```

  Expected: Should use `idx_judgments_case_type` or composite index

### 7. Monitor Production (if deploying to prod)

- [ ] **Monitor error rates**
  - Check backend logs for errors
  - Monitor `/documents/search` endpoint
  - Monitor `/documents/facets` endpoint

- [ ] **Monitor performance**
  - Check Supabase dashboard for slow queries
  - Verify search latency <200ms
  - Check database CPU/memory usage

- [ ] **Monitor index usage**
  ```sql
  SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
  FROM pg_stat_user_indexes
  WHERE tablename = 'judgments'
  ORDER BY idx_scan DESC;
  ```

- [ ] **Verify no regressions**
  - Existing searches still work
  - No performance degradation
  - Frontend still functional (if deployed)

## Post-Migration

### Success Criteria

- [ ] All database indexes created successfully
- [ ] Both functions (`search_judgments_hybrid`, `get_judgment_facets`) exist and work
- [ ] Backend API endpoints respond correctly
- [ ] Search performance improved (2-5s → <200ms)
- [ ] Faceting works and returns accurate counts
- [ ] Polish full-text search returns relevant results
- [ ] No increase in error rates
- [ ] Database CPU/memory usage acceptable

### Update Documentation

- [ ] Update API documentation with new filter parameters
- [ ] Update frontend documentation (if applicable)
- [ ] Document any performance issues encountered
- [ ] Update team on new filtering capabilities

### Communication

- [ ] Notify team of new filtering features
- [ ] Share performance improvements
- [ ] Document any breaking changes (none expected)
- [ ] Update user-facing documentation

## Rollback Plan

If issues occur after migration:

### Backend Rollback

- [ ] **Revert to previous version**
  ```bash
  git checkout <previous-commit>
  docker compose up --build backend
  ```

### Database Rollback

- [ ] **Option 1: Keep migration, drop indexes** (safer, retains functions)
  ```sql
  -- Drop performance indexes (keeps backward compatibility)
  DROP INDEX IF EXISTS public.idx_judgments_case_type;
  DROP INDEX IF EXISTS public.idx_judgments_decision_type;
  -- ... etc (see FILTERING_IMPLEMENTATION_SUMMARY.md)

  -- Recreate old English-only index
  CREATE INDEX idx_judgments_full_text_search ON public.judgments
      USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(full_text, '')));
  ```

- [ ] **Option 2: Full rollback** (if functions cause issues)
  ```sql
  -- Drop new functions
  DROP FUNCTION IF EXISTS public.search_judgments_hybrid;
  DROP FUNCTION IF EXISTS public.get_judgment_facets;

  -- Drop indexes (see Option 1)
  ```

- [ ] **Option 3: Restore from backup** (nuclear option)
  ```bash
  psql $DATABASE_URL < backup_<timestamp>.sql
  ```

### Verify Rollback

- [ ] Existing searches work
- [ ] Backend starts without errors
- [ ] Frontend functions normally
- [ ] Performance is acceptable

## Troubleshooting

### Migration Fails with "function already exists"

**Solution**: Drop and recreate
```sql
DROP FUNCTION IF EXISTS public.search_judgments_hybrid;
DROP FUNCTION IF EXISTS public.get_judgment_facets;
-- Re-run migration
```

### Search Returns No Results

**Check 1**: Verify filters aren't too restrictive
```bash
curl "http://localhost:8004/documents/facets"
# Check what values actually exist in data
```

**Check 2**: Verify embeddings exist
```sql
SELECT COUNT(*) FROM judgments WHERE embedding IS NOT NULL;
```

### Performance Still Slow (>500ms)

**Check 1**: Verify indexes are being used
```sql
EXPLAIN (ANALYZE) SELECT * FROM search_judgments_hybrid(...);
```

**Check 2**: Update statistics
```sql
ANALYZE public.judgments;
```

**Check 3**: Increase work_mem temporarily
```sql
SET work_mem = '256MB';
```

### Backend API Errors

**Check 1**: Verify environment variables
```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

**Check 2**: Check backend logs
```bash
docker compose logs -f backend
```

**Check 3**: Test database connection directly
```python
from supabase import create_client
client = create_client(url, key)
response = client.table("judgments").select("id").limit(1).execute()
print(response.data)
```

## Additional Resources

- **Implementation Summary**: `FILTERING_IMPLEMENTATION_SUMMARY.md`
- **Migration File**: `supabase/migrations/20260209000002_extend_judgments_filtering.sql`
- **Verification Script**: `scripts/verify_filtering_implementation.py`
- **Project Documentation**: `CLAUDE.md`

## Notes

- **Estimated migration time**: 5-10 minutes
- **Estimated downtime**: <1 minute (if rolling deployment)
- **Database size increase**: ~15-20% (for indexes)
- **Expected performance improvement**: 10-50x faster searches

---

**Date Applied**: _______________

**Applied By**: _______________

**Version/Commit**: _______________

**Issues Encountered**: _______________

**Resolution**: _______________
