# Branding Updates Checklist

This document tracks what has been updated and what still needs to be changed from "AI-Tax" to "Juddges" branding.

## ✅ Completed Updates

### Repository Structure
- [x] Frontend and backend directories copied from AI-Tax
- [x] Docker compose files copied
- [x] Frontend `package.json` - name changed to "juddges-frontend"
- [x] Backend `pyproject.toml` - name changed to "juddges"

### Documentation
- [x] README.md - New project documentation written
- [x] SETUP_GUIDE.md - Complete setup instructions
- [x] DATA_INGESTION_GUIDE.md - Data ingestion documentation
- [x] SUPABASE_MCP_GUIDE.md - Database management guide
- [x] PROJECT_SUMMARY.md - Project overview

## 🔄 Remaining Updates Needed

### Frontend Configuration

1. **App Layout & Metadata**
   - [ ] `frontend/app/layout.tsx` - Update site title and metadata
   - [ ] `frontend/app/page.tsx` - Update homepage content
   - [ ] Update any "AI-Tax" references in component text

2. **Branding Assets**
   - [ ] `frontend/public/logo.png` - Replace with Juddges logo (if you have one)
   - [ ] `frontend/public/favicon.ico` - Update favicon
   - [ ] Update any other brand assets in `public/`

3. **Environment Variables**
   - [ ] Create `frontend/.env.local` from `.env.example`
   - [ ] Update `NEXT_PUBLIC_APP_NAME` to "Juddges App"
   - [ ] Update any API URLs if needed

4. **Navigation & UI Components**
   - [ ] Search for "AI-Tax" in all frontend files
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
   - [ ] Update service names from `ai-tax-*` to `juddges-*`
   - [ ] Update container names
   - [ ] Update network names
   - [ ] Update volume names

## 🔍 Quick Search Commands

Find AI-Tax references:
```bash
cd /home/laugustyniak/github/legal-ai/juddges-app
grep -r "AI-Tax" frontend/ backend/ --include="*.ts" --include="*.tsx" --include="*.py"
```

## 🎯 Minimal Working Setup

To get a working app quickly, you only need to update:
1. ✅ Package names (done)
2. [ ] Frontend layout title
3. [ ] Environment variables (.env files)
4. [ ] Run Supabase migration
5. [ ] Ingest sample data

Everything else can be updated gradually.

---

**Status**: Frontend/Backend copied, basic branding started
