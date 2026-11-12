# Hybrid search fusion (keyword + semantic)

How `GET /api/search/documents?semantic_ratio=…` blends Meilisearch keyword
ranking with BGE-M3 vector ranking, and why the blend is done in the backend
rather than by Meilisearch. Code: `reciprocal_rank_fusion` and
`MeiliSearchService._fused_hybrid_search` in
`backend/app/services/search.py`; tests in
`backend/tests/app/test_hybrid_fusion.py`.

## The problem (issue #798)

The endpoint used to send one Meilisearch query with
`hybrid.semanticRatio = r`. Meilisearch merges the keyword and vector lists by
comparing their ranking scores weighted by `1 - r` and `r`. The two score
scales are unrelated: keyword ranking scores sit near 1.0 for every hit that
matches all query words, and BGE-M3 cosine scores sit in a narrow band of their
own. Weighting two near-constant lists gives a step function. On prod the top-5
was identical to pure keyword for `r <= 0.5` and identical to pure semantic for
`r >= 0.55`, so the frontend's `0.75` was effectively pure semantic, with no
keyword signal (for example an exact case number) left in the ranking.

## What runs now

| `semantic_ratio` | Meilisearch calls | Ranking |
|---|---|---|
| `0` (and every anonymous caller, #565) | one keyword query | Meilisearch keyword order |
| `0 < r < 1` | keyword query **and** pure-vector query (`semanticRatio: 1.0`), in parallel | fused in the backend |
| `1` | one pure-vector query | Meilisearch vector order |

For the fused case, both legs fetch the top `HYBRID_CANDIDATE_DEPTH = 200` hits
(from offset 0) on **every** page of a query, and the fused list is paginated in
the backend. The keyword leg starts while the query is still being embedded on
TEI, so the added latency is about one vector query.

### Why the candidate depth is fixed

The depth must not depend on `offset`. An earlier version fetched
`offset + 3 × limit` per leg, so each page fused a deeper slice than the page
before it. A deeper slice can surface a document that appears in *both* lists
(for example keyword #35 + semantic #20); it collects two RRF contributions and
jumps above every single-list hit, landing on a page the user has already
scrolled past while pushing an already-served hit onto the next page. With
overlapping lists, 100 hits served over ten pages contained only 77 unique
documents. A fixed depth gives one fused list per query, and every page slices
it, so infinite scroll has no duplicates and no gaps
(`TestHybridPaginationStability`).

The cost is a cap: hybrid mode serves at most the union of the two top-200
lists (200–400 documents). `estimatedTotalHits` is set to the fused list's
length, so `has_more` turns false at its end instead of requesting empty pages.
Users who need the long tail can switch to keyword mode, which pages Meilisearch
directly.

## The fusion formula

```
score(d) = 1 / (k + rank_kw(d) / (1 − r))  +  1 / (k + rank_sem(d) / r),   k = 60
```

Ranks are 1-based. A document missing from a list, or a list whose weight is 0,
contributes nothing.

The ratio scales the rank, not the score. The textbook weighted RRF,
`(1 − r)/(k + rank_kw) + r/(k + rank_sem)`, has the same flip as Meilisearch:
with `k = 60` the `1/(k + rank)` curve is so flat that the weight alone decides
between two disjoint lists. At `r = 0.6` all 30 semantic candidates outrank
keyword #1. Scaling the rank means semantic #j beats keyword #i exactly when
`j / r < i / (1 − r)`. Single-list hits therefore interleave in proportion to
the ratio: 1:1 at 0.5 and about 3:1 semantic at 0.75. A document that both legs
retrieve still collects both contributions and rises above single-list hits.

The semantic term only grows and the keyword term only shrinks as `r` rises.
Raising the ratio can therefore never push a semantic hit down or a keyword hit
up: the blend is monotone. `test_blending_is_monotone_across_ratios` checks
this at every 0.05 step.

### Exact case-number pin

If the query equals a keyword hit's `case_number` (ignoring whitespace and
case), that hit is pinned to rank 1. Without the pin, an exact lookup such as
`III Ca 1553/21` at `r = 0.75` would fall to roughly rank 2–4 behind semantic
neighbours.

### Degradation

- **The TEI embedding fails.** The keyword leg's results are returned with
  `search_mode = "keyword"`.
- **Meilisearch rejects the vector leg with a 4xx** (for example, the `bge-m3`
  embedder is not registered). The keyword leg's results are returned with
  `search_mode = "keyword_fallback"`. The vector leg is not retried as keyword,
  because the keyword leg already ran.
- In both cases a page that lies past the 200-hit keyword window is fetched
  with one direct keyword query at the requested offset, and the keyword
  `estimatedTotalHits` is kept, so keyword paging is not capped.
- **A 5xx or network error on either leg** gives HTTP 502, the same as before.

## Response fields

The response has the same shape as a single Meilisearch call:

- `hits` holds the fused page.
- `estimatedTotalHits` is the number of fused candidates (at most 400), which
  is what hybrid mode can page through.
- `processingTimeMs` is the larger of the two legs' values.
- `search_mode` is `"hybrid"`.
