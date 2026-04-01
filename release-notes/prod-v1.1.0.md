# prod-v1.1.0

> Release Notes for Version prod-v1.1.0

_Generated on 2026-04-01 from `prod-v1.0.0..HEAD` (24 commits)._

## Summary
This release introduces significant enhancements in functionality, testing coverage, and code quality. Key features include improved user flows, expanded testing capabilities, and various optimizations across the frontend and backend.

## Highlights
- Enhanced user flow for login, search, document access, and chat functionality.
- Increased test coverage across frontend and backend components.
- Refactored code for better modularity and maintainability.

## New Features
- Added parsing utilities, header components, and Supabase client singleton.
- Introduced an API client, i18n translations, and build optimizations.
- Improved dashboard with rich statistics and branding.
- Added precomputed dashboard statistics tables and refresh function.
- Implemented Discord webhook notifications for build and deploy.

## Improvements
- Refactored the dashboard stats to utilize precomputed tables.
- Simplified date filter guard clause in useGraphData.

## Testing Enhancements
- Added 39 Playwright E2E tests for search, chat, and documents.
- Increased unit test coverage from 6% to 21% in the frontend and from 41% to 65% in the backend.
- Fixed broken test suites and updated test markers.

## Bug Fixes
- Eliminated stale closure race condition in useChatLogic.
- Handled invalid dates, improved YAML export, and fixed streaming animation.
- Resolved 18 bugs identified through test coverage analysis.

## Code Quality and Refactoring
- Split large files into domain-specific modules for better organization.
- Conducted a comprehensive audit of security, CI, testing, Docker, and code quality.

## Source Commits
- `9ec4429` test(e2e): add critical user flow — login → search → document → chat (#62)
- `e593b0c` refactor: split 3 largest files into domain-specific modules (#59 phase 1)
- `1bf82f2` fix(frontend): eliminate stale closure race condition in useChatLogic
- `34781e9` fix: comprehensive repo audit — security, CI, testing, Docker, and code quality
- `4a1e783` refactor(frontend): simplify date filter guard clause in useGraphData
- `4036258` test(frontend): add 39 Playwright E2E tests for search, chat, documents
- `54d9df5` test(frontend): add 1238 unit tests (6% → 21% coverage)
- `86d8bbe` test: add 1572 backend unit tests (41% → 65% coverage)
- `aaa28b1` test: fix broken test suites and update test markers
- `9d37db8` fix(frontend): handle invalid dates, improve YAML export, fix streaming animation
- `2d5ab78` fix: resolve 18 bugs found via test coverage analysis
- `8d7b90c` style: standardize whitespace and indentation in error handlers and test config
- `690e9ef` feat(frontend): add parsing utilities, header components, and Supabase client singleton
- `0625c93` chore(gitignore): exclude deploy history and test query artifacts
- `75e26de` feat(frontend): add API client, i18n translations, and build optimizations
- `0ae04e5` chore: track previously-ignored api-client test file
- `53b5384` fix(gitignore): track 169 untracked frontend/lib source files
- `4460ec8` fix(frontend): repair 14 failing test suites (39/39 passing, 355 tests)
- `cf23ca3` feat(scripts): add Discord webhook notifications for build and deploy
- `de93079` chore(i18n): remove Arabic and Hebrew translations
- `7858d04` feat(frontend): improve dashboard with rich stats, i18n, and Juddges branding
- `5bd00b7` feat(backend): refactor dashboard stats to use precomputed tables
- `dee2066` feat(db): add precomputed dashboard statistics tables and refresh function
- `1c95523` chore: track frontend i18n and API library directories
