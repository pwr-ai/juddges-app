# Master Test Plan - Juddges Legal Assistant

**Version**: 1.0  
**Date**: 2026-02-14  
**Status**: Active  

---

## Executive Summary

This document defines the comprehensive testing strategy for the Juddges Legal Assistant application, covering 195 backend API endpoints, 69 frontend pages, and 183 components. The goal is to achieve 70% code coverage with a balanced testing pyramid emphasizing unit tests (80%), integration tests (15%), and E2E tests (5%).

### Current State
- **Backend Coverage**: 29.1%
- **Frontend Coverage**: 1.6%
- **Combined Coverage**: 15.3%
- **Existing Tests**: 26 backend test files, 22 frontend test files
- **Total Endpoints**: 195 API endpoints across 35 routers
- **Frontend Pages**: 69 pages
- **Components**: 183 components

### Target State
- **Backend Coverage**: 75%
- **Frontend Coverage**: 65%
- **Combined Coverage**: 70%+
- **Total Test Cases**: ~1,500 tests
- **Execution Time**: <10 minutes for full suite

---

## Testing Objectives

1. **Coverage**: Achieve 70% code coverage across all modules
2. **Reliability**: 99.9% uptime with graceful degradation
3. **Performance**: All endpoints <2s p95 latency
4. **Security**: Zero vulnerabilities in auth flows
5. **UX**: All critical user flows tested end-to-end
6. **Maintainability**: Self-documenting tests with clear structure
7. **CI/CD**: Automated testing with fast feedback loops

---

## Testing Pyramid

```
           E2E Tests (5%)
          /            \
         /   ~75 tests  \
        /________________\
       Integration (15%)
      /                  \
     /    ~225 tests      \
    /______________________\
   Unit Tests (80%)
  /                        \
 /      ~1200 tests         \
/____________________________\
```

### Rationale
- **Unit Tests (80%)**: Fast, isolated, cheap to maintain
- **Integration Tests (15%)**: Test component interactions and data flow
- **E2E Tests (5%)**: Critical user journeys, expensive but high confidence

---

## Test Categories

### 1. Backend API Tests (~800 tests)

#### 1.1 Documents API (13 endpoints → 65 tests)
**Priority**: CRITICAL

| Endpoint | Method | Tests | Description |
|----------|--------|-------|-------------|
| `/api/documents` | GET | 5 | List with pagination, filtering, sorting |
| `/api/documents/search` | POST | 8 | Full-text and semantic search |
| `/api/documents/{id}` | GET | 5 | Single document retrieval |
| `/api/documents/{id}/similar` | GET | 5 | Similar documents (vector search) |
| `/api/documents/{id}/metadata` | GET | 4 | Document metadata extraction |
| `/api/documents/batch` | POST | 5 | Batch retrieval by IDs |
| `/api/documents/chunks/search` | POST | 6 | Chunk-level search |
| `/api/documents/sample` | GET | 4 | Sample documents for testing |
| `/api/documents/summarize` | POST | 6 | AI-powered summarization |
| `/api/documents/citation-network` | GET | 5 | Citation graph generation |
| `/api/documents/timeline` | POST | 4 | Timeline extraction |
| `/api/documents/{id}/export` | GET | 4 | Document export (PDF, JSON) |
| `/api/documents/stats` | GET | 4 | Document statistics |

**Test Coverage Per Endpoint**:
- ✅ Happy path (valid inputs)
- ✅ Invalid inputs (validation errors)
- ✅ Edge cases (empty results, large datasets, special characters)
- ✅ Error scenarios (database errors, timeouts, external API failures)
- ✅ Performance (latency within limits, pagination efficiency)
- ✅ Security (authentication, authorization, data leakage)

#### 1.2 Collections API (10 endpoints → 50 tests)
**Priority**: HIGH

| Endpoint | Method | Tests | Description |
|----------|--------|-------|-------------|
| `/api/collections` | GET | 5 | List user collections |
| `/api/collections` | POST | 5 | Create collection |
| `/api/collections/{id}` | GET | 4 | Get single collection |
| `/api/collections/{id}` | PUT | 5 | Update collection |
| `/api/collections/{id}` | DELETE | 4 | Delete collection |
| `/api/collections/{id}/documents` | POST | 6 | Add documents to collection |
| `/api/collections/{id}/documents` | DELETE | 5 | Remove documents from collection |
| `/api/collections/{id}/documents` | GET | 5 | List documents in collection |
| `/api/collections/{id}/share` | POST | 5 | Share collection |
| `/api/collections/{id}/export` | GET | 6 | Export collection |

