# prod-v1.5.30

> Release Notes for Version prod-v1.5.30

_Generated on 2026-10-30 from `prod-v1.5.29..HEAD` (3 commits)._

## Summary
This release focuses on performance improvements across various components, enhancing the efficiency of key operations and data ingestion.

## Highlights
- Improved performance for key resolution off the event loop.
- Optimized unchunked judgments selection via anti-join RPC.
- Enhanced keyset pagination for MeiliSearch full synchronization.

## Performance Improvements
- Resolved keys off the event loop, allowing for one write per key use.
- Selected unchunked judgments via anti-join RPC for better efficiency.
- Implemented keyset pagination for MeiliSearch full sync.

## Source Commits
- `c8f1a285` perf(mcp): resolve keys off the event loop, one write per key use
- `25be8ae5` perf(ingest): select unchunked judgments via anti-join rpc
- `90877932` perf(search): keyset-paginate meilisearch full sync
