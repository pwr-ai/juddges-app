# Branding Updates Checklist

This document tracks what has been updated and what still needs to be changed from "JuDDGES" to "Juddges" branding.

## ✅ Completed Updates

### Repository Structure
- [x] Frontend and backend directories copied from JuDDGES
- [x] Docker compose files copied
- [x] Frontend `package.json` - name changed to "juddges-frontend"
- [x] Backend `pyproject.toml` - name changed to "juddges"
- [x] Package renamed to `juddges_search`

### Documentation
- [x] README.md - Updated branding references
- [x] CLAUDE.md - Updated all JuDDGES references
- [x] docs/README.md - Updated migration documentation
- [x] docs/migration/README.md - Updated fork references
- [x] docs/migration/branding-checklist.md - This file
- [x] docs/architecture/overview.md - Updated project overview
- [x] docs/getting-started/setup-guide.md - Updated setup references
- [x] backend/README.md - Updated to Juddges branding
- [x] backend/packages/juddges_search/README.md - New package documentation

## 🔄 Remaining Updates Needed

### Frontend Configuration

1. **App Layout & Metadata**
   - [ ] `frontend/app/layout.tsx` - Update site title and metadata
   - [ ] `frontend/app/page.tsx` - Update homepage content
   - [ ] Update any "JuDDGES" references in component text

2. **Branding Assets**
   - [ ] `frontend/public/logo.png` - Replace with Juddges logo (if you have one)
   - [ ] `frontend/public/favicon.ico` - Update favicon
   - [ ] Update any other brand assets in `public/`

3. **Environment Variables**
   - [ ] Create `frontend/.env.local` from `.env.example`
   - [ ] Update `NEXT_PUBLIC_APP_NAME` to "Juddges App"
   - [ ] Update any API URLs if needed

4. **Navigation & UI Components**
   - [ ] Search for "JuDDGES" in all frontend files
   - [ ] Replace with "Juddges" or appropriate text

### Backend Configuration

1. **API Documentation**
   - [ ] `backend/app/server.py` - Update FastAPI title and description
   - [ ] Update API docs metadata (visible at `/docs`)

2. **Environment Variables**
   - [ ] Create `backend/.env` from root `.env.example`
   - [ ] Update service URLs if needed

### Docker Configuration

1. **docker-compose files**
   - [ ] Update service names to `juddges-*`
   - [ ] Update container names
   - [ ] Update network names
   - [ ] Update volume names

## 🔍 Quick Search Commands

Find remaining JuDDGES references:
```bash
cd /home/laugustyniak/github/legal-ai/juddges-app

# Search in code
grep -r "JuDDGES" frontend/ backend/ --include="*.ts" --include="*.tsx" --include="*.py"

# Search in documentation
grep -r "JuDDGES" docs/ --include="*.md"
```

## 🎯 Minimal Working Setup

To get a working app quickly, you only need to update:
1. ✅ Package names (done)
2. ✅ Documentation (done)
3. [ ] Frontend layout title
4. [ ] Environment variables (.env files)
5. [ ] Run Supabase migration
6. [ ] Ingest sample data

Everything else can be updated gradually.

---

**Status**: Documentation rebranding complete, code updates in progress
