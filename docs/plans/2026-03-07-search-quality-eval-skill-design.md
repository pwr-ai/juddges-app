# Search Quality Evaluation Skill — Design Document

**Date:** 2026-03-07
**Status:** Implemented
**Skill location:** `~/claude-arsenal/skills/quality/search-quality-eval/`
**Symlink:** `~/.claude/skills/search-quality-eval`

## Problem

Multiple Supabase + Next.js + Python backend projects with search and AI assistants need a systematic way to evaluate, benchmark, and improve search quality across projects.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Discovery | Auto-discovery + config override | Zero-config for standard setups, override for edge cases |
| Test execution | Layered pyramid (SQL → API → Browser) | Full coverage from function-level to user experience |
| LLM judge | Multi-criteria (6 dimensions) | Actionable breakdown of *why* search fails |
| Query generation | Seed + LLM expand (option 4 as future GH issue) | Reliable baseline + long-tail coverage |
| Research | Two-phase (pre-test + post-test) | General best practices + targeted fixes |
| Report output | Markdown + JSON | Human-readable + machine-diffable |
| Improvements | Report + PR | Actionable fixes that can be reviewed |
| Scope | Project-agnostic, user-level skill | Reusable across all search projects |

## Architecture

```
/search-quality-eval invocation
├── Step 1: Auto-Discovery (Grep/Glob/Read → SearchProfile)
├── Step 2: Pre-Test Research (4 parallel WebSearch agents)
├── Step 3: Query Generation (seed extraction + LLM expansion)
├── Step 4: Test Pyramid + LLM Judge
│   ├── Layer 1: SQL function tests (psql/supabase CLI)
│   ├── Layer 2: API endpoint tests (curl/httpie)
│   ├── Layer 3: Browser E2E tests (Claude-in-Chrome)
│   └── LLM Judge: 6-dimension scoring per query-result pair
├── Step 5: Post-Test Research (targeted agents for weaknesses)
└── Step 6: Report + Improvement PR
```

## Judge Scoring

6 dimensions, 1-5 scale, weighted:
- Relevance (0.30), Ranking (0.20), Completeness (0.20)
- Snippet Quality (0.15), Filter Accuracy (0.10), Diversity (0.05)
- Overall: 0-100 score with A-F letter grade

## File Structure

```
~/claude-arsenal/skills/quality/search-quality-eval/
├── SKILL.md                          # Main skill (orchestration)
└── references/
    ├── discovery.md                  # SearchProfile schema + discovery prompt
    ├── query-generation.md           # Seed + expand strategy
    ├── judge.md                      # Multi-criteria evaluation prompt
    ├── research-agents.md            # 4 research agent definitions
    ├── report-template.md            # Report markdown template
    └── results-schema.md             # JSON results schema
```

## Future Work

- [Issue #13](https://github.com/pwr-ai/juddges-app/issues/13): Add real user search logs as query source
