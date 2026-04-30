# Search Optimizations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Redis caching (embeddings + results), skip reranking for high-confidence results, parallelize zero-result fallbacks, dynamic `ef_search`, and a weekly `VACUUM ANALYZE` maintenance task.

**Architecture:** A dedicated `SearchCache` service (`backend/app/services/search_cache.py`) wraps Redis with graceful fallback. It's injected into the search pipeline at two points: embedding generation and full result caching. Other optimizations modify the existing search and reranker modules in-place.

**Tech Stack:** Redis (async, via `redis.asyncio`), Celery Beat, PostgreSQL, existing FastAPI search pipeline.

---

### Task 1: Create the `SearchCache` service

**Files:**
- Create: `backend/app/services/search_cache.py`
- Modify: `backend/app/config.py`

**Step 1: Add cache settings to config**

In `backend/app/config.py`, add these fields to the `Settings` class:

```python
# Search cache settings
SEARCH_CACHE_ENABLED: bool = os.getenv("SEARCH_CACHE_ENABLED", "true").lower() == "true"
SEARCH_EMBEDDING_CACHE_TTL: int = int(os.getenv("SEARCH_EMBEDDING_CACHE_TTL", "3600"))  # 1 hour
SEARCH_RESULT_CACHE_TTL: int = int(os.getenv("SEARCH_RESULT_CACHE_TTL", "300"))  # 5 minutes
```

**Step 2: Create the search cache module**

Create `backend/app/services/search_cache.py`:

```python
"""Redis-backed cache for search embeddings and query results.

Falls back gracefully to no-op when Redis is unavailable.
Cache can be disabled entirely via SEARCH_CACHE_ENABLED=false.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

from loguru import logger

from app.config import settings

# Lazy Redis init — same pattern as dashboard.py
try:
    import redis.asyncio as redis

    _redis_client = redis.Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        password=os.getenv("REDIS_AUTH"),
        decode_responses=False,  # we store binary msgpack/json
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    _REDIS_OK = True
except Exception as e:
    logger.warning(f"Redis not available for search cache: {e}")
    _redis_client = None
    _REDIS_OK = False

_PREFIX_EMB = "search:emb:"
_PREFIX_RES = "search:res:"


def _cache_enabled() -> bool:
    return _REDIS_OK and settings.SEARCH_CACHE_ENABLED and _redis_client is not None


def _embedding_key(text: str) -> str:
    digest = hashlib.sha256(text.encode()).hexdigest()[:32]
    return f"{_PREFIX_EMB}{digest}"


def _result_key(query: str, filters: dict[str, Any], alpha: float, limit: int, offset: int) -> str:
    canonical = json.dumps(
        {"q": query.strip().lower(), "f": filters, "a": round(alpha, 2), "l": limit, "o": offset},
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(canonical.encode()).hexdigest()[:32]
    return f"{_PREFIX_RES}{digest}"


# ── Embedding cache ─────────────────────────────────────────────────────

async def get_cached_embedding(text: str) -> list[float] | None:
    if not _cache_enabled():
        return None
    try:
        raw = await _redis_client.get(_embedding_key(text))  # type: ignore[union-attr]
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        logger.debug("Embedding cache read miss (error)")
        return None


async def set_cached_embedding(text: str, embedding: list[float]) -> None:
    if not _cache_enabled():
        return
    try:
        await _redis_client.setex(  # type: ignore[union-attr]
            _embedding_key(text),
            settings.SEARCH_EMBEDDING_CACHE_TTL,
            json.dumps(embedding),
        )
    except Exception:
        logger.debug("Embedding cache write failed")


# ── Result cache ────────────────────────────────────────────────────────

async def get_cached_results(
    query: str, filters: dict[str, Any], alpha: float, limit: int, offset: int,
) -> list[dict[str, Any]] | None:
    if not _cache_enabled():
        return None
    try:
        raw = await _redis_client.get(  # type: ignore[union-attr]
            _result_key(query, filters, alpha, limit, offset),
        )
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        logger.debug("Result cache read miss (error)")
        return None


async def set_cached_results(
    query: str,
    filters: dict[str, Any],
    alpha: float,
    limit: int,
    offset: int,
    results: list[dict[str, Any]],
) -> None:
    if not _cache_enabled():
        return
    try:
        await _redis_client.setex(  # type: ignore[union-attr]
            _result_key(query, filters, alpha, limit, offset),
            settings.SEARCH_RESULT_CACHE_TTL,
            json.dumps(results, default=str),
        )
    except Exception:
        logger.debug("Result cache write failed")
```

