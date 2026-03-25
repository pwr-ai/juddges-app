# prod-v1.0.0

> Release Notes for Version prod-v1.0.0

_Generated on 2026-03-25 from `prod-v0.1.3..HEAD` (47 commits)._

## Summary
This release introduces significant enhancements to our analysis and ingestion capabilities, alongside improvements to the frontend experience and documentation. Below are the key highlights and changes made in this version.

## Highlights
- Added batch extraction pipeline using Anthropic Message Batches API.
- Introduced Polish judgment dataset curation pipeline and guide.
- Enhanced public demo experience with streamlined flows and stability.
- Expanded error handling in the backend with new exception classes.

## New Features
- Added batch extraction pipeline using Anthropic Message Batches API.
- Added search quality evaluation with multi-source queries.
- Introduced Polish judgment dataset curation pipeline.
- Added search benchmark script with latency targets.
- Implemented cross-jurisdictional query generation from UK topics.
- Added UK topic analysis pipeline with BERTopic.
- Enhanced public demo experience with streamlined flows.
- Added batch base-schema extraction script for demo prep.
- Introduced BGE-M3 re-embedding scripts with single and dual-GPU support.
- Added deep analysis prompts and schemas for EN/PL judgments.
- Migrated embeddings from OpenAI to BAAI/bge-m3.

## Improvements
- Stabilized public search flow for demo usage.
- Simplified frontend test suites and reduced boilerplate.
- Updated environment and Docker configuration.
- Refocused core components on judgment content.

## Documentation Updates
- Added Polish judgment dataset curation guide.
- Consolidated styling guide and added manual testing checklist.
- Merged deployment guides and fixed broken frontend README link.

## Refactoring
- Updated UI components for feature cleanup.
- Removed legacy components, types, and utilities.
- Simplified admin panel navigation.

## Source Commits
- `bdc6772` docs: add Polish judgment dataset curation guide
- `b923e5f` build: add Dockerfile for running analysis and ingestion scripts
- `3ffa862` feat(scripts): add batch extraction pipeline using Anthropic Message Batches API
- `2d3505a` feat(scripts): add search quality evaluation with multi-source queries (#13)
- `c8285df` feat(scripts): add Polish judgment dataset curation pipeline (#12)
- `aa358d7` feat(scripts): add search benchmark script with latency targets (#31)
- `f5c65df` feat(scripts): add cross-jurisdictional query generation from UK topics (#11)
- `7e789f1` feat(scripts): add checkpoint/resume and batch optimization to ingestion (#29)
- `3a28065` feat(scripts): add UK topic analysis pipeline with BERTopic (#10)
- `0d1c6e4` feat(frontend): polish judgment detail experience for demo (#35)
- `5e13d54` feat(frontend): stabilize public search flow for demo usage (#34)
- `496bde3` feat(scripts): add batch base-schema extraction script for demo prep
- `ca8bd07` docs: add v1 demo release planning and update test documentation
- `18183b2` refactor(tests): simplify frontend test suites and reduce boilerplate
- `b6b1954` feat(frontend): streamline public demo experience
- `9cc5237` feat(frontend): support batch document_ids in base-schema extraction endpoint
- `3831a8d` fix(frontend): guard against malformed dates and null metadata
- `149488f` fix(frontend): fix null query param coercion and lazy-init backend config
- `7947d79` feat(tests): add local test profile system for fast selective test runs
- `689e3f7` fix(tests): align backend test expectations with current API behavior
- `e876e0f` fix(schema-generator): handle None assessment results and add prompt key aliases
- `c5fe6d0` feat(backend): expand error handling with new exception classes and error codes
- `427cfb4` feat(scripts): add BGE-M3 re-embedding scripts with single and dual-GPU support
- `5fe0d00` feat(scripts): add batch runners for structural segmentation and deep analysis extraction
- `dad99ad` feat(extraction): add deep analysis prompts and schemas for EN/PL judgments
- `acffb5c` feat(extraction): add structural segmentation prompts and schemas for EN/PL judgments
- `d432753` feat(db): add structural segmentation and deep analysis columns to judgments table
- `165b021` chore: add .claude/ to gitignore
- `c1c6580` docs: consolidate styling guide, add manual testing checklist
- `67f56e8` docs: merge deployment guides and fix broken frontend README link
- `6cbad9f` chore: add minio-sync and worktrees to gitignore
- `dc28e80` feat(embeddings): migrate from OpenAI text-embedding-3-small (768d) to BAAI/bge-m3 (1024d)
- `6aa7068` feat(embeddings): add HuggingFace BGE-M3 embedding provider
- `4c3f9ae` feat(extraction): add checkpoint/resume and completion report to batch extraction script
- `f7c2f52` refactor(config): update environment and Docker configuration
- `35902ce` refactor(styles): update search and document card styling
- `3f1c1c9` refactor(pages): update pages to remove deprecated feature references
- `f352457` refactor(components): update UI components for feature cleanup
- `00c0fb2` refactor(hooks): update hooks to remove legacy feature references
- `be55d45` refactor(types): update type definitions for judgment-focused platform
- `2ec4656` refactor(admin): simplify admin panel navigation
- `e34d402` refactor(ui): refocus core components on judgment content
- `1d05d48` refactor(frontend): simplify service worker and remove offline support
- `3d476c4` refactor(frontend): remove legacy components, types, and utilities
- `52ee81e` refactor(frontend): remove legacy feature pages and API routes
- `b3b67fd` chore: update gitignore and move research artifacts to .context
- `3b514a3` docs: add AGENTS.md symlink to CLAUDE.md
