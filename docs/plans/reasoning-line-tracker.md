# Reasoning Line Tracker — Implementation Plan

> GitHub Issue: #70
> Status: Planning
> Last updated: 2026-04-03

## Architecture Overview

The feature tracks how judicial reasoning on specific legal questions evolves across cases over time, modeling this as a **DAG (directed acyclic graph)** where:
- **Nodes** = reasoning lines (groups of cases addressing the same legal question)
- **Edges** = events (branch, merge, drift, reversal, influence)

Branches form when courts diverge; reconvergence happens when a divergent line returns or a higher court resolves the split.

### Existing Building Blocks
| Component | Location | Reusable For |
|-----------|----------|-------------|
| Embeddings (1024d BGE-M3) | `judgments.embedding` + pgvector HNSW | Semantic similarity between cases |
| Citation graph | `backend/app/documents_pkg/citation.py` | Shared-reference edges, authority scoring |
| K-Means clustering | `backend/app/clustering.py` | Grouping cases by legal question |
| TF-IDF keywords | `backend/app/clustering.py` | Labeling clusters/branches |
| NMF topic modeling | `backend/app/topic_modeling.py` | Temporal trend detection |
| Trend detection | `backend/app/topic_modeling.py` | Linear regression slopes for drift |
| Argumentation extraction | `backend/app/argumentation.py` | Reasoning pattern classification |
| Force-directed graph | `frontend/components/similarity-viz/GraphCanvas.tsx` | DAG visualization base |
| Celery workers | `backend/app/workers.py` | Background pipeline |
| Recharts + Plotly.js | `frontend/package.json` | Timeline & drift charts |

---

## Data Model — New Supabase Tables

**Migration file:** `supabase/migrations/YYYYMMDD000001_create_reasoning_lines_tables.sql`

### Table 1: `reasoning_lines`

```sql
CREATE TABLE IF NOT EXISTS public.reasoning_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    legal_question TEXT NOT NULL,
    legal_question_embedding vector(1024),
    keywords TEXT[] NOT NULL DEFAULT '{}',
    legal_bases TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'merged', 'superseded', 'dormant')),
    case_count INTEGER NOT NULL DEFAULT 0,
    date_range_start DATE,
    date_range_end DATE,
    avg_embedding vector(1024),
    coherence_score FLOAT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rl_legal_question_embedding ON public.reasoning_lines
    USING hnsw (legal_question_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_rl_status ON public.reasoning_lines (status);
CREATE INDEX idx_rl_legal_bases ON public.reasoning_lines USING GIN (legal_bases);
CREATE INDEX idx_rl_keywords ON public.reasoning_lines USING GIN (keywords);
```

### Table 2: `reasoning_line_members`

```sql
CREATE TABLE IF NOT EXISTS public.reasoning_line_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reasoning_line_id UUID NOT NULL REFERENCES public.reasoning_lines(id) ON DELETE CASCADE,
    judgment_id UUID NOT NULL REFERENCES public.judgments(id) ON DELETE CASCADE,
    position_in_line INTEGER,
    similarity_to_centroid FLOAT,
    reasoning_excerpt TEXT,
    reasoning_pattern TEXT,
    outcome_direction TEXT CHECK (outcome_direction IN ('for', 'against', 'mixed', 'procedural')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (reasoning_line_id, judgment_id)
);

CREATE INDEX idx_rlm_line ON public.reasoning_line_members (reasoning_line_id);
CREATE INDEX idx_rlm_judgment ON public.reasoning_line_members (judgment_id);
CREATE INDEX idx_rlm_position ON public.reasoning_line_members (reasoning_line_id, position_in_line);
```

### Table 3: `reasoning_line_events`

```sql
CREATE TABLE IF NOT EXISTS public.reasoning_line_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL
        CHECK (event_type IN ('branch', 'merge', 'drift', 'reversal', 'consolidation', 'influence')),
    source_line_id UUID REFERENCES public.reasoning_lines(id) ON DELETE SET NULL,
    target_line_id UUID REFERENCES public.reasoning_lines(id) ON DELETE SET NULL,
    trigger_judgment_id UUID REFERENCES public.judgments(id) ON DELETE SET NULL,
    event_date DATE,
    description TEXT,
    drift_score FLOAT,
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rle_source ON public.reasoning_line_events (source_line_id);
CREATE INDEX idx_rle_target ON public.reasoning_line_events (target_line_id);
CREATE INDEX idx_rle_type ON public.reasoning_line_events (event_type);
CREATE INDEX idx_rle_date ON public.reasoning_line_events (event_date);
```

---

## Milestones

Each milestone is independently valuable and resumable in a separate session.

### M1: Legal Question Cluster Discovery

**Goal:** Users discover clusters of cases addressing the same legal question.

**Backend:**
- New file: `backend/app/reasoning_lines.py` — router prefix `/reasoning-lines`
- `POST /reasoning-lines/discover` — reuses `_kmeans()` from clustering.py, groups by shared `cited_legislation[]` + embedding similarity
- Models: `ReasoningLineDiscoveryRequest`, `ReasoningLineCluster`

**Frontend:**
- New page: `frontend/app/reasoning-lines/page.tsx`
- Discovery form (sample_size, num_clusters) + results table
- Each cluster shows keywords, case count, date range, coherence

**Depends on:** Existing clustering.py, judgments embeddings

**Test:** Endpoint returns clusters with distinct keywords and non-trivial coherence. Frontend renders clickable cluster table.

---

### M2: Persist Reasoning Lines + Member Assignment

**Goal:** Users save a discovered cluster as a named reasoning line. Cases assigned chronologically.