**Step 3: Verify the module loads without errors**

Run: `cd backend && poetry run python -c "from app.services.search_cache import get_cached_embedding; print('OK')"`

Expected: `OK`

**Step 4: Commit**

```
feat: add SearchCache service for embedding and result caching
```

---

### Task 2: Wire embedding cache into search pipeline

**Files:**
- Modify: `backend/app/documents_pkg/search.py` — `_generate_search_embedding()`

**Step 1: Add cache check before embedding generation**

In `backend/app/documents_pkg/search.py`, modify `_generate_search_embedding()` (lines 205-233):

```python
async def _generate_search_embedding(
    semantic_query: str,
    effective_alpha: float,
) -> tuple[list[float] | None, float, bool]:
    if effective_alpha <= 0:
        return None, 0.0, False

    from app.services.search_cache import get_cached_embedding, set_cached_embedding

    query_embedding: list[float] | None = None
    embedding_time_ms = 0.0
    vector_fallback = False

    # Check cache first
    cached = await get_cached_embedding(semantic_query)
    if cached is not None:
        if len(cached) != JUDGMENTS_EMBEDDING_DIMENSION:
            logger.warning("Cached embedding dimension mismatch, regenerating")
        else:
            return cached, 0.0, False

    try:
        embedding_start = time.perf_counter()
        query_embedding = await generate_embedding(semantic_query)
        if len(query_embedding) != JUDGMENTS_EMBEDDING_DIMENSION:
            logger.warning(
                f"Embedding dimension mismatch: expected {JUDGMENTS_EMBEDDING_DIMENSION}, "
                f"got {len(query_embedding)}. Falling back to text-only search."
            )
            query_embedding = None
            vector_fallback = True
        else:
            await set_cached_embedding(semantic_query, query_embedding)
        embedding_time_ms = (time.perf_counter() - embedding_start) * 1000
    except Exception as emb_err:
        logger.warning(
            f"Embedding generation failed, falling back to text-only search: {emb_err}"
        )
        query_embedding = None
        vector_fallback = True

    return query_embedding, embedding_time_ms, vector_fallback
```

**Step 2: Run existing tests**

Run: `cd backend && poetry run pytest tests/app/ -v -x -q --timeout=30 2>&1 | tail -20`

Expected: All existing tests pass.

**Step 3: Commit**

```
feat: wire embedding cache into search embedding generation
```

---

### Task 3: Wire result cache into search endpoint

**Files:**
- Modify: `backend/app/documents_pkg/__init__.py` — `search_documents()` (around line 399-531)

**Step 1: Add result caching around the hybrid search call**

In the `search_documents()` function, after building `rpc_params` and before calling `_run_hybrid_search`, add cache check. After getting results (whether from DB or fallback), cache them.

Locate the block (around line 444-454):

```python
        rpc_params = _build_search_rpc_params(...)
        supabase = await _get_search_client()
        results, search_time_ms = await _run_hybrid_search(supabase, rpc_params)
```

Replace with:

```python
        rpc_params = _build_search_rpc_params(
            query_embedding=query_embedding,
            keyword_query=keyword_query,
            search_language=search_language,
            effective_filters=effective_filters,
            effective_alpha=effective_alpha,
            limit=limit,
            offset=offset,
        )

        from app.services.search_cache import get_cached_results, set_cached_results

        cached_results = await get_cached_results(
            query=keyword_query,
            filters=effective_filters,
            alpha=effective_alpha,
            limit=limit,
            offset=offset,
        )
        if cached_results is not None:
            results = cached_results
            search_time_ms = 0.0
        else:
            supabase = await _get_search_client()
            results, search_time_ms = await _run_hybrid_search(supabase, rpc_params)
```

