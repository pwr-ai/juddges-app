# prod-v1.5.7

> Release Notes for Version prod-v1.5.7

_Generated on 2026-09-15 from `prod-v1.5.6..HEAD` (15 commits)._

## Summary
This release includes various improvements, dependency updates, and bug fixes to enhance performance and user experience.

## Highlights
- Updated dependencies for improved stability and performance.
- Fixed issues with rendering and styling in the frontend.
- Enhanced documentation for better guidance.

## Dependency Updates
- Bumped react-intersection-observer in /frontend.
- Updated plotly.js-dist from 3.7.0 to 4.1.0 in /frontend.
- Bumped lucide-react from 0.544.0 to 1.45.0 in /frontend.

## Bug Fixes
- Parsed string pgvector embeddings and embedded the legal question.
- Stopped wrapping colour tokens in oklch() to ensure skeletons render correctly.
- Kept GitHub and LinkedIn marks after the lucide v1 bump.
- Stopped defining components inside render bodies.

## Documentation Improvements
- Noted native-prop passthrough and skeleton re-grade step in design sync documentation.
- Repointed styling link at DESIGN.md in getting started documentation.
- Removed legacy glassmorphism styling guide from frontend documentation.

## Refactoring and Enhancements
- Gave the memos dependencies the compiler can preserve in statistics.
- Failed build.mjs early when converter dependencies are missing.
- Dropped duplicate pyarrow pin in scripts.

## New Features
- Introduced CHF-loan judgments stratified around Dziubak in the ingest process.

## Source Commits
- `9f2f54b9` chore(deps): bump react-intersection-observer in /frontend
- `27414a6c` fix(reasoning-lines): parse string pgvector embeddings and embed the legal question
- `47118042` chore(deps): bump plotly.js-dist from 3.7.0 to 4.1.0 in /frontend
- `84eaa256` fix(css): stop wrapping colour tokens in oklch() so skeletons render
- `c77978fa` fix(icons): keep GitHub and LinkedIn marks after the lucide v1 bump
- `c0b4c73f` docs(design-sync): note native-prop passthrough and skeleton re-grade step
- `26557dbe` chore(design): fail build.mjs early when converter deps are missing
- `459117e0` chore(design): add claude.ai/design sync inputs
- `3ffa8de8` chore(scripts): drop duplicate pyarrow pin
- `24dec2ee` chore(deps): bump lucide-react from 0.544.0 to 1.45.0 in /frontend
- `f33453a1` refactor(statistics): give the memos dependencies the compiler can preserve
- `4a9ee5b5` fix(react): stop defining components inside render bodies
- `4264c40d` docs(getting-started): repoint styling link at DESIGN.md
- `406a37f6` docs(frontend): remove legacy glassmorphism styling guide
- `6ac5f5d8` feat(ingest): CHF-loan judgments stratified around Dziubak