#### 1.3 Schemas API (18 endpoints → 90 tests)
**Priority**: HIGH

| Endpoint | Method | Tests | Description |
|----------|--------|-------|-------------|
| `/api/schemas` | GET | 5 | List schemas |
| `/api/schemas` | POST | 6 | Create schema |
| `/api/schemas/{id}` | GET | 4 | Get schema |
| `/api/schemas/{id}` | PUT | 5 | Update schema |
| `/api/schemas/{id}` | DELETE | 4 | Delete schema |
| `/api/schemas/{id}/generate` | POST | 8 | AI schema generation |
| `/api/schemas/{id}/validate` | POST | 6 | Validate schema |
| `/api/schemas/{id}/versions` | GET | 5 | Schema versions |
| `/api/schemas/{id}/apply` | POST | 7 | Apply schema to document |
| `/api/schemas/marketplace` | GET | 5 | Public schema marketplace |
| `/api/schemas/{id}/publish` | POST | 5 | Publish to marketplace |
| `/api/schemas/{id}/fork` | POST | 5 | Fork schema |
| `/api/schemas/{id}/stats` | GET | 4 | Schema usage statistics |
| `/api/schemas/import` | POST | 6 | Import schema from file |
| `/api/schemas/{id}/export` | GET | 4 | Export schema |
| `/api/schemas/{id}/test` | POST | 5 | Test schema on sample data |
| `/api/schemas/search` | POST | 4 | Search schemas |
| `/api/schemas/suggest` | POST | 6 | AI schema suggestions |

#### 1.4 Extraction API (18 endpoints → 90 tests)
**Priority**: HIGH

| Endpoint | Method | Tests | Description |
|----------|--------|-------|-------------|
| `/api/extractions` | GET | 5 | List extractions |
| `/api/extractions` | POST | 8 | Create extraction job |
| `/api/extractions/{id}` | GET | 5 | Get extraction result |
| `/api/extractions/{id}` | DELETE | 4 | Delete extraction |
| `/api/extractions/{id}/status` | GET | 4 | Check extraction status |
| `/api/extractions/{id}/retry` | POST | 5 | Retry failed extraction |
| `/api/extractions/{id}/export` | GET | 5 | Export extraction results |
| `/api/extractions/{id}/validate` | POST | 6 | Validate extracted data |
| `/api/extractions/batch` | POST | 7 | Batch extraction |
| `/api/extractions/templates` | GET | 4 | Extraction templates |
| `/api/extractions/{id}/feedback` | POST | 5 | Provide feedback on extraction |
| `/api/extractions/{id}/correct` | POST | 6 | Correct extraction errors |
| `/api/extractions/stats` | GET | 4 | Extraction statistics |
| `/api/extractions/{id}/chunks` | GET | 5 | View extracted chunks |
| `/api/extractions/{id}/entities` | GET | 5 | View extracted entities |
| `/api/extractions/{id}/relationships` | GET | 5 | View extracted relationships |
| `/api/extractions/{id}/preview` | POST | 6 | Preview extraction |
| `/api/extractions/compare` | POST | 6 | Compare extractions |

#### 1.5 Chat & QA API (8 endpoints → 40 tests)
**Priority**: CRITICAL

| Endpoint | Method | Tests | Description |
|----------|--------|-------|-------------|
| `/api/chat` | POST | 8 | Chat with AI (LangServe) |
| `/api/qa` | POST | 7 | Question answering |
| `/api/chats` | GET | 5 | Chat history |
| `/api/chats/{id}` | GET | 5 | Get chat session |
| `/api/chats/{id}/messages` | GET | 5 | Message history |
| `/api/chats/{id}/fork` | POST | 4 | Fork conversation |
| `/api/chats/{id}/share` | POST | 3 | Share chat |
| `/api/chats/{id}/export` | GET | 3 | Export chat |

#### 1.6 Analytics & Feedback API (9 endpoints → 45 tests)
**Priority**: MEDIUM