Then after the fallback block and before reranking (around line 484), add:

```python
        if cached_results is None and results:
            await set_cached_results(
                query=keyword_query,
                filters=effective_filters,
                alpha=effective_alpha,
                limit=limit,
                offset=offset,
                results=results,
            )
```

**Step 2: Run tests**

Run: `cd backend && poetry run pytest tests/app/ -v -x -q --timeout=30 2>&1 | tail -20`

**Step 3: Commit**

```
feat: wire result cache into hybrid search endpoint
```

---

### Task 4: Skip reranking for high-confidence results

**Files:**
- Modify: `backend/app/documents_pkg/search.py` — `_rerank_if_enabled()`
- Modify: `backend/app/config.py`

**Step 1: Add config for rerank skip threshold**

In `backend/app/config.py`, add to `Settings`:

```python
RERANK_SKIP_THRESHOLD: float = float(os.getenv("RERANK_SKIP_THRESHOLD", "0.82"))
RERANK_SKIP_MIN_RESULTS: int = int(os.getenv("RERANK_SKIP_MIN_RESULTS", "3"))
```

**Step 2: Modify `_rerank_if_enabled` to skip when top results are high-confidence**

In `backend/app/documents_pkg/search.py`, replace the `_rerank_if_enabled` function (lines 471-484):

```python
async def _rerank_if_enabled(
    query: str,
    results: list[dict[str, Any]],
    top_k: int,
) -> tuple[list[dict[str, Any]], float]:
    if not results:
        return results, 0.0

    # Skip reranking when top results already have high confidence scores
    top_scores = [
        r.get("combined_score", 0.0) or 0.0
        for r in results[: settings.RERANK_SKIP_MIN_RESULTS]
    ]
    if (
        len(top_scores) >= settings.RERANK_SKIP_MIN_RESULTS
        and all(s >= settings.RERANK_SKIP_THRESHOLD for s in top_scores)
    ):
        logger.debug(
            f"Skipping rerank: top {len(top_scores)} scores "
            f"({[round(s, 3) for s in top_scores]}) all >= {settings.RERANK_SKIP_THRESHOLD}"
        )
        return results, 0.0

    from app.reranker import rerank_results

    rerank_start = time.perf_counter()
    reranked = await rerank_results(query=query, results=results, top_k=top_k)
    rerank_time_ms = (time.perf_counter() - rerank_start) * 1000
    return reranked, rerank_time_ms
```

Add `from app.config import settings` to the imports at the top of `search.py` if not already present.

**Step 3: Run tests**

Run: `cd backend && poetry run pytest tests/app/ -v -x -q --timeout=30 2>&1 | tail -20`

**Step 4: Commit**

```
perf: skip reranking when top results have high confidence scores
```

---

### Task 5: Parallelize zero-result fallbacks

**Files:**
- Modify: `backend/app/documents_pkg/search.py` — `_run_zero_result_fallbacks()`

**Step 1: Replace sequential loop with parallel execution**

Replace the `_run_zero_result_fallbacks` function (lines 332-453) with a parallel version. The key change: fire all fallback attempts concurrently with `asyncio.gather()` and take the first non-empty result (ordered by priority).

