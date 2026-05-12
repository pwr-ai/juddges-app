# prod-v1.1.2

> Release Notes for Version 1.1.2

_Generated on 2026-05-12 from `prod-v1.1.1..HEAD` (15 commits)._

## Summary
This release includes enhancements to the search functionality, various refactoring efforts, and updates to documentation and platform summaries.

## Highlights
- Introduced topic-aware autocomplete with criminal-case chips and analytics.
- Implemented facet-based topic/keyword autocomplete with a hybrid fallback.
- Updated the memory limit for backend workers to improve performance.

## Search Enhancements
- Switched autocomplete to judgment-based suggestions.
- Added topic-aware autocomplete with criminal-case chips and analytics.
- Implemented facet-based topic/keyword autocomplete with a hybrid 400 fallback.

## Infrastructure Updates
- Added missing Redis service to Docker Compose.
- Bumped backend worker memory limit to 8G (reservation 4G).

## Documentation and Cleanup
- Removed AI Assistant mentions from platform summary and ecosystem copy.
- Dropped AI Assistant FAQ category and related chat-data mentions.
- Removed AI Assistant link from the footer and chat capability card from the landing page.

## Test Improvements
- Repaired the main test suite following recent search refactors.

## Source Commits
- `52d3e8c` chore(release): bump version to 1.1.2
- `b7ec6d5` refactor(search): switch autocomplete to judgment-based suggestions
- `7b13d99` feat(search): topic-aware autocomplete with criminal-case chips + analytics (#207)
- `7173963` fix(prod): add missing redis service to docker-compose
- `383c37d` chore: move unite-search paper out of app repo
- `ae7496c` feat(search): facet-based topic/keyword autocomplete + hybrid 400 fallback
- `ef461c0` chore(ops): bump backend-worker memory limit to 8G (reservation 4G)
- `d584c0c` chore(about): remove RAG chat from platform summary
- `d320810` chore(ecosystem): remove RAG chat mentions from platform copy
- `9fbe432` chore(help): drop AI Assistant FAQ category and chat-data mention
- `2012ef7` chore(404): drop AI Assistant shortcut, keep Search
- `b906240` chore(footer): remove AI Assistant link
- `78c5d8c` chore(landing): drop AI chat capability card and copy mention
- `551c7ec` release: prod-v1.1.1 (#205)
- `14fb7a1` fix(tests): repair main test suite after recent search refactors (#204)
