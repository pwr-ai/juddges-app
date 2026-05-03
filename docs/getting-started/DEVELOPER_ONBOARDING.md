# Developer Onboarding Guide

Welcome to the Juddges Legal Assistant project! This guide will help you get set up and productive quickly.

## Table of Contents

- [Quick Start (30 minutes)](#quick-start-30-minutes)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
- [Common Tasks](#common-tasks)
- [Testing Guide](#testing-guide)
- [Debugging](#debugging)
- [Troubleshooting](#troubleshooting)
- [Resources](#resources)
- [Next Steps](#next-steps)

## Quick Start (30 minutes)

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+** and npm
- **Python 3.12+**
- **Poetry** (Python package manager): `curl -sSL https://install.python-poetry.org | python3 -`
- **Docker and Docker Compose**
- **Git**
- **Supabase account** (free tier available at https://supabase.com)
- **OpenAI API key** (for embeddings and chat)

### 1. Clone and Setup (5 min)

```bash
# Clone the repository
git clone https://github.com/your-org/juddges-app.git
cd juddges-app

# Create environment file from example
cp .env.example .env.secrets
```

### 2. Configure Environment (10 min)

Edit `.env.secrets` and add your actual credentials:

```bash
# Supabase Configuration
# Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Backend Configuration
BACKEND_API_KEY=your-backend-secret-key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/juddges

# Redis (for guest sessions and caching)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_AUTH=
```

**Important**: Never commit `.env.secrets` to version control!

### 3. Setup Database (5 min)

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project (optional, for remote migrations)
supabase link --project-ref your-project-ref

# Push database migrations to Supabase
cd supabase
npx supabase db push
cd ..
```

### 4. Install Dependencies (10 min)

```bash
# Backend dependencies (using Poetry)
cd backend
poetry install
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 5. Start Development Servers (5 min)

**Option A: Using Docker Compose (Recommended)**

```bash
# Start all services with hot reload
docker compose -f docker-compose.dev.yml up --build

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

Services will be available at:
- Frontend: http://localhost:3007
- Backend API: http://localhost:8004
- API Docs: http://localhost:8004/docs

**Option B: Manual Start (for active development)**

```bash
# Terminal 1: Start Backend
cd backend
poetry run uvicorn app.server:app --reload --port 8004

# Terminal 2: Start Frontend
cd frontend
npm run dev

# Terminal 3: Start Redis (if not using Docker)
docker run -p 6379:6379 redis:7-alpine
```

### 6. Verify Installation

Visit http://localhost:3007 and you should see the Juddges homepage.

To ingest sample data:

```bash
cd scripts
pip install -r requirements.txt
python ingest_judgments.py --polish 10 --uk 10
```

This will load 20 sample judgments (10 Polish + 10 UK) for testing.

For the full target dataset (6K+ documents), run:
```bash
python ingest_judgments.py --polish 3000 --uk 3000
```

## Project Architecture

### Monorepo Structure

```
juddges-app/
├── frontend/              # Next.js 15 application (port 3007)
│   ├── app/              # App Router pages and layouts
│   ├── components/       # Reusable React components
│   ├── lib/              # Utilities, hooks, API clients
│   ├── supabase/         # Supabase client configuration
│   └── __tests__/        # Frontend tests
│
├── backend/              # FastAPI application (port 8004)
│   ├── app/              # Main API endpoints
│   │   ├── server.py    # FastAPI app entry point
│   │   ├── documents.py # Document search endpoints
│   │   ├── analytics.py # Analytics endpoints
│   │   └── ...          # Other feature routers
│   ├── packages/         # Reusable Python packages
│   │   ├── juddges_search/           # RAG search implementation
│   │   └── schema_generator_agent/   # AI schema generation
│   └── tests/            # Backend tests
│
├── supabase/             # Database configuration
│   ├── migrations/       # SQL migration files
│   └── config.toml       # Supabase project config
│
├── scripts/              # Utility scripts
│   └── ingest_judgments.py  # Data ingestion pipeline
│
└── docs/                 # Documentation
    ├── getting-started/  # Setup guides
    ├── guides/           # How-to guides
    ├── architecture/     # System design docs
    └── frontend/         # Frontend-specific docs
```

### Technology Stack

#### Frontend
- **Framework**: Next.js 15 (App Router) with React 19
- **UI Library**: Radix UI primitives + custom components
- **Styling**: Tailwind CSS 4 with CSS variables
- **State Management**:
  - Zustand for global UI state
  - React Query (@tanstack/react-query) for server state and caching
- **Forms**: React Hook Form with Zod validation
- **Rich Text**: TipTap editor for annotations
- **Testing**: Jest (unit) + Playwright (E2E)

#### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: PostgreSQL with pgvector extension (via Supabase)
- **Vector Search**: Supabase pgvector for semantic search
- **AI/ML**:
  - LangChain/LangGraph for AI chains
  - OpenAI API (GPT-4 for chat, text-embedding-3-small for embeddings)
  - Langfuse for observability (optional)
- **Background Tasks**: Celery with Redis broker
- **Authentication**: Supabase Auth (JWT-based)
- **Testing**: pytest with unit and integration markers

#### Infrastructure
- **Database**: Supabase (managed PostgreSQL + Auth + Storage)
- **Vector Database**: pgvector extension (replaces Weaviate from JuDDGES)
- **Caching**: Redis for sessions and task queue
- **Deployment**: Docker Compose (dev and prod configurations)

### Backend Package Architecture

The backend uses a package-based architecture with two main reusable packages:

#### 1. `juddges_search` (`backend/packages/juddges_search/`)

RAG (Retrieval-Augmented Generation) search implementation:
- LangChain integration for AI-powered search
- Vector database operations using Supabase pgvector
- Chat and QA chains
- Document retrieval and similarity search

Usage:
```python
from juddges_search.chains.chat import chat_chain
from juddges_search.db.supabase_db import get_vector_db
from juddges_search.models import LegalDocument
```

#### 2. `schema_generator_agent` (`backend/packages/schema_generator_agent/`)

AI-powered legal schema generation:
- LangGraph-based agent workflows
- Extracts structured data from legal documents
- Generates JSON schemas for data extraction

Usage:
```python
from schema_generator_agent.graph import create_agent_graph
```

Both packages are installed in editable mode via Poetry:
```toml
juddges_search = { path = "packages/juddges_search", develop = true }
schema_generator_agent = { path = "packages/schema_generator_agent", develop = true }
```

### Database Architecture

**Dual Database Approach:**

1. **PostgreSQL (via Supabase)**: Main database for structured data
   - `judgments` table: Stores court decisions with metadata
   - Includes `embedding` column (vector(768)) for semantic search
   - Full-text search using PostgreSQL GIN indexes
   - RLS (Row Level Security) for access control

2. **Vector Search**: Uses Supabase pgvector extension
   - JuDDGES originally used Weaviate (migration complete)
   - Juddges uses native PostgreSQL pgvector
   - Vector similarity search using HNSW index
   - Supports hybrid search (vector + full-text + filters)

**Important**: When working with vector search, older code may reference Weaviate (legacy from JuDDGES fork). All vector operations now use Supabase pgvector.

### FastAPI Server Structure

The main FastAPI app (`backend/app/server.py`) is organized with:

- **Router-based architecture**: Each domain has its own router module
  - `documents.py`: Document search and retrieval
  - `collections.py`: Document collections
  - `analytics.py`: Usage analytics
  - `feedback.py`: User feedback
  - `schemas.py`: Schema generation and management
  - etc.

- **LangServe integration**: LangChain chains exposed as HTTP endpoints
  - `/qa`: Question-answering chain
  - `/chat`: Conversational chat chain
  - `/enhance_query`: Query enhancement chain

- **Middleware**:
  - CORS for cross-origin requests
  - GZip for response compression
  - Rate limiting (SlowAPI) to prevent abuse

- **Background tasks**: Celery workers for async processing
  - Document embedding generation
  - Batch operations
  - Scheduled cleanup tasks

- **Health checks**: Dedicated endpoints at `/health/*`

### Frontend Architecture

Next.js 15 with App Router:

```
frontend/app/
├── (app)/               # Authenticated app shell
│   ├── chat/           # Chat interface
│   ├── search/         # Search interface
│   ├── documents/      # Document management
│   ├── analytics/      # Analytics dashboard
│   └── layout.tsx      # Main app layout
│
├── auth/               # Authentication pages
│   ├── login/
│   ├── signup/
│   └── callback/
│
└── api/                # API routes (backend proxy)
```

**Key Patterns:**
- **App Router**: File-based routing with layouts and pages
- **Server Components**: Default server-side rendering
- **Client Components**: Interactive UI with `"use client"`
- **API Routes**: Backend proxying and middleware

**State Management:**
- **Zustand**: Global UI state (sidebar open, theme, filters)
- **React Query**: Server state, data fetching, caching, mutations

**UI Components** (`frontend/components/`):
- `ui/`: Base components (Button, Input, Dialog, etc.)
- `chat/`: Chat-specific components
- `search/`: Search-specific components
- `documents/`: Document-specific components

### API Communication

- Frontend calls backend via `/api` routes or direct fetch
- Backend runs on port 8004 (dev) or 8002 (prod)
- Frontend runs on port 3007 (dev) or 3006 (prod)
- CORS configured for cross-origin requests during development
- Authentication via Supabase JWT tokens

## Development Workflow

> **Branching model**: `develop` is the integration branch — all feature/fix work happens there. `main` is reserved for production releases (and only release PRs from `develop` or `hotfix/*` PRs land on it). See the root `README.md` and `docs/how-to/deployment.md` for the full release flow.

### Making Changes

#### 1. Create Feature Branch from `develop`

```bash
git checkout develop && git pull
git checkout -b feature/your-feature-name
# OR for bug fixes
git checkout -b fix/bug-description
```

> Branch from `main` only when working on a production hotfix (`hotfix/<name>`). All other work starts from `develop`.

#### 2. Make Changes

**Backend:**
- Modify files in `backend/app/`
- Add new routers in `backend/app/your_feature.py`
- Update models in `backend/app/models.py`
- Add tests in `backend/tests/`

**Frontend:**
- Modify pages in `frontend/app/`
- Add components in `frontend/components/`
- Update utilities in `frontend/lib/`
- Add tests in `frontend/__tests__/` or `frontend/tests/`

#### 3. Run Tests

```bash
# Backend tests
cd backend
poetry run pytest tests/ -v

# Backend unit tests only
poetry run pytest tests/ -v -m unit

# Backend with coverage
poetry run pytest tests/ --cov=app --cov-report=html

# Frontend unit tests
cd frontend
npm test

# Frontend E2E tests
npm run test:e2e

# Watch mode for active development
npm run test:watch
```

#### 4. Code Quality Checks

```bash
# Backend formatting and linting
cd backend
poetry run ruff format .
poetry run ruff check .

# Frontend linting
cd frontend
npm run lint
```

#### 5. Commit with Conventional Commits

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
git add .
git commit -m "feat: add jurisdiction filter to search"
```

**Commit Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions or changes
- `chore:` Build process or tooling changes
- `style:` Code style changes (formatting, etc.)

**Important**: Per project guidelines, do not include:
- Claude Code mentions
- Co-Authored-By lines
- Generated with lines

#### 6. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:
- **Base branch set to `develop`** (use `main` only for `hotfix/*` PRs)
- Clear title describing the change
- Description of what changed and why
- Link to related issues
- Screenshots/videos for UI changes

## Common Tasks

### Adding a New API Endpoint

1. **Create or update router** in `backend/app/`

```python
# backend/app/my_feature.py
from fastapi import APIRouter, HTTPException
from app.models import MyRequest, MyResponse

router = APIRouter(prefix="/my-feature", tags=["my-feature"])

@router.post("/action", response_model=MyResponse)
async def perform_action(request: MyRequest):
    """Perform an action."""
    # Implementation
    return MyResponse(...)
```

2. **Define Pydantic schemas** in `backend/app/models.py`

```python
from pydantic import BaseModel

class MyRequest(BaseModel):
    query: str
    limit: int = 10

class MyResponse(BaseModel):
    results: list[dict]
    count: int
```

3. **Register router** in `backend/app/server.py`

```python
from app.my_feature import router as my_feature_router

app.include_router(my_feature_router, prefix="/api/v1")
```

4. **Add tests** in `backend/tests/app/test_my_feature.py`

```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.unit
def test_perform_action(client: TestClient):
    response = client.post("/api/v1/my-feature/action", json={
        "query": "test",
        "limit": 5
    })
    assert response.status_code == 200
    assert "results" in response.json()
```

5. **Update OpenAPI docs** (automatic via FastAPI)

Access docs at http://localhost:8004/docs

### Adding a New Frontend Page

1. **Create page** in `frontend/app/your-page/page.tsx`

```typescript
// frontend/app/(app)/my-page/page.tsx
export default function MyPage() {
  return (
    <div className="container py-6">
      <h1 className="text-3xl font-bold">My Page</h1>
      {/* Content */}
    </div>
  );
}
```

2. **Create layout** if needed: `frontend/app/your-page/layout.tsx`

```typescript
export default function MyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="my-page-layout">
      {children}
    </div>
  );
}
```

3. **Create components** in `frontend/components/my-page/`

```typescript
// frontend/components/my-page/MyComponent.tsx
"use client";

import { Button } from "@/components/ui/button";

export function MyComponent() {
  return <Button>Click Me</Button>;
}
```

4. **Add API hooks** using React Query

```typescript
// frontend/lib/api/my-feature.ts
import { useQuery, useMutation } from "@tanstack/react-query";

export function useMyData() {
  return useQuery({
    queryKey: ["myData"],
    queryFn: async () => {
      const response = await fetch("/api/my-feature");
      return response.json();
    },
  });
}
```

5. **Add tests** in `frontend/__tests__/my-page/`

```typescript
import { render, screen } from "@testing-library/react";
import MyPage from "@/app/(app)/my-page/page";

describe("MyPage", () => {
  it("renders heading", () => {
    render(<MyPage />);
    expect(screen.getByText("My Page")).toBeInTheDocument();
  });
});
```

6. **Update navigation** in `frontend/components/navigation/`

### Working with Judgments Data

#### Schema

See `supabase/migrations/20260209000001_create_judgments_table.sql` for complete table structure.

Key fields:
- `id`: UUID primary key
- `case_number`: Unique case identifier
- `jurisdiction`: 'PL' or 'UK'
- `court_name`: Name of the court
- `decision_date`: Date of judgment
- `title`: Case title
- `summary`: Brief summary
- `full_text`: Complete judgment text
- `judges`: JSONB array of judges
- `keywords`: Text array for filtering
- `embedding`: vector(768) for semantic search
- `metadata`: JSONB for flexible data

#### Ingestion

Use `scripts/ingest_judgments.py` to load data from HuggingFace datasets:

```bash
cd scripts
pip install -r requirements.txt

# Ingest sample data (quick test)
python ingest_judgments.py --polish 10 --uk 10

# Ingest development dataset
python ingest_judgments.py --polish 100 --uk 100

# Ingest full target dataset (6K+ documents)
python ingest_judgments.py --polish 3000 --uk 3000

# Check available datasets
python ingest_judgments.py --help
```

#### Search

**Text Search**: PostgreSQL full-text search with ranking
```python
from juddges_search.db.supabase_db import get_vector_db

db = get_vector_db()
results = await db.search_documents(query="contract law", limit=10)
```

**Semantic Search**: Vector similarity using pgvector with OpenAI embeddings
```python
results = await db.similarity_search(query="contract law", k=10)
```

**Hybrid Search**: Combine both for best results
```python
results = await db.hybrid_search(
    query="contract law",
    filters={"jurisdiction": "PL", "year": 2023},
    limit=10
)
```

### Running Background Tasks

Backend uses Celery for async tasks (document processing, embeddings, etc.)

**Start Celery worker:**
```bash
# Using Docker Compose
docker compose up backend-worker

# Manual start
cd backend
poetry run celery -A app.workers worker --loglevel=info
```

**Monitor tasks:**
```bash
docker compose logs -f backend-worker
```

**Task examples:**
- Document embedding generation
- Batch data ingestion
- Scheduled cleanup jobs
- Email notifications

Tasks are defined in `backend/app/workers.py`.

## Testing Guide

### Backend Testing

#### Run All Tests
```bash
cd backend
poetry run pytest tests/ -v
```

#### Run Specific Test File
```bash
poetry run pytest tests/app/test_documents.py -v
```

#### Run Tests by Marker
```bash
# Unit tests only (fast, no external dependencies)
poetry run pytest tests/ -v -m unit

# Integration tests (require DB, Redis, OpenAI)
poetry run pytest tests/ -v -m integration
```

#### Generate Coverage Report
```bash
# HTML report (opens in browser)
poetry run pytest tests/ --cov=app --cov-report=html
open htmlcov/index.html

# Terminal report
poetry run pytest tests/ --cov=app --cov-report=term-missing
```

#### Using Poe Tasks (Shortcuts)
```bash
poetry run poe test           # All tests
poetry run poe test-unit      # Unit tests only
poetry run poe test-integration  # Integration tests only
poetry run poe test-cov       # Tests with coverage
```

#### Test Structure
```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.unit  # Mark as unit test
def test_document_search(client: TestClient):
    """Test document search endpoint."""
    response = client.post("/api/v1/documents/search", json={
        "query": "test query",
        "limit": 10
    })
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert isinstance(data["results"], list)

@pytest.mark.integration  # Mark as integration test (requires DB)
async def test_database_query():
    """Test database query."""
    from juddges_search.db.supabase_db import get_vector_db
    db = get_vector_db()
    results = await db.search_documents("test")
    assert len(results) >= 0
```

### Frontend Testing

#### Unit Tests (Jest)
```bash
cd frontend

# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

#### E2E Tests (Playwright)
```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (visual debugger)
npm run test:e2e:ui

# Run specific test suite
npm run test:e2e:chat
npm run test:e2e:search
npm run test:e2e:documents

# Debug mode (step through tests)
npm run test:e2e:debug
```

#### Test Structure

**Unit Test:**
```typescript
// frontend/__tests__/components/Button.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders with text", () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText("Click Me")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Click Me</Button>);
    fireEvent.click(screen.getByText("Click Me"));
    expect(onClick).toHaveBeenCalled();
  });
});
```

**E2E Test:**
```typescript
// frontend/tests/e2e/search.spec.ts
import { test, expect } from "@playwright/test";

test("search for judgments", async ({ page }) => {
  await page.goto("http://localhost:3007/search");

  await page.fill('input[name="query"]', "contract law");
  await page.click('button[type="submit"]');

  await expect(page.locator(".search-results")).toBeVisible();
  await expect(page.locator(".result-item")).toHaveCount(10);
});
```

## Debugging

### Backend Debugging

#### Use Loguru Logger
```python
from loguru import logger

logger.info("Starting process")
logger.debug(f"Query: {query}")
logger.error(f"Error occurred: {error}")
```

Logs are written to:
- Console (stdout)
- `backend/logs/app.log` (rotated daily)

#### FastAPI Interactive Docs
- Swagger UI: http://localhost:8004/docs
- ReDoc: http://localhost:8004/redoc

Test endpoints directly in the browser.

#### Python Debugger (pdb)
```python
import pdb; pdb.set_trace()  # Set breakpoint
```

#### VS Code Debugging
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.server:app", "--reload", "--port", "8004"],
      "cwd": "${workspaceFolder}/backend"
    }
  ]
}
```

### Frontend Debugging

#### React DevTools
Install browser extension: [React DevTools](https://react.dev/learn/react-developer-tools)

#### Console Logs
```typescript
console.log("Debug:", data);
console.error("Error:", error);
```

#### Next.js Error Overlay
Displays errors directly in the browser during development.

#### VS Code Debugging
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/frontend",
      "console": "integratedTerminal"
    }
  ]
}
```

