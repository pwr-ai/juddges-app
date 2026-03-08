# System Architecture

## Table of Contents

- [Overview](#overview)
- [High-Level Architecture](#high-level-architecture)
- [Data Flow](#data-flow)
- [Component Details](#component-details)
- [Database Design](#database-design)
- [API Design](#api-design)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Performance Considerations](#performance-considerations)
- [Migration from AI-Tax](#migration-from-ai-tax)

## Overview

Juddges is a full-stack legal research platform built with a modern, scalable architecture. The system enables semantic search across judicial decisions from Poland and the United Kingdom using AI-powered vector search and retrieval-augmented generation (RAG).

**Key Design Principles:**
- Separation of concerns (frontend, backend, database)
- API-first design
- Scalable vector search
- Real-time capabilities
- Type-safe interfaces
- Comprehensive testing

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User / Browser                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 15)                       │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐             │
│  │   Pages    │  │ Components │  │ State Mgmt   │             │
│  │ (App       │  │  (React    │  │ (Zustand +   │             │
│  │  Router)   │  │   19)      │  │  React Query)│             │
│  └────────────┘  └────────────┘  └──────────────┘             │
│                                                                  │
│  Port: 3007 (dev) / 3006 (prod)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ REST API / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                           │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐             │
│  │   API      │  │  LangChain │  │   Celery     │             │
│  │  Routes    │  │   Chains   │  │   Workers    │             │
│  │            │  │            │  │              │             │
│  └────────────┘  └────────────┘  └──────────────┘             │
│                                                                  │
│  Port: 8004 (dev) / 8002 (prod)                                │
└─────┬───────────────────┬────────────────┬──────────────────────┘
      │                   │                │
      │                   │                │
      ▼                   ▼                ▼
┌──────────┐      ┌──────────────┐  ┌──────────┐
│ Supabase │      │    OpenAI    │  │  Redis   │
│          │      │              │  │          │
│ Postgres │      │  - GPT-4     │  │ Sessions │
│ pgvector │      │  - Embeddings│  │ Cache    │
│ Auth     │      │              │  │ Celery   │
└──────────┘      └──────────────┘  └──────────┘
```

## Data Flow

### 1. Search Flow

```
User Query
    │
    ▼
Frontend Search Component
    │
    ▼
Backend API (/documents/search)
    │
    ├─► Generate Query Embedding (OpenAI)
    │
    ├─► Vector Similarity Search (pgvector)
    │
    ├─► Full-Text Search (PostgreSQL)
    │
    └─► Merge & Rank Results
            │
            ▼
        Return Results
            │
            ▼
    Frontend Display Results
```

**Steps:**
1. User enters search query in frontend
2. Frontend sends POST request to `/api/v1/documents/search`
3. Backend generates embedding using OpenAI API
4. Backend queries pgvector for semantic similarity
5. Backend also performs full-text search for keyword matching
6. Results are merged, ranked, and filtered
7. Response returned to frontend with pagination
8. Frontend displays results with highlighting

### 2. Chat Flow (RAG)

```
User Question
    │
    ▼
Frontend Chat Component
    │
    ▼
Backend Chat Endpoint (/chat)
    │
    ├─► Retrieve Relevant Documents (Vector Search)
    │
    ├─► Build Context from Documents
    │
    ├─► Generate Response (GPT-4 + Context)
    │
    └─► Stream Response
            │
            ▼
    Frontend Display Stream
```

**Steps:**
1. User asks question in chat interface
2. Frontend sends question to `/chat` endpoint
3. Backend retrieves relevant judgments using vector search
4. Backend constructs prompt with retrieved context
5. Backend calls OpenAI GPT-4 with context
6. Response is streamed back to frontend
7. Frontend displays response with citations

### 3. Data Ingestion Flow

```
HuggingFace Dataset
    │
    ▼
Ingestion Script
    │
    ├─► Download Data
    │
    ├─► Transform to Schema
    │
    ├─► Generate Embeddings (OpenAI)
    │
    └─► Insert into Database
            │
            ├─► judgments table (PostgreSQL)
            │
            └─► Vector index (pgvector)
```

**Steps:**
1. Script downloads judgments from HuggingFace
2. Data transformed to unified schema
3. Text chunked and embedded using OpenAI
4. Records inserted into Supabase `judgments` table
5. Vector embeddings stored in `embedding` column
6. Indexes automatically updated

### 4. Authentication Flow

```
User Login
    │
    ▼
Supabase Auth
    │
    ├─► Verify Credentials
    │
    ├─► Generate JWT Token
    │
    └─► Return Token
            │
            ▼
    Store in Cookie/LocalStorage
            │
            ▼
    Include in API Requests (Authorization Header)
            │
            ▼
    Backend Verifies JWT
```

## Component Details

### Frontend Components

#### Page Structure
```
app/
├── (app)/                      # Authenticated app routes
│   ├── layout.tsx             # Main app shell with nav
│   ├── page.tsx               # Dashboard/home
│   ├── search/
│   │   ├── page.tsx           # Search interface
│   │   └── [id]/page.tsx      # Document detail
│   ├── chat/
│   │   └── page.tsx           # Chat interface
│   ├── documents/
│   │   ├── page.tsx           # Document list
│   │   └── [id]/page.tsx      # Document detail
│   └── analytics/
│       └── page.tsx           # Analytics dashboard
│
├── auth/                      # Public auth routes
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── callback/page.tsx
│
└── api/                       # API routes
    └── [route]/route.ts
```

#### Component Library
```
components/
├── ui/                        # Base UI components (shadcn)
│   ├── button.tsx
│   ├── input.tsx
│   ├── dialog.tsx
│   └── ...
│
├── search/                    # Search-specific
│   ├── SearchBar.tsx
│   ├── SearchResults.tsx
│   ├── SearchFilters.tsx
│   └── DocumentCard.tsx
│
├── chat/                      # Chat-specific
│   ├── ChatInterface.tsx
│   ├── MessageList.tsx
│   ├── MessageInput.tsx
│   └── CitationCard.tsx
│
└── documents/                 # Document-specific
    ├── DocumentViewer.tsx
    ├── DocumentMetadata.tsx
    └── DocumentActions.tsx
```

#### State Management

**Zustand (Global UI State):**
```typescript
// stores/ui-store.ts
interface UIState {
  sidebarOpen: boolean;
  theme: "light" | "dark";
  filters: SearchFilters;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: "light" | "dark") => void;
  setFilters: (filters: SearchFilters) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  theme: "light",
  filters: {},
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setTheme: (theme) => set({ theme }),
  setFilters: (filters) => set({ filters }),
}));
```

**React Query (Server State):**
```typescript
// lib/api/documents.ts
export function useDocuments(filters: SearchFilters) {
  return useQuery({
    queryKey: ["documents", filters],
    queryFn: async () => {
      const response = await fetch("/api/documents/search", {
        method: "POST",
        body: JSON.stringify(filters),
      });
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
```

### Backend Components

#### Router Organization
```
app/
├── server.py                  # FastAPI app + router registration
├── auth.py                    # Authentication utilities
├── models.py                  # Pydantic models
├── errors.py                  # Custom exceptions
│
├── documents.py               # Document CRUD + search
├── collections.py             # Document collections
├── analytics.py               # Usage analytics
├── feedback.py                # User feedback
├── schemas.py                 # Schema generation
├── extraction.py              # Data extraction
│
├── api/                       # Additional API modules
│   ├── audit.py              # Audit logging
│   ├── consent.py            # Consent management
│   ├── legal.py              # Legal compliance
│   └── sso.py                # SSO integration
│
└── workers.py                 # Celery background tasks
```

#### Package Structure
```
packages/
├── juddges_search/
│   ├── chains/
│   │   ├── chat.py           # Chat chain
│   │   ├── qa.py             # Q&A chain
│   │   └── enhance_query.py  # Query enhancement
│   ├── db/
│   │   └── supabase_db.py    # Database client
│   ├── models.py             # Data models
│   └── utils.py              # Utilities
│
└── schema_generator_agent/
    ├── graph.py              # LangGraph agent
    ├── prompts.py            # Agent prompts
    └── tools.py              # Agent tools
```

## Database Design

### Schema Overview

```sql
-- Main judgments table
CREATE TABLE judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL UNIQUE,
  jurisdiction TEXT NOT NULL,          -- 'PL' or 'UK'
  court_name TEXT,
  court_level TEXT,                     -- Supreme, Appeal, District
  decision_date DATE,
  publication_date DATE,
  title TEXT,
  summary TEXT,
  full_text TEXT,
  judges JSONB,                         -- Array of judge objects
  keywords TEXT[],                      -- Array of keywords
  cited_legislation TEXT[],             -- Array of legal bases
  legal_topics TEXT[],                  -- Array of topics/references
  case_type TEXT,                       -- Civil, Criminal, etc.
  decision_type TEXT,                   -- Judgment, Order, etc.
  outcome TEXT,                         -- Upheld, Overturned, etc.
  source_url TEXT,
  embedding vector(768),                -- OpenAI embedding
  metadata JSONB,                       -- Flexible metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
-- B-tree indexes for filtering
CREATE INDEX idx_judgments_jurisdiction ON judgments(jurisdiction);
CREATE INDEX idx_judgments_decision_date ON judgments(decision_date);
CREATE INDEX idx_judgments_case_number ON judgments(case_number);
CREATE INDEX idx_judgments_court_name ON judgments(court_name);

-- GIN indexes for full-text search
CREATE INDEX idx_judgments_keywords ON judgments USING GIN(keywords);
CREATE INDEX idx_judgments_full_text ON judgments
  USING GIN(to_tsvector('english', full_text));

-- GIN index for JSONB
CREATE INDEX idx_judgments_metadata ON judgments USING GIN(metadata);

-- HNSW index for vector similarity (pgvector)
CREATE INDEX idx_judgments_embedding ON judgments
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### Search Functions

```sql
-- Semantic search by vector embedding
CREATE OR REPLACE FUNCTION search_judgments_by_embedding(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  case_number text,
  title text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.case_number,
    j.title,
    1 - (j.embedding <=> query_embedding) as similarity
  FROM judgments j
  WHERE 1 - (j.embedding <=> query_embedding) > match_threshold
  ORDER BY j.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Full-text search with ranking
CREATE OR REPLACE FUNCTION search_judgments_by_text(
  search_query text,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  case_number text,
  title text,
  rank float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.case_number,
    j.title,
    ts_rank(
      to_tsvector('english', j.full_text),
      plainto_tsquery('english', search_query)
    ) as rank
  FROM judgments j
  WHERE to_tsvector('english', j.full_text) @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;
```

### Vector Search Strategy

**pgvector Configuration:**
- **Algorithm**: HNSW (Hierarchical Navigable Small World)
- **Distance Metric**: Cosine similarity
- **Embedding Dimension**: 768
- **Index Parameters**:
  - `m = 16`: Max connections per layer
  - `ef_construction = 64`: Build-time search width

**Performance:**
- Search time: ~50-200ms for 1K-100K vectors
- Index size: ~10-15% of embedding data
- Memory: ~4 bytes per dimension per vector

## API Design

### RESTful Endpoints

**Base URL**: `http://localhost:8004/api/v1`

#### Documents

```
GET    /documents                    # List documents
POST   /documents/search             # Search documents
GET    /documents/{id}               # Get document by ID
POST   /documents/{id}/similar       # Find similar documents
GET    /documents/{id}/citations     # Get citation network
```

#### Search

```
POST   /search/semantic              # Semantic search
POST   /search/hybrid                # Hybrid search (semantic + text)
POST   /search/facets                # Get search facets
```

#### Chat (LangServe)

```
POST   /chat                         # Chat with RAG
POST   /qa                           # Question answering
POST   /enhance_query                # Enhance search query
```

#### Analytics

```
GET    /analytics/stats              # General statistics
GET    /analytics/trends             # Decision trends
GET    /analytics/courts             # Court statistics
```

#### Collections

```
GET    /collections                  # List collections
POST   /collections                  # Create collection
GET    /collections/{id}             # Get collection
PUT    /collections/{id}             # Update collection
DELETE /collections/{id}             # Delete collection
```

### Request/Response Format

**Search Request:**
```json
{
  "query": "contract law interpretation",
  "filters": {
    "jurisdiction": "PL",
    "court_level": "Supreme",
    "decision_date_from": "2020-01-01",
    "decision_date_to": "2024-12-31",
    "keywords": ["contract", "interpretation"]
  },
  "limit": 20,
  "offset": 0,
  "sort_by": "relevance"
}
```

**Search Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "case_number": "I CSK 123/2023",
      "title": "Contract Interpretation Case",
      "summary": "...",
      "jurisdiction": "PL",
      "court_name": "Supreme Court",
      "decision_date": "2023-06-15",
      "score": 0.92,
      "highlights": {
        "full_text": ["...contract <mark>law</mark>..."]
      }
    }
  ],
  "total": 145,
  "page": 1,
  "per_page": 20,
  "facets": {
    "court_level": {"Supreme": 45, "Appeal": 78, "District": 22},
    "year": {"2023": 60, "2022": 50, "2021": 35}
  }
}
```

### Authentication

**JWT-based Authentication:**
- Supabase Auth handles user authentication
- JWT tokens issued on login
- Tokens included in `Authorization: Bearer <token>` header
- Backend verifies tokens using Supabase service role key

**API Key Authentication:**
- Backend-to-backend communication uses API keys
- Configured via `BACKEND_API_KEY` environment variable
- Included in `X-API-Key` header

## Frontend Architecture

### Rendering Strategy

- **Server Components**: Default for pages and static content
- **Client Components**: Interactive UI with `"use client"` directive
- **Streaming**: Suspense boundaries for progressive rendering
- **Static Generation**: Pre-rendered pages where possible

### Data Fetching

**Server Components:**
```typescript
// app/documents/[id]/page.tsx
export default async function DocumentPage({ params }) {
  const document = await fetch(`/api/documents/${params.id}`)
    .then(res => res.json());

  return <DocumentViewer document={document} />;
}
```

**Client Components (React Query):**
```typescript
// components/search/SearchResults.tsx
"use client";

export function SearchResults() {
  const { data, isLoading } = useQuery({
    queryKey: ["search", filters],
    queryFn: () => searchDocuments(filters),
  });

  if (isLoading) return <Skeleton />;
  return <ResultsList results={data.results} />;
}
```

### Routing

**File-based Routing:**
- `app/page.tsx` → `/`
- `app/search/page.tsx` → `/search`
- `app/documents/[id]/page.tsx` → `/documents/:id`

**Route Groups:**
- `(app)`: Authenticated routes
- `(marketing)`: Public marketing pages
- `(auth)`: Authentication pages

**API Routes:**
- `app/api/[route]/route.ts` → `/api/:route`

## Backend Architecture

### Dependency Injection

FastAPI uses dependency injection for shared resources:

```python
from fastapi import Depends
from app.auth import verify_api_key

@router.get("/protected")
async def protected_route(
    api_key: str = Depends(verify_api_key)
):
    return {"message": "Authenticated"}
```

### Middleware Stack

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3007"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### Background Tasks (Celery)

```python
# app/workers.py
from celery import Celery

celery_app = Celery(
    "juddges",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

@celery_app.task
def generate_embeddings(document_id: str):
    """Generate embeddings for a document."""
    # Implementation
    pass
```

### Error Handling

```python
# app/errors.py
class DocumentNotFoundError(Exception):
    """Document not found."""
    pass

# app/server.py
@app.exception_handler(DocumentNotFoundError)
async def document_not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Document not found"}
    )
```

## Security Architecture

### Authentication & Authorization

1. **User Authentication**: Supabase Auth (JWT)
2. **API Authentication**: API keys for backend services
3. **Row-Level Security**: Supabase RLS policies
4. **CORS**: Configured for allowed origins only

### Data Protection

1. **Encryption at Rest**: Supabase encrypts data
2. **Encryption in Transit**: HTTPS for all connections
3. **API Key Storage**: Environment variables only
4. **Secret Management**: `.env.secrets` (gitignored)

### Input Validation

1. **Frontend**: Zod schemas for form validation
2. **Backend**: Pydantic models for API validation
3. **Database**: Type constraints and check constraints

## Deployment Architecture

### Development Environment

```yaml
# docker-compose.dev.yml
services:
  frontend:
    build: ./frontend
    volumes:
      - ./frontend:/app    # Hot reload
    ports:
      - "3007:3007"

  backend:
    build: ./backend
    volumes:
      - ./backend:/app     # Hot reload
    ports:
      - "8004:8004"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### Production Environment

```yaml
# docker-compose.yml
services:
  frontend:
    build: ./frontend
    ports:
      - "3006:3006"
    environment:
      - NODE_ENV=production

  backend:
    build: ./backend
    ports:
      - "8002:8002"
    environment:
      - PYTHON_ENV=production

  backend-worker:
    build: ./backend
    command: celery -A app.workers worker
```

## Performance Considerations

### Caching Strategy

1. **React Query**: Client-side caching (5 min stale time)
2. **Redis**: Server-side session caching
3. **PostgreSQL**: Query result caching
4. **CDN**: Static asset caching (future)

### Optimization Techniques

1. **Database Indexes**: All frequently queried fields
2. **Connection Pooling**: PostgreSQL connection pool
3. **Lazy Loading**: Load data on demand
4. **Code Splitting**: Next.js automatic code splitting
5. **Image Optimization**: Next.js Image component

### Scalability

**Current Capacity:**
- Up to 100K judgments
- ~1000 concurrent users
- ~100 requests/second

**Scaling Path:**
- Horizontal scaling of backend (multiple instances)
- Read replicas for database
- Redis cluster for distributed caching
- CDN for static assets

## Migration from AI-Tax

Juddges is forked from AI-Tax with the following changes:

### Completed Migrations

1. **Branding**: AI-Tax → Juddges throughout codebase
2. **Vector DB**: Weaviate → Supabase pgvector
3. **Data Model**: Tax documents → Court judgments
4. **Schema**: Custom `judgments` table
5. **Package Names**: `ai_tax_search` → `juddges_search`

### Legacy References

Some code may still reference AI-Tax patterns:
- Check for Weaviate imports (should use Supabase)
- Look for tax-specific terminology
- Review data transformation logic

### Future Work

- Complete frontend UI rebrand
- Optimize vector search performance
- Add jurisdiction-specific features
- Implement citation graph analysis

---

For more details, see related documentation:
- [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) - Getting started guide
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation
- [TESTING.md](./TESTING.md) - Testing strategy and guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
