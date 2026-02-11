# Deployment Next Steps - Quick Start Guide

All implementation work is complete! Follow these steps to finalize deployment.

## 🚀 Quick Start (5 Steps)

### Step 1: Update Dependencies (5 min)

```bash
# Backend
cd /home/laugustyniak/github/legal-ai/juddges-app/backend
poetry lock --no-update
poetry install

# Frontend
cd /home/laugustyniak/github/legal-ai/juddges-app/frontend
npm install  # Should be up-to-date already
```

**Expected:** Poetry lockfile updates, dependencies install without errors.

---

### Step 2: Apply Database Migration (2 min)

```bash
cd /home/laugustyniak/github/legal-ai/juddges-app/supabase

# If not linked, link to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Apply migration
npx supabase db push
```

**Expected:** Migration `20260211000003_add_chunk_metadata_to_search.sql` applies successfully.

---

### Step 3: Run Verification Script (1 min)

```bash
cd /home/laugustyniak/github/legal-ai/juddges-app
./scripts/verify-deployment.sh
```

**Expected:** All checks pass (✓). If any fail, see troubleshooting section below.

---

### Step 4: Run Automated Tests (10 min)

```bash
# Backend tests
cd /home/laugustyniak/github/legal-ai/juddges-app/backend
poetry run pytest tests/ -v --tb=short

# Frontend tests (if configured)
cd /home/laugustyniak/github/legal-ai/juddges-app/frontend
npm run test
```

**Expected:**
- Backend: 67+ tests pass
- Frontend: Tests pass (if configured)

**Note:** Some integration tests may skip if API keys aren't configured. This is expected.

---

### Step 5: Manual Testing (30 min)

Follow the comprehensive checklist:

```bash
# Open checklist
cat /home/laugustyniak/github/legal-ai/juddges-app/docs/MANUAL_TESTING_CHECKLIST.md
```

Test these critical features:
1. ✅ Chat with streaming and sources
2. ✅ Search with "rabbit" and "thinking" modes
3. ✅ Schema generation workflow
4. ✅ Extraction with table view and export
5. ✅ Authentication flows

---

## 📋 What Changed (Summary)

### ✅ New Features Added
1. **Chat E2E Tests** - 12 comprehensive tests for chat functionality
2. **Enhanced Search Metadata** - Detailed chunk metadata with scoring
3. **AI Query Enhancement** - "Thinking" mode rewrites queries for better results
4. **Table View for Extractions** - View and export results in table format
5. **Schema Generation Tests** - 43 tests for schema generator

### ✅ Technical Improvements
1. **Removed Weaviate** - All vector search via Supabase pgvector
2. **Removed Deprecated Endpoints** - Cleaner API surface
3. **Better Test Coverage** - 67+ new tests across frontend and backend

### ✅ Files Changed
- **Created:** 16+ files (tests, components, utilities)
- **Modified:** 28+ files (API, models, configurations)
- **Deleted:** 14 files (Weaviate modules, deprecated code)
- **Commits:** 4 commits

---

## 🔧 Troubleshooting

### Issue: Poetry lock fails

**Solution:**
```bash
cd backend
rm poetry.lock
poetry install
```

### Issue: Supabase migration fails

**Error:** "Cannot find project ref"

**Solution:**
```bash
cd supabase
npx supabase link --project-ref YOUR_PROJECT_REF
# Then retry: npx supabase db push
```

**Error:** "Migration already applied"

**Solution:** This is OK! Migration was already applied to remote.

### Issue: Tests fail with "OpenAI API key not found"

**Solution:** This is expected for tests marked `@pytest.mark.integration`. They skip automatically. Unit tests should still pass.

To run integration tests:
```bash
export OPENAI_API_KEY=your-key
poetry run pytest tests/ -v -m integration
```

### Issue: Frontend E2E tests fail

**Solution:** Ensure dev server is running:
```bash
# Terminal 1
cd frontend && npm run dev

# Terminal 2
cd frontend && npm run test:e2e
```

### Issue: "Weaviate" errors in logs

**Solution:**
1. Run verification script to find remaining references
2. Check `.env` file - remove `WEAVIATE_*` variables
3. Restart backend server

---

## 📊 Verification Checklist

After completing Steps 1-5:

- [ ] `./scripts/verify-deployment.sh` passes
- [ ] Backend tests pass (67+ tests)
- [ ] Frontend tests pass (if configured)
- [ ] Chat works with streaming
- [ ] Search "thinking" mode enhances queries
- [ ] Table view displays extraction results
- [ ] CSV export works
- [ ] No Weaviate errors in console

---

## 🎯 Production Deployment

Once all tests pass:

### 1. Environment Variables (Production)

Update production `.env`:
```bash
# Remove (deprecated)
WEAVIATE_URL
WEAVIATE_API_KEY
WEAVIATE_USE_POOL

# Ensure these exist
SUPABASE_URL=https://prod-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=prod-service-role-key
SUPABASE_ANON_KEY=prod-anon-key
OPENAI_API_KEY=prod-openai-key
LANGGRAPH_POSTGRES_URL=postgresql://prod-db
BACKEND_API_KEY=prod-backend-key
```

### 2. Build Production Assets

```bash
# Frontend
cd frontend
npm run build
npm start  # Test production build locally

# Backend
cd backend
poetry build  # If deploying as package
```

### 3. Deploy

```bash
# Using Docker Compose
docker compose -f docker-compose.yml up -d

# Or deploy to your platform (Vercel, Railway, etc.)
```

### 4. Post-Deployment Verification

```bash
# Check health
curl https://your-domain.com/health/status

# Run smoke tests
# (Use MANUAL_TESTING_CHECKLIST.md on production)
```

---

## 📚 Documentation

**Key Documents:**
1. `docs/plans/2026-02-11-fix-gaps-and-polish.md` - Implementation plan
2. `docs/MANUAL_TESTING_CHECKLIST.md` - Testing checklist (this file)
3. `scripts/verify-deployment.sh` - Automated verification
4. `CLAUDE.md` - Updated project overview

**API Documentation:**
- Swagger UI: http://localhost:8004/docs
- ReDoc: http://localhost:8004/redoc

---

## 🎉 Success Criteria

You're ready for production when:

✅ All automated tests pass
✅ Manual testing checklist completed
✅ No Weaviate references in code or logs
✅ Search metadata includes detailed scoring
✅ "Thinking" mode enhances queries
✅ Table view exports work
✅ Chat streaming works smoothly
✅ Schema generation completes successfully
✅ All API health checks green

---

## 🆘 Need Help?

**Common Issues:**
- Weaviate errors → Run `scripts/verify-deployment.sh`
- Test failures → Check environment variables
- Migration errors → Verify Supabase connection

**Logs to Check:**
```bash
# Backend logs
tail -f backend/logs/app.log  # If configured

# Frontend logs (browser console)
# Network tab for API calls

# Docker logs (if using containers)
docker compose logs -f backend
docker compose logs -f frontend
```

---

**Last Updated:** 2026-02-11
**Version:** Post-Implementation v0.3.0
**Status:** ✅ Ready for Testing
