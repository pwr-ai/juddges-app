# Search Architecture

Deep dive into the Juddges hybrid search system — the core feature of the platform.

## Table of Contents

- [Overview](#overview)
- [Search Pipeline](#search-pipeline)
- [Query Classification & Alpha Routing](#query-classification--alpha-routing)
- [Hybrid Search (BM25 + Vector)](#hybrid-search-bm25--vector)
- [Language Detection](#language-detection)
- [Cross-Encoder Reranking](#cross-encoder-reranking)
- [Autocomplete (Meilisearch)](#autocomplete-meilisearch)
- [Database Schema & Indexes](#database-schema--indexes)
- [Embedding Pipeline](#embedding-pipeline)
- [API Contract](#api-contract)
- [Performance & Timing](#performance--timing)
- [Configuration Reference](#configuration-reference)

---

## Overview

The search system combines three retrieval strategies into a single hybrid pipeline:

1. **BM25 full-text search** — PostgreSQL `tsvector` with language-aware tokenization and unaccent
2. **Vector similarity search** — pgvector HNSW index on 768-dimensional embeddings
3. **Reciprocal Rank Fusion (RRF)** — Merges BM25 and vector rankings with a tunable alpha parameter

Results can optionally be reranked by a Cohere cross-encoder for higher precision.

```
                        ┌─────────────────┐
                        │   User Query    │
                        └────────┬────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Query Classification  │
                    │   (regex + heuristics)   │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
              ▼                  ▼                   ▼
    ┌─────────────────┐ ┌───────────────┐ ┌──────────────────┐
    │ Language Detect  │ │ Alpha Routing │ │ Filter Inference │
    │ (PL/EN/auto)     │ │ (0.0 → 1.0)  │ │ (jurisdiction,   │
    │                  │ │               │ │  dates, courts)  │
    └────────┬────────┘ └───────┬───────┘ └────────┬─────────┘
             │                  │                   │
             └──────────────────┼───────────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │        Parallel Retrieval          │
              │                                    │
              │  ┌──────────┐    ┌──────────────┐ │
              │  │  BM25    │    │   pgvector   │ │
              │  │  search  │    │   HNSW ANN   │ │
              │  └─────┬────┘    └──────┬───────┘ │
              │        │                │         │
              │        └───────┬────────┘         │
              │                │                  │
              │    ┌───────────▼───────────┐      │
              │    │    RRF Fusion         │      │
              │    │  (k=60, alpha blend)  │      │
              │    └───────────┬───────────┘      │
              └────────────────┼──────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Cohere Reranking   │  (optional)
                    │  (rerank-v3.5)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Response Build    │
                    │  (chunks + docs +   │
                    │   timing + meta)    │
                    └─────────────────────┘
```

---

## Search Pipeline

**Entry point:** `backend/app/documents.py` — `POST /documents/search`

The endpoint handles two modes:

| Mode | Description | Speed |
|------|-------------|-------|
| `rabbit` | Direct search with heuristic query analysis | Fast (~200-500ms) |
| `thinking` | LLM-powered query rewriting + filter inference, with heuristic fallback | Slower (~1-3s) |

### Pipeline Steps

1. **Receive** `SearchChunksRequest` with query, filters, pagination, mode
2. **Classify** query type (case_number, statute_reference, exact_phrase, conceptual, mixed)
3. **Route alpha** based on query type (override user-specified alpha when `auto`)
4. **Detect language** from query, jurisdiction, or diacritics
5. **Generate embedding** via configured provider (OpenAI, Cohere, or local)
6. **Execute** Supabase RPC `search_judgments_hybrid` with all parameters
7. **Rerank** top results with Cohere cross-encoder (if `COHERE_API_KEY` set)
8. **Build** response with chunks, documents, pagination, and timing breakdown

---

## Query Classification & Alpha Routing

**File:** `backend/app/query_analysis.py`

The classifier uses regex patterns to detect query intent, then routes to an optimal BM25/vector balance:

### Classification Rules

| Query Type | Detection Pattern | Alpha | Rationale |
|------------|-------------------|-------|-----------|
| `case_number` | Polish: `II K 123/20`, `V CSK 12/22`; UK: `[2020] UKSC 1`, `[2019] EWCA Civ 123` | 0.1 | Case numbers are exact — favor BM25 keyword matching |
| `statute_reference` | `art. 148 kk`, `Section 2 Criminal Justice Act`, `§ 5 kpc` | 0.2 | Statute references are semi-structured — mostly BM25 |
| `exact_phrase` | Quoted queries (`"search term"`) | 0.15 | Exact phrases need lexical matching |
| `conceptual` | 4+ words, no specific legal patterns | 0.8 | Abstract concepts benefit from semantic similarity |
| `mixed` | Default / unclear | 0.5 | Balanced hybrid |

### Alpha Semantics

```
alpha = 0.0  →  100% BM25 (keyword/text search)
alpha = 0.5  →  50/50 hybrid blend
alpha = 1.0  →  100% vector (semantic search)
```

### Heuristic Fallback (when LLM analysis fails)

When in `thinking` mode, if the LLM query analysis fails, the system falls back to regex-based heuristics:

- **Jurisdiction detection**: Polish diacritics (ą, ę, ź, ż, ó, ł, ś, ć, ń) → PL; English keywords → UK
- **Case type detection**: Explicit terms like "karny" (criminal), "cywilny" (civil)
- **Court level detection**: "Sąd Najwyższy" → supreme, "rejonowy" → district
- **Date extraction**: Year patterns mapped to ISO date bounds

---

## Hybrid Search (BM25 + Vector)

**Database function:** `search_judgments_hybrid` (Supabase RPC)

### BM25 Full-Text Search

PostgreSQL full-text search with:
- **GIN index** on `to_tsvector('simple', full_text || title || summary)`
- **Unaccent extension** — normalizes Polish diacritics for fuzzy matching
- **Per-document language detection** — uses `simple` config for Polish (no stemmer), `english` for English docs
- **Polish stopword filtering** — 150+ common Polish words excluded at query time

### Vector Similarity Search

- **Index type:** HNSW (Hierarchical Navigable Small World)
- **Distance metric:** Cosine similarity
- **Dimensions:** 768 (configurable via `EMBEDDING_DIMENSION`)
- **HNSW parameters:** m=16, ef_construction=64
- **Default model:** `text-embedding-3-small` (OpenAI)

### Reciprocal Rank Fusion

Combines BM25 and vector rankings using:

```
RRF_score(d) = alpha * (1 / (k + rank_vector(d))) + (1 - alpha) * (1 / (k + rank_bm25(d)))
```

Where `k = 60` (default), tunable via request parameter.

---

## Language Detection

**File:** `backend/app/documents.py` (lines 80-162)

Language detection follows a priority chain:

```
1. Explicit language filter  (user sets language=pl)
     │ found? → use it
     ▼
2. Jurisdiction inference     (PL → Polish, UK → English)
     │ found? → use it
     ▼
3. Content heuristics          (Polish diacritics? → Polish)
     │ detected? → use it
     ▼
4. Per-document auto-detection (fallback in SQL function)
```

### Polish Content Heuristics

Detects Polish by presence of:
- **Diacritics:** ą, ę, ź, ż, ó, ł, ś, ć, ń
- **Stopwords:** "jest", "nie", "na", "do", "się", "to", etc. (150+ words)

When Polish is detected, the search uses the `simple` PostgreSQL text search config (no stemming) combined with `unaccent()` for diacritic-insensitive matching.

---

## Cross-Encoder Reranking

**File:** `backend/app/reranker.py`

When `COHERE_API_KEY` is set, search results pass through a cross-encoder reranking stage:

| Setting | Value |
|---------|-------|
| Model | `rerank-v3.5` |
| Provider | Cohere API |
| Max document length | 4,000 characters |
| Fallback | Returns original scores on API failure |

### Document Text Extraction Priority

For each document, the reranker extracts text in this order:
1. `summary` field
2. `chunk_text` from search result
3. `title` field

Text is truncated to 4,000 characters for the Cohere API limit.

### Graceful Degradation

If reranking fails (network error, API quota, etc.), the endpoint returns original RRF-scored results without error. The `timing_breakdown` in the response indicates whether reranking was applied.

---

## Autocomplete (Meilisearch)

**Files:**
- `backend/app/api/search.py` — API endpoint
- `backend/app/services/search.py` — Meilisearch service
- `backend/app/services/meilisearch_config.py` — Index configuration
- `backend/app/tasks/meilisearch_sync.py` — Celery sync tasks

### Architecture

Meilisearch runs as a separate service for sub-50ms autocomplete:

```
User types → GET /api/search/autocomplete?q=...
                        │
                        ▼
              ┌───────────────────┐
              │   Meilisearch     │
              │   (port 7700)     │
              │                   │
              │  Searchable:      │
              │  - title          │
              │  - summary        │
              │  - case_number    │
              │  - court_name     │
              │  - keywords       │
              └───────────────────┘
```

### Sync Strategy

- **Full sync:** Every 6 hours via Celery Beat (`full_sync_judgments_to_meilisearch`)
- **Incremental sync:** Per-document via `sync_judgment_to_meilisearch` task
- **Batch size:** 500 documents per sync page
- **Retry:** 3 attempts with exponential backoff

---

## Database Schema & Indexes

### `judgments` Table

```sql
CREATE TABLE judgments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number     TEXT,
  jurisdiction    TEXT NOT NULL,  -- 'PL' or 'UK'
  court_name      TEXT,
  court_level     TEXT,           -- 'supreme', 'appeal', 'district', etc.
  decision_date   DATE,
  publication_date DATE,
  title           TEXT,
  summary         TEXT,
  full_text       TEXT,
  judges          JSONB,
  case_type       TEXT,
  decision_type   TEXT,
  outcome         TEXT,
  keywords        TEXT[],
  legal_topics    TEXT[],
  cited_legislation TEXT[],
  embedding       vector(768),
  metadata        JSONB,
  source_dataset  TEXT,
  source_id       TEXT,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### Index Strategy

| Index | Type | Purpose |
|-------|------|---------|
| `idx_judgments_jurisdiction` | B-tree | Filter by PL/UK |
| `idx_judgments_decision_date` | B-tree DESC | Sort/filter by date |
| `idx_judgments_case_number` | B-tree | Exact case number lookup |
| `idx_judgments_case_number_trgm` | GIN (trigram) | Fuzzy case number search |
| `idx_judgments_court_name` | B-tree | Filter by court |
| `idx_judgments_fts` | GIN (tsvector) | Full-text search |
| `idx_judgments_keywords` | GIN | Array containment on keywords |
| `idx_judgments_legal_topics` | GIN | Array containment on topics |
| `idx_judgments_metadata` | GIN (jsonb_path_ops) | JSONB queries |
| `idx_judgments_embedding` | HNSW (cosine) | Vector similarity, m=16, ef=64 |
| Composite | B-tree | jurisdiction + decision_date |

---

## Embedding Pipeline

**File:** `backend/app/embedding_providers.py`

### Supported Providers

| Provider | Model | Dimensions | Config |
|----------|-------|------------|--------|
| OpenAI | `text-embedding-3-small` | 768 | `EMBEDDING_MODEL_ID`, `OPENAI_API_KEY` |
| Cohere | `embed-multilingual-v3.0` | 768 | `COHERE_API_KEY` |
| Local | `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` | 768 | Transformers Docker service |

### Ingestion Pipeline

**File:** `scripts/ingest_judgments.py`

```
HuggingFace Datasets
  ├── HFforLegal/case-law          (Polish judgments)
  └── JuDDGES/en-appealcourt       (UK appeal court)
         │
         ▼
  ┌──────────────────┐
  │  Truncate text   │   (max 32,000 chars)
  │  Generate embed  │   (768-dim multilingual-mpnet)
  │  Map metadata    │   (jurisdiction, dates, etc.)
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │  Supabase INSERT │   (judgments table)
  │  + vector column │
  └──────────────────┘
```

---

## API Contract

### Request: `POST /documents/search`

```json
{
  "query": "odpowiedzialność za szkodę wyrządzoną ruchem pojazdu",
  "alpha": 0.5,
  "limit_docs": 20,
  "offset": 0,
  "mode": "rabbit",
  "jurisdictions": ["PL"],
  "court_levels": ["supreme"],
  "date_from": "2020-01-01",
  "date_to": "2025-12-31",
  "keywords": ["odpowiedzialność cywilna"],
  "include_count": true
}
```

### Response: `SearchChunksResponse`

```json
{
  "chunks": [
    {
      "document_id": "uuid",
      "chunk_id": 1,
      "chunk_text": "...",
      "combined_score": 0.85,
      "vector_score": 0.78,
      "text_score": 0.92,
      "segment_type": "uzasadnienie"
    }
  ],
  "documents": [ /* full LegalDocument objects */ ],
  "pagination": {
    "offset": 0,
    "limit": 20,
    "has_more": true,
    "next_offset": 20,
    "estimated_total": 142
  },
  "timing_breakdown": {
    "enhancement_ms": 0,
    "embedding_ms": 45,
    "search_ms": 120,
    "rerank_ms": 80,
    "total_ms": 250
  },
  "metadata": {
    "query_type": "conceptual",
    "effective_alpha": 0.8,
    "alpha_was_routed": true,
    "search_language": "polish",
    "vector_fallback": false
  }
}
```

### Available Filters

| Filter | Type | Example |
|--------|------|---------|
| `jurisdictions` | string[] | `["PL", "UK"]` |
| `court_names` | string[] | `["Sąd Najwyższy"]` |
| `court_levels` | string[] | `["supreme", "appeal", "district"]` |
| `case_types` | string[] | `["criminal", "civil"]` |
| `decision_types` | string[] | `["judgment", "order"]` |
| `outcomes` | string[] | `["upheld", "reversed"]` |
| `keywords` | string[] | `["prawo karne"]` |
| `legal_topics` | string[] | `["contractual liability"]` |
| `cited_legislation` | string[] | `["art. 415 kc"]` |
| `date_from` | ISO date | `"2020-01-01"` |
| `date_to` | ISO date | `"2025-12-31"` |
| `languages` | string[] | `["pl", "en"]` |

---

## Performance & Timing

### Response Time Targets

| Stage | Target | Notes |
|-------|--------|-------|
| Query classification | <5ms | Regex-based, no I/O |
| Embedding generation | 30-80ms | OpenAI API call |
| Hybrid search (RPC) | 50-200ms | Depends on filter selectivity and result count |
| Reranking | 50-150ms | Cohere API, ~20 documents |
| **Total (rabbit mode)** | **150-400ms** | Without LLM query analysis |
| **Total (thinking mode)** | **1-3s** | With LLM query rewriting |

### Scaling Considerations

- **HNSW index:** Sublinear ANN search — scales well to millions of documents
- **BM25:** GIN indexes provide fast full-text lookup
- **Connection pooling:** `AsyncConnectionPool` with configurable min/max
- **Embedding cache:** LLM cache backed by PostgreSQL
- **Meilisearch:** Separate service handles autocomplete load independently

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_MODEL_ID` | `text-embedding-3-small` | Embedding model identifier |
| `EMBEDDING_DIMENSION` | `768` | Embedding vector dimensions |
| `OPENAI_API_KEY` | (required) | OpenAI API key for embeddings and LLM |
| `COHERE_API_KEY` | (optional) | Enables cross-encoder reranking |
| `MEILISEARCH_URL` | `http://meilisearch:7700` | Meilisearch service URL |
| `MEILI_MASTER_KEY` | (required in prod) | Meilisearch authentication |
| `MEILISEARCH_INDEX_NAME` | `judgments` | Index name |

### Key Constants (in code)

| Constant | Value | Location |
|----------|-------|----------|
| RRF k parameter | 60 | `documents.py` |
| Max rerank text length | 4,000 chars | `reranker.py` |
| Ingestion text truncation | 32,000 chars | `ingest_judgments.py` |
| Meilisearch sync batch | 500 | `meilisearch_sync.py` |
| Full sync interval | 6 hours | `workers.py` |
| Polish stopwords count | 150+ | `documents.py` |

---

## Related Files

| File | Purpose |
|------|---------|
| `backend/app/documents.py` | Main search endpoint (1300+ lines) |
| `backend/app/query_analysis.py` | Query classification and alpha routing |
| `backend/app/reranker.py` | Cohere cross-encoder reranking |
| `backend/app/embedding_providers.py` | Multi-provider embedding support |
| `backend/app/models.py` | SearchChunksRequest/Response schemas |
| `backend/app/api/search.py` | Autocomplete endpoint |
| `backend/app/services/search.py` | Meilisearch service layer |
| `backend/app/tasks/meilisearch_sync.py` | Background sync tasks |
| `backend/packages/juddges_search/` | RAG chains and retrieval logic |
| `scripts/ingest_judgments.py` | Data ingestion pipeline |
| `supabase/migrations/20260308*` | Search quality SQL migrations |
