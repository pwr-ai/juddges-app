# Supabase MCP Integration Guide

This guide shows how to use the Supabase Model Context Protocol (MCP) tools with your Juddges App database.

## 🔧 Available MCP Tools

Based on the MCP tools available in your Claude Code session, you can interact with your Supabase database programmatically:

### Database Schema Operations

1. **`mcp__supabase__list_tables`** - List all tables in your database
2. **`mcp__supabase__list_extensions`** - List PostgreSQL extensions (pgvector, etc.)
3. **`mcp__supabase__list_migrations`** - View migration history

### Data Operations

4. **`mcp__supabase__execute_sql`** - Run SQL queries (SELECT, UPDATE, DELETE)
5. **`mcp__supabase__apply_migration`** - Apply new database migrations

### Monitoring & Analytics

6. **`mcp__supabase__get_logs`** - View service logs (API, Postgres, Auth, etc.)
7. **`mcp__supabase__get_advisors`** - Get security & performance recommendations

### Project Management

8. **`mcp__supabase__get_project_url`** - Get your project's API URL
9. **`mcp__supabase__get_publishable_keys`** - Get API keys for client access

### TypeScript Type Generation

10. **`mcp__supabase__generate_typescript_types`** - Generate TypeScript types from schema

### Branching (Development Environments)

11. **`mcp__supabase__create_branch`** - Create development branch
12. **`mcp__supabase__list_branches`** - List all branches
13. **`mcp__supabase__merge_branch`** - Merge branch to production

## 📝 Common Usage Examples

### Example 1: List Tables

Check what tables exist in your database:

```javascript
// Using MCP tool
mcp__supabase__list_tables({
  schemas: ["public"]
})

// Expected response:
// Tables: judgments, auth.users, ...
```

### Example 2: Query Judgments

Retrieve judgments from your database:

```sql
-- Using execute_sql tool
SELECT
  id,
  case_number,
  jurisdiction,
  title,
  decision_date,
  court_name
FROM judgments
WHERE jurisdiction = 'PL'
ORDER BY decision_date DESC
LIMIT 10;
```

### Example 3: Count by Jurisdiction

Get statistics on your judgment data:

```sql
SELECT
  jurisdiction,
  COUNT(*) as total_judgments,
  COUNT(DISTINCT court_name) as unique_courts,
  MIN(decision_date) as earliest_date,
  MAX(decision_date) as latest_date
FROM judgments
GROUP BY jurisdiction;
```

### Example 4: Semantic Search

Search judgments by vector similarity:

```sql
-- First, you'd generate an embedding for the query
-- Then search using the function we created:
SELECT * FROM search_judgments_by_embedding(
  ARRAY[0.1, 0.2, ...]::vector(1536),  -- Your query embedding
  0.7,  -- Similarity threshold
  10,   -- Number of results
  'PL'  -- Filter by jurisdiction (optional)
);
```

### Example 5: Full-Text Search

Search judgments using PostgreSQL full-text search:

```sql
SELECT * FROM search_judgments_by_text(
  'criminal appeal tax liability',  -- Search query
  'UK',  -- Filter by jurisdiction (optional)
  20     -- Number of results
);
```

### Example 6: Get Recent Judgments

Query the most recently added judgments:

```sql
SELECT
  case_number,
  jurisdiction,
  title,
  decision_date,
  created_at
FROM judgments
ORDER BY created_at DESC
LIMIT 20;
```

### Example 7: Check Embeddings Status

See how many judgments have embeddings:

```sql
SELECT
  jurisdiction,
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  ROUND(100.0 * COUNT(embedding) / COUNT(*), 2) as percentage
FROM judgments
GROUP BY jurisdiction;
```

### Example 8: Search by Keywords

Find judgments matching specific keywords:

```sql
SELECT
  case_number,
  title,
  keywords,
  jurisdiction
FROM judgments
WHERE keywords && ARRAY['tax', 'liability']  -- Overlaps with keywords
ORDER BY decision_date DESC
LIMIT 10;
```

## 🔐 Security & Access Control

### Row Level Security (RLS)

If you want to enable RLS for user-specific access:

```sql
-- Enable RLS on judgments table
ALTER TABLE judgments ENABLE ROW LEVEL SECURITY;

-- Allow public read access (all users can view judgments)
CREATE POLICY "Allow public read access"
ON judgments
FOR SELECT
TO public
USING (true);

-- Only authenticated users can insert
CREATE POLICY "Authenticated users can insert"
ON judgments
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Only service role can update/delete
CREATE POLICY "Service role full access"
ON judgments
FOR ALL
TO service_role
USING (true);
```

