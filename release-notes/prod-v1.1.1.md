# prod-v1.1.1

> Release Notes for Version prod-v1.1.1

_Generated on 2026-05-12 from `prod-v1.1.0..HEAD` (124 commits)._

## Summary
This release includes significant enhancements to search functionality, improvements in onboarding, and various bug fixes. Users can expect a more streamlined experience with better performance and new features.

## Highlights
- Enhanced search capabilities with hybrid routing and query highlights.
- Improved onboarding experience with new tutorial phases.
- Bug fixes for search, collections, and backend functionalities.

## Search Enhancements
- Defaulted /search to text mode and hid broken hybrid.
- Restricted pgvector vector branch to search_language.
- Implemented hybrid routing and query highlights design.
- Added /search/extractions page with filters for all 42 base_* fields.
- Introduced text/vector/hybrid mode toggle and extracted-fields filter.

## Onboarding Improvements
- Launched new phases in onboarding with detailed content and screenshots.
- Dropped chat step from the onboarding tour.

## Meilisearch Updates
- Defaulted autocomplete to pure keyword with semantic_ratio=0.0.
- Introduced hybrid autocomplete with semantic_ratio default 0.3.
- Added backfill script for BGE-M3 embeddings.

## Bug Fixes
- Fixed immediate-commit delete on collections pages.
- Ensured fallback to static seed when DB returns empty for publications.
- Rebuilt citation BibTeX from CITATION.cff.

## Documentation and CI Improvements
- Updated documentation for search language selector design.
- Enhanced CI processes with coverage archival and artifact retention.

