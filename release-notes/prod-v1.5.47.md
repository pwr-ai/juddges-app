# prod-v1.5.47

> Release Notes for Version prod-v1.5.47

_Generated on 2026-11-24 from `prod-v1.5.46..HEAD` (5 commits)._

## Summary
This release includes improvements to schema generation, enhancing performance and documentation.

## Highlights
- Enhanced schema generation with new features and optimizations.
- Improved documentation for schema design rules.

## Schema Generation Improvements
- Capped schema generation retries to stay under proxy timeout.
- Introduced flat schemas and extended timeout for large generations.
- Implemented an aggregatable-first prompt, JSON mode, and lossless merge.
- Ensured full existing field definitions are sent to /simple.

## Documentation Updates
- Updated documentation to explain field design rules and handling of missing values.

## Source Commits
- `6fc5d457` fix(schema-gen): cap schema generation retries to stay under proxy timeout
- `cf60bf91` fix(schema-gen): flat schemas and longer timeout for large generations
- `0fae5778` docs(schema-gen): explain field design rules and missing-value handling
- `54017c69` feat(schema-gen): aggregatable-first prompt, JSON mode and lossless merge
- `6a387f38` fix(schema-gen): send full existing field definitions to /simple
