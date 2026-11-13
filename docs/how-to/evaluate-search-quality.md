# How to evaluate search quality offline

Use this when you change anything that can move document-search ranking: the
hybrid ratio or fusion (#798), Meilisearch settings, the embedder, chunking,
or `hnsw.ef_search` (#733). The harness scores `/api/search/documents` against
a labelled golden set and reports **recall@k, nDCG@k, MRR@k and latency
p50/p95** per search mode, so the PR can say "nDCG@10 went from X to Y" and
not just "the top 5 looks better".

It is **not** a CI check: it needs a live Meilisearch index and the TEI
embedding service. Run it by hand before and after your change and paste both
tables into the PR.

| What | Where |
|---|---|
| Golden set | `backend/evals/search/golden_set.jsonl` |
| Runner | `backend/evals/search/run_eval.py` (`poe eval-search`) |
| Golden-set builder | `backend/evals/search/build_golden.py` (`poe eval-search-build`) |
| Metric + harness tests | `backend/tests/app/test_search_eval_{metrics,harness}.py` |

!!! warning "Never against production"
    The runner and builder refuse to start when `PYTHON_ENV` (or
    `ENVIRONMENT` / `APP_ENV`) is `production`/`prod`. Run them in the
    **dev** backend container (`juddges-backend-dev`), never with
    `docker exec juddges-backend …`. Every non-keyword mode embeds each query
    on the TEI GPU service, so one default run costs a few hundred embedding
    calls.

## Run it

The dev stack bind-mounts `./backend` into the container at `/app`, so the
harness is already there:

```bash
# from the repo root, with the dev stack up
docker compose -f docker-compose.dev.yml exec backend-dev \
  python -m evals.search.run_eval --runs 3 --json /tmp/eval-before.json
```

Or the poe task (same command, from `backend/`, needs `MEILISEARCH_*` and the
TEI env of a non-production stack):

```bash
cd backend && uv run poe eval-search --runs 3
```

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--k N` | `10` | Cut-off for every metric (1–100, the endpoint's limit cap). |
| `--modes …` | `keyword,semantic,hybrid:0.25,hybrid:0.5,hybrid:0.75` | `keyword` = `semantic_ratio` 0, `semantic` = 1, `hybrid:<r>` = r. |
| `--runs N` | `1` | Calls per query per mode; all go into the latency percentiles. |
| `--category C` | all | `case_number`, `citation` or `topical`. |
| `--jurisdiction J` | all | `PL` or `UK` queries only. |
| `--jurisdiction-filter` | off | Send `jurisdiction = "<query's>"` as a Meili filter, as a scoped search would. |
| `--ids-only` | off | Match hits to labels by judgment id only (see [matching](#how-hits-are-matched)). |
| `--golden PATH` | committed set | Use another golden-set file. |
| `--json PATH` | — | Write summary, per-query grades and latencies. |
| `--baseline PATH` | — | Compare with an earlier `--json` output (the gate). |
| `--max-drop X` | `0.02` | Largest allowed absolute drop of nDCG/recall/MRR per mode. |

The runner calls `MeiliSearchService.documents_search` in-process, which is
the function behind `GET /api/search/documents`. HTTP, auth, rate limits and
the anonymous-caller clamp to keyword (#565) are therefore out of the
measurement: a `semantic` row is what a signed-in user's request runs.

### Use it as a gate

```bash
# on main
docker compose -f docker-compose.dev.yml exec backend-dev \
  python -m evals.search.run_eval --runs 3 --json /tmp/eval-before.json
# on your branch, same index
docker compose -f docker-compose.dev.yml exec backend-dev \
  python -m evals.search.run_eval --runs 3 --baseline /tmp/eval-before.json
```

Exit codes: `0` ok · `1` a mode dropped more than `--max-drop` on nDCG@k,
recall@k or MRR@k against the baseline · `2` usage/config error (including the
production guard) · `3` a mode was **degraded**.

**Degraded** means a mode with `semantic_ratio > 0` came back as anything but
`search_mode == "hybrid"`: TEI failed and the service fell back to keyword, or
Meili rejected the embedder. Its row then measures keyword search under
another name, so the run exits non-zero instead of reporting it.

Only compare runs made against the same index snapshot and the same
`golden_set_sha256` (both are in the JSON output).

## Read the output

```
mode        ratio  n  recall@10 nDCG@10 MRR@10 nDCG@10 strict p50 ms p95 ms degraded
```

- **recall@k**: the share of a query's relevant judgments found in the top k,
  divided by `min(k, #relevant)`. Topical queries carry hundreds of labels, so
  plain recall could never exceed 10/200. With the cap, a perfect top 10 reads
  1.0 for every query type.
- **nDCG@k**: graded gain `2^grade − 1`, log2 rank discount. The ideal ranking
  is built from *all* labels, so ranking a grade-2 citing judgment above the
  grade-3 judgment itself costs score.
- **MRR@k**: `1/rank` of the first relevant hit, averaged.
- **nDCG@k strict**: nDCG against the non-heuristic labels only (see
  [labels](#how-the-labels-were-made)), averaged over the queries that have
  any. Treat this as the hard number.
- **p50/p95 ms**: wall clock around `documents_search`, which includes the
  query embedding for ratio > 0. One warm-up call per mode is excluded.

There are two more tables, one per category and one per jurisdiction. Read
the category table first: the categories measure different abilities.

### Baseline (dev index, 2026-11-05)

Taken on the dev Meilisearch with 12,307 judgments (6,150 PL / 6,157 UK),
`--runs 3`, k=10, golden set at its first commit:

| mode | recall@10 | nDCG@10 | MRR@10 | nDCG@10 strict | p50 ms | p95 ms |
|---|---|---|---|---|---|---|
| keyword | 0.863 | 0.857 | 0.892 | 1.000 | 10 | 54 |
| semantic | 0.140 | 0.127 | 0.201 | 0.070 | 15 | 19 |
| hybrid:0.25 | 0.863 | 0.857 | 0.892 | 1.000 | 19 | 26 |
| hybrid:0.5 | 0.863 | 0.857 | 0.892 | 1.000 | 20 | 28 |
| hybrid:0.75 | 0.140 | 0.127 | 0.201 | 0.070 | 24 | 43 |

| mode | case_number nDCG / recall | citation | topical |
|---|---|---|---|
| keyword | 0.996 / 1.000 | 0.984 / 1.000 | 0.494 / 0.492 |
| semantic | 0.046 / 0.091 | 0.067 / 0.064 | 0.323 / 0.302 |

These numbers reproduce #798. Hybrid at 0.25 and 0.5 is identical to keyword
on every metric, and 0.75 is identical to semantic, so no ratio blends the
two rankings. A fusion fix for #798 should produce hybrid rows that differ
from both. To pass, it should keep `case_number` nDCG near keyword's ~1.0 and
lift `topical` above both 0.494 and 0.323.

## How the labels were made

`build_golden.py` derived every label from the index; nothing was hand-judged.
Each label stores its `source`, a `heuristic` flag and an `evidence` string.

| Category | Query | Grade 3 (`heuristic: false`) | Grade 2 / 1 (`heuristic: true`) |
|---|---|---|---|
| `case_number` (16) | a judgment's case number: 3 pinned from #798/#799 (`III Ca 1553/21`, `[2019] EWCA Crim 952`, `[2013] EWCA Crim 2410`), the rest one judgment per decision year | every indexed judgment whose `case_number` equals the query | 2: every other judgment whose `full_text` cites it |
| `citation` (11) | a signature that judgments cite: PL from the opening of sampled appeal judgments (the lower-court `sygn. akt`), UK six pinned leading authorities (Jogee, Hanson, Lang, Waya, Ivey, Barton & Booth) | the judgment carrying it, if indexed | 2: every judgment whose `full_text` cites it |
| `topical` (10) | a paraphrase of a topic tag, written to avoid the tag's own words | — | 1: every judgment carrying the tag. PL: SAOS editorial `keywords` (`keyword_tag`). UK: LLM-extracted `base_keywords` (`extracted_keyword`) |

What the heuristic labels assume:

- **"Cites" relies on the keyword engine.** `full_text` is searchable but not
  retrievable in the index, so "cites X" means a Meilisearch phrase search
  for X restricted to `full_text` (`attributesToSearchOn`): every token,
  adjacent, in order. These labels measure "find the judgments that cite X",
  and keyword search is expected to win at that.
- **Topic tags are proxies.** A judgment tagged *Obrona Konieczna* is not
  necessarily the one a lawyer wants for the paraphrase, and an untagged one
  may be. The UK tags come from LLM extraction and are noisier than SAOS's.
  Use `topical` to compare modes with each other, not as an absolute score.

## How hits are matched

A hit matches a label by judgment `id` first, then by normalised
`case_number` (case-insensitive, whitespace-collapsed). The case-number
fallback keeps the set usable on a local re-ingest whose ids differ. Each
label is credited once, so an index holding two copies of a judgment does not
double-count.

Polish signatures are unique only within one court: `II AKa 144/22` exists at
several appeal courts. On the index the set was built from, `--ids-only` rules
out crediting a same-signature judgment from another court.

## Change the golden set

- **Add a hand-curated query:** append a line to `golden_set.jsonl`. The loader
  validates it (`jurisdiction` PL/UK, `language` pl/en, grades 1–3, a known
  `source`, and only `exact_case_number` labels may be non-heuristic).
  `test_search_eval_harness.py` loads the committed file, so a malformed line
  fails CI.
- **Regenerate:** `python -m evals.search.build_golden` in the dev container
  (`--per-jurisdiction`, `--citations`, `--out`). Regenerating against another
  corpus snapshot samples different judgments, so the result is a **new
  baseline**. Never compare numbers across two versions of the set.

## Related

- [Benchmark search performance](benchmark-search-performance.md) covers
  latency only, through the HTTP API.
- `backend/scripts/search_benchmark.py` (`poe bench-search`) covers query
  routing and `min_hits` thresholds, with no relevance labels.
- [Re-enable hybrid search](re-enable-hybrid-search.md) covers the Meili
  embedder the semantic modes depend on.