```python
async def _run_zero_result_fallbacks(
    *,
    request: SearchChunksRequest,
    query: str,
    semantic_query: str,
    keyword_query: str,
    search_language: str,
    effective_alpha: float,
    initial_query_embedding: list[float] | None,
    supabase: Any,
    limit: int,
    offset: int,
    vector_fallback: bool,
) -> tuple[list[dict[str, Any]], float, bool, str | None, str | None, bool]:
    """Retry zero-result thinking queries with progressively broader rewrites.

    All fallback attempts run in parallel for speed. The first non-empty
    result (in priority order) is returned.
    """
    explicit_filters = _build_effective_filters(request)
    attempts: list[tuple[str, str, str, float, dict[str, Any]]] = []
    seen: set[tuple[str, float, bool]] = set()

    def add_attempt(
        stage: str,
        semantic_text: str,
        keyword_text: str,
        alpha: float,
        filters: dict[str, Any],
    ) -> None:
        key = (keyword_text.strip().lower(), round(alpha, 2), _has_any_filters(filters))
        if not keyword_text.strip() or key in seen:
            return
        seen.add(key)
        attempts.append((stage, semantic_text, keyword_text, alpha, filters))

    add_attempt(
        "semantic_retry",
        semantic_query,
        semantic_query,
        effective_alpha,
        explicit_filters,
    )

    relaxed_query = _build_relaxed_keyword_query(keyword_query, search_language)
    if relaxed_query:
        add_attempt(
            "relaxed_terms",
            semantic_query,
            relaxed_query,
            effective_alpha,
            explicit_filters,
        )

    generic_query = _build_generic_legal_query(search_language)
    add_attempt(
        "generic_legal",
        semantic_query,
        generic_query,
        0.0,
        explicit_filters,
    )

    if _has_any_filters(explicit_filters):
        add_attempt(
            "generic_unfiltered",
            semantic_query,
            generic_query,
            0.0,
            _empty_filters(),
        )

    if not attempts:
        return [], 0.0, False, None, None, vector_fallback

    async def _run_single_fallback(
        stage: str,
        semantic_text: str,
        keyword_text: str,
        alpha: float,
        filters: dict[str, Any],
    ) -> tuple[str, list[dict[str, Any]], float, bool]:
        emb_ms = 0.0
        emb_fallback = False
        if alpha <= 0:
            fallback_embedding = None
        elif alpha == effective_alpha and semantic_text == semantic_query:
            fallback_embedding = initial_query_embedding
        else:
            fallback_embedding, emb_ms, emb_fallback = await _generate_search_embedding(
                semantic_text, alpha,
            )

        fallback_language = _detect_search_language(
            keyword_text, request.languages, filters["jurisdictions"],
        )
        fallback_params = _build_search_rpc_params(
            query_embedding=fallback_embedding,
            keyword_query=keyword_text,
            search_language=fallback_language,
            effective_filters=filters,
            effective_alpha=alpha,
            limit=limit,
            offset=offset,
        )
        fallback_results, fallback_search_ms = await _run_hybrid_search(
            supabase, fallback_params,
        )
        total_ms = emb_ms + fallback_search_ms

        logger.info(
            "Zero-result fallback attempt",
            stage=stage,
            alpha=alpha,
            query=keyword_text,
            result_count=len(fallback_results),
            filters_applied=_has_any_filters(filters),
        )
        return stage, fallback_results, total_ms, emb_fallback

    fallback_start = time.perf_counter()
    outcomes = await asyncio.gather(
        *[_run_single_fallback(*a) for a in attempts],
        return_exceptions=True,
    )
    total_fallback_ms = (time.perf_counter() - fallback_start) * 1000

    # Pick the first non-empty result in priority order
    any_emb_fallback = False
    for outcome in outcomes:
        if isinstance(outcome, BaseException):
            logger.warning(f"Fallback attempt failed: {outcome}")
            continue
        stage, results, _ms, emb_fallback = outcome
        any_emb_fallback = any_emb_fallback or emb_fallback
        if results:
            return (
                results,
                total_fallback_ms,
                True,
                stage,
                # Find the keyword_text for the winning stage
                next(kw for s, _, kw, _, _ in attempts if s == stage),
                vector_fallback or any_emb_fallback,
            )

    return [], total_fallback_ms, False, None, None, vector_fallback or any_emb_fallback
```

**Step 2: Run tests**

Run: `cd backend && poetry run pytest tests/app/ -v -x -q --timeout=30 2>&1 | tail -20`

**Step 3: Commit**

```
perf: parallelize zero-result fallback attempts with asyncio.gather
```

---

### Task 6: Add dynamic `ef_search` parameter

**Files:**
- Modify: `supabase/migrations/` — new migration
- Modify: `backend/app/documents_pkg/search.py` — `_build_search_rpc_params()`

