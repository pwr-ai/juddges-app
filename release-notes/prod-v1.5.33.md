# prod-v1.5.33

> prod-v1.5.33

_Generated on 2026-11-13 from `prod-v1.5.32..HEAD` (34 commits)._

## Summary
34 commits since prod-v1.5.32. Summary generated without an LLM; see Source Commits below.

## Source Commits
- `74c41711` fix(security): isolate invite and collection preflight quotas
- `1f1fd4a2` fix(security): patch HTML selector dependency and type auth fixtures
- `b4fbfb55` fix(security): restrict database privileges and isolate API quotas
- `3936217d` chore(deps): bump rich from 14.3.4 to 15.0.0 in /backend
- `b00e1a61` chore(deps): bump the uv-minor-patch group across 1 directory with 14 updates
- `8ed78609` chore(ci): bump the actions group across 1 directory with 2 updates
- `8f26d34f` docs: describe the Weaviate v2 test engine instead of claiming no other vector store
- `c67cb70b` docs: drop the vector-store exclusivity sentence (Meilisearch hybrid also embeds)
- `52396c9e` docs(backend): drop the removed refresh-stats route from a docstring
- `9b2c34c8` fix(analytics): bound background event pool and add wiring tests
- `1f80ecfe` fix(telemetry): port search trace emit to langfuse v5 api
- `d684faaa` fix(tests): restore celery conf by hand in celery_eager for pytest 9
- `45c68865` ci(e2e): track playwright container image to @playwright/test 1.65.0
- `76c2bf39` docs: soften vector-store rule and warn that the ingest script needs a t2v endpoint
- `fb4f458b` chore(deps): bump the npm-minor-patch group across 1 directory with 32 updates
- `69946e6e` chore(deps): bump langfuse from 3.15.0 to 5.1.0 in /backend
- `8dfcd870` chore(deps): bump pytest from 8.4.2 to 9.2.0 in /backend
- `857f43a4` feat(analytics): usage instrumentation for feature ranking
- `c6cffdad` feat!: remove the uncalled clustering, timeline and versioning routers
- `717c150d` chore(deps): drop unimported aiohttp and langchain-text-splitters
- `ace8e4cc` chore(backend): remove unused /dashboard/featured-examples and /dashboard/refresh-stats
- `389ded25` feat!: remove the GraphQL API and the strawberry-graphql dependency
- `c2ecbad4` refactor(frontend): remove verified-dead files and fix dependency hygiene
- `ce228b4d` refactor(juddges_search): remove orphan chains, retrieval and ingestion modules
- `a8ed7ae3` feat!: remove research_agent package and /research-agent router
- `7e340723` chore(db): drop three unused RPCs (prune A16)
- `c877ee16` docs: move agent plans, specs and research notes out of docs/
- `12a8606e` refactor(backend): remove orphan app modules and unused OCR models
- `c3369767` chore(scripts): remove stale one-off root scripts
- `cb7247c7` refactor(frontend): remove dead RJSF schema-editor layer and @rjsf/utils
- `34b62d23` docs: remove Weaviate leftovers from docs, CLAUDE.md and scripts
- `50bb3f87` chore(backend/scripts): remove one-off schema seed generators and JSON seeds
- `f7745fd9` chore(ci): drop develop/dev-v triggers and the always-failing backend perf job
- `4e69c735` chore: remove unused top-level clutter