## Source Commits
- `8458178` fix(search): default /search to text mode and hide broken hybrid (#202)
- `5eb32b2` fix(search): restrict pgvector vector branch to search_language (#201)
- `1f578f0` fix(landing): route demo and CTA links to /auth/login (#203)
- `527fde6` docs
- `1c51ebc` feat(search): query highlights on result cards and document detail page
- `61908e4` feat(search): hybrid routing, query-highlights design, search feedback fix (#199)
- `02e1392` refactor(search): drop loading modal, surface results ASAP
- `d3a53b2` docs(how-to): add re-enable runbook for reverted hybrid search
- `a586ab5` fix(meilisearch): opt-out null vector + batched full-sync embeddings
- `f812f48` feat(meilisearch): default autocomplete to pure keyword (semantic_ratio=0.0)
- `d123415` test(meilisearch): integration test asserting hybrid surfaces cross-lingual match
- `4caa825` feat(meilisearch): add backfill script for BGE-M3 embeddings
- `ee1fae8` test(meilisearch): assert autocomplete survives TEI outage
- `1bdd26d` feat(meilisearch): hybrid autocomplete with semantic_ratio default 0.3
- `a7fc720` feat(meilisearch): attach embeddings during full sync batches
- `931f03c` feat(meilisearch): attach embedding on incremental sync
- `c48c5fd` feat(meilisearch): relocate + expand sync column projection
- `70e833f` feat(meilisearch): register bge-m3 userProvided embedder in index settings
- `fd50e8c` feat(meilisearch): add attach_embedding helper to embed indexed docs
- `c564f9f` test(meilisearch): cover attach_embedding success, skip, and failure paths
- `ab63ecc` feat(search): text/vector/hybrid mode toggle + extracted-fields filter
- `08354a6` feat(meilisearch): add build_embed_text helper for curated-field embedding input
- `16a9276` refactor(onboarding): drop chat step from the tour
- `30225b3` docs(spec): /search language selector design
- `719cd8e` docs(reference): add Meilisearch judgments index reference
- `9a2440b` fix(publications): fall back to static seed when DB returns empty
- `487c462` feat(collections): full-columns table view with batched fetch + export
- `c885a15` refactor(export): extract shared file-export utility
- `d2ff9cc` feat(auth): remove SSO management surface
- `48d811b` chore(env): align .env.example embedding docs with TEI-only refactor
- `86249a2` feat(onboarding): Phase 6 — surface tutorial + sidebar reference
- `0333a6c` feat(onboarding): Phase 5 — Step 4 Base Coding Schema content + screenshot
- `00a4547` feat(onboarding): Phase 4 — Step 3 Chat with citations content + screenshot
- `2b57f48` feat(onboarding): Phase 3 — Step 2 Collections content + screenshot
- `601da1f` feat(onboarding): Phase 2 — Step 1 Search content + screenshot
- `18df903` feat(onboarding): /onboarding route shell + Playwright capture script
- `c317c6c` feat(extraction): promote base-schema output to typed base_* columns
- `7088192` refactor(embeddings): drop OpenAI/Cohere/HF/Local providers, TEI-only
- `130ef79` refactor(sidebar): drop /extract and /extractions menu items
- `a84a97b` fix(dashboard): rebuild citation BibTeX from CITATION.cff
- `883e9f3` content(publications): seed static fallback with 5 recent papers
- `77a8944` refactor(dashboard): swap coding-schemas list for /schemas/base link, drop recent-extractions
- `3c0cbf4` refactor(dashboard): drop recent-judgments card, promote quick-start strip
- `f4c4ec8` feat(meilisearch): index base-schema extraction fields for filtering
- `dd57dce` chore(team): keep only Łukasz, Tomasz, Albert, Jakub on /team
- `476de81` chore(docs): move per-task scratchpads out of docs/ into .context/
- `5b8c936` fix(ci): write trailing newline in openapi snapshot to avoid false drift
- `e8d2c20` fix(collections): immediate-commit delete on both list and detail pages (#190)
- `1b48514` fix(collections): persist description on PUT /collections/{id} (#189)
- `595cd7e` refactor: remove dead code and simplify across all domains (#187)
- `1f53b14` feat(tests): expand coverage + CI hardening (RLS, pgvector, OpenAPI drift, MSW) (#188)
- `443a8e2` release: integrate develop → main (45 commits) (#186)
- `7c19907` feat(search): judgment-only + blazing fast (#185)
- `166dcc9` chore(docs): reflect lifted review requirement on main (#161)
- `60945d2` feat(footer): app version display + dataset stop-word expansion (#160)
- `5d7fc51` fix(ci): gate frontend-e2e behind workflow_dispatch until matrix narrowed (#159)
- `a3afd79` fix(ci): skip playwright webServer in CI; workflow owns server lifecycle (#158)
- `0e5e731` fix(ci): correct e2e download path + de-flake typing-animation test (#157)
- `cd93be6` fix(ci): include hidden files in frontend-build artifact (#156)
- `8d13beb` fix(ci): unblock dependency audit and frontend e2e on main (#155)
- `0e1de38` fix(ci): green main on all required + auxiliary checks (#152)
- `387127b` test: comprehensive test coverage expansion (10 task groups) (#133)
- `2448066` feat(search): add /search/extractions page with filters for all 42 base_* fields (#138)
- `1bb5ae6` feat(base-schema): extend filterable + searchable surface, add NL filter generator (#137)
- `9e6dadd` fix(migration): drop old search_judgments_hybrid overload before re-create (#135)
- `185df57` chore: ignore .worktrees/ and .env.rls-verify
- `20ce700` docs: fix in-page anchor links to match Python-Markdown slugs
- `3cd13b4` docs: fix remaining broken markdown links across 7 directories
- `5eb4519` docs: fix broken markdown links in 4 directories (parallel sweep)
- `5cb71f4` docs: relocate ephemeral notes to gitignored .context/
- `0054391` fix(docs): unbreak BibTeX rendering on GitHub
- `8c9d9ce` docs(open-science): mark CODE_OF_CONDUCT.md as Done in checklist
- `51b3dc2` Add files via upload
- `afa03d4` docs(open-science): full FAIR4RS report and companion files
- `0ca45ce` docs(readme): link to rendered docs site and Open Science page
- `93456e8` ci(docs): use modern Pages deploy artifact flow
- `b3db231` docs(site): MkDocs Material site with GitHub Pages auto-deploy
- `337e93c` docs: remove open-science assessment, keep questionnaire only
- `0dd17c0` docs: move open-science questionnaire to docs/open-science/
- `990c66f` docs(open-science): add FAIR/open-science questionnaire for funder reporting
- `894785e` chore: remove CODE_AUDIT_REPORT.md
- `58a71f6` fix(readme): use direct Zenodo SVG URL so DOI badge renders
- `c221a6d` docs(citation): reorder authors — Tagowski to 4th position
- `f407418` docs(citation): add full author list from research team
- `7356714` docs: add CITATION.cff placeholder with Zenodo DOI
- `d3068d7` docs(readme): add Zenodo DOI badge
- `a9cf70c` docs(readme): point datasets to JuDDGES HF org
- `97cb922` chore: prepare repo for public release (license, README, security) (#130)
- `4c0be86` docs: unify branching and release flow across canonical docs (#129)
- `e8f6cb4` feat: add /changelog page with RSS feed (#113) (#128)
- `35d2080` feat(llm,security): central LLM defaults + CSP tightening + test repair
- `c04447d` feat(llm): upgrade to GPT-5 family + fix thinking mode + repair failing tests
- `cc17207` chore(coverage): raise coverage threshold from 50% to 60%, expand scope
- `ec48222` feat(observability): add Sentry config files for Next.js 15 App Router frontend
- `3e3eed9` feat(observability): add Sentry error tracking to backend
- `14e6b27` ci(search): run search regression tests in CI (#106)
- `565872d` ci(e2e): start frontend server before Playwright run (#98)
- `983fa6f` fix(feedback): harden anonymous endpoints against spam and abuse
- `01376d8` ci(docker): validate frontend Dockerfile build on every PR (#101)
- `3d51649` fix(rate-limiter): use real client IP when behind trusted reverse proxy
- `97325c6` ci(security): make dependency audits blocking on HIGH/CRITICAL (#100)
- `f223d34` feat(feedback): wire thumbs up/down feedback onto search result cards
- `716815c` feat(search-ui): add zero-result empty state with bilingual messages and sample queries
- `734bcd4` feat(search): better LLM query analysis prompts + adaptive timeout
- `aca72c7` feat(frontend): character counter + 2000-char cap on search input
- `42e2ecb` feat(search): Langfuse trace per /documents/search call
- `f492753` perf(search): Redis cache for query embeddings (24h TTL)
- `2521f72` feat(search): unify embedding endpoint + token-aware truncation + startup probe
- `17dc8cb` test(search): lock in 5-query benchmark + integration suite
- `0963219` fix(search): classify paragraphs citing signatures + relax conceptual BM25
- `074eb50` feat(search): add TEI embedding provider via HTTP
- `36446eb` chore: add audit report and Unite paper sources
- `dc0c8d5` feat(frontend): add digest subscription management UI and API routes
- `49d449c` feat(backend): add cron-based digest notification system
- `ff2fe1c` chore(backend): fix dead code, add complexity CI check
- `cf46f92` fix(backend): add Redis-backed session store with in-memory fallback
- `3755509` fix(backend): document and standardize authentication tiers
- `90abeda` fix(frontend): replace console.log/warn/error with structured logger
- `550be29` refactor(backend): split supabase_db.py into domain-specific modules
- `af3d5f3` fix(backend): replace broad except-Exception with specific exception types
- `7a50e7f` refactor(frontend): split api.ts into domain-specific modules
- `3e32fb6` perf(backend): replace SELECT * with explicit column projections
- `97b6d3b` chore(ci): add coverage archival, SBOM generation, and artifact retention
- `ffb1722` fix(security): remove .env copy from Dockerfile.analysis and sanitize env logging
