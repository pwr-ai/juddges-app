# Code Audit Report - Juddges App

**Date:** 2026-04-05
**Scope:** Full codebase (backend + frontend + infrastructure)
**Thoroughness:** Standard (comprehensive across all dimensions)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Overall Health Score | **7.2 / 10** |
| Critical Issues | **1** (secrets exposure) |
| High Priority Issues | **6** |
| Medium Priority Issues | **9** |
| Low Priority Issues | **5** |
| Backend Python LOC | ~56,700 |
| Frontend TypeScript LOC | ~55,000+ |
| Average Backend Complexity | **C (15.6)** - needs attention |
| Backend Test Files | 62+ |
| Frontend Test Files | 38+ unit, 17 E2E |

### Top 3 Priorities
1. **CRITICAL: Rotate all secrets** - `.env` file contains real production credentials
2. **HIGH: Decompose god files** - 5 files exceed 1000 lines with complexity grade C-D
3. **HIGH: Increase test coverage enforcement** - Frontend at 3% threshold, many untested modules

---

## Findings by Category

### 1. Architecture & Design

#### Strengths
- Clean monorepo structure with clear frontend/backend separation
- Router-based FastAPI architecture with 30+ feature-specific routers
- Well-designed package system (`juddges_search`, `schema_generator_agent`)
- Modern async/await patterns throughout the backend
- LangGraph agent architecture for AI workflows is well-structured
- Singleton pattern with double-checked locking for database connections
- Good middleware stack: security headers, CORS, rate limiting, GZip

#### Issues

##### HIGH: God Files Require Decomposition

| File | Lines | Cyclomatic Complexity |
|------|-------|-----------------------|
| `backend/app/schemas.py` | 2,490 | C (avg 14) |
| `backend/app/documents.py` | 1,804 | C (avg 12) |
| `backend/app/models.py` | 1,384 | - |
| `backend/packages/juddges_search/.../supabase_db.py` | 1,116 | 38 broad except blocks |
| `backend/app/extraction_domain/jobs_router.py` | 1,109 | C |
| `frontend/lib/api.ts` | 1,954 | - |
| `frontend/app/documents/[id]/page.tsx` | 1,444 | - |
| `frontend/lib/store/searchStore.ts` | 1,241 | - |
| `frontend/hooks/useChatLogic.ts` | 1,231 | - |
| `frontend/components/DocumentVisualization.tsx` | 1,223 | - |

**Recommendation:** Split along domain boundaries:
- `schemas.py` -> `schemas_crud.py`, `schema_generator.py`, `schema_versioning.py`
- `documents.py` -> `documents_crud.py`, `document_search.py`, `document_formatting.py`
- `api.ts` -> `chatApi.ts`, `documentsApi.ts`, `schemasApi.ts`, `extractionsApi.ts`
- `useChatLogic.ts` -> `useChatMessages.ts`, `useChatStreaming.ts`, `useChatSources.ts`

##### HIGH: Mixed Authentication Patterns

The backend uses three authentication mechanisms inconsistently:
- **API Key** (`verify_api_key`) - most endpoints
- **JWT** (`get_current_user`) - user-facing endpoints
- **Admin** (`require_admin`) - admin endpoints (JWT only, no API key)

Some endpoints accept both, some accept neither for anonymous access. This creates confusion about which endpoints are protected and how.

**Recommendation:** Define clear auth tiers and document which tier each endpoint belongs to.

##### MEDIUM: In-Memory Session State

`backend/app/schemas.py` stores generation sessions in `_generation_sessions` dict. Sessions lost on restart. Cleanup runs every 5 minutes.

**Recommendation:** Migrate to Redis with TTL.

##### MEDIUM: Circular Import Avoidance via Lazy Imports

`backend/app/api/admin.py` uses lazy imports to avoid circular dependencies - a symptom of tight coupling between modules.

##### LOW: Deprecated Endpoints Still Exposed

Multiple deprecated endpoints remain in the API surface:
- `GET /schemas` (use `/schemas/db`)
- `GET /extractions/schemas` (deprecated)
- Several legacy document endpoints

---

### 2. Code Quality

#### Strengths
- Ruff for formatting and linting (comprehensive rule set including security rules)
- MyPy configured for type checking
- Radon and Vulture in dev dependencies for complexity and dead code analysis
- TypeScript strict mode on frontend
- No `@ts-ignore` directives in frontend source
- Consistent import patterns across both codebases
- Pydantic v2 for strong backend data validation
- Zod for frontend runtime validation