| Endpoint | Method | Tests | Description |
|----------|--------|-------|-------------|
| `/api/analytics/usage` | GET | 5 | Usage statistics |
| `/api/analytics/searches` | GET | 5 | Search analytics |
| `/api/analytics/documents` | GET | 5 | Document analytics |
| `/api/analytics/users` | GET | 5 | User analytics |
| `/api/feedback` | POST | 6 | Submit feedback |
| `/api/feedback/{id}` | GET | 4 | Get feedback |
| `/api/feedback/{id}` | PUT | 5 | Update feedback |
| `/api/feedback/{id}` | DELETE | 4 | Delete feedback |
| `/api/feedback/stats` | GET | 6 | Feedback statistics |

#### 1.7 Authentication & Authorization (9 endpoints → 45 tests)
**Priority**: CRITICAL

| Endpoint | Method | Tests | Description |
|----------|--------|-------|-------------|
| `/api/auth/login` | POST | 6 | User login |
| `/api/auth/logout` | POST | 4 | User logout |
| `/api/auth/register` | POST | 7 | User registration |
| `/api/auth/refresh` | POST | 5 | Token refresh |
| `/api/auth/verify` | POST | 5 | Email verification |
| `/api/auth/reset-password` | POST | 6 | Password reset |
| `/api/auth/api-keys` | GET | 4 | List API keys |
| `/api/auth/api-keys` | POST | 5 | Create API key |
| `/api/auth/api-keys/{id}` | DELETE | 3 | Delete API key |

#### 1.8 Publications & Blog (21 endpoints → 84 tests)
**Priority**: MEDIUM

**Publications** (14 endpoints → 56 tests):
- List, create, update, delete publications
- Publish/unpublish, featured content
- Category management
- Search and filtering
- Import/export

**Blog** (7 endpoints → 28 tests):
- List, create, update, delete posts
- Publish/unpublish, tags
- Comments (if enabled)

#### 1.9 Experiments & Evaluations (15 endpoints → 75 tests)
**Priority**: MEDIUM

**Experiments** (8 endpoints → 40 tests):
- Create and run experiments
- Compare models/prompts
- Track metrics
- Export results

**Evaluations** (7 endpoints → 35 tests):
- Create evaluation datasets
- Run evaluations
- Metrics tracking
- Human evaluation

#### 1.10 Advanced Features (40+ endpoints → 200+ tests)
**Priority**: LOW-MEDIUM

- **Research Assistant** (4 endpoints → 20 tests)
- **Recommendations** (2 endpoints → 10 tests)
- **Deduplication** (4 endpoints → 20 tests)
- **OCR** (5 endpoints → 25 tests)
- **Clustering** (1 endpoint → 5 tests)
- **Topic Modeling** (2 endpoints → 10 tests)
- **Citation Network** (1 endpoint → 5 tests)
- **Timeline Extraction** (1 endpoint → 5 tests)
- **Argumentation Analysis** (1 endpoint → 5 tests)
- **Precedents** (1 endpoint → 5 tests)
- **Playground** (3 endpoints → 15 tests)
- **Dashboard** (6 endpoints → 30 tests)
- **Versioning** (5 endpoints → 25 tests)
- **Guest Sessions** (4 endpoints → 20 tests)
- **Health Checks** (5 endpoints → 10 tests)

#### 1.11 SSO & Legal API (13 endpoints → 52 tests)
**Priority**: MEDIUM

**SSO** (7 endpoints → 28 tests):
- SAML configuration
- OAuth providers
- SSO login flow

**Legal API** (6 endpoints → 24 tests):
- Terms of service
- Privacy policy
- Consent management

#### 1.12 GraphQL API (1 endpoint → 20 tests)
**Priority**: LOW

- Query testing (10 tests)
- Mutation testing (5 tests)
- Subscription testing (if enabled) (5 tests)

---

### 2. Frontend Component Tests (~400 tests)

#### 2.1 Search Components (50 tests)
**Priority**: CRITICAL

| Component | Tests | Description |
|-----------|-------|-------------|
| `SearchBar` | 8 | Input handling, suggestions, keyboard navigation |
| `SearchFilters` | 10 | Filter application, multi-select, date ranges |
| `SearchResults` | 12 | Result rendering, pagination, sorting |
| `SearchCard` | 6 | Document card display |
| `SavedSearches` | 8 | Save, load, delete searches |
| `SearchIntelligence` | 6 | AI-powered search insights |

#### 2.2 Chat Components (40 tests)
**Priority**: CRITICAL

