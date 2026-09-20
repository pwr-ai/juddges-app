# Research note: quantitative use cases over court judgments (#687)

> Bounded deep-research note for [#687](https://github.com/pwr-ai/juddges-app/issues/687). Source tags [S#] refer to the collector ledgers kept in the session; snippet-only means the claim rests on a search-result excerpt, not a fetched page. Companion spec: `docs/superpowers/specs/2026-09-20-persona-flows-design.md`.

## 1. Question

Which single UX workflow should juddges-app ship for a quantitative persona (sociologist / ELS scholar / analyst) asking "how many cases have features X,Y,Z" and "descriptive statistics over 10–5000 judgments", using what the app already has?

## 2. What quantitative users actually do

All RQ1 evidence is snippet-only.

- Hall & Wright (Cal. L. Rev. 96, 2008; 122 studies): systematic content analysis = (1) select cases, (2) code against a codebook, (3) analyze codes statistically. Reliability via Cohen's kappa; weakest point across studies: replicability of case selection [S1, S2].
- Published outputs: frequency tables, cross-tabs, time series; codebook + reliability check + tabulation [S4].
- Polish precedent: IWS "badania aktowe" hand-coded 397 juvenile case files (2014), repeated 2015 and 2025 (Włodarczyk-Madejska, IWS 2025); juvenile-narcotics trend study in Prawo i Więź. Hundreds of cases, human coders [S5, S6].

## 3. UX patterns worth copying

- **SAOS analysis** (full fetch [S5b]): stacked filters (court type, court incl. subordinates, chamber, date range, keywords) → two charts (count over time, count per court; absolute / % / per-1000) → CSV → "show judgments in search engine" drill-back. The full filter→chart→export→drill-back loop; metadata only, no extracted-field dimension.
- **Harvard CAP** [S3, snippet]: word frequency over time only.
- **Harvey Vault** (full fetch [S6b]): cohort = vault (≤100k files); NL query → review table (rows = documents, columns = extracted attributes) → second LLM pass over the table. **Hebbia Matrix** [S7b, snippet]: same shape, columns = prompts. Neither shows cost/progress or a sample-then-scale step.
- Lex Machina / Westlaw / Lexis: fetch failed, nothing verified.

## 4. Scaling LLM extraction 10→5000

RQ3 items are snippet-only and carry no S-tags.

- Task-dependent: GPT-4 "on par with human annotators" for generic coding (arXiv 2311.11844); GPT-4o human-level on basic annotations but weak recall on citation extraction in UK Employment Tribunal judgments (AI & Law 2025); "assistants, not independent annotators" (arXiv 2503.06778). Simple fields ≈ human; references and reasoning worse.
- GPT-4o cheaper and faster than student annotators (AI & Law 2025).
- Agreement is reliability, not validity; the model may hit the code via a shortcut (arXiv 2606.28574).

Protocol:
1. Queries over the 51 pre-extracted base fields need no LLM call: count, cross-tab, export.
2. Custom schema: sample → human check per field (kappa; flag citation/reasoning fields) → scale with a visible cost/progress estimate.
3. No source gives a validation N; any sample size in the spec is an assumption.

## 5. Implications for juddges-app

(App facts: 2026-09-20 audit on main, not sources.)

- **Biggest gap: no surface renders a distribution or cross-tab of extracted fields over a user-defined cohort.**
- The "select" step exists: `/search/extractions` has 51-base-field filters, facet counts, NL-to-filter and CSV over all 12,907 judgments. Facet counts are almost a frequency table; a "group by field" aggregate view closes the SAOS loop.
- Fix drill-back first: rows link to `/judgments/<id>` (404) instead of `/documents/[id]`; unauditable counts are the Hall & Wright concern.
- `/collections` is the cohort object; the aggregate view should accept a collection or saved filter and export the filter definition with the CSV.
- `/dataset-comparison` has a Plotly shell reading static JSON; feed it live aggregates.
- The Harvey/Hebbia review table maps onto `/extract` → `/extractions/[id]`, but that path is untested here: 0 rows in `extraction_schemas`, OpenAI credits issue (#546). Not headline-ready.
- Deep 1–5 scores (complexity, reasoning quality) are cheap to chart but carry the RQ3 validity caveat; label them as model scores.

## 6. Conflicts and unresolved gaps

- LLM ≈ human (simple coding) vs. LLM < human (citations, reasoning); unmeasured on this corpus.
- SAOS lists administrative courts but reportedly does not index WSA/NSA (unverified).
- No verified commercial analytics UX; LEX, Legalis, orzeczenia.ms.gov.pl not searched.
- Only 3 of 6 full-page fetches succeeded; RQ1/RQ3 all snippet-level. No sample-then-scale pattern with cost/progress UI documented anywhere.

## 7. Sources

Collector A (RQ1, RQ3):

- [S1] https://papers.ssrn.com/sol3/papers.cfm?abstract_id=913336 — Hall & Wright 2008, *Systematic Content Analysis of Judicial Opinions*, SSRN abstract; snippet-only.
- [S2] https://lawcat.berkeley.edu/record/1121706?ln=en — same paper, Berkeley Law repository; snippet-only (full PDF fetch blocked, 403).
- [S4] https://tilburglawreview.com/articles/10.5334/tilr.5 — *The Value of Systematic Content Analysis in Legal Research*; snippet-only.
- [S5] https://iws.gov.pl/wp-content/uploads/2025/08/Wlodarczyk-Madejska-J_Stosowanie-srodka-wychowawczego-1.pdf — IWS juvenile case-file study, 2025; snippet-only.
- [S6] https://www.prawoiwiez.edu.pl/index.php/piw/article/view/1074 — juvenile narcotics trends, *Prawo i Więź*; snippet-only.
- https://arxiv.org/pdf/2311.11844 — *Towards Human-Level Text Coding with LLMs* (Nov 2023); PDF unparseable, snippet-only.
- https://link.springer.com/article/10.1007/s10506-025-09443-z — GPT-4o extraction on UK Employment Tribunal judgments, *AI & Law* 2025; paywalled, snippet-only. Preprint: https://arxiv.org/pdf/2403.12936
- https://link.springer.com/article/10.1007/s10506-025-09495-1 — GPT-4o vs student annotators cost, *AI & Law* 2025; paywalled, snippet-only.
- https://arxiv.org/html/2606.28574 — *Correct codes for the wrong reasons?* (2026); snippet-only.
- https://arxiv.org/pdf/2503.06778 — *LLMs are effective annotation assistants but not good independent annotators* (Mar 2025); snippet-only.
- https://link.springer.com/article/10.1007/s10506-025-09488-0 — GPT vs human on privacy-policy text, *AI & Law* 2025; snippet-only.

Collector B (RQ2):

- [S1b] https://free.law/2026/05/07/api-included-in-memberships/ — CourtListener API in memberships (2026-05-07); snippet-only.
- [S2b] https://wiki.free.law/c/courtlistener/help/api/rest/v4/visualizations — CourtListener citation-network visualization API; full fetch.
- [S3] https://lil.law.harvard.edu/blog/2021/11/10/feature-update-extension-of-trend-search-capability/ — CAP Historical Trends (2021); snippet-only.
- https://hls.harvard.edu/today/caselaw-access-project-launches-api-and-bulk-data-service/ — CAP API/bulk launch (2018); snippet-only.
- [S5b] https://www.saos.org.pl/analysis — SAOS analysis module; full fetch.
- [S6b] https://www.harvey.ai/platform/vault — Harvey Vault; full fetch.
- [S7b] https://spellbook.com/briefs/hebbia-vs-harvey — Hebbia Matrix vs Harvey; snippet-only.
- https://www.lexisnexis.com/en-us/products/lex-machina.page — fetch failed (header overflow); no content.

```text
Research usage: 3 questions | 2 collector agents | 8 search queries |
21 unique sources opened | 6 full-page fetches | final model: Fable 5.1 (claude-fable-5-1)
Limits expanded: no (source count over default 10 is search-hit ledger entries, mostly snippet-only; not approved as an expansion)
```