#### Issues

##### HIGH: Complexity Hotspots (Radon Grade D)

| Function | File | Complexity |
|----------|------|------------|
| `prepare_retriever` | `packages/.../supabase_search.py` | D (27) |
| `detect_jurisdiction` | `packages/.../jurisdiction.py` | D (23) |
| `update_post` | `app/api/blog.py` | C (20) |
| `list_extraction_jobs` | `app/extraction_domain/jobs_router.py` | C (19) |
| `get_admin_blog_stats` | `app/api/blog.py` | C (18) |
| `compare_schema_versions` | `app/schemas.py` | C (17) |
| `compile_field_to_json_schema` | `app/schemas.py` | C (16) |

Average cyclomatic complexity across backend: **C (15.6)** - above recommended threshold of B (10).

##### HIGH: Broad Exception Handling

**361 instances** of `except Exception` or bare `except:` across 73 backend files. Top offenders:
- `supabase_db.py`: 38 instances
- `schemas.py`: 20 instances
- `admin.py`: 19 instances
- `dashboard.py`: 15 instances
- `blog.py`: 15 instances
- `jobs_router.py`: 15 instances

These hide bugs, swallow stack traces, and make debugging difficult.

**Recommendation:** Replace with specific exception types. Use the existing `AppException` hierarchy.

##### MEDIUM: SELECT * Queries (20+ instances)

`.select("*")` used in 20+ locations across backend. Fetches all columns when only a subset is needed, wasting bandwidth and memory.

**Recommendation:** Specify only needed columns: `.select("id, name, created_at")`.

##### MEDIUM: Frontend Console Logging

**234 instances** of `console.log/warn/error` across 95 frontend files. A `lib/logger.ts` exists but is not consistently used.

**Recommendation:** Replace with the existing logger utility for production-safe logging.

##### LOW: Dead Code Detected

Vulture found unreachable code in `app/ingestion/chunk_documents.py:463` (after `while` statement).

---

### 3. Security

#### Strengths
- Security headers middleware (CSP, HSTS, X-Frame-Options, X-XSS-Protection)
- `defusedxml` for safe XML parsing (prevents XXE)
- `DOMPurify` with strict whitelist for all HTML rendering of user content
- Constant-time comparison for API keys (`secrets.compare_digest`)
- Parameterized queries via Supabase SDK (no SQL injection vectors found)
- Rate limiting with SlowAPI
- Multi-stage Docker builds with non-root users
- CI/CD: pip-audit, npm audit, Gitleaks secret scanning
- CORS limited to specific origins (not wildcard)

#### Issues

##### CRITICAL: Production Secrets in .env File

The `.env` file contains **real production credentials** including:
- Supabase URL, anon key, **service role key** (bypasses RLS)
- OpenAI API key (`sk-proj-...`)
- Anthropic API key (`sk-ant-...`)
- Docker Hub token (`dckr_pat_...`)
- HuggingFace token (`hf_...`)
- Database URL with password
- Discord webhook URL
- Meilisearch master key

**While `.env` is in `.gitignore`**, if it was ever committed to git history, secrets are exposed.

**Immediate Action Required:**
1. Rotate ALL production secrets
2. Audit git history for `.env` commits (`git log --all --full-history -- .env`)
3. If found, use `git filter-repo` to purge from history
4. Consider a secrets manager (Vault, AWS Secrets Manager)

##### HIGH: Dockerfile.analysis Copies .env into Image

`Dockerfile.analysis:23` contains `COPY .env .env`, baking secrets into Docker image layers permanently.

**Fix:** Use `--env-file` at runtime or Docker BuildKit secrets.

##### HIGH: Environment Variable Logging Leaks Prefixes

Server startup logs masked values showing first 4 characters of secrets. While partially masked, this still provides information for targeted attacks.

**Fix:** Log only whether variables are configured, not their values.

##### MEDIUM: No Rate Limit Response Headers

Rate limiting is configured but clients don't receive `X-RateLimit-*` headers to know their limits.

##### MEDIUM: Meilisearch Master Key as Application Key

The master key (full admin access) is passed to the application. Should use separate read-only search keys.

##### LOW: Missing SBOM Generation in CI/CD

No Software Bill of Materials generated during builds. Useful for compliance and vulnerability tracking.

---

### 4. Performance

