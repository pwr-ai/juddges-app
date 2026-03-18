# V1 Demo Release Plan

## Goal

Ship a first public version this week that reliably supports the core journey:

`Landing -> Search -> Judgment detail`

The release should optimize for a credible demo, not for exposing every product area already present in the repository.

## Current Priorities

### P0. Public demo search flow

- Make `/search` accessible without forcing sign-in.
- Keep public navigation focused on the demo-safe path.
- Ensure result cards expose title, court, date, jurisdiction, and document type.
- Verify at least one Polish and one English query work end-to-end.

Related issue:
- `#34 feat(v1): stabilize the public judgment search flow for demo usage`
- Partial scope from `#33 feat(v1): focus homepage and navigation on the public demo journey`

### P0. Demo dataset ingestion reliability

- Harden large ingestion runs with checkpoint/resume, batching, and safe re-runs.
- Use this before attempting bigger PL/UK demo loads.

Related issue:
- `#29 perf: add ingestion script checkpoint/resume and batch optimization for 6K+ documents`

### P0. Base-schema extraction on the demo corpus

This work is not tracked strongly enough yet and should be treated as a release blocker for the demo dataset story.

Required outcome:
- Run base-schema extraction on a large, curated PL/UK demo subset.
- Record completion rate, failed IDs, and rerun path.
- Expose enough extracted fields to support demo explanations and future filtering.

Recommended new GitHub issue:
- `ops(v1): batch-run base schema extraction for the PL/UK demo corpus`

Suggested acceptance criteria:
- A script can select judgments by jurisdiction and extraction status.
- Extraction runs in batches and writes a checkpoint file.
- Failed batches can be retried without restarting from zero.
- A final report shows completed, failed, and skipped documents.

### P1. Judgment detail polish

- Ensure a result opens into a stable, demo-usable detail page.
- Show metadata, readable content, and source context where available.

Related issue:
- `#35 feat(v1): ship a polished judgment detail experience from search results`

### P1. Release smoke checklist

- Write and use a short verification checklist before merging to `main`.

Related issue:
- `#36 chore(v1): add demo smoke verification and release checklist for main`

## Work Sequence For This Week

1. Finish public search flow.
2. Freeze a demo corpus manifest and known-good sample queries.
3. Harden ingestion for repeatable large runs.
4. Run base-schema extraction on the chosen PL/UK subset.
5. Polish judgment detail only where it directly improves the demo.
6. Run the smoke checklist before release.

## Recommended Demo Scope

### Demo-safe surfaces

- `/`
- `/search`
- `/documents/[id]`

### Not promoted publicly in v1

- General extraction UI flows
- Collections
- Schema studio
- Dataset comparison
- Chat and other advanced surfaces unless explicitly verified for the demo branch

## Known-good sample queries

- `frankowicze i abuzywne klauzule`
- `skarga do sądu administracyjnego`
- `murder conviction appeal`
- `consumer protection in financial services`

## Definition Of Ready For Release

- Public users can reach `/search` from the landing page.
- Search returns usable PL and UK results from the chosen demo corpus.
- Opening a result reaches a stable judgment detail page.
- Demo corpus ingestion is repeatable.
- Base-schema extraction has been applied to the demo subset with a recorded completion report.
- Smoke checklist has been executed once against the release candidate.
