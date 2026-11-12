# prod-v1.5.31

> Release Notes for Version prod-v1.5.31

_Generated on 2026-11-06 from `prod-v1.5.30..HEAD` (10 commits)._

## Summary
This release includes important fixes and improvements to enhance performance and functionality.

## Highlights
- Improved search capabilities with enhanced ranking and rate limiting.
- Optimized database maintenance and deployment configurations.

## Search Enhancements
- Fused keyword and semantic rankings in the backend for improved search results.
- Implemented hybrid search legs over a fixed candidate depth to enhance search accuracy.
- Keyed anonymous search rate limits per visitor, improving resource management.

## Database and Maintenance Improvements
- Ran vacuum_analyze on psycopg 3 to optimize database performance.
- Set hnsw.ef_search in search judgments by embedding for better search efficiency.

## Dependency and Deployment Updates
- Added langchain to ensure the Langfuse callback handler loads correctly.
- Sized Gunicorn workers based on the cgroup CPU limit, capped at 8 for better resource allocation.

## Rate Limiting Adjustments
- Charged default limits on include_router routes to streamline rate limiting processes.

## Precedents Data Filtering
- Filtered court_names and legal_bases on judgments data for improved data accuracy.

## Source Commits
- `be6d88ce` fix(suggestions): use Meili-valid document ids
- `72c68c68` fix(maintenance): run vacuum_analyze on psycopg 3
- `a51e4123` fix(deps): add langchain so Langfuse callback handler loads
- `1f00a849` fix(search): fuse hybrid legs over a fixed candidate depth
- `b0ee4eae` fix(search): fuse keyword and semantic rankings in the backend
- `9e8a7c7a` fix(search): key anonymous search rate limits per visitor, not per BFF container
- `70a82050` fix(db): set hnsw.ef_search in search_judgments_by_embedding
- `46532f26` fix(rate-limit): charge default limits on include_router routes
- `9ffe2a53` fix(precedents): filter court_names and legal_bases on judgments data
- `9caf3b59` fix(deploy): size gunicorn workers from the cgroup CPU limit, capped at 8