#### Strengths
- PostgreSQL connection pooling (min=5, max=20)
- Async/await throughout for I/O-bound operations
- GZip compression middleware
- React Query with 4-hour cache TTL (matches backend)
- No refetch on window focus (explicit optimization)
- Hybrid search with configurable BM25/vector balance
- Chunk caching to prevent re-fetching
- React compiler enabled (experimental) for automatic memoization
- Next.js standalone output for optimized Docker builds
- Image optimization with AVIF/WebP formats

#### Issues

##### HIGH: SELECT * on Large Tables

20+ queries use `.select("*")` on tables that may have many columns (including large text and embedding vectors). Embedding columns alone are `vector(768)` - 768 floats per row.

**Impact:** Unnecessary bandwidth and memory usage, especially on list queries.

**Fix:** Use column projections: `.select("id, name, jurisdiction, created_at")`.

##### MEDIUM: No Database Query Monitoring

No query performance monitoring or slow query logging configured. Complex search queries could degrade without visibility.

**Recommendation:** Enable PostgreSQL `pg_stat_statements` or add query timing middleware.

##### MEDIUM: In-Memory Session Storage Could Grow Unbounded

`_generation_sessions` dict in schemas.py has cleanup every 5 minutes, but a bug in the cleanup or a burst of requests could cause memory growth.

##### MEDIUM: No Bundle Analysis Configured

No `@next/bundle-analyzer` or equivalent configured. Heavy dependencies (Plotly.js, recharts, force-graph) may bloat client bundles without visibility.

**Recommendation:** Add bundle analysis to build pipeline.

##### LOW: No CDN or Static Asset Caching Headers

Static assets served directly from Next.js without explicit CDN or long-term cache headers beyond Next.js defaults.

---

### 5. Testing

#### Strengths
- pytest with proper async support and marker-based categorization
- 62+ backend test files covering auth, search, documents, security
- Security-focused fixtures (malicious API keys, injection testing)
- Multi-user isolation testing
- Playwright for E2E with multi-browser support (Chrome, Firefox, Safari, mobile)
- CI pipeline runs unit tests with 50% coverage threshold
- pip-audit and npm audit in CI for dependency security

#### Issues

##### HIGH: Extremely Low Frontend Coverage Thresholds

Jest coverage thresholds: **3% statements, 2% branches, 3% functions, 3% lines**. This is effectively no enforcement.

**Recommendation:** Increase to at least 40% short-term, 70% medium-term.

##### HIGH: --passWithNoTests in Frontend CI

Frontend CI uses `npm run test -- --ci --passWithNoTests`, meaning the pipeline passes even if zero tests exist.

**Fix:** Remove `--passWithNoTests` flag.

##### HIGH: 85% of Frontend Components Untested

Only ~7 of ~45 component directories have test files. Missing tests for:
- Admin, Blog, Dashboard, Filters, Footer, Header, Legal, Marketplace
- Navigation, Precedents, Publications, Research Assistant, Sidebar

##### HIGH: Packages Excluded from Coverage

CI only measures coverage on `app` module. The `juddges_search` and `schema_generator_agent` packages (8,000+ lines) are excluded.

##### MEDIUM: No Integration Test Enforcement in CI

Integration tests require `RUN_INTEGRATION_TESTS=1` and real services. Not enforced in standard CI runs.

**Recommendation:** Add a CI job with service containers (PostgreSQL, Redis) for integration tests.

##### MEDIUM: E2E Tests Not in CI Pipeline

17 Playwright E2E spec files exist but are not run on every commit/PR.

##### MEDIUM: Untested Backend Modules

No dedicated test files for:
- `xml_converter.py`, `workers.py`, `search_intelligence.py`
- `summarization.py`, `timeline_extraction.py`, `topic_modeling.py`
- `marketplace.py`, `precedents.py`, `publications.py`
- `ocr.py`, `playground.py`, `recommendations.py`
- GraphQL API, worker tasks, health checks (beyond basic)

##### LOW: No Coverage Report Generation/Tracking

CI does not generate or archive coverage reports. No trend tracking over time.

---

### 6. Maintainability

#### Strengths
- Clear monorepo structure
- Package-based architecture with editable installs
- Comprehensive CLAUDE.md with development commands, architecture docs, and common tasks
- Multiple documentation files (README, SETUP_GUIDE, DATA_INGESTION_GUIDE, etc.)
- Conventional commits approach
- Docker compose for both dev and production
- Automated deployment scripts with version management and rollback
- i18n infrastructure for internationalization
- Comprehensive Radix-based UI component library (51 components)

