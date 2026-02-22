# Frontend Weaviate Refactoring Needed

## Overview
The frontend still has several files that attempt to connect directly to Weaviate. These need to be refactored to use the backend API instead.

## Files Requiring Major Refactoring

### Statistics Routes (CRITICAL - Currently Broken)
These routes try to connect directly to Weaviate, which no longer exists:

1. **`frontend/app/api/statistics/route.ts`**
   - Uses `withWeaviateClient()` and `getWeaviateCollection()`
   - Needs: Backend API endpoint `/api/stats` or similar
   - Status: BROKEN - Will fail at runtime

2. **`frontend/app/api/statistics/precompute/route.ts`**
   - Uses `withWeaviateClient()` and `getWeaviateCollection()`
   - Needs: Backend API endpoint for precomputing statistics
   - Status: BROKEN - Will fail at runtime

3. **`frontend/app/api/statistics/sample-document/route.ts`**
   - Uses `withWeaviateClient()` and `getWeaviateCollection()`
   - Needs: Backend API endpoint `/api/documents/random` or similar
   - Status: BROKEN - Will fail at runtime

4. **`frontend/app/api/diagnostics/weaviate/route.ts`**
   - Diagnostic route for Weaviate health checks
   - Needs: Either deletion or migration to backend health endpoint
   - Status: BROKEN - Should be deleted

### Collection and Error Handling Files
These files reference Weaviate in error handling but might still work:

5. **`frontend/app/collections/[id]/client.tsx`**
   - Checks for `isWeaviateError` and `_isWeaviateError` flags
   - Updates: Change to `isDatabaseError` / `_isDatabaseError`
   - Status: Needs update for consistency

6. **`frontend/app/api/extractions/route.ts`**
   - Comments mention "Weaviate IDs" but functionality correct
   - Updates: Update comments only
   - Status: LOW priority

7. **`frontend/app/enterprise/content.ts`**
   - Lists "Weaviate" in technology stack
   - Updates: Remove from tech stack, replace with "Supabase pgvector"
   - Status: Documentation only

8. **`frontend/lib/styles/components/document-card.tsx`**
   - References `_isWeaviateError` flag
   - Updates: Change to `_isDatabaseError`
   - Status: Needs update for consistency

## Recommended Approach

### Phase 1: Quick Fixes (Do Now)
1. Delete `frontend/app/api/diagnostics/weaviate/route.ts` (obsolete)
2. Update `frontend/app/enterprise/content.ts` tech stack
3. Update error flag names (`_isWeaviateError` → `_isDatabaseError`)
4. Update comments in `extractions/route.ts`

### Phase 2: Backend API Development (Required Before Statistics Work)
1. Create backend endpoint: `GET /api/statistics` → Dashboard stats
2. Create backend endpoint: `GET /api/statistics/precompute` → Precompute stats
3. Create backend endpoint: `GET /api/documents/random` → Random document sample

### Phase 3: Frontend Refactoring (After Backend APIs Ready)
1. Refactor `statistics/route.ts` to call backend API
2. Refactor `statistics/precompute/route.ts` to call backend API
3. Refactor `statistics/sample-document/route.ts` to call backend API
4. Test statistics page functionality

## Impact Assessment

### Currently Broken Features
- Statistics page (`/statistics`) - Cannot connect to Weaviate
- Statistics precomputation - Cannot connect to Weaviate
- Sample document fetching - Cannot connect to Weaviate
- Weaviate diagnostics endpoint - Obsolete

### Working Features
- Search functionality - Uses backend API ✓
- Chat functionality - Uses backend API ✓
- Collections - Uses backend API ✓
- Document fetching - Uses backend API ✓

## Notes
- The backend already has most statistics logic in `backend/app/dashboard.py`
- Frontend statistics routes were trying to bypass the backend (anti-pattern)
- Proper architecture: Frontend → Backend API → Supabase
- This refactoring aligns frontend with proper API boundaries
