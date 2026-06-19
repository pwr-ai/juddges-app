"""Live end-to-end test engine for the Juddges search backend.

This package exercises a RUNNING backend (local dev or production) that is
wired to REAL Supabase + Meilisearch + TEI embeddings. Every check performs a
real HTTP round-trip and asserts on real judgment documents — this is
end-to-end verification against live data, NOT unit testing.

Read-only by design: only GET and read-only POST endpoints (search / rewrite)
are exercised, so the engine is safe to point at production.

Entry points:
    python -m tests.e2e_live            # run all checks with rich output
    poetry run poe e2e-live             # same, via poe task
    tests/e2e_live/test_e2e_live.py     # gated pytest bridge (RUN_E2E_LIVE=1)
"""

from .engine import Case, CaseContext, CheckResult, SkipCase, run_cases

__all__ = ["Case", "CaseContext", "CheckResult", "SkipCase", "run_cases"]