**Step 1: Create a new migration**

Create file `supabase/migrations/20260406000001_add_ef_search_parameter.sql`:

This migration replaces the function to accept an optional `ef_search_value` parameter instead of hardcoding 100.

```sql
-- =============================================================================
-- Migration: Add configurable ef_search to search_judgments_hybrid
-- =============================================================================
-- Allows the caller to tune HNSW recall vs speed via the ef_search_value param.
-- Default remains 100 (unchanged behavior).
-- =============================================================================

-- We need to DROP and recreate because adding a parameter changes the signature.
-- The function body is identical to the previous version except for the new param
-- and the SET LOCAL line.

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    -- (all existing parameters stay unchanged)
    query_embedding vector(768) DEFAULT NULL,
    search_text text DEFAULT NULL,
    search_language text DEFAULT 'auto',
    filter_jurisdictions text[] DEFAULT NULL,
    filter_court_names text[] DEFAULT NULL,
    filter_court_levels text[] DEFAULT NULL,
    filter_case_types text[] DEFAULT NULL,
    filter_decision_types text[] DEFAULT NULL,
    filter_outcomes text[] DEFAULT NULL,
    filter_keywords text[] DEFAULT NULL,
    filter_legal_topics text[] DEFAULT NULL,
    filter_cited_legislation text[] DEFAULT NULL,
    filter_date_from date DEFAULT NULL,
    filter_date_to date DEFAULT NULL,
    similarity_threshold float DEFAULT 0.5,
    hybrid_alpha float DEFAULT 0.5,
    result_limit int DEFAULT 20,
    result_offset int DEFAULT 0,
    rrf_k int DEFAULT 60,
    -- NEW: configurable ef_search for HNSW recall tuning
    ef_search_value int DEFAULT 100
)
-- RETURNS TABLE ... (unchanged, copy from existing migration)
```

**Important:** The full function body must be copied from the existing migration at `supabase/migrations/20260310000002_optimize_search_hybrid_performance.sql`. The ONLY change inside the body is replacing:

```sql
PERFORM set_config('hnsw.ef_search', '100', true);
```

with:

```sql
PERFORM set_config('hnsw.ef_search', ef_search_value::text, true);
```

**Step 2: Add `ef_search` to RPC params builder**

In `backend/app/documents_pkg/search.py`, modify `_build_search_rpc_params()` to accept and pass `ef_search`:

```python
def _build_search_rpc_params(
    query_embedding: list[float] | None,
    keyword_query: str,
    search_language: str,
    effective_filters: dict[str, Any],
    effective_alpha: float,
    limit: int,
    offset: int,
    ef_search: int = 100,
) -> dict[str, Any]:
    return {
        "query_embedding": query_embedding,
        "search_text": keyword_query if effective_alpha < 1.0 else None,
        "search_language": search_language,
        "filter_jurisdictions": effective_filters["jurisdictions"],
        "filter_court_names": effective_filters["court_names"],
        "filter_court_levels": effective_filters["court_levels"],
        "filter_case_types": effective_filters["case_types"],
        "filter_decision_types": effective_filters["decision_types"],
        "filter_outcomes": effective_filters["outcomes"],
        "filter_keywords": effective_filters["keywords"],
        "filter_legal_topics": effective_filters["legal_topics"],
        "filter_cited_legislation": effective_filters["cited_legislation"],
        "filter_date_from": effective_filters["date_from"],
        "filter_date_to": effective_filters["date_to"],
        "similarity_threshold": 0.5,
        "hybrid_alpha": effective_alpha,
        "result_limit": limit,
        "result_offset": offset,
        "rrf_k": 60,
        "ef_search_value": ef_search,
    }
```

**Step 3: Pass dynamic `ef_search` in `search_documents()`**

In `backend/app/documents_pkg/__init__.py`, where `_build_search_rpc_params` is called (around line 444), add the `ef_search` kwarg:

