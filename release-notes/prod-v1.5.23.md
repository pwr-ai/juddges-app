# prod-v1.5.23

> Release Notes for Version prod-v1.5.23

_Generated on 2026-10-28 from `prod-v1.5.22..HEAD` (2 commits)._

## Summary
This release includes improvements to our CI configuration and enhancements to the extraction process.

## Highlights
- Optimized CI caching for faster builds.
- Improved prompt rendering in extraction using langchain's jinja2 sandbox.

## CI Improvements
- Cached only the in-project virtual environment, reducing unnecessary cache size.

## Extraction Enhancements
- Prompts are now rendered under langchain's jinja2 sandbox for improved security and flexibility.

## Source Commits
- `333f7e9c` ci: cache only the in-project venv, not all of ~/.cache/pypoetry
- `2a18f1c4` fix(extraction): render prompts under langchain's jinja2 sandbox
