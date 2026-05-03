# Juddges App Setup Guide

Complete step-by-step guide to set up your Juddges App.

## 📋 Prerequisites

Before you begin, ensure you have:

- [ ] **Node.js 18+** installed ([Download](https://nodejs.org/))
- [ ] **Python 3.12+** installed ([Download](https://www.python.org/))
- [ ] **Docker & Docker Compose** installed ([Download](https://www.docker.com/))
- [ ] **Git** installed
- [ ] **Supabase account** ([Sign up free](https://supabase.com/))
- [ ] **OpenAI API key** ([Get key](https://platform.openai.com/api-keys)) (optional but recommended)

## 🚀 Quick Start (5 minutes)

### Step 1: Clone and Setup Repository

```bash
# Navigate to your projects directory
cd ~/github/juddges-app

# The juddges-app directory has been created
cd juddges-app

# Initialize git repository
git init
git add .
git commit -m "Initial commit: Juddges app from JuDDGES boilerplate"

# Create GitHub repository (optional)
gh repo create juddges-app --public --source=. --remote=origin --push
```

### Step 2: Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in project details:
   - **Name**: `juddges-app`
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine for development

4. Wait 2-3 minutes for project provisioning

5. Get your project credentials:
   - Go to **Settings** → **API**
   - Copy **Project URL** (looks like `https://xxxxx.supabase.co`)
   - Copy **anon/public key** (starts with `eyJ...`)
   - Copy **service_role key** (starts with `eyJ...`) - Keep this secret!

### Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your favorite editor
```

**Minimum required variables:**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key  # Optional but recommended
```

### Step 4: Run Database Migrations

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link to your Supabase project
supabase link --project-ref your-project-ref

# Run migrations to create judgments table
supabase db push
```

Alternatively, you can run the migration directly in Supabase:
1. Go to **SQL Editor** in Supabase Dashboard
2. Copy contents of `supabase/migrations/20260209000001_create_judgments_table.sql`
3. Paste and run the SQL

### Step 5: Ingest Sample Data

```bash
# Install Python dependencies
cd scripts
pip install -r requirements.txt

# Ingest sample data for development (takes ~5-10 minutes)
python ingest_judgments.py --polish 100 --uk 100

# Quick test with minimal data
python ingest_judgments.py --polish 10 --uk 10

# Full target dataset: 6K+ judgments (takes ~3-4 hours)
python ingest_judgments.py --polish 3000 --uk 3000
```

**Note:** If you skip `--openai-api-key`, judgments will be ingested without embeddings (semantic search won't work, but text search will).

### Step 6: Verify Installation

The frontend and backend are already included in this repository (forked from JuDDGES).

```bash
# Verify directory structure
ls -la frontend/ backend/

# Check that packages are properly named
grep "juddges" backend/pyproject.toml
grep "juddges" frontend/package.json
```

## 🔧 Detailed Setup

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Update package.json name
# Change: "name": "frontend" → "name": "juddges-frontend"

# Update Supabase client configuration
# Edit frontend/lib/supabase/client.ts to use your Supabase URL/key

# Run development server
npm run dev
```

Frontend will be available at: **http://localhost:3007**

### Backend Setup

```bash
cd backend

# Install Poetry (if not installed)
curl -sSL https://install.python-poetry.org | python3 -

# Install dependencies
poetry install

# Run migrations (if any backend-specific migrations)
poetry run alembic upgrade head

# Run development server
poetry run uvicorn app.server:app --reload --port 8004
```

Backend API will be available at: **http://localhost:8004**

API Documentation: **http://localhost:8004/docs**

### Docker Compose Setup (Recommended)

For full-stack development with all services:

```bash
# Update docker-compose.dev.yml with juddges-specific settings

# Start all services
docker compose -f docker-compose.dev.yml up --build

# Services will be available at:
# - Frontend: http://localhost:3007
# - Backend: http://localhost:8004
# - Backend Docs: http://localhost:8004/docs
```

## 📊 Verify Installation

### 1. Check Database

```bash
# Using Supabase CLI
supabase db dump --schema public > dump.sql

# Or check in Supabase Dashboard → Table Editor
# You should see the "judgments" table with your ingested data
```

### 2. Test API Endpoints

```bash
# Health check
curl http://localhost:8004/api/v1/health

# List judgments
curl "http://localhost:8004/api/v1/judgments?limit=10"

# Search judgments
curl -X POST http://localhost:8004/api/v1/search/judgments \
  -H "Content-Type: application/json" \
  -d '{"query": "criminal appeal", "jurisdiction": "UK"}'
```

### 3. Test Frontend

1. Open http://localhost:3007
2. You should see the Juddges app interface
3. Try searching for judgments
4. Check that results are displayed correctly

## 🎨 Customization

### Update Branding

1. **App Name**: Update in `frontend/app/layout.tsx`
2. **Logo**: Replace `frontend/public/logo.png`
3. **Favicon**: Replace `frontend/public/favicon.ico`
4. **Colors**: Update Tailwind theme in `frontend/tailwind.config.js`

### Update Database Schema

If you need additional fields:

```bash
# Create new migration
supabase migration new add_custom_fields

# Edit the generated migration file
# Then apply
supabase db push
```

## 🐛 Troubleshooting

### "Cannot connect to Supabase"
- Verify `SUPABASE_URL` and keys in `.env`
- Check Supabase project is active in dashboard
- Ensure no typos in environment variables

### "No judgments found"
- Run data ingestion script: `python scripts/ingest_judgments.py`
- Check Supabase Table Editor to verify data exists
- Check backend logs for errors

### "OpenAI API error"
- Verify `OPENAI_API_KEY` is correct
- Check you have credits in OpenAI account
- You can run without embeddings: `--no-embeddings` flag

### "Docker containers won't start"
- Check ports 3007 and 8004 aren't in use
- Run `docker compose down` then try again
- Check Docker daemon is running

### "Module not found" errors
- **Frontend**: Run `npm install` in frontend directory
- **Backend**: Run `poetry install` in backend directory
- **Scripts**: Run `pip install -r requirements.txt` in scripts directory

## 📚 Next Steps

1. **Ingest More Data**: Increase sample size in ingestion script
2. **Configure Authentication**: Set up Supabase Auth for user management
3. **Add Features**: Implement chat, analytics, document upload
4. **Deploy**: Follow deployment guide for production setup
5. **Customize UI**: Update components to match your brand

## 🆘 Getting Help

- **Documentation**: See `/docs` directory
- **Issues**: Open an issue on GitHub
- **Supabase Docs**: https://supabase.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com

## 📝 Checklist

Use this checklist to track your setup progress:

- [ ] Supabase project created
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Sample data ingested (Polish + UK)
- [ ] Frontend running locally
- [ ] Backend running locally
- [ ] API endpoints responding
- [ ] Can search and view judgments
- [ ] Docker compose setup (optional)
- [ ] Git repository initialized
- [ ] First commit made

---

**Congratulations! 🎉** Your Juddges App is now set up and ready for development!
