# Weaviate Cleanup Checklist

## Overview
Complete removal of all Weaviate legacy code from the Juddges App codebase. The project has migrated to Supabase pgvector for all vector search operations.

## Completed (Previous Work)
- [x] Implemented Supabase search (`supabase_search.py`)
- [x] Updated main imports in backend packages
- [x] Updated chain files to use Supabase
- [x] Removed weaviate-client from package dependencies
- [x] Removed WEAVIATE_URL from .env

## Backend Cleanup

### Files to Delete
- [ ] `backend/packages/juddges_search/fixed_weaviate_benchmark.py`
- [ ] `backend/packages/juddges_search/juddges_search/performance/weaviate_benchmark.py`
- [ ] `backend/packages/juddges_search/juddges_search/performance/verify_setup.py` (references Weaviate)
- [ ] `backend/packages/juddges_search/juddges_search/performance/optimize_schema.py` (Weaviate-specific)
- [ ] `backend/packages/juddges_search/juddges_search/performance/schema_migration.py` (Weaviate-specific)
- [ ] `backend/packages/juddges_search/juddges_search/performance/optimized_schema.py` (Weaviate-specific)
- [ ] `backend/packages/juddges_search/juddges_search/performance/cli.py` (references weaviate_benchmark)
- [ ] `backend/packages/juddges_search/juddges_search/retrieval/similarity.py` (uses WeaviateLegalDatabase)
- [ ] `backend/packages/juddges_search/juddges_search/ingest/ingest_to_weaviate.py`
- [ ] `backend/run_performance_tests.py` (references weaviate_benchmark)
- [ ] `backend/scripts/enable_nullstate_index_for_factual_legal_state.py` (Weaviate-specific)
- [ ] `backend/scripts/update_dashboard_stats.py` (uses Weaviate client)
- [ ] `backend/scripts/add_factual_legal_state_properties.py` (Weaviate-specific)
- [ ] `backend/scripts/fix_weaviate_schema.py` (if exists)

### Files to Update

#### Health Checks
- [ ] `backend/app/health/checks.py`
  - Remove `check_weaviate()` function
  - Remove Weaviate imports
  - Update `check_all_services()` to remove Weaviate

- [ ] `backend/app/health/router.py`
  - Remove Weaviate from critical services list
  - Remove Weaviate from DependencyInfo

- [ ] `backend/app/health/models.py`
  - Remove Weaviate from example responses

#### Code References
- [ ] `backend/packages/juddges_search/juddges_search/db/supabase_db.py`
  - Update comments referencing Weaviate document IDs
  
- [ ] `backend/packages/juddges_search/juddges_search/retrieval/filters.py`
  - Remove `build_weaviate_filters()` function
  - Remove Weaviate imports

- [ ] `backend/packages/juddges_search/juddges_search/retrieval/fetch.py`
  - Already deprecated, verify no active usage

- [ ] `backend/packages/juddges_search/juddges_search/retrieval/utils.py`
  - Remove Weaviate conversion functions:
    - `convert_weaviate_obj_to_legal_document()`
    - `convert_weaviate_obj_to_document_chunk()`
    - `convert_weaviate_obj_to_legal_document_metadata()`

- [ ] `backend/packages/juddges_search/juddges_search/retrieval/config.py`
  - Update comments to remove Weaviate references

- [ ] `backend/packages/juddges_search/juddges_search/models.py`
  - Remove Weaviate-specific model fields

- [ ] `backend/app/dashboard.py`
  - Remove WEAVIATE_AVAILABLE flag
  - Remove Weaviate fallback logic

- [ ] `backend/app/collections.py`
  - Update comments about Weaviate document IDs

- [ ] `backend/app/extraction.py`
  - Remove WeaviateClient references
  - Remove Weaviate error handling

- [ ] `backend/app/core/secrets.py`
  - Remove `get_weaviate_key()` function

- [ ] `backend/app/api/schema_generator.py`
  - Remove WeaviateSearchClient alias

- [ ] `backend/app/api/legal.py`
  - Remove Weaviate from dependency list

- [ ] `backend/app/models.py`
  - Update docstrings removing Weaviate references

