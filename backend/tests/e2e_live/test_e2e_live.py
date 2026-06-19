"""Pytest bridge for the live e2e engine.

This is NOT a unit test. It drives the same cases as ``python -m tests.e2e_live``
against a real running backend + real Supabase corpus, and is SKIPPED unless
``RUN_E2E_LIVE=1`` so normal unit CI stays hermetic and fast.

Run it explicitly:

    RUN_E2E_LIVE=1 BACKEND_API_KEY=... \
      JUDDGES_BENCHMARK_API_URL=http://localhost:8004 \
      poetry run pytest -v -m integration tests/e2e_live/test_e2e_live.py
"""

from __future__ import annotations

import os

import httpx
import pytest

from .cases import build_cases
from .engine import CaseContext, run_cases

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_E2E_LIVE") != "1",
        reason="Set RUN_E2E_LIVE=1 to run the live e2e engine against a real backend",
    ),
]


def _api_url() -> str:
    return (
        os.getenv("JUDDGES_BENCHMARK_API_URL")
        or os.getenv("BENCHMARK_API_URL")
        or "http://localhost:8004"
    ).rstrip("/")


def _api_key() -> str:
    key = os.getenv("BACKEND_API_KEY", "")
    if not key:
        pytest.skip("BACKEND_API_KEY not set")
    return key


@pytest.fixture(scope="module")
def results():
    with httpx.Client(base_url=_api_url(), timeout=60.0) as client:
        ctx = CaseContext(client=client, api_key=_api_key(), limit_docs=50)
        yield run_cases(ctx, build_cases())


def test_no_check_errored(results) -> None:
    errored = [
        f"{r.feature}/{r.name}: {r.message}" for r in results if r.status == "error"
    ]
    assert not errored, "e2e checks errored:\n" + "\n".join(errored)


def test_no_check_failed(results) -> None:
    failed = [
        f"{r.feature}/{r.name}: {r.message}" for r in results if r.status == "fail"
    ]
    assert not failed, "e2e checks failed:\n" + "\n".join(failed)


def test_search_checks_present_and_passing(results) -> None:
    search = [r for r in results if r.feature == "search"]
    assert len(search) >= 5, f"expected >=5 search checks, found {len(search)}"
    bad = [f"{r.name}: {r.message}" for r in search if r.status in ("fail", "error")]
    assert not bad, "search checks not green:\n" + "\n".join(bad)
