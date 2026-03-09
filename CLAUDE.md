# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Juddges App is an AI-powered judicial decision search and analysis platform for Polish and UK court judgments. It's a specialized fork of AI-Tax, adapted for legal case law research with semantic search capabilities.

**Key Technologies:**
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4, Zustand, React Query
- **Backend**: FastAPI (Python 3.12+), PostgreSQL, pgvector for embeddings
- **Vector Search**: Supabase pgvector (migrated from Weaviate used in AI-Tax)
- **AI/ML**: LangChain, OpenAI API, Langfuse (monitoring)
- **Task Queue**: Celery with Redis
- **Auth**: Supabase Auth

## Development Commands

### Frontend (Next.js)
```bash
cd frontend

# Development
npm run dev                    # Start dev server with Turbopack (port 3007 default)
npm run dev:stable            # Start dev server without Turbopack
npm run dev:clean             # Clean cache and start dev server

# Build & Production
npm run build                 # Production build
npm start                     # Start production server (port 3006)

# Testing
npm run test                  # Run Jest unit tests
npm run test:watch            # Run tests in watch mode
npm run test:coverage         # Run tests with coverage report
npm run test:e2e              # Run Playwright E2E tests
npm run test:e2e:ui           # Run E2E tests with UI
npm run test:e2e:chat         # Test chat functionality
npm run test:e2e:search       # Test search functionality

# Code Quality
npm run lint                  # ESLint check
npm run validate              # Run all validations (lint + type checks)
```

### Backend (FastAPI with Poetry)
```bash
cd backend

# Setup
poetry install                # Install dependencies

# Development
poetry run uvicorn app.server:app --reload --port 8004   # Dev server with hot reload

# Testing
poetry run pytest                                         # Run all tests
poetry run pytest tests/app/test_documents.py            # Run specific test file
poetry run pytest -v -m unit                              # Run unit tests only
poetry run pytest -v -m integration                       # Run integration tests only
poetry run pytest --cov=app                              # Run tests with coverage

# Using Poe tasks (simpler aliases)
poetry run poe test                                       # All tests
poetry run poe test-unit                                 # Unit tests
poetry run poe test-integration                          # Integration tests
poetry run poe test-cov                                  # Tests with HTML coverage report

# Code Quality
poetry run ruff format .                                 # Format code
poetry run ruff check .                                  # Lint code
poetry run ruff check . --fix                            # Auto-fix linting issues

# Using Poe tasks
poetry run poe format                                    # Format code
poetry run poe lint                                      # Lint check
poetry run poe lint-fix                                  # Lint with auto-fix
poetry run poe check                                     # Format check + lint
poetry run poe check-all                                 # Format + lint + test
```

### Docker Compose
```bash
# Development (with hot reload and volume mounts)
docker compose -f docker-compose.dev.yml up --build

# Production (local build)
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f backend-worker

# Rebuild specific service
docker compose up --build backend
```

### Production Build & Deploy
```bash
# Build, tag, and push Docker images to Docker Hub (laugustyniak/juddges-*)
./scripts/build_and_push_prod.sh              # Auto-increment patch version
./scripts/build_and_push_prod.sh minor        # Increment minor version
./scripts/build_and_push_prod.sh major        # Increment major version
./scripts/build_and_push_prod.sh 2.1.0        # Use explicit version

# Deploy on production host (pull from Docker Hub and restart)
./scripts/deploy_prod.sh                      # Deploy :latest
./scripts/deploy_prod.sh 0.2.0               # Deploy specific version
./scripts/deploy_prod.sh --status             # Show running containers
./scripts/deploy_prod.sh --rollback           # Rollback to previous version
```

### Database & Data Ingestion
```bash
# Supabase migrations (from project root)
cd supabase
npx supabase db push                    # Apply migrations to remote
npx supabase db pull                    # Pull schema changes from remote
npx supabase db reset                   # Reset local database

# Data ingestion (from scripts directory)
cd scripts
pip install -r requirements.txt
python ingest_judgments.py --polish 3000 --uk 3000  # Ingest full target dataset (6K+)
python ingest_judgments.py --polish 100 --uk 100    # Ingest dev sample
python ingest_judgments.py --polish 10 --uk 10      # Quick test with 20 cases
```

## Architecture

### Monorepo Structure
This is a monorepo with clear separation between frontend and backend:
- **Frontend** (`/frontend`): Next.js 15 app with App Router
- **Backend** (`/backend`): FastAPI app with reusable packages
- **Shared**: Supabase for database, auth, and infrastructure

