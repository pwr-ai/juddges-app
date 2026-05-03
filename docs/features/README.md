# Features

Feature-specific documentation for Juddges App functionality.

## 🎨 Feature Documentation

### [Chat Sources](chat-sources/README.md)
AI-powered chat interface with source citations:
- Design and implementation details
- Source citation system
- Visual reference and UI patterns
- Implementation checklist
- Design options comparison

**Tech**: LangChain, OpenAI API, React Query, TipTap

### [Filtering](filtering/implementation.md)
Advanced judgment filtering system:
- Implementation details
- 11+ filter criteria (case type, court level, jurisdiction, etc.)
- Polish language support
- Server-side filtering with indexes
- Performance optimization

**Tech**: PostgreSQL indexes, Supabase, React Query

### [Schema Editor](schema-editor/load-feature.md)
JSON schema editing features:
- Load feature implementation
- Save feature implementation
- Schema validation
- Real-time editing

**Tech**: React JSON Schema Form (RJSF), Monaco Editor

### Search
Multi-modal search functionality:
- Semantic search (vector similarity)
- Full-text search (PostgreSQL FTS)
- Hybrid search (combining both)
- Language-aware search (Polish/English)

**Tech**: pgvector, OpenAI embeddings, PostgreSQL FTS

## 🏗️ Feature Architecture

### Common Patterns

**State Management**:
- Zustand for UI state (filters, selections, modal state)
- React Query for server state (data fetching, caching, mutations)

**API Communication**:
- Frontend → Backend via fetch/axios
- Backend → Supabase via direct SQL or REST API
- Real-time updates via Supabase Realtime (optional)

**Error Handling**:
- React Query error boundaries
- Toast notifications for user feedback
- Detailed error logging to console

### Feature Development Workflow

1. **Backend**: Define API endpoints in FastAPI router
2. **Database**: Add schema/migrations if needed
3. **Frontend**: Create components and hooks
4. **State**: Add Zustand store or React Query hooks
5. **UI**: Build components with Radix UI + Tailwind
6. **Testing**: Add Jest unit tests + Playwright E2E tests

## 📊 Feature Status

| Feature | Status | Documentation |
|---------|--------|--------------|
| Chat Sources | ✅ Implemented | [docs](chat-sources/README.md) |
| Filtering | ✅ Implemented | [docs](filtering/implementation.md) |
| Schema Editor | ✅ Implemented | [docs](schema-editor/load-feature.md) |
| Semantic Search | ✅ Implemented | Coming soon |
| Full-Text Search | ✅ Implemented | Coming soon |
| Hybrid Search | ✅ Implemented | Coming soon |
| Collections | 🚧 In Progress | Coming soon |
| Analytics | 🚧 In Progress | Coming soon |
| Annotations | 📋 Planned | Coming soon |

## 🚀 Adding New Features

When adding a new feature:

1. **Design First**:
   - Document design decisions
   - Create mockups or wireframes
   - Define API contracts

2. **Implement**:
   - Start with backend API
   - Add database schema if needed
   - Build frontend components
   - Add tests

3. **Document**:
   - Create feature directory in `docs/features/`
   - Add README with overview
   - Document implementation details
   - Include examples and usage

4. **Review**:
   - Code review
   - Test coverage check
   - Documentation review
   - Performance testing

See [Frontend Styling Guide](../frontend/styling-guide/README.md) for UI/UX standards.

## 🔗 Related Documentation

- [Architecture](../architecture/README.md) - System design
- [Frontend](../frontend/README.md) - Frontend-specific docs
- Backend - Backend-specific docs
- [API](../api/API_REFERENCE.md) - API reference