```python
        # Use lower ef_search for paginated/loadMore requests (speed), higher for first page (recall)
        ef_search = 60 if offset > 0 else 100
        rpc_params = _build_search_rpc_params(
            ...
            ef_search=ef_search,
        )
```

**Step 4: Run tests**

Run: `cd backend && poetry run pytest tests/app/ -v -x -q --timeout=30 2>&1 | tail -20`

**Step 5: Commit**

```
perf: add dynamic ef_search parameter to hybrid search RPC
```

---

### Task 7: Add weekly VACUUM ANALYZE Celery task

**Files:**
- Create: `backend/app/tasks/maintenance.py`
- Modify: `backend/app/workers.py`

**Step 1: Create the maintenance task module**

Create `backend/app/tasks/maintenance.py`:

```python
"""Celery tasks for database maintenance."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

from loguru import logger

from app.workers import celery_app

if TYPE_CHECKING:
    from celery import Task


@celery_app.task(
    bind=True,
    name="maintenance.vacuum_analyze",
    max_retries=1,
    default_retry_delay=300,
)
def vacuum_analyze_judgments(self: Task) -> dict[str, Any]:
    """Run VACUUM ANALYZE on the judgments table.

    Keeps HNSW index statistics and query planner costs up to date.
    Designed to run weekly via Celery Beat.
    """
    import psycopg2

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.warning("DATABASE_URL not set — skipping VACUUM ANALYZE")
        return {"status": "skipped", "reason": "no_database_url"}

    try:
        # VACUUM cannot run inside a transaction block, so use autocommit
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cur = conn.cursor()
        logger.info("Running VACUUM ANALYZE on judgments table")
        cur.execute("VACUUM ANALYZE public.judgments")
        cur.close()
        conn.close()
        logger.info("VACUUM ANALYZE completed successfully")
        return {"status": "completed"}
    except Exception as exc:
        logger.error(f"VACUUM ANALYZE failed: {exc}")
        raise
```

**Step 2: Register the task module and add beat schedule**

In `backend/app/workers.py`, add `"app.tasks.maintenance"` to `conf.imports`:

```python
celery_app.conf.imports = [
    "app.tasks.meilisearch_sync",
    "app.tasks.reasoning_line_pipeline",
    "app.tasks.maintenance",
]
```

Add the beat schedule entry (using `crontab` for weekly Sunday 3 AM UTC):

```python
from celery.schedules import crontab

# ... in beat_schedule dict:
    "vacuum-analyze-judgments-weekly": {
        "task": "maintenance.vacuum_analyze",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),  # Sunday 3 AM UTC
    },
```

**Step 3: Verify worker picks up the task**

Run: `cd backend && poetry run celery -A app.workers inspect registered 2>&1 | grep maintenance || echo "Start worker to verify"`

**Step 4: Commit**

```
feat: add weekly VACUUM ANALYZE maintenance task for judgments table
```

---

### Task 8: Run full test suite and format

**Step 1: Format**

Run: `cd backend && poetry run ruff format . && poetry run ruff check . --fix`

**Step 2: Run all tests**

Run: `cd backend && poetry run pytest tests/ -v -x --timeout=60 2>&1 | tail -30`

**Step 3: Fix any failures and commit**

```
chore: format and fix lint issues from search optimizations
```

---

## Summary of changes

| File | Change |
|------|--------|
| `backend/app/config.py` | Add `SEARCH_CACHE_ENABLED`, TTL settings, `RERANK_SKIP_THRESHOLD` |
| `backend/app/services/search_cache.py` | **NEW** — Redis embedding + result cache with graceful fallback |
| `backend/app/documents_pkg/search.py` | Cache-aware embedding generation, skip-rerank logic, parallel fallbacks, `ef_search` param |
| `backend/app/documents_pkg/__init__.py` | Result caching in search endpoint, dynamic `ef_search` |
| `backend/app/tasks/maintenance.py` | **NEW** — Weekly VACUUM ANALYZE task |
| `backend/app/workers.py` | Register maintenance task, add beat schedule |
| `supabase/migrations/20260406000001_...` | **NEW** — Add `ef_search_value` param to hybrid RPC |