| Component | Tests | Description |
|-----------|-------|-------------|
| `ChatInterface` | 12 | Main chat UI, message flow |
| `ChatMessage` | 8 | Message rendering, markdown support |
| `ChatInput` | 8 | Input handling, attachments |
| `ChatHistory` | 6 | History navigation |
| `ChatSources` | 6 | Source citations |

#### 2.3 Document Components (50 tests)
**Priority**: HIGH

| Component | Tests | Description |
|-----------|-------|-------------|
| `DocumentViewer` | 15 | Document rendering, zoom, navigation |
| `DocumentCard` | 8 | Card display, metadata |
| `DocumentMetadata` | 7 | Metadata display, editing |
| `DocumentSimilar` | 6 | Similar documents widget |
| `DocumentExport` | 6 | Export functionality |
| `DocumentAnnotation` | 8 | Annotation tools |

#### 2.4 Collection Components (35 tests)
**Priority**: HIGH

| Component | Tests | Description |
|-----------|-------|-------------|
| `CollectionList` | 8 | List display, sorting |
| `CollectionCard` | 6 | Collection card |
| `CollectionEditor` | 10 | Create/edit collections |
| `CollectionDocuments` | 7 | Document management |
| `CollectionShare` | 4 | Sharing functionality |

#### 2.5 Schema Components (45 tests)
**Priority**: HIGH

| Component | Tests | Description |
|-----------|-------|-------------|
| `SchemaEditor` | 15 | Schema editing, validation |
| `SchemaPreview` | 8 | Preview extracted data |
| `SchemaMarketplace` | 10 | Browse and install schemas |
| `SchemaGenerator` | 12 | AI schema generation |

#### 2.6 Extraction Components (30 tests)
**Priority**: HIGH

| Component | Tests | Description |
|-----------|-------|-------------|
| `ExtractionList` | 8 | List extractions |
| `ExtractionViewer` | 10 | View extraction results |
| `ExtractionEditor` | 8 | Edit/correct extractions |
| `ExtractionExport` | 4 | Export functionality |

#### 2.7 UI Components (80 tests)
**Priority**: MEDIUM

| Component | Tests | Description |
|-----------|-------|-------------|
| `Button` | 6 | All variants, states |
| `Input` | 8 | Text, number, date inputs |
| `Select` | 7 | Dropdown, multi-select |
| `Modal` | 6 | Open, close, content |
| `Toast` | 5 | Success, error, warning |
| `Loading` | 5 | Spinner, skeleton |
| `Empty` | 4 | Empty states |
| `ErrorBoundary` | 6 | Error handling |
| `Pagination` | 7 | Page navigation |
| `Table` | 10 | Data table, sorting, filtering |
| `Tabs` | 6 | Tab navigation |
| `Accordion` | 5 | Expand/collapse |
| `Tooltip` | 5 | Hover tooltips |

#### 2.8 Layout Components (20 tests)
**Priority**: MEDIUM

| Component | Tests | Description |
|-----------|-------|-------------|
| `Header` | 6 | Navigation, user menu |
| `Sidebar` | 6 | Navigation, responsive |
| `Footer` | 4 | Links, social |
| `Layout` | 4 | Page layout |

#### 2.9 Auth Components (25 tests)
**Priority**: CRITICAL

| Component | Tests | Description |
|-----------|-------|-------------|
| `LoginForm` | 8 | Login flow, validation |
| `SignupForm` | 8 | Signup flow, validation |
| `ForgotPassword` | 5 | Password reset |
| `ProtectedRoute` | 4 | Route protection |

#### 2.10 Form Components (25 tests)
**Priority**: MEDIUM

| Component | Tests | Description |
|-----------|-------|-------------|
| `FormField` | 6 | Field rendering, validation |
| `FormGroup` | 5 | Group layout |
| `FormValidation` | 8 | Validation rules |
| `FormSubmit` | 6 | Submit handling |

---

### 3. E2E Tests (~75 scenarios)

#### 3.1 Critical User Flows (30 tests)
**Priority**: CRITICAL

1. **Search Flow** (8 tests)
   - Basic search → Results → Document view
   - Filtered search → Refine → View document
   - Semantic search → Similar docs → Collection
   - Search → Save search → Load later
   - Advanced filters → Complex query
   - Search → Chat about results
   - Search → Export results
   - Empty search results handling

2. **Chat Flow** (8 tests)
   - New chat → Question → AI response → Sources
   - Follow-up questions → Context preservation
   - Chat with document context
   - Chat → Create collection from sources
   - Chat history → Resume conversation
   - Fork conversation → New branch
   - Share chat → Public link
   - Export chat → PDF/JSON

