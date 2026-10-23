# prod-v1.5.16

> Release Notes for Version prod-v1.5.16

_Generated on 2026-10-23 from `prod-v1.5.15..HEAD` (43 commits)._

## Summary
This release includes significant refactoring, new features, and various fixes aimed at improving performance and reliability.

## Highlights
- Enhanced MCP traffic management with rate-limiting features.
- New tools and endpoints for MCP key management.
- Improvements in search functionality and telemetry.

## Refactoring Improvements
- Exposed filter workflow in collections.
- Ranked projection ownership in precedents.
- Own query transitions in filters.
- Dropped unused dual-credential MCP dependency in auth.
- Extracted run_document_search from the search route handler.

## New Features
- Rate-limit MCP traffic per key and per rejected-key IP.
- Added stdio entrypoint for local development.
- Introduced tools for getting judgments and extracted fields.
- Added search_judgments tool.
- Implemented MCP access section in settings.
- Created endpoints for MCP key management including create, list, and revoke.

## Fixes and Enhancements
- Cleared high-severity npm audit findings in frontend.
- Renumbered MCP keys migration to address main's facets fix.
- Emitted search telemetry for non-empty results.
- Dropped stack-frame local variables from Sentry events.
- Normalized jurisdiction case and corrected rate-limit wording.
- Enforced rejected-key IP budget only behind a trusted proxy.

## Documentation Updates
- Documented jurisdiction case handling in MCP.
- Added live check documentation for the MCP server.
- Provided implementation plan for juddges-mcp phases 0 and 1.
- Added design spec for juddges-mcp phases 0 and 1.

## Source Commits
- `d7ab0b80` refactor(collections): expose filter workflow
- `048227b9` refactor(precedents): own ranked projection
- `4b15731c` refactor(filters): own query transitions
- `ff0274c4` chore(deps): bump the npm-minor-patch group across 1 directory with 49 updates
- `bc5d7b44` docs(rate-limit): record the trusted-proxy pairing and correct the Caddy claim
- `a2168757` chore(deps): bump the pip-minor-patch group across 1 directory with 9 updates
- `5282b2e1` chore(deps): bump framer-motion from 13.4.3 to 14.3.0 in /frontend
- `8d12bdca` fix(frontend): clear the high-severity npm audit findings
- `e84f7b9c` fix(db): renumber the MCP keys migration past main's facets fix
- `c06b7630` refactor(auth): drop the unused dual-credential MCP dependency
- `0fa99534` fix(search): emit search telemetry for non-empty results
- `874294be` fix(sentry): drop stack-frame local variables from events
- `866e1d95` fix(mcp): label search snippets by provenance and pin the transport paths
- `453ba5c3` fix(mcp): stop logging the plaintext key in resolution failure tracebacks
- `1ebce672` docs(mcp): describe jurisdiction case handling as implemented
- `1a5eaa2b` fix(mcp): normalise jurisdiction case and correct rate-limit wording
- `9d9e3cf1` docs(mcp): document the MCP server and add its live check
- `bb1d5957` fix(mcp): enforce the rejected-key ip budget only behind a trusted proxy
- `149d7c24` feat(mcp): rate-limit MCP traffic per key and per rejected-key IP
- `c3f36505` feat(mcp): add the stdio entrypoint for local development
- `683c224c` fix(mcp): record key use on the /mcp transport
- `b165dd93` feat(mcp): mount the authenticated MCP server at /mcp
- `9f27b719` fix(mcp): pin the section mapping and align judgment output with search
- `3ab9d1fb` feat(mcp): add the get_judgment and get_extracted_fields tools
- `37d07e6f` test(mcp): pin the chunk-to-document join and normalise date filters
- `833833e3` feat(mcp): add the search_judgments tool
- `c7c4e618` feat(mcp): add the juddges_mcp package skeleton and principal context
- `d20d8878` refactor(search): extract run_document_search from the route handler
- `81b59743` test(search): pin filter forwarding, cache args and the try boundary
- `ea6758fb` test(search): characterize the document search pipeline before extraction
- `f765f787` fix(mcp): hold the reveal-once property in the settings spec
- `d35dbbcc` feat(mcp): add the MCP access section to /settings
- `299d0026` test(mcp): guard the forwarded JWT on the MCP key create proxy
- `1ccd3bfc` feat(mcp): proxy MCP key management through the Next.js BFF
- `fdd62c32` fix(mcp): distinguishable key prefix, no re-revocation, uuid key id
- `2412c38d` feat(mcp): add /mcp/keys create, list and revoke endpoints
- `d2ecf591` feat(mcp): accept MCP keys alongside Supabase JWTs
- `89e28de9` feat(mcp): resolve an MCP key to its owning principal
- `d8e2d5b4` feat(mcp): add mcp_api_keys table and key material helpers
- `f3ca88ae` docs(mcp): add the juddges-mcp implementation plan for phases 0 and 1
- `19ce1251` test(e2e): make live search checks resilient to cache + transient 5xx
- `49f3553b` docs(mcp): add juddges-mcp design spec for phases 0 and 1
- `b9c8ce92` fix(precedents): map judgment metadata
