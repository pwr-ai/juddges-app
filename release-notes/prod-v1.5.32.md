# prod-v1.5.32

> Release Notes for Version prod-v1.5.32

_Generated on 2026-11-13 from `prod-v1.5.31..HEAD` (15 commits)._

## Summary
This release introduces new features, enhancements, and fixes to improve the overall functionality and stability of the application.

## Highlights
- New search engine integration for enhanced query capabilities.
- Improvements to health checks and authentication mechanisms.
- Various bug fixes to enhance performance and reliability.

## New Features
- Added the v2 (weaviate, test) engine to /search.
- Introduced auth-gated /search/v2 over the weaviate v2 corpus.
- Implemented an offline retrieval evaluation harness with a graded golden set.
- Enabled translator filtering on case_type.

## Improvements
- Regenerated OpenAPI snapshot for /search/v2.
- Probed LLM provider authentication in /health/status.

## Bug Fixes
- Redacted LLM endpoint and locked/split TTL for LLM probe.
- Restored CRLF endings and documented env_file caveat in frontend.
- Assigned a unique version to the case_type filter migration.
- Locked down langgraph checkpoint tables from PostgREST.
- Reset chunker cursor at the start of run().
- Ensured development NEXT_PUBLIC_* URLs are excluded from the production frontend.

## Testing Enhancements
- Asserted guests are login-redirected from /api/search/v2.
- Replaced placeholder checks with HTTP boundary contracts.

## Deployment Updates
- Attached backend to the Weaviate v2 network.

## Source Commits
- `1d8281a0` test(search): assert guests are login-redirected from /api/search/v2
- `08c75f93` feat(search): add the v2 (weaviate, test) engine to /search
- `69050908` chore(api): regenerate openapi snapshot for /search/v2
- `4d037d91` chore(deploy): attach backend to the weaviate v2 network
- `4279d175` fix(health): redact llm endpoint, lock and split ttl for llm probe
- `5ab3d6bb` fix(frontend): restore CRLF endings, portable lowercase, document env_file caveat
- `01deb2b8` fix(db): give the case_type filter migration a unique version
- `a5aef73e` feat(search): add auth-gated /search/v2 over the weaviate v2 corpus
- `0acdd567` fix(db): lock down langgraph checkpoint tables from postgrest
- `037550d0` test(auth): replace placeholder checks with HTTP boundary contracts
- `fda4eb4f` fix(ingest): reset chunker cursor at the start of run()
- `0fcc1c0a` feat(search): offline retrieval eval harness with graded golden set (#831)
- `3ac5edf6` feat(health): probe LLM provider auth in /health/status
- `39999c36` fix(build): keep dev NEXT_PUBLIC_* URLs out of the production frontend
- `f76eea34` feat(nl-filter): let the translator filter on case_type