### API Key Management

```javascript
// Get your publishable keys
mcp__supabase__get_publishable_keys()

// Returns:
// - anon key (safe for client-side)
// - service_role key (server-side only, never expose)
```

## 📊 Monitoring & Performance

### View API Logs

```javascript
// Check API request logs
mcp__supabase__get_logs({
  service: "api"  // Options: api, postgres, auth, storage, realtime
})
```

### Get Security Advisors

```javascript
// Check for security issues
mcp__supabase__get_advisors({
  type: "security"  // Options: security, performance
})

// Common advisories:
// - Missing RLS policies
// - Unindexed foreign keys
// - Exposed service role keys
```

### Performance Optimization

```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM judgments
WHERE jurisdiction = 'UK'
AND decision_date > '2020-01-01';

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## 🔄 Development Workflow

### Create Development Branch

For testing schema changes without affecting production:

```javascript
// Create a development branch
mcp__supabase__create_branch({
  name: "develop",
  confirm_cost_id: "cost_id_from_confirmation"
})

// List branches
mcp__supabase__list_branches()

// Work on your branch, then merge when ready
mcp__supabase__merge_branch({
  branch_id: "your_branch_id"
})
```

## 🎨 TypeScript Type Generation

Generate TypeScript types for your frontend:

```javascript
// Generate types from your schema
mcp__supabase__generate_typescript_types()

// Save to file: frontend/types/supabase.ts
// Use in your Next.js app:
// import { Database } from '@/types/supabase'
```

## 🚀 Advanced Queries

### Complex Search with Filters

```sql
SELECT
  j.id,
  j.case_number,
  j.title,
  j.decision_date,
  j.court_name,
  ts_rank(
    to_tsvector('english', j.full_text),
    plainto_tsquery('english', 'criminal liability')
  ) as relevance
FROM judgments j
WHERE
  j.jurisdiction = 'UK'
  AND j.decision_date BETWEEN '2020-01-01' AND '2024-12-31'
  AND j.case_type = 'Criminal'
  AND to_tsvector('english', j.full_text) @@
      plainto_tsquery('english', 'criminal liability')
ORDER BY relevance DESC, j.decision_date DESC
LIMIT 20;
```

### Aggregate Statistics

```sql
SELECT
  DATE_TRUNC('year', decision_date) as year,
  jurisdiction,
  court_name,
  COUNT(*) as judgment_count
FROM judgments
WHERE decision_date IS NOT NULL
GROUP BY year, jurisdiction, court_name
ORDER BY year DESC, judgment_count DESC;
```

### Similar Cases (Vector Similarity)

```sql
-- Find cases similar to a specific case
WITH target_case AS (
  SELECT embedding
  FROM judgments
  WHERE case_number = 'I ACa 123/21'
)
SELECT
  j.case_number,
  j.title,
  1 - (j.embedding <=> tc.embedding) as similarity
FROM judgments j, target_case tc
WHERE j.embedding IS NOT NULL
  AND j.case_number != 'I ACa 123/21'
ORDER BY j.embedding <=> tc.embedding
LIMIT 10;
```

## 🛠️ Maintenance Tasks

### Vacuum and Analyze

Keep your database performant:

```sql
-- Vacuum to reclaim storage
VACUUM ANALYZE judgments;

-- Update statistics
ANALYZE judgments;
```

### Check Database Size

```sql
SELECT
  pg_size_pretty(pg_database_size(current_database())) as db_size,
  pg_size_pretty(pg_relation_size('judgments')) as judgments_table_size,
  pg_size_pretty(pg_indexes_size('judgments')) as judgments_indexes_size;
```

### Backup Data

```sql
-- Export to JSON (use execute_sql with COPY TO)
COPY (
  SELECT json_agg(t)
  FROM (
    SELECT * FROM judgments
    WHERE jurisdiction = 'PL'
    LIMIT 100
  ) t
) TO '/tmp/polish_judgments_backup.json';
```

## 📚 Resources

- **Supabase Docs**: https://supabase.com/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **pgvector Docs**: https://github.com/pgvector/pgvector
- **MCP Specification**: https://modelcontextprotocol.io/

---

**Pro Tip**: Use the MCP tools in your Claude Code sessions to quickly query and manage your Juddges database without leaving your development environment!