**Backend:**
- Supabase migration: create 3 tables above
- `POST /reasoning-lines/create` — saves line, computes centroid, assigns members by `decision_date`
- `GET /reasoning-lines/` — list all lines (paginated)
- `GET /reasoning-lines/{id}` — single line with members + timeline
- `DELETE /reasoning-lines/{id}` — soft-delete

**Frontend:**
- "Save as Reasoning Line" button on discovery results
- Detail page: `frontend/app/reasoning-lines/[id]/page.tsx` — vertical timeline of members
- List view with tabs: "Discover" | "Saved Lines"

**Depends on:** M1, migration applied

**Test:** Can create, list, view, delete reasoning lines. Members sorted chronologically.

---

### M3: Temporal Outcome Timeline

**Goal:** For a saved line, show how outcome direction shifts over time (for/against chart).

**Backend:**
- `POST /reasoning-lines/{id}/analyze-outcomes` — LLM classifies each member's outcome (for/against/mixed/procedural)
- `GET /reasoning-lines/{id}/timeline` — time-bucketed outcome distribution
- Reuse `_assign_time_periods()` and `_detect_trend()` from topic_modeling.py

**Frontend:**
- Stacked bar chart (Recharts) on detail page: for/against/mixed per period
- Trend badge: "emerging consensus", "stable split", "shifting direction"
- Clickable bars → specific judgments

**Depends on:** M2, LLM access

**Test:** Outcome labels reasonable for known cases. Chart renders with correct stacking. Trend matches visual.

---

### M4: Branch & Merge Detection (DAG Edges)

**Goal:** Auto-detect when a line splits or when two lines merge. Display as DAG.

**Backend:**
- `_detect_branches()` — cosine similarity drop between consecutive time windows + outcome flip = branch event
- `_detect_merges()` — two lines' centroids converging + shared citations = merge event
- `POST /reasoning-lines/detect-events` — runs detection, writes to events table
- `GET /reasoning-lines/dag` — full DAG (nodes=lines, edges=events)

**Frontend:**
- `ReasoningDAG.tsx` — adapt `react-force-graph-2d` with directed edges, time axis layout
- Nodes colored by status, sized by case_count
- Edge labels for event type
- Third tab on lines page: "DAG View"

**Depends on:** M2, M3

**Test:** Branch detection fires on clear divergence. DAG renders with directed edges. Node click → line detail.

---

### M5: Language Drift Detection

**Goal:** Detect when language shifts within a line (even if outcomes stay the same). Early warning.

**Backend:**
- `_compute_drift_scores()` — rolling window centroids, drift = 1 - cosine_sim(window_n, window_n+1)
- `POST /reasoning-lines/{id}/drift-analysis` — per-window drift scores, keyword shifts
- Writes `drift` events at peaks
- Returns: windows with drift_score, entering/exiting keywords

**Frontend:**
- Line chart (Recharts) showing drift score over time on detail page
- Annotations at drift peaks with keyword changes
- Drift events in timeline view

**Depends on:** M2 (can be done in parallel with M3/M4)

**Test:** Drift near 0 for homogeneous lines, spikes on genuine shifts. Keywords meaningful.

---

### M6: Semantic Search + Cross-Reference

**Goal:** Search for reasoning lines by legal question. Find related lines.

**Backend:**
- `POST /reasoning-lines/search` — embed query, vector search against `legal_question_embedding`
- `GET /reasoning-lines/{id}/related` — lines with overlapping members or shared legal bases
- New Supabase RPC: `search_reasoning_lines_by_embedding()`

**Frontend:**
- Search bar on reasoning lines page
- "Related Lines" sidebar on detail page
- Cross-link badges on judgment pages

**Depends on:** M2

**Test:** Semantic search returns relevant lines. Related lines share members or legal bases.

---

### M7: Background Auto-Discovery Pipeline

**Goal:** Celery tasks automatically assign new judgments to lines and propose new lines.

**Backend:**
- New file: `backend/app/tasks/reasoning_line_pipeline.py`
- Task `reasoning_line_auto_assign` — match unassigned judgments to line centroids
- Task `reasoning_line_auto_discover` — cluster unassigned, propose new lines
- Task `reasoning_line_event_detection` — periodic branch/merge/drift scan
- Register in Celery beat schedule (weekly)

**Frontend:**
- "Auto-Discover" toggle
- Pipeline status dashboard
- Notification for newly proposed lines

**Depends on:** M1-M4, Celery infrastructure

**Test:** New judgments auto-assigned. Auto-discovered lines have coherence > 0.6. No duplicates.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Branch detection accuracy | High | Conservative thresholds, expose as params, human-in-the-loop confirmation |
| Outcome classification (Polish) | Medium | Reuse argumentation prompts, validate on labeled set |
| `legal_documents` vs `judgments` table | Medium | Verify production schema early, standardize on `judgments` |
| DAG visualization at scale | Medium | Filtering (domain, date, min cases), hierarchical layout |
| Polish TF-IDF / stopwords | Low | Rely on embedding drift (BGE-M3 handles Polish), not just keywords |
| Centroid update performance | Low | Incremental formula: `new = (old * n + new_emb) / (n + 1)` |

## Recommended Order

```
M1 (discover) → M2 (persist) → M3 (outcomes) ─┬→ M4 (DAG)
                                 │              └→ M5 (drift) [parallel with M4]
                                 └→ M6 (search) [parallel with M3]
                                                    M7 (pipeline) [after M4]
```

M5 and M6 can be done in parallel with M3/M4 since they only depend on M2.
