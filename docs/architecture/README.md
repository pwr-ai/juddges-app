# Architecture

System design, technical decisions, and architectural patterns for Juddges App.

## 📚 Documentation

### [Overview](overview.md)
High-level project architecture including:
- Project structure and repository layout
- Technology stack and key dependencies
- Frontend and backend architecture
- Database design (PostgreSQL + pgvector)
- Data sources (HuggingFace datasets)
- Feature overview and roadmap

**Read this first** to understand the overall system design.

## 🏗️ Key Architectural Decisions

### Monorepo Structure
- Clear separation between frontend and backend
- Shared infrastructure via Supabase
- Independent deployment of services

### Backend Package Architecture
The backend uses reusable packages:
- **`juddges_search`** - RAG search implementation with LangChain
- **`schema_generator_agent`** - AI-powered legal schema generation

### Database Architecture
**Unified approach**:
- **PostgreSQL (Supabase)** - Structured data storage
- **pgvector** - Vector similarity search for semantic search
- Migrated from Weaviate (used in JuDDGES) to pgvector

### FastAPI Server
- Router-based architecture (documents, collections, analytics, feedback)
- LangServe integration for LangChain chains
- Middleware stack (CORS, GZip, rate limiting)
- Background tasks via Celery workers

### Frontend Architecture
- Next.js 15 App Router with file-based routing
- State management: Zustand (UI state) + React Query (server state)
- UI library: Radix UI primitives + custom components
- Rich text editing: TipTap editor

## 🔧 Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI**: React 19, Tailwind CSS 4, Radix UI
- **State**: Zustand, React Query (@tanstack/react-query)
- **Text Editing**: TipTap

### Backend
- **API**: FastAPI (Python 3.12+)
- **Database**: PostgreSQL with pgvector
- **Vector Search**: Supabase pgvector extension
- **AI/ML**: LangChain, OpenAI API, Langfuse
- **Tasks**: Celery with Redis
- **Auth**: Supabase Auth

### Infrastructure
- **Database/Auth**: Supabase
- **Deployment**: Docker Compose
- **Development**: Hot reload with volume mounts

## 📊 Data Flow

1. **Data Ingestion** → HuggingFace datasets → PostgreSQL
2. **Embeddings** → OpenAI API → pgvector storage
3. **Search** → User query → Hybrid search (vector + text) → Results
4. **Chat** → User question → RAG chain → AI response with sources

## 🔄 Migration Notes

This codebase was forked from JuDDGES:
- **Branding**: JuDDGES → Juddges (documentation complete, code in progress)
- **Data Model**: Tax documents → Court judgments (complete)
- **Vector DB**: Weaviate → pgvector (complete)
- **Package Names**: standardized on `juddges_search` (complete)
- **Schema**: Custom judgments table with rich metadata (complete)

## 🚀 Coming Soon

Additional architecture documentation:

### Database Schema
- Complete table structure
- Indexes and performance optimization
- Migration strategy
- Vector search implementation

### API Design
- FastAPI router organization
- Request/response schemas
- Authentication flow
- Rate limiting strategy

### Frontend Architecture
- Component hierarchy
- State management patterns
- Routing structure
- Performance optimization

### Vector Search
- pgvector configuration
- Embedding strategy
- Hybrid search algorithm
- Performance tuning

## 🔗 Related Documentation

- [Getting Started](../getting-started/README.md) - Initial setup
- [How-to Guides](../how-to/troubleshooting.md) - Task-oriented guides
- [Features](../features/README.md) - Feature-specific docs