#### Browser DevTools
- Network tab: Monitor API requests
- Console tab: View logs and errors
- React tab: Inspect component state

## Troubleshooting

### "Module not found" errors

```bash
# Backend
cd backend && poetry install

# Frontend
cd frontend && npm install
```

### Database connection errors

1. Check Supabase credentials in `.env.secrets`
2. Verify Supabase project is active
3. Check network connectivity

```bash
# Test Supabase connection
curl https://your-project.supabase.co/rest/v1/
```

### Frontend won't start

```bash
# Clear cache and reinstall
cd frontend
rm -rf .next node_modules/.cache
npm install
npm run dev
```

### Backend tests failing

1. Ensure test database is set up
2. Check environment variables
3. Run only unit tests to isolate issues

```bash
poetry run pytest tests/ -v -m unit
```

### Docker issues

```bash
# Stop all containers
docker compose down

# Remove volumes (fresh start)
docker compose down -v

# Rebuild from scratch
docker compose -f docker-compose.dev.yml up --build --force-recreate
```

### Port already in use

```bash
# Find and kill process using port 3007
lsof -ti:3007 | xargs kill -9

# Find and kill process using port 8004
lsof -ti:8004 | xargs kill -9
```

### OpenAI API errors

1. Check API key is valid
2. Verify you have credits
3. Check rate limits

