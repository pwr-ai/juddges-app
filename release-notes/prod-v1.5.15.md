# prod-v1.5.15

> Release Notes for Version prod-v1.5.15

_Generated on 2026-10-14 from `prod-v1.5.14..HEAD` (6 commits)._

## Summary
This release includes important fixes and improvements to enhance the functionality and stability of the application.

## Highlights
- Improved search and health/status serialization
- Enhanced frontend configuration for runtime
- Updated Node version in environment settings
- Documentation for extraction implementation plan

## Improvements and Fixes
- Repair facets RPC and health/status serialization
- Make NEXT_PUBLIC_* true runtime configuration
- Stop SSR crash in highlight sanitizer without a DOM

## Testing Enhancements
- Provide inert Supabase environment defaults in Jest setup

## Chore
- Pin Node 22 in .nvmrc

## Documentation
- Add extraction path usable implementation plan

## Source Commits
- `b215daa6` fix(search,health): repair facets RPC and health/status serialization
- `c5f773dd` test(frontend): provide inert Supabase env defaults in jest setup
- `d33f0f4d` fix(frontend): make NEXT_PUBLIC_* true runtime configuration
- `e8d67a3b` chore: pin Node 22 in .nvmrc
- `f7f67abf` fix(frontend): stop SSR crash in highlight sanitizer without a DOM
- `47deb4a8` docs(extraction): add extraction path usable implementation plan
