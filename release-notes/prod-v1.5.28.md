# prod-v1.5.28

> Release Notes for Version prod-v1.5.28

_Generated on 2026-10-29 from `prod-v1.5.27..HEAD` (7 commits)._

## Summary
This release includes enhancements to data ingestion and member timeline pagination, along with important fixes and documentation updates.

## Highlights
- Improved member timeline pagination to handle 100 entries at a time.
- Enhanced data ingestion capabilities for CHF judgments.
- Documentation updated for the halfvec chunk vector index.

## Enhancements
- Paginated member timeline to display 100 entries at a time.
- Ingested CHF judgments from the JuDDGES extraction set.

## Fixes
- Resolved issues with small chunk inserts to prevent truncated chunk sets.
- Ensured that chunks are never saved without embeddings.
- Fixed pagination for member fetches and batch ID lookups.

## Documentation
- Updated documentation for the halfvec chunk vector index.

## Performance Improvements
- Implemented halfvec HNSW index for document chunks.

## Source Commits
- `7e966399` fix(ingest): small chunk inserts, no truncated chunk sets
- `cc81e09a` feat(reasoning-lines): paginate member timeline, 100 at a time
- `ec223e91` docs: document the halfvec chunk vector index
- `81e5a36e` fix(ingest): never save chunks without embeddings
- `4a442868` fix(reasoning-lines): page member fetches and batch id lookups
- `6c1bf2cf` feat(ingest): ingest CHF judgments from the JuDDGES extraction set
- `d2fb4b9a` perf(db): halfvec HNSW index for document_chunks
