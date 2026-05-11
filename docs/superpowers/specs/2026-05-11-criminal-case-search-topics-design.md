# Criminal-Case Search Topics for Autocomplete — Design

**Status:** Draft — awaiting user review
**Author:** Brainstorm session, 2026-05-11
**Scope:** Search autocomplete enhancement; criminal cases only (PL + UK)

## Problem

The current autocomplete at `GET /api/search/autocomplete` only surfaces document
hits from the Meilisearch `judgments` index. Users who don't know the right
search terms — especially across the PL/UK language boundary — have no way to
discover the topical landscape of the corpus. The `/dataset-comparison` page
demonstrates the value of surfacing crime-category breakdowns, but that data
isn't reachable from the search bar.

## Goal

Surface ~500 unified bilingual topic concepts (drawn from criminal judgments in
both jurisdictions) inside the autocomplete dropdown, so users can click a topic
chip to launch a pre-filtered search. Behavior degrades silently if the topic
index is unavailable.

## Non-Goals

- Other case types (civil, administrative, family). Criminal only.
- Real-time topic generation. Refresh is a quarterly manual job.
- Re-ranking document hits by topic similarity. Topics and documents render as
  two independent sections.
- A feature flag to toggle topics. Silent degradation covers the rollout window.
- Incremental / delta topic updates. Full regenerate is simpler.

## High-Level Architecture

Two parts: an offline pipeline that produces `search-topics.json` plus a
Meilisearch `topics` index, and a runtime path that queries both indexes in
parallel from the existing autocomplete endpoint.

```
OFFLINE (quarterly, manual)
  judgments (Supabase, case_type=criminal)
    → reuse existing embeddings
    → BERTopic clustering (PL and UK independently, ~75 clusters each)
    → GPT-4o-mini labels each cluster (5–8 keywords + canonical label)
    → GPT-4o-mini cross-lingual alignment → 500 unified concepts
    → write search-topics.json
    → push to Meilisearch `topics` index (atomic swap)

RUNTIME (every keystroke ≥ 2 chars)
  GET /api/search/autocomplete?q=…
    backend fires 2 Meili queries in parallel:
      ① judgments  (existing, limit 8)
      ② topics     (new,      limit 4)
    merge → return { topic_hits, hits }
  UI renders topics as a chip section above document hits
```

## Pipeline: `scripts/generate_search_topics.py`

New script. Single entry point, idempotent. Reuses
`scripts/analyze_uk_topics.py` as the implementation template.

**Inputs:**

- Supabase `judgments` filtered to criminal cases:
  - UK: `case_type ILIKE '%criminal%'`
  - PL: department label matches `Wydział Karny`
- Cap at ~6,000 per jurisdiction (same volume as `/dataset-comparison`).

**Steps:**

1. **Embed** — read existing vector column. No new OpenAI embedding calls; the
   recent batched full-sync job already populated vectors for the corpus.
2. **Cluster per language** — BERTopic on PL and UK embeddings independently
   (different stopword lists, different language models). Target ~75 clusters
   per jurisdiction.
3. **Label clusters** — for each cluster, send the top 10 representative
   judgments' summaries to GPT-4o-mini with a Pydantic structured-output schema.
   Output per cluster: canonical label, 5–8 keywords/aliases, short description.
4. **Cross-lingual alignment** — single GPT-4o-mini call that takes the PL list
   and UK list and emits up to 500 unified concepts. Concepts present in only
   one jurisdiction are kept (`jurisdictions: ["pl"]` or `["uk"]`).
5. **Cap at 500** — sort by `doc_count` desc, keep top 500.
6. **Write outputs** — `frontend/lib/stats/search-topics.json` and push to
   Meilisearch.

**Document shape (each unified concept):**

```json
{
  "id": "drug_trafficking",
  "label_pl": "Handel narkotykami",
  "label_en": "Drug trafficking",
  "aliases_pl": ["narkomania", "obrót środkami odurzającymi"],
  "aliases_en": ["narcotics", "controlled substance"],
  "category": "drug_offences",
  "doc_count": 247,
  "jurisdictions": ["pl", "uk"]
}
```

**Cost estimate:** ~150 cluster-labeling calls + 1 alignment call ≈ \$3–8 per
full regeneration with GPT-4o-mini. Re-run quarterly.

**Run wrapper:**

```bash
docker compose run --rm backend python -m scripts.generate_search_topics \
  --jurisdictions pl,uk \
  --case-type criminal \
  --output frontend/lib/stats/search-topics.json
```

