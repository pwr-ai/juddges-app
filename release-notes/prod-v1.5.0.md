# prod-v1.5.0

> Release Notes for Version 1.5.0

_Generated on 2026-09-02 from `prod-v1.4.0..HEAD` (38 commits)._

## Summary
This release includes significant updates to the authentication flow, improvements to API rate limiting, and various documentation enhancements.

## Highlights
- Enhanced invite code redemption process
- Improved rate limiting for users and services
- Updated documentation for operational procedures

## Authentication Enhancements
- Gate registration behind invite codes
- Redeem invite codes from the sign-up form
- Close invite-gate review gaps in the sign-up flow
- Allow guests to search and read judgments

## API Improvements
- Regenerate OpenAPI snapshot for the invite endpoint
- Fix rate limit handling for backend responses
- Enforce per-client budget on langserve LLM routes
- Install slowapi middleware for default limits

## Documentation Updates
- Add pilot safety gate implementation plan
- Document pilot safety environment variables and launch checklist
- Correct status documentation regarding service health claims

## General Fixes and Chores
- Remove dead code and comments
- Bump dependencies for improved performance and security
- Fix issues related to the dashboard and GDPR compliance

## Source Commits
- `1c0ef410` chore(api): regenerate openapi snapshot for the invite endpoint
- `26aefa74` docs(plan): add the pilot safety gate implementation plan
- `93a91858` chore: drop dead e2e helper and misleading invites comment
- `a122a31e` chore: remove dead sign-up-success surface and stale comment
- `180a7608` fix(api): degrade to in-memory limiter on rate-limit storage errors
- `d3cf6910` fix(chat): pass through backend 429 with its body
- `5e0e12e8` fix(db): grant service_role execute on redeem_invite_code
- `d64739f4` docs(ops): document pilot safety env vars and launch checklist
- `162eef41` fix(auth): close invite-gate review gaps in the sign-up flow
- `d4e6e0a4` feat(auth): redeem invite codes from the sign-up form
- `7f64f9b4` fix(auth): add per-email invite rate limit and widen the shared ceiling
- `16d0a2b1` feat(auth): gate registration behind invite codes
- `b699d355` docs(api): correct the backstop comment and pin the include_router gap
- `93a7f334` fix(api): keep cors outermost and give chat/enhance_query a per-user rate key
- `3219b826` fix(api): install slowapi middleware so default limits apply
- `64665b1b` fix(api): enforce a per-client budget on langserve llm routes
- `81fceab9` fix(search): give signed-in users their own rate-limit bucket
- `f9127c56` fix(search): meter anonymous search and keep it off the GPU path
- `a9b7b9ad` fix(audit): wire the audit trail to the request paths it claims to cover
- `7fc4a66d` chore(deps): bump transitive browserslist off the OOM/prototype advisories
- `799223e3` docs(status): drop the last three all-services-healthy claims
- `2012f512` docs(status): correct the 2026-08-21 findings and drop the spent plan
- `d579a773` chore(deps): bump typescript from 5.9.3 to 6.0.3 in /frontend
- `2c05cd94` fix(dashboard): remove fabricated trending topics from the public home page
- `fbd0f08b` chore(deps): bump framer-motion from 12.43.0 to 13.1.1 in /frontend
- `10f5173a` test(auth): cover the guest route contract in production E2E
- `38506e66` test(gdpr): pin the deletion-queue column projection
- `5261a705` test(auth): update the production document matrix to the guest policy
- `2729af6d` fix(gdpr): wire the deletion processor to an admin queue
- `0eb91b6c` feat(auth): let guests search and read judgments
- `978b7608` fix(deploy): prepare celery state volume
- `6b341d4e` chore(deps): bump the pip-minor-patch group in /backend with 4 updates
- `079d4bd3` chore(deps): bump @types/node from 24.13.3 to 26.4.0 in /frontend
- `d7f65f22` chore(deps): bump the npm-minor-patch group in /frontend with 23 updates
- `d5f05d34` test(route-contract): read the poll body on arrival, not after navigation
- `704730b5` fix(deploy): make REDIS_AUTH satisfiable so the prod backend can boot
- `b5de98e8` docs(status): flag that the LLM-backed grades were never tested end-to-end
- `5ad741e1` docs(status): add whole-application audit and one-week ship plan
