# prod-v1.1.4

> Release Notes for Version prod-v1.1.4

_Generated on 2026-05-12 from `prod-v1.1.3..HEAD` (12 commits)._

## Summary
This release introduces new features and improvements to enhance document handling and metadata management.

## Highlights
- Added support for base fields in document types and models.
- Refactored document field metadata for better organization.
- Improved document request schemas with new flags.

## New Features
- Added `base_fields` to the `SearchDocument` type.
- Exposed `base_fields` opt-in on document GET and batch endpoints.
- Introduced `_extract_base_fields` helper for document responses.
- Added `include_base_fields` flag to document request schemas.
- Added `base_fields` to the `LegalDocument` model.
- Surface `base_*` extraction fields on the document page.

## Refactoring and Improvements
- Extracted document field metadata into a shared module.

## Chores and Maintenance
- Dropped the dead `/dashboard/recent-documents` endpoint.
- Updated `.gitignore` to exclude `docs/superpowers` and untracked existing plans/specs.

## Bug Fixes
- Updated query to use judgments table instead of legacy `legal_documents`.
- Removed body width clamp on `/documents/[id]`.

## Source Commits
- `893d8b2` feat(frontend): add base_fields to SearchDocument type
- `9466dd4` refactor(frontend): extract document field metadata into shared module
- `7308c9a` chore(dashboard): drop dead /dashboard/recent-documents endpoint
- `282d83c` test(backend): cover include_base_fields flag on document endpoints
- `aa802b4` feat(backend): expose base_fields opt-in on document GET and batch endpoints
- `7eaa1ed` feat(backend): add _extract_base_fields helper for document responses
- `e73f320` feat(backend): add include_base_fields flag to document request schemas
- `00320a1` chore: gitignore docs/superpowers and untrack existing plans/specs
- `8c92936` fix(documents): query judgments table instead of legacy legal_documents
- `00331ea` feat(backend): add base_fields to LegalDocument model
- `9bcf738` fix(documents): stop body width clamp on /documents/[id]
- `eb370b7` feat(documents): surface base_* extraction fields on document page
