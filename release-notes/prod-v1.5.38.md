# prod-v1.5.38

> Release Notes for Version prod-v1.5.38

_Generated on 2026-11-23 from `prod-v1.5.37..HEAD` (9 commits)._

## Summary
This release introduces enhancements to reasoning lines and search functionalities, along with improvements to the extractions process.

## Highlights
- Enhanced member judgment loading for reasoning lines.
- Introduced a lazy members endpoint with an include_members flag.
- Improved search functionality with better facet handling.

## Enhancements
- Load member judgments only when the list is expanded for improved performance.
- Added a lazy members endpoint with an include_members flag to optimize data retrieval.

## Search Improvements
- Capped facet fan-out and validated facets to ensure data integrity.
- Served facet queries via facet-search for all callers, enhancing search consistency.

## Extractions Updates
- Scoped facet counts and histograms to a single jurisdiction for better data relevance.
- Parsed facet counts and improved handling of facets and histograms by jurisdiction.

## API Updates
- Regenerated OpenAPI snapshot for facets maxItems to reflect recent changes.

## Source Commits
- `ce02e800` feat(reasoning-lines): load member judgments only when list is expanded
- `971c984c` feat(reasoning-lines): add lazy members endpoint and include_members flag
- `6acab814` chore(api): regenerate OpenAPI snapshot for facets maxItems
- `a7359676` fix(search): cap facet fan-out, validate facets, keep CRLF
- `1cfc9fe2` fix(search): serve facet_query via facet-search for all callers
- `31623c09` fix(extractions): keep CRLF in facets proxy, harden proxy errors, document scope
- `d73ddd96` fix(extractions): parse facet counts and scope facets/histograms by jurisdiction
- `d45027a3` fix(search): pass facets and facet_query through documents search
- `87651034` feat(extractions): scope facet counts and histograms to one jurisdiction
