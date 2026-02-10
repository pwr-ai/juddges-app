# Quick Start: Apply Enhanced Filtering Migration

## Prerequisites

You need Supabase credentials to apply this migration. If you don't have a Supabase project yet:

1. **Create a Supabase project** at https://supabase.com/dashboard
2. **Get your credentials** from: Project Settings → API

You'll need:
- `SUPABASE_URL` (e.g., `https://abcdefgh.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` (starts with `eyJ...`)
- `DATABASE_URL` (optional, for direct PostgreSQL access)

## Option 1: Automated Setup (Recommended)

### Step 1: Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit .env and set your credentials
nano .env  # or use your preferred editor
```

Required variables in `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.your-project.supabase.co:5432/postgres
```

### Step 2: Run Setup Script

```bash
./scripts/setup_and_migrate.sh
```

This script will:
- ✓ Check your environment configuration
- ✓ Test database connection
- ✓ Apply the migration
- ✓ Verify the migration succeeded
- ✓ Run automated tests

## Option 2: Manual Migration

### Step 1: Configure Environment

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.your-project.supabase.co:5432/postgres"
```

### Step 2: Apply Migration via psql

```bash
psql $DATABASE_URL -f supabase/migrations/20260209000002_extend_judgments_filtering.sql
```

**Or** via Supabase CLI:

```bash
cd supabase
npx supabase db push
```

### Step 3: Verify Migration

```sql
-- Check indexes were created
SELECT indexname FROM pg_indexes
WHERE tablename = 'judgments'
  AND indexname LIKE 'idx_judgments_%'
ORDER BY indexname;

-- Check functions exist
\df public.search_judgments_hybrid
\df public.get_judgment_facets

-- Test search function
SELECT id, title, combined_score
FROM search_judgments_hybrid(
    search_text := 'test',
    search_language := 'polish',
    result_limit := 5
);

-- Test facets function
SELECT facet_type, facet_value, facet_count
FROM get_judgment_facets()
LIMIT 10;
```

### Step 4: Run Verification Script

```bash
# Install dependencies
pip install supabase loguru requests

# Run verification
python3 scripts/verify_filtering_implementation.py
```

## Option 3: Docker-based Migration

If you're using Docker:

### Step 1: Ensure .env file exists

```bash
cp .env.example .env
# Edit .env with your credentials
```

### Step 2: Run migration via Docker

```bash
# Start database service
docker compose up -d postgres  # if using local postgres

# Or connect to Supabase and run migration
docker compose run --rm backend bash -c "
  psql \$DATABASE_URL -f /app/../supabase/migrations/20260209000002_extend_judgments_filtering.sql
"
```

## Verification Checklist

After applying the migration, verify:

- [ ] **7 new indexes created**:
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'judgments' AND indexname ~ 'idx_judgments_(case_type|decision_type|outcome|court_level|cited_legislation|jurisdiction_court_level_date|case_type_date)'"
  ```
  Expected: 7

- [ ] **Polish/English FTS indexes**:
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname IN ('idx_judgments_full_text_search_pl', 'idx_judgments_full_text_search_en')"
  ```
  Expected: 2

- [ ] **Functions exist**:
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_proc WHERE proname IN ('search_judgments_hybrid', 'get_judgment_facets')"
  ```
  Expected: 2

- [ ] **Test search works**:
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM search_judgments_hybrid(search_text := 'test', result_limit := 1)"
  ```
  Expected: No errors (may return 0 or more results)

- [ ] **Test facets works**:
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM get_judgment_facets()"
  ```
  Expected: Number of facet rows (0+ depending on data)

## Troubleshooting

### Error: "relation 'judgments' does not exist"

**Solution**: Run the base migration first:
```bash
psql $DATABASE_URL -f supabase/migrations/20260209000001_create_judgments_table.sql
```

### Error: "function already exists"

**Solution**: Drop existing functions and reapply:
```bash
psql $DATABASE_URL -c "DROP FUNCTION IF EXISTS public.search_judgments_hybrid CASCADE"
psql $DATABASE_URL -c "DROP FUNCTION IF EXISTS public.get_judgment_facets CASCADE"
psql $DATABASE_URL -f supabase/migrations/20260209000002_extend_judgments_filtering.sql
```

### Error: "index already exists"

**Solution**: Migration uses `CREATE INDEX IF NOT EXISTS`, so this shouldn't happen. If it does:
```bash
# Drop and recreate
psql $DATABASE_URL -c "DROP INDEX IF EXISTS public.idx_judgments_case_type"
# Then rerun migration
```

### Connection Issues

**Check 1**: Verify DATABASE_URL format
```bash
echo $DATABASE_URL
# Should be: postgresql://postgres:[PASSWORD]@db.project.supabase.co:5432/postgres
```

**Check 2**: Test connection
```bash
psql $DATABASE_URL -c "SELECT version()"
```

**Check 3**: Check firewall/network
```bash
ping db.your-project.supabase.co
```

## What Gets Created

### Indexes (9 total):
1. `idx_judgments_case_type` - B-tree, partial
2. `idx_judgments_decision_type` - B-tree, partial
3. `idx_judgments_outcome` - B-tree, partial
4. `idx_judgments_court_level` - B-tree, partial
5. `idx_judgments_cited_legislation` - GIN array
6. `idx_judgments_jurisdiction_court_level_date` - B-tree composite
7. `idx_judgments_case_type_date` - B-tree composite
8. `idx_judgments_full_text_search_pl` - GIN, Polish stemming
9. `idx_judgments_full_text_search_en` - GIN, English stemming

### Functions (2 total):
1. `search_judgments_hybrid()` - Hybrid search with 11 filters
2. `get_judgment_facets()` - Facet aggregation

### Storage Impact:
- ~200-300MB additional space (for 100k judgments)
- ~15-20% increase in total database size

## Next Steps

After successful migration:

1. **Deploy Backend**:
   ```bash
   cd backend
   docker compose up --build backend
   ```

2. **Test API Endpoints**:
   ```bash
   # Search with filters
   curl -X POST http://localhost:8004/documents/search \
     -H "Content-Type: application/json" \
     -d '{"query": "test", "jurisdictions": ["PL"], "limit_docs": 5}'

   # Get facets
   curl "http://localhost:8004/documents/facets?jurisdiction=PL"
   ```

3. **Update Frontend** (optional):
   - Modify search store to pass filters to backend
   - Remove client-side filtering
   - Use facets for dynamic filter UI

## Support

- **Documentation**: `FILTERING_IMPLEMENTATION_SUMMARY.md`
- **Detailed Checklist**: `MIGRATION_CHECKLIST.md`
- **Verification Script**: `scripts/verify_filtering_implementation.py`
- **Setup Script**: `scripts/setup_and_migrate.sh`

## Rollback

If you need to rollback:

```bash
# Drop new functions
psql $DATABASE_URL -c "DROP FUNCTION IF EXISTS public.search_judgments_hybrid CASCADE"
psql $DATABASE_URL -c "DROP FUNCTION IF EXISTS public.get_judgment_facets CASCADE"

# Drop new indexes
psql $DATABASE_URL -c "
DROP INDEX IF EXISTS public.idx_judgments_case_type;
DROP INDEX IF EXISTS public.idx_judgments_decision_type;
DROP INDEX IF EXISTS public.idx_judgments_outcome;
DROP INDEX IF EXISTS public.idx_judgments_court_level;
DROP INDEX IF EXISTS public.idx_judgments_cited_legislation;
DROP INDEX IF EXISTS public.idx_judgments_jurisdiction_court_level_date;
DROP INDEX IF EXISTS public.idx_judgments_case_type_date;
DROP INDEX IF EXISTS public.idx_judgments_full_text_search_pl;
DROP INDEX IF EXISTS public.idx_judgments_full_text_search_en;
"

# Restore old English-only FTS index
psql $DATABASE_URL -c "
CREATE INDEX idx_judgments_full_text_search ON public.judgments
    USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(full_text, '')));
"
```

---

**Ready to migrate?** Choose your preferred option above and follow the steps!