3. **Collection Flow** (7 tests)
   - Create collection → Add documents → View
   - Edit collection → Update metadata
   - Share collection → Collaborators
   - Export collection → PDF bundle
   - Delete collection → Confirmation
   - Collection from search results
   - Collection from chat sources

4. **Schema Flow** (7 tests)
   - Create schema → Define fields → Save
   - AI schema generation → Review → Apply
   - Apply schema → Document extraction
   - Schema marketplace → Install → Use
   - Edit extraction results → Corrections
   - Schema versioning → Rollback
   - Export extraction → JSON/CSV

#### 3.2 Authentication Flows (10 tests)
**Priority**: CRITICAL

1. **Sign Up & Onboarding** (3 tests)
   - Sign up → Email verification → First login
   - Sign up → Skip verification → Limited access
   - Sign up → Error handling

2. **Sign In** (3 tests)
   - Sign in → Dashboard
   - Sign in → Remember me
   - Sign in → Wrong credentials

3. **Password Management** (2 tests)
   - Forgot password → Reset link → New password
   - Change password → Re-login

4. **Session Management** (2 tests)
   - Session expiration → Re-login
   - Concurrent sessions → Logout all

#### 3.3 Advanced Workflows (15 tests)
**Priority**: HIGH

1. **Research Workflow** (5 tests)
   - Search → Multiple documents → Compare
   - Create research collection → Annotations
   - Extract data → Schema → Export
   - Citation network → Related cases
   - Timeline extraction → Chronology

2. **Collaboration Workflow** (5 tests)
   - Share collection → Collaborator adds docs
   - Comment on document → Discussion
   - Shared schema → Team extraction
   - Publish schema → Marketplace
   - Team workspace → Shared resources

3. **Data Export Workflow** (5 tests)
   - Export search results → CSV
   - Export document → PDF with annotations
   - Export collection → ZIP bundle
   - Export extraction → Structured data
   - API integration → External tool

#### 3.4 Edge Cases & Error Handling (20 tests)
**Priority**: MEDIUM

1. **Network Issues** (5 tests)
   - Offline mode → Queue actions
   - Network error → Retry mechanism
   - Slow connection → Loading states
   - Request timeout → Error message
   - Reconnection → Resume session

2. **Browser Compatibility** (5 tests)
   - Back/forward navigation → State preservation
   - Refresh page → State recovery
   - Multiple tabs → Sync state
   - Browser storage limits
   - Cookies disabled → Fallback

3. **Data Handling** (5 tests)
   - Large dataset → Pagination
   - Empty results → Helpful message
   - Malformed data → Error handling
   - Special characters → Escaping
   - Unicode support → International

4. **Concurrent Operations** (5 tests)
   - Simultaneous edits → Conflict resolution
   - Race conditions → Proper ordering
   - Optimistic updates → Rollback on error
   - Real-time updates → WebSocket sync
   - Stale data → Refresh prompt

---

### 4. Integration Tests (~225 tests)

#### 4.1 Backend Integration (100 tests)

1. **Database Integration** (30 tests)
   - CRUD operations with transactions
   - Complex queries with joins
   - Full-text search with ranking
   - Vector search with embeddings
   - Batch operations
   - Connection pooling
   - Error recovery

2. **External API Integration** (25 tests)
   - OpenAI API (embeddings, chat)
   - Supabase Auth
   - Redis (caching, sessions)
   - Celery (background tasks)
   - Langfuse (monitoring)

3. **LangChain Integration** (20 tests)
   - Chat chains
   - QA chains
   - Document loaders
   - Vector stores
   - Callbacks and monitoring

4. **Cross-Router Integration** (25 tests)
   - Document → Collection workflow
   - Schema → Extraction workflow
   - Search → Chat workflow
   - Analytics → Feedback workflow
   - Auth → Protected resources

#### 4.2 Frontend Integration (75 tests)

1. **API Integration** (30 tests)
   - Fetch with error handling
   - Request caching (React Query)
   - Optimistic updates
   - Polling for status
   - WebSocket connections

2. **State Management** (20 tests)
   - Zustand store updates
   - React Query cache
   - Local storage persistence
   - Cross-component communication
   - Context providers