## Meilisearch `topics` Index

Configured in `backend/app/services/meilisearch_config.py` alongside the
existing `judgments` index setup.

| Setting | Value |
|---|---|
| `searchableAttributes` | `label_pl`, `label_en`, `aliases_pl`, `aliases_en` (order = ranking priority) |
| `filterableAttributes` | `category`, `jurisdictions` |
| `sortableAttributes` | `doc_count` |
| `displayedAttributes` | all fields |
| `rankingRules` | `words, typo, proximity, attribute, exactness, doc_count:desc` |
| `typoTolerance.minWordSizeForTypos` | `{ oneTypo: 4, twoTypos: 8 }` (matches `judgments`) |
| `stopWords` | none (topics are short phrases) |

**Why a separate index, not a field on `judgments`:** small corpus (500 docs),
different ranking rules, and topics shouldn't pollute document hit results.

## Backend: Autocomplete Endpoint Changes

Files touched:

- `backend/app/api/search.py` — endpoint route at line 54
- `backend/app/services/search.py` — `MeiliSearchService.autocomplete()` at line 82
- `backend/app/services/meilisearch_config.py` — add `topics` index setup
- `backend/app/api/search.py` — new `POST /api/search/topic-click` analytics route

**Response shape (additive — existing `hits` field unchanged):**

```json
{
  "query": "narko",
  "topic_hits": [
    {
      "id": "drug_trafficking",
      "label_pl": "Handel narkotykami",
      "label_en": "Drug trafficking",
      "doc_count": 247,
      "category": "drug_offences",
      "jurisdictions": ["pl", "uk"],
      "_formatted": { "label_pl": "<mark>Narko</mark>tykami" }
    }
  ],
  "hits": [ /* existing document hits, unchanged */ ],
  "limit": 8,
  "processing_time_ms": 12
}
```

**Service-level changes:**

```python
async def autocomplete(self, q: str, limit: int = 8, filters: str | None = None):
    docs_task = asyncio.to_thread(self._query_judgments, q, limit, filters)
    topics_task = asyncio.to_thread(self._query_topics, q, limit=4, filters=filters)
    docs, topics = await asyncio.gather(docs_task, topics_task, return_exceptions=True)

    topic_hits = topics["hits"] if not isinstance(topics, Exception) else []
    if isinstance(topics, Exception):
        logger.warning("topics_index_unavailable", error=str(topics))

    return {"hits": docs["hits"], "topic_hits": topic_hits, ...}
```

**Merge rules:**

- Topics capped at 4; document hits stay at 8. Total dropdown rows ≤ 12 but
  topics and documents render in visually distinct sections.
- Skip topics query when `q` is < 2 chars (same gate as documents).
- If a `jurisdiction` filter is active, pass through to topics
  (`filters="jurisdictions IN [pl]"`).
- On topics-index error: silent degradation. Return empty `topic_hits` and log.
  Judgments query must never block on topics.

**Analytics:** new `POST /api/search/topic-click` fire-and-forget endpoint
records clicks. Existing autocomplete background-task analytics extended with
`topic_hits_count` alongside `document_hits_count`.

## Frontend: Dropdown Rendering

Files touched:

- `frontend/hooks/useSearchAutocomplete.ts` — extend response type with
  `topicHits: TopicHit[]`
- `frontend/lib/styles/components/search/SearchForm.tsx` — add topics section
  above document hits

**Hook changes:** same 250ms debounce, same ≥2-char gate, no new loading state
(topic + document fetches resolve together server-side).

**Dropdown layout — two sections in one panel:**

```
┌─────────────────────────────────────────────────────┐
│ ╱╱╱ TOPICS                                          │
│   ▸ Handel narkotykami  · Drug trafficking  (247)   │
│   ▸ Oszustwo            · Fraud              (299)  │
│   ▸ Zabójstwo           · Homicide           (237)  │
│ ─────────────────────────────────────────────────── │
│ ╱╱╱ JUDGMENTS                                       │
│   ▸ Wyrok II AKa 123/22 — Sąd Apelacyjny Warszawa   │
│   ▸ [2024] EWCA Crim 456 — R v Smith                │
└─────────────────────────────────────────────────────┘
```

**Design-system fidelity** (per `docs/reference/DESIGN.md`):

- Section eyebrows in `Geist Mono` uppercase, `--ink-soft`, hairline `--rule`
  divider between sections.
- Topic rows: bilingual labels separated by `·` middot; doc count as right-
  aligned tabular numeral in `--ink-soft`.
