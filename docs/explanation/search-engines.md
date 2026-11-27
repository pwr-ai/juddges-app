# Search modes: Polish native and comparative

`/search` runs over one of two corpora, and the user picks which one with the
switch directly above the query input (issue #867). The labels live in the
i18n catalogs (`search.engine*` in `frontend/lib/i18n/translations/{en,pl}.ts`):

| `?engine=` | EN | PL |
|---|---|---|
| `full` | Polish native · full corpus (~2.7M judgments) | Polski natywny · pełna baza (~2,7 mln orzeczeń) |
| `curated` | Comparative · PL + EN across jurisdictions (with extractions) | Porównawczy · PL + EN, jurysdykcje (z ekstrakcjami) |

## The two engines

**Polish native (`?engine=full`)**, the default for signed-in users. This is the
Weaviate v2 corpus: about 2.69M Polish judgments from the common courts
(`pl-court-raw`) and the administrative courts (NSA, WSA), split into about
30.7M chunks. The search is hybrid on `JudgmentChunks` (BM25 plus
`mmlw-retrieval-e5-large` vectors, alpha 0.25), and each judgment is ranked by
its best chunk (MaxP). It covers everything, but only with what the source
portals publish: no LLM extractions, no UK judgments, no facets. Code:
`backend/app/search_v2/`. Operations:
[Enable the full-corpus search engine](../how-to/enable-search-v2.md).

**Comparative (`?engine=curated`)**. This is the Supabase and
Meilisearch path. On 22 November 2026, production indexed 17,397 judgments
(11,240 PL and 6,157 from England and Wales). The comparative mode supports
LLM-extracted field filters, facets, collections, export and cross-lingual search. See
[Hybrid search fusion](hybrid-search-fusion.md).

A full-corpus hit that also exists in the curated set links to the curated
judgment page `/documents/<id>`. Any other hit opens `/judgments/full/<id>`,
which shows the source metadata and the full text.

## How the engine is picked

The rule lives in `frontend/lib/search/engine.ts` and runs once per page
load, after the session is known so that no engine flashes first:

1. **Guests get `curated`.** The full corpus needs a session, so the switch
   shows it locked.
2. **An explicit `?engine=` wins.** The old values `v2` and `standard` still
   map to `full` and `curated`.
3. **Curated-only state picks `curated`.** Without an explicit engine, the page
   checks the URL params and the persisted search state for anything the full
   corpus cannot serve:
   - a language selection without Polish (UK/EN only);
   - a non-PL jurisdiction filter;
   - extracted-field filters (`?extracted=`);
   - custom-metadata filters (`?customMeta=`).

   If one is present, the page opens the curated engine and says so next to
   the switch ("Comparative mode was selected because this search uses: …") with a
   one-click way back.
4. **Otherwise `full`.**

The choice is then fixed for the visit. Clearing a filter never switches
engines on its own. When the user is on the full corpus and the stored state
holds curated-only settings, the page only suggests switching ("The Polish
native corpus does not support: …") and leaves the decision to the user. The chosen engine is
written to `?engine=`, so shared links and refreshes keep it.

Links built for curated features say so explicitly: saved searches replay with
`engine=curated`, because they were saved from the curated results view, and
the English onboarding example does the same.

## Why this split

The curated set is small because extraction is expensive. The full corpus is
what a researcher needs in order to find a ruling at all. Making the full
corpus the default gives every query the widest net. Sending curated-only
state to the curated engine, and saying why, keeps the features that only
exist there one visible click away, never silently lost.