### Backend Package Architecture
The backend uses a package-based architecture with two main reusable packages:

1. **`juddges_search`** (`backend/packages/juddges_search/`):
   - RAG (Retrieval-Augmented Generation) search implementation
   - LangChain integration for AI-powered search
   - Vector database operations using Supabase pgvector
   - Chat and QA chains
   - Used as: `from juddges_search.chains.chat import chat_chain`
   - Note: Package was originally named `ai_tax_search` in AI-Tax fork

2. **`schema_generator_agent`** (`backend/packages/schema_generator_agent/`):
   - AI-powered legal schema generation
   - LangGraph-based agent workflows
   - Used for extracting structured data from legal documents

Both packages are installed in editable mode via Poetry:
```python
# From pyproject.toml
juddges_search = { path = "packages/juddges_search", develop = true }
schema_generator_agent = { path = "packages/schema_generator_agent", develop = true }
```

### Database Architecture
**Dual Database Approach:**
- **PostgreSQL (via Supabase)**: Main database for structured data
  - `judgments` table: Stores court decisions with metadata
  - Includes `embedding` column (vector(768)) for semantic search
  - Full-text search using PostgreSQL GIN indexes

- **Vector Search**: Uses Supabase pgvector
  - AI-Tax originally used Weaviate (some legacy code may still reference it)
  - Juddges App uses Supabase pgvector extension
  - Vector similarity search using HNSW index

**Important**: When working with vector search, check whether code references Weaviate (legacy from AI-Tax) or pgvector (current). Juddges uses Supabase pgvector.

### FastAPI Server Structure
The main FastAPI app (`backend/app/server.py`) is organized with:
- **Router-based architecture**: Each domain has its own router module
  - `documents.py`, `collections.py`, `analytics.py`, `feedback.py`, etc.
  - Routers are registered in `server.py` with URL prefixes
- **LangServe integration**: LangChain chains exposed as HTTP endpoints
- **Middleware**: CORS, GZip, rate limiting (SlowAPI)
- **Background tasks**: Celery workers for async processing
- **Health checks**: Dedicated health check endpoints (`/health/*`)

### Frontend Architecture
Next.js 15 with App Router:
- **App directory** (`frontend/app/`): File-based routing
  - `(app)`: Main authenticated app shell
  - `auth`: Authentication pages
  - `chat`, `search`, `documents`: Feature-specific pages
- **Components** (`frontend/components/`): Reusable React components
- **State Management**:
  - **Zustand**: Global state (UI state, filters)
  - **React Query (@tanstack/react-query)**: Server state, data fetching, caching
- **UI Library**: Radix UI primitives + custom components
- **Rich Text**: TipTap editor for document annotations

### API Communication
- Frontend calls backend via fetch/axios through `/api` routes
- Backend runs on port 8004 (dev) or 8002 (prod)
- Frontend runs on port 3007 (dev) or 3006 (prod)
- CORS configured for cross-origin requests during development

### Production Deployment Architecture
**Docker Hub Registry**: `${DOCKER_USERNAME}/juddges-{frontend,backend}` (username from `.env`)

**Image Strategy**:
- Two images built: `juddges-frontend` and `juddges-backend`
- `backend-worker` reuses the `juddges-backend` image with a different command (Celery)
- Images tagged with semantic version (`0.1.0`) and `latest`
- `docker-compose.yml` has both `image:` and `build:` on each service — `image:` for Hub pulls, `build:` for local builds
- Version tag controlled by `JUDDGES_IMAGE_TAG` env var (defaults to `latest`)

**Versioning**: Git tags (`v0.1.0`, `v1.0.0`) are the source of truth. The build script reads the latest tag and auto-increments.

**Deployment Flow**:
1. Developer runs `build_and_push_prod.sh` locally (loads `.env` for frontend build args)
2. Images pushed to Docker Hub
3. On production host, run `deploy_prod.sh` to pull and restart
4. Deploy history logged to `.deploy-history` for rollback support

## Key Files

### Configuration Files
- **`backend/pyproject.toml`**: Poetry dependencies, test configuration, Poe task scripts
- **`frontend/package.json`**: npm dependencies, scripts for dev/test/build
- **`docker-compose.yml`**: Production services (frontend, backend, worker)
- **`docker-compose.dev.yml`**: Development services with hot reload
- **`.env.example`**: Environment variable template (copy to `.env`)

### Database
- **`supabase/migrations/20260209000001_create_judgments_table.sql`**: Main schema
  - Creates `judgments` table with vector search capabilities
  - Includes search functions for semantic and text search