3. **Routing Integration** (15 tests)
   - Navigation with state
   - Protected routes
   - Dynamic routes
   - Query parameters
   - Route transitions

4. **UI Integration** (10 tests)
   - Form submission → API → UI update
   - Search → Filter → Results update
   - Modal → Action → Refresh
   - Toast notifications → Actions

#### 4.3 Full-Stack Integration (50 tests)

1. **Search Pipeline** (15 tests)
   - User query → Backend search → Results rendering
   - Filters → Query building → API call → UI update
   - Semantic search → Vector DB → Ranking → Display

2. **Chat Pipeline** (15 tests)
   - User message → LangChain → Streaming → UI update
   - Context retrieval → Document chunks → Sources
   - Follow-up → History → Context preservation

3. **Extraction Pipeline** (10 tests)
   - Schema selection → Document upload → Celery job → Results
   - Status polling → Progress updates → Completion

4. **Authentication Pipeline** (10 tests)
   - Login → JWT → API requests → Protected pages
   - Token refresh → Seamless re-auth
   - Logout → Clear state → Redirect

---

### 5. Performance Tests (~30 tests)

#### 5.1 Load Testing (10 tests)
**Tools**: Locust, K6

- 100 concurrent users → Search
- 500 concurrent users → API endpoints
- 1000 concurrent users → Read-only operations
- Peak traffic simulation (5x baseline)
- Sustained load (1 hour at 80% capacity)
- Database connection pooling under load
- Redis cache hit rates
- Vector search performance at scale
- LangChain streaming latency
- API rate limiting enforcement

#### 5.2 Stress Testing (10 tests)

- Breaking point identification
- Resource exhaustion (memory, CPU, DB connections)
- Recovery after failure
- Cascading failure prevention
- Database query optimization under stress
- Vector search degradation
- Background worker queue overflow
- WebSocket connection limits
- File upload limits
- Concurrent extraction jobs

#### 5.3 Performance Benchmarks (10 tests)

- Endpoint latency (p50, p95, p99)
- Database query performance
- Vector search latency vs. accuracy
- LLM response time
- Frontend page load time (FCP, LCP, TTI)
- Bundle size optimization
- Image optimization
- Code splitting effectiveness
- Cache effectiveness
- API response times

**Targets**:
- API endpoints: p95 < 2s
- Search: p95 < 1s
- Chat streaming: first token < 1s
- Page load: LCP < 2.5s
- Database queries: p95 < 500ms

---

### 6. Security Tests (~40 tests)

#### 6.1 Authentication & Authorization (15 tests)

- SQL injection prevention
- XSS prevention (stored, reflected, DOM-based)
- CSRF protection
- JWT token validation
- Token expiration enforcement
- API key validation
- Permission checks (RBAC)
- Unauthorized access attempts
- Privilege escalation prevention
- Session hijacking prevention
- Brute force protection
- Password strength enforcement
- MFA implementation (if enabled)
- OAuth security
- SSO security

#### 6.2 Input Validation (10 tests)

- Request body validation (Pydantic)
- Query parameter sanitization
- File upload validation (type, size, content)
- JSON schema validation
- SQL injection in search queries
- NoSQL injection (if applicable)
- Command injection prevention
- Path traversal prevention
- XML external entity (XXE) prevention
- Server-side request forgery (SSRF) prevention

#### 6.3 Data Protection (10 tests)

- Sensitive data masking in logs
- PII handling and encryption
- Database encryption at rest
- TLS/SSL enforcement
- Secure headers (CSP, HSTS, X-Frame-Options)
- CORS configuration
- API rate limiting
- DDoS protection
- Data leakage prevention
- Audit logging

#### 6.4 Dependency Security (5 tests)

- Vulnerability scanning (npm audit, safety)
- Dependency version pinning
- Supply chain security
- License compliance
- Security patches

---

## Test Infrastructure

### Backend Testing Stack

**Framework**: pytest + pytest-asyncio
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
markers = [
    "unit: Unit tests (fast, isolated)",
    "integration: Integration tests (external dependencies)",
    "e2e: End-to-end tests (full system)",
    "performance: Performance and load tests",
    "security: Security tests",
]
```

**Key Libraries**:
- `pytest`: Test runner
- `pytest-asyncio`: Async test support
- `pytest-mock`: Mocking and patching
- `pytest-cov`: Coverage reporting
- `httpx`: HTTP client testing
- `responses`: HTTP mocking
- `factory-boy`: Test fixtures
- `faker`: Test data generation

**Test Structure**:
```
backend/tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Unit tests (80%)
│   ├── test_documents.py
│   ├── test_collections.py
│   ├── test_schemas.py
│   └── ...
├── integration/             # Integration tests (15%)
│   ├── test_search_flow.py
│   ├── test_extraction_flow.py
│   └── ...
└── e2e/                     # E2E tests (5%)
    ├── test_critical_flows.py
    └── ...
