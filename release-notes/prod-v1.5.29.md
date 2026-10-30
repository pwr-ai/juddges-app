# prod-v1.5.29

> Release Notes for Version prod-v1.5.29

_Generated on 2026-10-30 from `prod-v1.5.28..HEAD` (14 commits)._

## Summary
This release includes updates to dependencies, improvements in documentation, and enhancements to the backend setup.

## Highlights
- Regenerated OpenAPI snapshot and types for LangChain 1.x.
- Migrated backend setup from Poetry to uv.
- Updated documentation to reflect changes in dependency management.

## Dependency Updates
- Bumped langchain-core to 1.7.1 and langchain-openai to 1.7.3.
- Moved LangChain and LangGraph to 1.x versions.
- Dropped unused umbrella langchain package.

## Backend Improvements
- Migrated packaging from Poetry to a uv workspace.
- Installed the backend with uv instead of Poetry.
- Created LangGraph checkpoint tables at startup.

## Documentation Enhancements
- Replaced Poetry with uv in backend setup and dependency documentation.
- Noted that checkpoint tables are created at startup.

## Miscellaneous
- Bumped project version and re-locked uv.lock.

## Source Commits
- `932c55ac` chore(api): regenerate OpenAPI snapshot and types for LangChain 1.x (refs #793)
- `d9a7c6bb` docs: replace Poetry with uv in backend setup and dependency docs
- `f7af97ec` chore: replace Poetry commands with uv in scripts and tooling
- `1d66ea73` build(release): bump the [project] version and re-lock uv.lock
- `318bc18f` ci: install and run the backend with uv
- `fd6ab2f0` build(docker): install the backend with uv instead of Poetry
- `c1b2f6d1` fix(ingestion): match EWCA (Crim) citation form in uk classifier
- `cf559431` build(backend): migrate packaging from Poetry to a uv workspace
- `e60646b9` build(deps): bump langchain-core to 1.7.1 and langchain-openai to 1.7.3 (refs #793)
- `282822da` docs(reference): note checkpoint tables are created at startup (refs #793)
- `2081c235` build(deps): drop unused umbrella langchain package (refs #793)
- `6a3a59f6` fix(backend): create LangGraph checkpoint tables at startup (refs #793)
- `6a96fe78` fix(backend): import messages and parsers from langchain_core (refs #793)
- `d5484cb3` build(deps): move LangChain to 1.x and LangGraph to 1.x (refs #793)
