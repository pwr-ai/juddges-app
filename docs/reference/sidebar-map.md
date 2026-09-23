# Sidebar reference

The signed-in sidebar is rendered from one config,
`frontend/lib/navigation/flows.ts` (#690). It shows the **Dashboard**, four
**persona flows**, and — for admins only — an **Administration** group. A
`FlowStepper` row under the top bar tells you which flow and which step the
current page belongs to. This page mirrors that config; a Jest test
(`frontend/__tests__/docs/sidebar-map.test.ts`) fails when the two drift.

Design: `docs/superpowers/specs/2026-09-20-persona-flows-design.md` §2, §4.

| Item | Route | What it does |
|---|---|---|
| **Dashboard** | `/` | Corpus statistics, recent work, entry points to every flow (#646). |

## Ask — find and read judgments

| Step | Route | What it does |
|---|---|---|
| 1. Search Judgments | `/search` | Keyword (Meilisearch) and semantic (pgvector) search over the corpus; anonymous. |
| 2. Chat | `/chat` | RAG chat over retrieved judgments, with citations. |
| 3. Search History | `/history` | Your past queries. |

## Explore — cohorts and statistics

| Step | Route | What it does |
|---|---|---|
| 1. Search Extracted Data | `/search/extractions` | Filter the corpus on the 51 pre-extracted base fields (facets, NL filter, CSV export). Rows open the reader at `/documents/[id]`. |
| 2. Statistics | `/search/extractions?view=stats` | Distributions of the pre-extracted fields over the current cohort, at 10 … all. |
| 3. Research Collections | `/collections` | Named judgment sets — the working folder for a research question. |
| 4. Topic Trends | `/topics` | Popular and trending search topics. |
| 5. Compare PL / UK | `/compare` | One structured filter run against both jurisdictions side by side; saved pairs open at `/compare/[pairId]`. |

## Code — your own extraction schema

| Step | Route | What it does |
|---|---|---|
| 1. Schemas | `/schemas` | Schema library, including the base coding schema and the LLM schema builder. |
| 2. Run Extraction | `/extract` | Pick a collection and a schema, start an extraction job. |
| 3. Extraction Jobs | `/extractions` | Job list and per-job results. |

## Case — from a fact pattern to a memo

| Step | Route | What it does |
|---|---|---|
| 1. Precedent Search | `/precedents` | Describe a fact pattern; get similar judgments with matching factors. |
| 2. Reasoning Lines | `/reasoning-lines` | Lines of judicial reasoning across the selected judgments. |
| 3. Judge Fingerprint *(admin)* | `/judge-fingerprint` | Per-judge statistics. |
| 4. Argumentation Analysis *(admin)* | `/argumentation-analysis` | LLM analysis of argument structure. |

## Administration (admins only)

| Item | Route | What it does |
|---|---|---|
| Saved Searches | `/saved-searches` | Persisted queries and filters. |
| Topic Modeling | `/topic-modeling` | UMAP topic map (empty until `judgments.umap_x` is populated). |
| Admin Panel | `/admin` | Users, stats, system, content. |

## Not in the sidebar

Reachable by URL or in-page link only: `/documents/[id]` (the reader — every
result row links here), the static PL/UK comparison, `/schema-chat`,
`/settings`, `/statistics`, `/help`, `/about`, `/changelog`.