```

### Frontend Testing Stack

**Unit & Integration**: Jest + Testing Library
```json
{
  "jest": {
    "testEnvironment": "jsdom",
    "setupFilesAfterEnv": ["<rootDir>/jest.setup.js"],
    "collectCoverageFrom": [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "!**/*.d.ts",
      "!**/node_modules/**"
    ]
  }
}
```

**E2E**: Playwright
```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3007',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
```

**Key Libraries**:
- `@testing-library/react`: Component testing
- `@testing-library/jest-dom`: DOM matchers
- `@testing-library/user-event`: User interaction simulation
- `msw`: API mocking (Mock Service Worker)
- `playwright`: E2E testing
- `jest-axe`: Accessibility testing

**Test Structure**:
```
frontend/
├── __tests__/              # Unit tests
│   ├── components/
│   ├── hooks/
│   └── utils/
└── tests/
    ├── integration/        # Integration tests
    └── e2e/               # E2E tests
        ├── auth.spec.ts
        ├── search.spec.ts
        ├── chat.spec.ts
        └── ...
```

### CI/CD Pipeline

**GitHub Actions Workflow**:
```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run backend tests
        run: |
          cd backend
          poetry install
          poetry run pytest --cov --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run frontend tests
        run: |
          cd frontend
          npm ci
          npm run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E tests
        run: |
          docker-compose -f docker-compose.test.yml up -d
          cd frontend
          npm run test:e2e
      - name: Upload Playwright report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: frontend/playwright-report/

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run security scans
        run: |
          npm audit
          poetry run safety check
