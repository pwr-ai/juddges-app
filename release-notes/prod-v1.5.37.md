# prod-v1.5.37

> Release Notes for Version prod-v1.5.37

_Generated on 2026-11-23 from `prod-v1.5.36..HEAD` (7 commits)._

## Summary
This release includes important documentation updates and several fixes to enhance functionality and user experience.

## Highlights
- Improved documentation for release notes and Dockerfile context.
- Fixed issues related to changelog and version rendering.
- Enhanced job listing and dataset comparison features.

## Documentation Updates
- Documented the release-notes build context and logging for missing directories in the frontend.
- Updated the Dockerfile to include documentation for the release-notes build context.

## Fixes
- Ensured release notes are included in the frontend image.
- Fixed rendering of the 404 page for unknown versions.
- Updated the publications API to list extraction jobs and display linked resources by name.
- Formatted dataset comparison statistics with a fixed locale.
- Adjusted blog admin functionality to limit posts displayed to 100.

## Source Commits
- `e01c93ac` docs(frontend): document release-notes build context and log missing dir once
- `f80391fa` docs(frontend): document the release-notes build context in the Dockerfile
- `478be335` fix(changelog): ship release notes in the frontend image
- `05301d55` fix(changelog): render the 404 page for unknown versions
- `16811d49` fix(publications): list extraction jobs from /api/jobs and show linked resources by name
- `6f0be1e2` fix(dataset-comparison): format stat numbers with a fixed locale
- `dbe1cfce` fix(blog-admin): page admin posts at the backend limit cap of 100
