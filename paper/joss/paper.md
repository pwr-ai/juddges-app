---
title: 'Juddges App: An open-source web platform for hybrid search, retrieval-augmented chat, and structured extraction over Polish and England & Wales court judgments'
tags:
  - Python
  - TypeScript
  - legal NLP
  - judicial decisions
  - case law
  - semantic search
  - retrieval-augmented generation
  - information extraction
  - Poland
  - United Kingdom
authors:
  - name: Łukasz Augustyniak
    orcid: 0000-0000-0000-0000
    corresponding: true
    affiliation: 1
  - name: Jakub Binkowski
    orcid: 0000-0000-0000-0000
    affiliation: 1
  - name: Albert Sawczyn
    orcid: 0000-0000-0000-0000
    affiliation: 1
  - name: Kamil Tagowski
    orcid: 0000-0000-0000-0000
    affiliation: 1
  - name: Michał Bernaczyk
    orcid: 0000-0000-0000-0000
    affiliation: 2
  - name: Krzysztof Kamiński
    orcid: 0000-0000-0000-0000
    affiliation: 3
  - name: Tomasz Kajdanowicz
    orcid: 0000-0000-0000-0000
    affiliation: 1
affiliations:
  - name: Wrocław University of Science and Technology, Poland
    index: 1
  - name: University of Wrocław, Poland
    index: 2
  - name: Court of Appeal, Wrocław, Poland
    index: 3
date: 22 May 2026
bibliography: paper.bib
---

# Summary

`Juddges App` is an open-source, self-hostable web platform for searching,
analysing, and extracting structured information from judicial decisions of
Polish appellate courts and the Court of Appeal of England & Wales. The
platform combines (i) hybrid semantic and full-text retrieval over court
judgments, (ii) retrieval-augmented chat grounded in matched cases, (iii)
schema-driven information extraction powered by large language models, and
(iv) an analytics dashboard for jurisdiction-, court-, and trend-level
insights. The application is the deployable companion to the `JuDDGES`
research initiative [@juddges-project], which curates the underlying
case-law corpora and develops the legal-NLP methodology; both projects
are released independently under the Apache 2.0 license.

The system is implemented as a TypeScript/Python monorepo: a Next.js 15
[@nextjs] frontend, a FastAPI [@fastapi] backend that exposes LangChain
[@langchain] chains via LangServe, a Supabase-managed PostgreSQL database
with `pgvector` [@pgvector] for semantic indexes, and Meilisearch
[@meilisearch] for full-text search. Sample corpora are loaded on demand
from two public Hugging Face datasets — `JuDDGES/pl-appealcourt-criminal`
[@juddges-pl-dataset] and `JuDDGES/en-appealcourt` [@juddges-en-dataset] —
so that any third party can reproduce the stack against the same data
used by the maintainers, or substitute their own legal corpus.

# Statement of need

Empirical legal research and the day-to-day work of legal practitioners
both depend on the ability to locate, compare, and synthesise relevant
court decisions across large case-law corpora [@katz2023legaltech;
@chalkidis2020legalbert]. Existing commercial legal-search portals are
closed, jurisdiction-bound, often paywalled, and rarely expose the
retrieval signals or the underlying models, which hinders reproducible
research on legal information retrieval and prevents fine-grained
extensions such as custom extraction schemas or jurisdiction-specific
embeddings. Open data initiatives have begun to address the corpus-side
gap [@chalkidis2022lexglue; @niklaus2023multilegalpile;
@guha2023legalbench], but a research-grade, deployable application that
ties together hybrid retrieval, retrieval-augmented question answering,
and structured extraction over multilingual case law has been missing.

`Juddges App` was designed to close that gap for two communities. For
legal-NLP researchers, it provides a transparent reference stack — pgvector
for embeddings, Meilisearch for lexical search, LangChain chains for
retrieval-augmented generation, and a LangGraph schema-extraction agent —
so that retrieval algorithms, prompting strategies, and extraction
schemas can be benchmarked end-to-end against the published `JuDDGES`
datasets, with the search-benchmark methodology documented in the
repository. For legal practitioners and case-law annotators, it provides
an interactive workspace with semantic and full-text search, in-line
chat with citation grounding, rich-text annotation, and analytics over
courts and jurisdictions, all of which can be self-hosted against
domain-specific corpora without depending on a commercial vendor.

The platform is already used to investigate cross-jurisdictional case
comparison between Polish and England & Wales judgments — a use case
that motivated the bilingual corpus design and the cross-lingual topic
comparison feature — and it is intended to serve as a reusable substrate
for further legal-NLP studies and for downstream applications such as
human-in-the-loop annotation pipelines and dataset-quality auditing.

# Software description

The application is organised around five capabilities that can be used
independently or composed.

**Hybrid retrieval.** Each judgment is indexed both as a `vector(768)`
embedding in a `pgvector` HNSW index and as a full-text record in
Meilisearch. A configurable reranker combines the two signals at query
time so that lexical-precise queries (citations, statute references) and
semantic queries (factual analogies across languages) share a single
search surface.

**Retrieval-augmented chat.** A LangChain chat chain retrieves top-`k`
judgments and grounds the response in the matched passages, returning
explicit citations back to the original cases.

**Schema-driven extraction.** A LangGraph agent generates a Pydantic
schema from a natural-language description of the target fields, runs
LLM extraction against a chosen corpus slice, and persists the results
as a versioned batch for downstream analysis.

**Annotation workspace.** A TipTap-based rich-text editor lets users
annotate judgments inline and persists the annotations server-side, so
the same corpus can serve research analyses and human-in-the-loop
training-data construction.

**Analytics dashboard.** Aggregations over jurisdiction, court, and
decision-trend slices are pre-computed and rendered as interactive
charts, providing a corpus-level overview that complements the
case-level search and chat surfaces.

The backend is shipped as three reusable Poetry packages — `juddges_search`,
`schema_generator_agent`, and `research_agent` — each documented with its
own `README` so that the retrieval, extraction, and agent components can
be embedded into other legal-NLP applications without taking on the full
web frontend. Production releases are tagged `prod-v<semver>` and shipped
as Docker images on Docker Hub; a Zenodo concept DOI [@zenodo-juddges-app]
provides a persistent identifier for citation.

# Acknowledgements

We thank the JuDDGES research project at Wrocław University of Science
and Technology for the curated Polish and England & Wales judgment
corpora and the legal-NLP methodology this application builds on, and
the Court of Appeal in Wrocław for domain expertise on Polish appellate
procedure. This work has been carried out as part of the JuDDGES research
programme; funding sources are listed in the upstream research
repository.

# References