```bash
# Test OpenAI API
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Redis connection errors

```bash
# Start Redis with Docker
docker run -d -p 6379:6379 redis:7-alpine

# Check Redis is running
redis-cli ping
# Should return: PONG
```

## Resources

### Documentation
- **API Documentation**: http://localhost:8004/docs (when backend is running)
- **Architecture Docs**: See `docs/architecture/`
- **Feature Docs**: See `docs/features/`
- **Frontend Docs**: See `docs/frontend/`

### External Documentation
- **Supabase**: https://supabase.com/docs
- **Next.js**: https://nextjs.org/docs
- **FastAPI**: https://fastapi.tiangolo.com
- **LangChain**: https://python.langchain.com
- **React Query**: https://tanstack.com/query/latest
- **Tailwind CSS**: https://tailwindcss.com/docs

### Data Sources
- **Polish Judgments**: https://huggingface.co/datasets/HFforLegal/case-law
- **UK Judgments**: https://huggingface.co/datasets/JuDDGES/en-appealcourt

### Community
- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and share ideas
- **Slack**: #juddges-dev (if applicable)

## Next Steps

After completing this onboarding guide:

1. Read [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) for deep dive into system design
2. Review [API_REFERENCE.md](../api/API_REFERENCE.md) for complete API documentation
3. Check [CONTRIBUTING.md](../contributing/CONTRIBUTING.md) for contribution guidelines
4. Explore [CODE_STYLE.md](../contributing/CODE_STYLE.md) for coding standards
5. Browse open issues on GitHub labeled "good first issue"
6. Join the team standup (if applicable)
7. Pick your first task and start coding!

### Your First Task

Try these beginner-friendly tasks:

1. **Fix a typo**: Find and fix documentation typos
2. **Add a test**: Improve test coverage for an existing feature
3. **Update docs**: Document an undocumented feature
4. **Small UI fix**: Fix a minor UI bug or styling issue
5. **Add validation**: Add input validation to an API endpoint

Welcome to the team!