#### Issues

##### MEDIUM: 9 TODO Comments in Frontend Schema Studio

Indicates incomplete feature implementation in the schema-studio component set. These TODO items should be tracked as issues.

##### MEDIUM: No Structured Logging

Backend uses Python `logging` module directly. Frontend has `lib/logger.ts` but it's not consistently used. No structured logging format (JSON) for log aggregation systems.

**Recommendation:** Adopt structured logging (e.g., `structlog` for Python, consistent use of `lib/logger.ts` for frontend).

##### MEDIUM: Configuration Scattered Across Multiple Sources

Configuration comes from `.env`, environment variables, hardcoded constants in multiple files, and Supabase settings. No single source of truth.

##### LOW: No API Documentation Beyond Auto-Generated

Relies on FastAPI auto-generated Swagger/ReDoc. No hand-written API guide, usage examples, or integration docs for external consumers.

##### LOW: No Architectural Decision Records (ADRs)

Key architectural decisions (Weaviate -> pgvector migration, auth approach, search strategy) are not formally documented beyond migration checklist.

---

## Prioritized Action Plan

### Quick Wins (< 1 day each)

| # | Action | Category | Impact |
|---|--------|----------|--------|
| 1 | Rotate all production secrets | Security | CRITICAL |
| 2 | Remove `COPY .env` from `Dockerfile.analysis` | Security | HIGH |
| 3 | Remove `--passWithNoTests` from frontend CI | Testing | HIGH |
| 4 | Increase frontend coverage threshold to 40% | Testing | HIGH |
| 5 | Add `juddges_search` and `schema_generator_agent` to coverage scope | Testing | HIGH |
| 6 | Fix unreachable code in `chunk_documents.py:463` | Quality | LOW |
| 7 | Remove deprecated endpoints or add sunset headers | Architecture | LOW |

### Medium-term Improvements (1-5 days each)

| # | Action | Category | Impact |
|---|--------|----------|--------|
| 8 | Decompose `schemas.py` (2490 lines) into 3 modules | Architecture | HIGH |
| 9 | Decompose `documents.py` (1804 lines) into 3 modules | Architecture | HIGH |
| 10 | Replace `except Exception` blocks with specific types (361 instances) | Quality | HIGH |
| 11 | Add column projections to `SELECT *` queries (20+ instances) | Performance | HIGH |
| 12 | Split `api.ts` into domain-specific API modules | Architecture | MEDIUM |
| 13 | Replace 234 console.log calls with logger utility | Quality | MEDIUM |
| 14 | Migrate in-memory sessions to Redis | Architecture | MEDIUM |
| 15 | Add tests for untested backend modules (xml_converter, workers, etc.) | Testing | MEDIUM |
| 16 | Add bundle analyzer to frontend build | Performance | MEDIUM |
| 17 | Standardize authentication patterns across routers | Security | HIGH |
| 18 | Add rate limit response headers | Security | MEDIUM |

### Long-term Initiatives (> 5 days each)

| # | Action | Category | Impact |
|---|--------|----------|--------|
| 19 | Reduce average backend complexity from C (15.6) to B (<10) | Quality | HIGH |
| 20 | Achieve 70% frontend component test coverage | Testing | HIGH |
| 21 | Add integration tests to CI with service containers | Testing | HIGH |
| 22 | Add E2E tests to CI pipeline | Testing | MEDIUM |
| 23 | Implement structured logging (structlog + JSON format) | Maintainability | MEDIUM |
| 24 | Adopt secrets manager (Vault/AWS Secrets Manager) | Security | MEDIUM |
| 25 | Create API documentation and integration guide | Maintainability | LOW |
| 26 | Document architectural decisions as ADRs | Maintainability | LOW |

---

## Metrics Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture & Design | 7/10 | Good structure, but god files and mixed auth |
| Code Quality | 6/10 | High complexity average, broad exception handling |
| Security | 7/10 | Strong implementation, critical secrets issue |
| Performance | 8/10 | Good async patterns, SELECT * is main concern |
| Testing | 5/10 | Good infrastructure, poor coverage enforcement |
| Maintainability | 8/10 | Excellent documentation and deployment tooling |
| **Overall** | **7.2/10** | **Solid foundation with clear improvement areas** |