```

---

## Test Execution Schedule

### Phase 1: Backend Unit Tests (Week 1)

**Days 1-2**: Documents & Search APIs (65 tests)
- `test_documents.py`: CRUD, search, similar docs
- `test_search_intelligence.py`: Advanced search features

**Days 3-4**: Collections & Schemas APIs (140 tests)
- `test_collections.py`: Collection management
- `test_schemas.py`: Schema CRUD and generation
- `test_schema_marketplace.py`: Marketplace features

**Days 5-6**: Extraction & Chat APIs (130 tests)
- `test_extraction.py`: Extraction workflows
- `test_chat.py`: Chat and QA
- `test_research_assistant.py`: Research features

**Day 7**: Analytics, Feedback, Auth APIs (90 tests)
- `test_analytics.py`: Analytics endpoints
- `test_feedback.py`: Feedback system
- `test_auth.py`: Authentication and authorization

### Phase 2: Frontend Unit Tests (Week 2)

**Days 1-2**: Core Components (100 tests)
- Search components (50 tests)
- Chat components (40 tests)
- UI components (10 tests)

**Days 3-4**: Feature Components (120 tests)
- Document components (50 tests)
- Collection components (35 tests)
- Schema components (35 tests)

**Days 5-6**: Page & Integration Tests (100 tests)
- Page component tests (60 tests)
- Hook tests (20 tests)
- Context tests (20 tests)

**Day 7**: Auth & Forms (80 tests)
- Auth components (25 tests)
- Form components (25 tests)
- Layout components (20 tests)
- Utilities (10 tests)

### Phase 3: Integration & E2E Tests (Week 3)

**Days 1-3**: Integration Tests (225 tests)
- Backend integration (100 tests)
- Frontend integration (75 tests)
- Full-stack integration (50 tests)

**Days 4-5**: E2E Critical Flows (40 tests)
- Search flow (8 tests)
- Chat flow (8 tests)
- Collection flow (7 tests)
- Schema flow (7 tests)
- Authentication flows (10 tests)

**Days 6-7**: E2E Advanced & Edge Cases (35 tests)
- Advanced workflows (15 tests)
- Edge cases and error handling (20 tests)

### Phase 4: Performance & Security (Week 4)

**Days 1-2**: Performance Testing (30 tests)
- Load testing (10 tests)
- Stress testing (10 tests)
- Performance benchmarks (10 tests)

**Days 3-4**: Security Testing (40 tests)
- Authentication & authorization (15 tests)
- Input validation (10 tests)
- Data protection (10 tests)
- Dependency security (5 tests)

**Days 5-7**: Bug Fixes, Coverage Gaps, Documentation
- Fix failing tests
- Improve coverage for low-coverage modules
- Document testing patterns
- Create test templates

---

## Success Criteria

### Coverage Targets
- ✅ Backend coverage: 75%+
- ✅ Frontend coverage: 65%+
- ✅ Combined coverage: 70%+
- ✅ Critical paths: 95%+

### Quality Targets
- ✅ All critical paths have E2E tests
- ✅ Zero P0 bugs in production
- ✅ All tests pass in CI/CD
- ✅ Performance targets met (p95 < 2s)
- ✅ Security vulnerabilities addressed (CVSS < 7.0)

### Process Targets
- ✅ Test execution time < 10 minutes (unit + integration)
- ✅ E2E test execution time < 30 minutes
- ✅ Flaky test rate < 1%
- ✅ Test maintainability score > 80%

---

## Test Ownership

| Area | Owner | Responsibilities |
|------|-------|------------------|
| Backend API Tests | Backend Team | Unit and integration tests for all endpoints |
| Frontend Component Tests | Frontend Team | Unit tests for all components and pages |
| E2E Tests | QA Team | Critical user flows and edge cases |
| Performance Tests | DevOps Team | Load, stress, and benchmark tests |
| Security Tests | Security Team | Vulnerability scanning and penetration testing |
| Test Infrastructure | DevOps Team | CI/CD, test environments, reporting |

---

## Monitoring & Reporting

### Daily Metrics
- Test pass rate (target: 100%)
- Coverage percentage (target: 70%+)
- Test execution time (target: <10 min)
- Flaky test count (target: 0)

### Weekly Reports
- Flaky test analysis and fixes
- Coverage trends by module
- Performance regression analysis
- New test additions

### Monthly Reviews
- Coverage improvement vs. target
- Bug density by module
- Test maintenance effort
- Testing velocity

### Dashboards
- **Codecov**: Coverage trends, PR coverage diff
- **GitHub Actions**: Test run history, failure patterns
- **Playwright**: E2E test traces, screenshots, videos
- **Custom Dashboard**: Aggregated metrics, trends

---

## Risk Management

### High-Risk Areas (Prioritize Testing)
1. Authentication & Authorization
2. Payment processing (if applicable)
3. Data export and privacy
4. AI/LLM integration (hallucinations, prompt injection)
5. Vector search accuracy

### Mitigation Strategies
- Extra test coverage for high-risk areas (95%+)
- Manual testing for critical flows
- Security audits for sensitive features
- Performance testing under peak load
- Chaos engineering for resilience

---

## Test Maintenance

### Best Practices
1. **DRY Principle**: Reusable fixtures and helpers
2. **AAA Pattern**: Arrange, Act, Assert
3. **Clear Naming**: Descriptive test names (what, when, expected)
4. **Isolation**: Independent, idempotent tests
5. **Fast Feedback**: Unit tests run in <5 seconds
6. **Fail Fast**: Stop on first critical failure

### Refactoring Guidelines
- Refactor tests alongside code changes
- Update tests when requirements change
- Remove obsolete tests
- Consolidate duplicate test logic
- Keep test code simple and readable

### Code Review Checklist
- [ ] Tests cover new/changed functionality
- [ ] Tests are independent and isolated
- [ ] Tests have clear, descriptive names
- [ ] Tests follow project conventions
- [ ] Edge cases are covered
- [ ] Error scenarios are tested
- [ ] Performance impact considered

---

## Appendices

### Appendix A: Test Templates
See `/docs/testing/templates/` for reusable test templates.

### Appendix B: Testing Glossary
- **Unit Test**: Tests a single function/method in isolation
- **Integration Test**: Tests interaction between components
- **E2E Test**: Tests complete user workflows
- **Smoke Test**: Quick sanity check after deployment
- **Regression Test**: Ensures bugs don't reappear
- **Flaky Test**: Test that intermittently fails
- **Test Fixture**: Reusable test data or setup

### Appendix C: Useful Resources
- [Testing Best Practices (Python)](https://docs.pytest.org/en/stable/goodpractices.html)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Jest Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-14  
**Next Review**: 2026-03-14
