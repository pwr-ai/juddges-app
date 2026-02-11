# Supabase Setup Guide

This guide walks you through setting up Supabase for the Juddges App, including database initialization, authentication configuration, and verification.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Detailed Setup](#detailed-setup)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- [ ] **Supabase Account**: Sign up at [supabase.com](https://supabase.com)
- [ ] **Supabase CLI**: Install via `npm install -g supabase` or [other methods](https://supabase.com/docs/guides/cli)
- [ ] **Node.js 18+**: For frontend development
- [ ] **Python 3.12+**: For backend development
- [ ] **Poetry**: For Python dependency management

---

## Quick Start

### 1. Create a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in project details:
   - **Name**: `juddges-app` (or your preferred name)
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
4. Wait for project initialization (~2 minutes)

### 2. Get Your Credentials

Once your project is ready:

1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxx.supabase.co`)
   - **Anon/Public Key** (safe for frontend)
   - **Service Role Key** (⚠️ **secret**, backend only)

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Frontend (auto-populated from above)
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# OpenAI (required for embeddings)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 4. Link to Remote Project

Link your local Supabase CLI to your remote project:

```bash
npx supabase link --project-ref your-project-ref
```

You can find your `project-ref` in the Supabase Dashboard URL or under **Settings** → **General**.

### 5. Apply Migrations

Push all migrations to your remote database:

```bash
npx supabase db push
```

This will create:
- ✅ `judgments` table with vector search
- ✅ `profiles` table for user metadata
- ✅ Row Level Security (RLS) policies
- ✅ Search functions (semantic + full-text)
- ✅ Auth schema verification

### 6. Verify Setup

Run the verification script to ensure everything is configured correctly:

```bash
# Install dependencies first (if not done)
cd backend
poetry install
cd ..

# Run verification
python scripts/verify_supabase_setup.py
```

Expected output:

```
🔍 Supabase Setup Verification

Step 1: Checking environment variables...
✓ All required environment variables are set

Step 2: Creating Supabase client...
✓ Supabase client created successfully

Step 3: Testing database connection...
✓ Connected successfully (judgments count: 0)

Step 4: Checking PostgreSQL extensions...
✓ Extension 'vector': installed
✓ Extension 'pg_trgm': installed

Step 5: Checking required tables...
✓ Table 'judgments': exists
✓ Table 'profiles': exists

Step 6: Checking Row Level Security...
RLS check requires direct SQL access (assumed enabled)

Step 7: Checking database functions...
✓ Function 'search_judgments_by_embedding': exists
✓ Function 'search_judgments_by_text': exists
✓ Function 'search_judgments_hybrid': exists
✓ Function 'get_judgment_facets': exists

Step 8: Checking Supabase Auth...
✓ Auth schema initialized (0 users)

✅ All checks passed! Supabase is properly configured.
```

---

## Detailed Setup

### Database Schema Overview

The Juddges App uses the following database structure:

#### **Tables**

1. **`public.judgments`** - Core table for court decisions
   - Fields: `case_number`, `jurisdiction`, `court_name`, `decision_date`, `full_text`, etc.
   - Vector column: `embedding` (1536-dim for semantic search)
   - Supports Polish and UK judgments

2. **`public.profiles`** - User profiles linked to `auth.users`
   - Auto-created when users sign up
   - Stores additional metadata, preferences, and roles

#### **Extensions**

- **`vector`** (pgvector) - For semantic similarity search
- **`pg_trgm`** - For fuzzy text matching

#### **Search Functions**

- `search_judgments_by_embedding()` - Semantic/vector search
- `search_judgments_by_text()` - Full-text search
- `search_judgments_hybrid()` - Combined vector + text search with 11+ filters
- `get_judgment_facets()` - Dynamic facet counts for filter UI

#### **Row Level Security (RLS)**

- **Public Read**: Anyone can read judgments (no auth required)
- **Authenticated Write**: Only logged-in users can insert/update
- **Service Role**: Backend has full access for bulk operations

### Authentication Setup

Supabase Auth is pre-configured with:

- **Email/Password** authentication enabled
- **User profiles** auto-created on signup
- **JWT-based sessions** with refresh tokens
- **SSO support** (optional, configure via Dashboard)

#### Enable Email Confirmations (Optional)

By default, email confirmation is disabled for faster development. To enable:

1. Go to **Authentication** → **Providers** → **Email**
2. Toggle **"Confirm email"** to ON
3. Configure email templates under **Authentication** → **Email Templates**

#### Configure OAuth Providers (Optional)

To add Google, GitHub, or other OAuth:

1. Go to **Authentication** → **Providers**
2. Enable desired provider (e.g., Google)
3. Add OAuth credentials from provider console
4. Update `site_url` and `redirect_urls` in **Authentication** → **URL Configuration**

---

## Verification

### Manual Verification Steps

#### 1. Check Database Tables

```bash
npx supabase db diff --schema public
```

You should see:
- `judgments` table
- `profiles` table

#### 2. Test Database Connection

```bash
# Using psql (if you have PostgreSQL client)
npx supabase db remote psql

# Then run:
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

#### 3. Verify Extensions

```sql
SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pg_trgm');
```

Expected:
```
  extname  | extversion
-----------+------------
 vector    | 0.5.1
 pg_trgm   | 1.6
```

#### 4. Check RLS Policies

```sql
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
```

Expected policies:
- `Public read access for judgments`
- `Authenticated users can insert judgments`
- `Authenticated users can update judgments`
- `Service role has full access`
- `Users can view own profile`
- `Users can update own profile`

#### 5. Test Auth

Create a test user via the dashboard or API:

```bash
# Using Supabase CLI
npx supabase auth signup --email test@example.com --password testpassword123
```

Then verify in **Authentication** → **Users** dashboard.

### Automated Verification

Run the Python verification script:

```bash
python scripts/verify_supabase_setup.py
```

This checks:
- ✅ Environment variables
- ✅ Database connectivity
- ✅ Extensions
- ✅ Tables existence
- ✅ Functions availability
- ✅ Auth schema

---

## Troubleshooting

### Issue: "Failed to link project"

**Solution**: Ensure you're using the correct `project-ref`. Find it in:
- Supabase Dashboard URL: `https://supabase.com/dashboard/project/YOUR-PROJECT-REF`
- Settings → General → Project Reference ID

### Issue: "Migration failed: relation already exists"

**Solution**: Your database already has some tables. You can:

**Option A**: Reset local database and re-apply migrations
```bash
npx supabase db reset
npx supabase db push
```

**Option B**: Manually drop conflicting tables (⚠️ **destructive**)
```sql
DROP TABLE IF EXISTS public.judgments CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
```

Then re-run:
```bash
npx supabase db push
```

### Issue: "Extension 'vector' does not exist"

**Solution**: Enable pgvector extension via dashboard or SQL:

1. Go to **Database** → **Extensions** in Supabase Dashboard
2. Search for "vector"
3. Click **"Enable"**

Or via SQL:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Issue: "Environment variables not set"

**Solution**:

1. Verify `.env` file exists in project root
2. Check that values don't contain placeholders like `your-*` or `placeholder`
3. Restart your development server to pick up new env vars:
   ```bash
   # Frontend
   npm run dev

   # Backend
   poetry run uvicorn app.server:app --reload
   ```

### Issue: "Auth users table does not exist"

**Solution**: Supabase Auth schema is managed automatically. If it's missing:

1. Check that your project is fully initialized (wait 2-3 minutes after creation)
2. Verify you're on a paid plan if using advanced auth features
3. Contact Supabase support if issue persists

### Issue: "Function search_judgments_hybrid does not exist"

**Solution**: Re-apply migrations to create search functions:

```bash
npx supabase db push --force
```

Or run the specific migration manually:
```bash
npx supabase db remote psql < supabase/schema.sql
```

---

## Next Steps

Once Supabase is set up:

1. **Ingest Sample Data**: Load court judgments from HuggingFace datasets
   ```bash
   python scripts/ingest_judgments.py --polish 10 --uk 10
   ```

2. **Start Development Servers**:
   ```bash
   # Frontend (port 3007)
   cd frontend
   npm run dev

   # Backend (port 8004)
   cd backend
   poetry run uvicorn app.server:app --reload
   ```

3. **Test Authentication**: Visit `http://localhost:3007/auth/login` and create a user

4. **Test Search**: Visit `http://localhost:3007/search` and try semantic search

---

## Additional Resources

- **Supabase Docs**: https://supabase.com/docs
- **pgvector Guide**: https://github.com/pgvector/pgvector
- **Supabase CLI Reference**: https://supabase.com/docs/reference/cli
- **Project README**: See `README.md` for general setup
- **Data Ingestion Guide**: See `DATA_INGESTION_GUIDE.md` for loading judgments

---

## Support

If you encounter issues not covered here:

1. Check [Supabase Discord](https://discord.supabase.com/)
2. Review [GitHub Issues](https://github.com/supabase/supabase/issues)
3. Open an issue in this project's repository