- [ ] `backend/app/utils/document_fetcher.py`
  - Update comments about Weaviate

- [ ] `backend/app/evaluations.py`
  - Update docstring (Weaviate document ID → document ID)

- [ ] `backend/app/playground.py`
  - Update docstrings

#### Configuration Files
- [ ] `backend/pyproject.toml`
  - Remove commented Weaviate test commands

- [ ] `backend/.env.example`
  - Remove WEAVIATE_URL, WEAVIATE_HOST references

#### Test Files
- [ ] `backend/tests/conftest.py`
  - Remove `weaviate_connection` fixture
  - Update test markers

- [ ] `backend/tests/test_chat_history_integration.py`
  - Remove WEAVIATE_URL check

## Frontend Cleanup

### Dependencies
- [ ] `frontend/package.json`
  - Remove weaviate-client dependency

- [ ] Run `npm uninstall weaviate-client` in frontend/

### Code Files
- [ ] Search for and update Weaviate error handling in frontend code
- [ ] Update type definitions if WeaviateDocument exists

## Documentation Updates

### Main Documentation
- [ ] `README.md` - Remove Weaviate mentions
- [ ] `CLAUDE.md` - Update migration notes (done → completed)
- [ ] `SETUP_GUIDE.md` - Remove Weaviate setup instructions
- [ ] `AI_COMPONENT_REVIEW.md` - Update to reflect completion
- [ ] `AI_REVIEW_SUMMARY.md` - Update status
- [ ] `AI_QUICK_REFERENCE.md` - Remove Weaviate references

### Backend Documentation
- [ ] `backend/README.md` - Remove Weaviate sections
- [ ] `backend/packages/juddges_search/SUPABASE_SEARCH_README.md` - Update migration status
- [ ] `backend/packages/juddges_search/MIGRATION_SUMMARY.md` - Mark as complete
- [ ] `backend/packages/juddges_search/juddges_search/performance/README.md` - Add deprecation notice
- [ ] `backend/docs/WEAVIATE_CONNECTION_POOL_ENV.md` - Delete or archive
- [ ] `backend/docs/BACKEND_API_REVIEW.md` - Remove Weaviate examples
- [ ] `backend/scripts/README.md` - Remove fix_weaviate_schema.py reference
- [ ] `backend/tests/README.md` - Remove Weaviate test references

### Migration Documentation
- [ ] `docs/MANUAL_TESTING_CHECKLIST.md` - Update verification steps
- [ ] `docs/DEPLOYMENT_NEXT_STEPS.md` - Mark Weaviate removal as complete
- [ ] `docs/architecture/README.md` - Update status
- [ ] `docs/architecture/overview.md` - Update Q&A
- [ ] `docs/VERIFICATION_REPORT.md` - Archive or update
- [ ] `docs/migration/README.md` - Update checklist

### Context Files
- [ ] `.context/action-items-2026-02-11.md` - Can remain as historical record

## Final Verification

### Code Search
- [ ] Run: `grep -r "weaviate" backend/ --include="*.py" -i` → should return no results
- [ ] Run: `grep -r "weaviate" frontend/ --include="*.ts*" -i` → should return no results
- [ ] Run: `grep -r "from.*weaviate" backend/ --include="*.py"` → should return no results
- [ ] Run: `grep -r "import weaviate" backend/ --include="*.py"` → should return no results

### Testing
- [ ] Backend tests pass: `cd backend && poetry run pytest tests/ -v`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] No runtime errors referencing Weaviate

### Health Checks
- [ ] `/health` endpoint returns all services healthy
- [ ] No Weaviate in critical services list
- [ ] Supabase health check working

## Completion Criteria

1. Zero grep results for "weaviate" in Python and TypeScript files
2. All tests passing
3. Documentation updated and consistent
4. Health checks working without Weaviate
5. No Weaviate environment variables in .env.example
6. Frontend builds without errors
7. No deprecated imports or functions remaining

## Notes

- Weaviate code is preserved in git history
- Migration was completed in commit: abf8d6f
- Supabase pgvector is the sole vector search solution
- This cleanup removes dead code and improves maintainability