### Entry Points
- **`backend/app/server.py`**: FastAPI application entry point
- **`frontend/app/layout.tsx`**: Root layout for Next.js app
- **`scripts/ingest_judgments.py`**: Data ingestion pipeline

### Deployment Scripts
- **`scripts/build_and_push_prod.sh`**: Build Docker images, tag with semver, push to Docker Hub
- **`scripts/deploy_prod.sh`**: Pull images from Docker Hub and deploy on production host

## Common Tasks

### Adding a New API Endpoint
1. Create or update router in `backend/app/` (e.g., `judgments.py`)
2. Define Pydantic schemas in `backend/app/schemas.py` or `models.py`
3. Register router in `backend/app/server.py`
4. Add tests in `backend/tests/app/test_<feature>.py`
5. Update frontend API client in `frontend/lib/api/` or inline in components

### Adding a New Frontend Page
1. Create page in `frontend/app/<route>/page.tsx`
2. Define layout if needed: `frontend/app/<route>/layout.tsx`
3. Create components in `frontend/components/<feature>/`
4. Add API hooks if needed in component or use React Query directly
5. Add tests in `frontend/__tests__/` or `frontend/tests/`

### Working with Judgments Data
- **Schema**: See `supabase/migrations/` for complete table structure
- **Ingestion**: Use `scripts/ingest_judgments.py` to load data from HuggingFace datasets
- **Search**:
  - Text search: PostgreSQL full-text search with ranking
  - Semantic search: Vector similarity using pgvector with OpenAI embeddings
  - Hybrid: Combine both for best results

### Running Background Tasks
- Backend uses Celery for async tasks (document processing, embeddings, etc.)
- Worker service: `docker compose up backend-worker`
- Tasks defined in `backend/app/workers.py`
- Monitor with: `docker compose logs -f backend-worker`

## Environment Variables

### Required
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase public/anon key (frontend + backend)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (backend only, never expose to frontend)
- `OPENAI_API_KEY`: OpenAI API key for embeddings and chat
- `BACKEND_API_KEY`: API key for backend authentication
- `LANGGRAPH_POSTGRES_URL`: PostgreSQL connection for LangGraph checkpointer

### Optional
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`: LLM observability
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_AUTH`: For Celery and guest sessions
- `WEAVIATE_URL`, `WEAVIATE_HOST`: Legacy Weaviate config (not used in Juddges)

### Development vs Production
- Development uses `docker-compose.dev.yml` with volume mounts for hot reload
- Production uses `docker-compose.yml` with code baked into Docker images
- Both configurations source variables from `.env`

## Port Configuration
- **Frontend**:
  - Development: 3007
  - Production: 3006
- **Backend API**:
  - Development: 8004
  - Production: 8002
- **Backend API Docs**:
  - Swagger UI: `http://localhost:8004/docs`
  - ReDoc: `http://localhost:8004/redoc`

## Testing Strategy
- **Frontend**: Jest for unit tests, Playwright for E2E
- **Backend**: pytest with markers for unit vs integration
- **Integration tests** require external services (database, Redis, OpenAI API)
- **Unit tests** should be fast and isolated
- Use markers: `@pytest.mark.unit` or `@pytest.mark.integration`

## Code Quality Standards
- **Backend**: Use Ruff for formatting and linting (replaces Black, isort, flake8)
- **Frontend**: ESLint with Next.js config
- **Commits**: Follow conventional commits (no Claude/Happy mentions, no Co-Authored-By)
- **Type Safety**: TypeScript strict mode for frontend, type hints for backend

## Migration Notes (AI-Tax → Juddges)
This codebase was forked from AI-Tax and adapted for judicial decisions:
- **Branding**: References to "AI-Tax" updated to "Juddges"
- **Data Model**: Transformed from tax documents to court judgments
- **Vector DB**: Migrated from Weaviate to Supabase pgvector
- **Schema**: Custom `judgments` table replaced generic documents
- **Jurisdictions**: Supports Polish ("PL") and UK courts
- **Package Names**: `ai_tax_search` → `juddges_search`

When working with this codebase, be aware that some AI-Tax code/patterns may still exist in legacy areas.

## Documentation
- **README.md**: Project overview and quick start
- **SETUP_GUIDE.md**: Detailed setup instructions
- **DATA_INGESTION_GUIDE.md**: Data pipeline documentation
- **SUPABASE_MCP_GUIDE.md**: Supabase MCP tools reference
- **PROJECT_SUMMARY.md**: High-level project summary and roadmap
- **docs/migration/branding-checklist.md**: Branding change checklist (AI-Tax → Juddges)