- Hover state on topic row: `--gold-soft` background, `--oxblood` text.
- `<mark>` highlight tags render with `--gold` background, `--ink` text.
- No new icon pills, no purple gradients, no glassmorphism — use existing
  `frontend/components/editorial/` primitives where applicable.

**Click behavior on a topic chip:**

- Navigate to `/search?q=<label_in_current_locale>&topic=<id>` — runs a query
  with the canonical label as `q`. The `topic=<id>` param is captured for
  analytics and reserved for future server-side facet filtering on `judgments`
  (out of scope for v1; documented in Future Work).
- Fire-and-forget `POST /api/search/topic-click` for analytics.

**Locale-aware label selection:**

- App locale `pl` → primary label `label_pl`, secondary `label_en` (smaller,
  ink-soft).
- App locale `en` → reversed.
- Aliases never rendered — backend matching only.

**Empty-topic state:** if `topic_hits` is empty but `hits` is non-empty, skip
the TOPICS section header entirely. No "no topics found" message.

## Refresh Strategy

**Cadence:** quarterly, manual.

**Trigger:** the same `scripts/generate_search_topics.py` invocation shown
above.

**Workflow:**

1. Script generates new `search-topics.json`.
2. Diffs against previous version, prints a rich-formatted summary (N added,
   N removed, N doc_count shifts ≥ 10%).
3. Asks for confirmation before pushing to live Meilisearch.
4. On confirm: atomic index swap — push to `topics_new`, call `swapIndexes`,
   drop the old one. Zero-downtime.

**No CI automation, no cron.** Matches existing manual-deploy pattern (per
CLAUDE.md and the recorded no-GHA-Docker-builds preference).

**Versioning:** JSON embeds `generated_at` ISO timestamp and `corpus_snapshot`
(count of criminal judgments at generation time). Exposed via new
`GET /api/search/topics/meta` for debugging.

**Failure handling:**

- Mid-run failure: `topics_new` may be left behind but never swapped. Re-run is
  safe.
- Live `topics` index deletion: autocomplete silently degrades. No production
  outage.

## Error Handling Summary

| Failure | Behavior |
|---|---|
| Topics index missing at startup | Backend logs warning; autocomplete returns empty `topic_hits`; document hits unaffected. |
| Topics query timeout | Same as above — silent degradation via `asyncio.gather(..., return_exceptions=True)`. |
| Generation script LLM error | Re-run; partial outputs not persisted. |
| Atomic swap failure | Old index remains live; new index left orphaned until next run cleans it. |
| Frontend receives malformed topic hit | Skip that hit, render others. |

## Testing

**Backend:**

- Unit: `_query_topics` returns the expected shape on a stubbed Meilisearch
  client; silent-degradation path returns empty `topic_hits` when the topics
  query raises.
- Integration: `pytest.mark.integration` test that exercises the real
  Meilisearch instance with a seeded mini `topics` index (5 docs), asserts
  cross-lingual matching ("fraud" surfaces both `label_en="Fraud"` and
  `label_pl="Oszustwo"`).

**Frontend:**

- Unit (Jest): `useSearchAutocomplete` correctly parses `topic_hits` from the
  response; locale switch flips primary/secondary label.
- E2E (Playwright): type a query, assert TOPICS section renders, click a topic
  chip, assert navigation to `/search?q=…&topic=…`.

**Pipeline:**

- Smoke test: run `generate_search_topics.py` against a 50-judgment fixture
  corpus, assert the JSON output has the expected schema and ≤ 500 entries.

## Future Work (Out of Scope for v1)

- Server-side facet filtering on `judgments` by `topic` id (requires tagging
  judgments with their cluster ids during the offline run).
- Per-user personalization of topic ranking based on click history.
- Auto-refresh trigger when corpus grows by > 10% since last generation.
- Extending to non-criminal case types.

## Files Touched (Summary)

**New:**

- `scripts/generate_search_topics.py`
- `frontend/lib/stats/search-topics.json`
- `docs/superpowers/specs/2026-05-11-criminal-case-search-topics-design.md`
  (this file)

**Modified:**

- `backend/app/services/meilisearch_config.py` — add `topics` index setup
- `backend/app/services/search.py` — extend `autocomplete()` to query both
  indexes in parallel
- `backend/app/api/search.py` — extend response schema; add
  `POST /api/search/topic-click` and `GET /api/search/topics/meta`
- `frontend/hooks/useSearchAutocomplete.ts` — extend response type
- `frontend/lib/styles/components/search/SearchForm.tsx` — render TOPICS
  section
