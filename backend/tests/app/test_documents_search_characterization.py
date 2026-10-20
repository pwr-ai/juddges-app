"""Characterization tests for the ``POST /documents/search`` route handler.

These pin what ``search_documents`` does *today*, with every boundary mocked,
so the pipeline body can be moved out of ``app/judgments_pkg/__init__.py``
without silently changing behavior. ``tests/app/test_documents_search.py`` is
not a substitute: it is integration-only and never runs under ``pytest -m unit``.

Where a behavior looks wrong it is pinned as-is and flagged ``CHARACTERIZATION``
in the test docstring; do not "fix" the assertion without fixing the code.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.judgments_pkg import search_documents, search_documents_legacy
from app.judgments_pkg.search import _validate_search_query as REAL_VALIDATE
from app.models import (
    DocumentRetrievalRequest,
    PaginationMetadata,
    SearchChunksRequest,
    SearchChunksResponse,
)
from app.services.search import SearchServiceError

# Task 7 moves the pipeline body into app/judgments_pkg/search.py. When it
# does, this constant is the ONLY line in this file that may change — every
# assertion below must still hold, or the move changed behavior.
SEARCH_MODULE = "app.judgments_pkg.search"
# The source-module patches below (app.search_cache.*, app.services.search_cache.*,
# app.sentry.capture_exception, app.search_telemetry.record_search,
# app.services.search.MeiliSearchService) are move-proof ONLY while Task 7 keeps
# those imports inside the function body. If they are hoisted to module level the
# real functions would run, and negative assertions such as
# `not called("set_cached_results")` could then pass vacuously.

# The 14 helpers the body calls, in the order they are listed in the module.
HELPERS = (
    "_validate_search_query",
    "_prepare_search_queries",
    "_route_effective_alpha",
    "_generate_search_embedding",
    "_detect_search_language",
    "_build_search_rpc_params",
    "_get_search_client",
    "_run_hybrid_search",
    "_run_zero_result_fallbacks",
    "_rerank_if_enabled",
    "_build_search_result_payload",
    "_get_estimated_total",
    "_build_search_timing_breakdown",
    "_build_search_pagination",
)

EFFECTIVE_FILTERS = {"jurisdictions": ["PL"], "court_names": None}
RAW_RESULTS = [{"id": "raw-1"}]
RERANKED_RESULTS = [{"id": "reranked-1"}, {"id": "reranked-2"}]
FALLBACK_RESULTS = [{"id": "fallback-1"}]
CHUNK = {
    "document_id": "doc-1",
    "chunk_id": 0,
    "chunk_text": "text",
    # Read by the telemetry preview; a chunk dict has no "score" key.
    "combined_score": 0.75,
}
TIMING = {"search_ms": 12.34, "marker": "timing-stub"}
SUPABASE = object()


class Harness:
    """Records helper calls and holds the knobs each test turns."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.args: dict[str, list[tuple[tuple, dict]]] = {}
        self.hybrid_results: list[dict] = list(RAW_RESULTS)
        self.rerank_results: list[dict] = list(RERANKED_RESULTS)
        self.cached_results: list[dict] | None = None
        self.cached_search: SearchChunksResponse | None = None
        self.cached_search_error: Exception | None = None
        self.fallback_return: tuple = (
            list(FALLBACK_RESULTS),
            5.0,
            True,
            "relaxed",
            "fallback query",
            True,
        )
        self.raise_in: dict[str, Exception] = {}
        self.meili_calls: list[dict] = []
        self.meili_response: dict | Exception = {}

    def record(self, name: str, *a: Any, **kw: Any) -> None:
        self.calls.append(name)
        self.args.setdefault(name, []).append((a, kw))
        if name in self.raise_in:
            raise self.raise_in[name]

    def called(self, name: str) -> bool:
        return name in self.calls

    def helper_calls(self) -> list[str]:
        return [c for c in self.calls if c in HELPERS]


@pytest.fixture
def h(monkeypatch: pytest.MonkeyPatch) -> Harness:
    hx = Harness()

    def sync(name: str, ret: Any):
        def fn(*a: Any, **kw: Any) -> Any:
            hx.record(name, *a, **kw)
            return ret() if callable(ret) else ret

        return fn

    def asyn(name: str, ret: Any):
        async def fn(*a: Any, **kw: Any) -> Any:
            hx.record(name, *a, **kw)
            return ret() if callable(ret) else ret

        return fn

    def patch_pkg(name: str, fn: Any) -> None:
        monkeypatch.setattr(f"{SEARCH_MODULE}.{name}", fn)

    patch_pkg("_validate_search_query", sync("_validate_search_query", None))
    patch_pkg(
        "_prepare_search_queries",
        asyn(
            "_prepare_search_queries",
            lambda: (
                "semantic q",
                "keyword q",
                "enhanced q",
                {"inferred": True},
                7.0,
                "llm",
                dict(EFFECTIVE_FILTERS),
            ),
        ),
    )
    patch_pkg(
        "_route_effective_alpha",
        sync("_route_effective_alpha", ("keyword", 0.4, True)),
    )
    patch_pkg(
        "_generate_search_embedding",
        asyn("_generate_search_embedding", ([0.1, 0.2], 1.5, False)),
    )
    patch_pkg("_detect_search_language", sync("_detect_search_language", "pl"))
    patch_pkg(
        "_build_search_rpc_params",
        sync("_build_search_rpc_params", {"rpc": "params"}),
    )
    patch_pkg("_get_search_client", asyn("_get_search_client", SUPABASE))
    patch_pkg(
        "_run_hybrid_search",
        asyn("_run_hybrid_search", lambda: (list(hx.hybrid_results), 12.34)),
    )
    patch_pkg(
        "_run_zero_result_fallbacks",
        asyn("_run_zero_result_fallbacks", lambda: hx.fallback_return),
    )
    patch_pkg(
        "_rerank_if_enabled",
        asyn("_rerank_if_enabled", lambda: (list(hx.rerank_results), 3.0)),
    )
    patch_pkg(
        "_build_search_result_payload",
        sync("_build_search_result_payload", lambda: ([dict(CHUNK)], [])),
    )
    patch_pkg("_get_estimated_total", asyn("_get_estimated_total", 42))
    patch_pkg(
        "_build_search_timing_breakdown",
        sync("_build_search_timing_breakdown", lambda: dict(TIMING)),
    )
    patch_pkg(
        "_build_search_pagination",
        sync(
            "_build_search_pagination",
            lambda: PaginationMetadata(
                offset=0, limit=20, loaded_count=1, has_more=False
            ),
        ),
    )

    # Imported inside the body at call time: patch at the real home.
    monkeypatch.setattr(
        "app.services.search_cache.get_cached_results",
        asyn("get_cached_results", lambda: hx.cached_results),
    )
    monkeypatch.setattr(
        "app.services.search_cache.set_cached_results",
        asyn("set_cached_results", None),
    )

    async def get_cached_search(*a: Any, **kw: Any) -> Any:
        hx.record("get_cached_search", *a, **kw)
        if hx.cached_search_error is not None:
            raise hx.cached_search_error
        return hx.cached_search

    monkeypatch.setattr("app.search_cache.get_cached_search", get_cached_search)
    monkeypatch.setattr(
        "app.search_cache.set_cached_search", asyn("set_cached_search", None)
    )
    monkeypatch.setattr(
        "app.search_telemetry.record_search", sync("record_search", None)
    )
    monkeypatch.setattr("app.sentry.capture_exception", sync("capture_exception", None))

    class FakeMeili:
        @classmethod
        def from_env(cls) -> FakeMeili:
            hx.record("meili_from_env")
            return cls()

        async def search(self, **kw: Any) -> dict:
            hx.meili_calls.append(kw)
            hx.record("meili_search", **kw)
            if isinstance(hx.meili_response, Exception):
                raise hx.meili_response
            return hx.meili_response

    monkeypatch.setattr("app.services.search.MeiliSearchService", FakeMeili)
    return hx


def make_request(**kw: Any) -> SearchChunksRequest:
    kw.setdefault("query", "kradzież z włamaniem")
    return SearchChunksRequest(**kw)


# 1 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_blank_query_is_rejected_with_400_before_any_work() -> None:
    """Uses the real validator and no stubs: nothing may be reached."""
    with pytest.raises(HTTPException) as exc:
        await search_documents(SearchChunksRequest(query="   "))
    assert exc.value.status_code == 400
    assert exc.value.detail == "Query cannot be empty"


@pytest.mark.unit
async def test_blank_query_never_reaches_pipeline_helpers(
    h: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Real validator restored; everything after it is a recording stub.
    _validate_search_query = REAL_VALIDATE

    monkeypatch.setattr(
        f"{SEARCH_MODULE}._validate_search_query", _validate_search_query
    )
    with pytest.raises(HTTPException) as exc:
        await search_documents(SearchChunksRequest(query="   "))
    assert exc.value.status_code == 400
    assert h.calls == []  # not even the cache lookup


# 2 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_facets_only_fast_path_proxies_meilisearch(h: Harness) -> None:
    h.meili_response = {
        "processingTimeMs": 4,
        "facetDistribution": {"court_name": {"SN": 3}},
        "facetStats": {"year": {"min": 1990, "max": 2020}},
    }
    req = make_request(
        query="",
        facets=["court_name"],
        facet_query="S",
        limit_docs=5,
        offset=10,
    )
    resp = await search_documents(req)

    assert h.meili_calls == [
        {
            "query": "",
            "limit": 5,
            "offset": 10,
            "facets": ["court_name"],
            "facet_query": "S",
        }
    ]
    assert not h.called("_run_hybrid_search")
    assert h.helper_calls() == []
    assert not h.called("get_cached_search")
    assert resp.chunks == []
    assert resp.total_chunks == 0
    assert resp.unique_documents == 0
    assert resp.query_time_ms == 4
    assert resp.facetDistribution == {"court_name": {"SN": 3}}
    assert resp.facetStats == {"year": {"min": 1990, "max": 2020}}


@pytest.mark.unit
async def test_facets_fast_path_triggers_on_whitespace_query(h: Harness) -> None:
    h.meili_response = {"facetDistribution": {"a": {"x": 1}}}
    resp = await search_documents(make_request(query="   ", facets=["a"]))
    assert h.called("meili_search")
    assert not h.called("_run_hybrid_search")
    assert resp.facetDistribution == {"a": {"x": 1}}
    assert resp.query_time_ms is None


@pytest.mark.unit
async def test_facets_fast_path_swallows_meili_failure(h: Harness) -> None:
    h.meili_response = SearchServiceError("meili down")
    resp = await search_documents(make_request(query="", facets=["a"]))
    assert resp.chunks == []
    assert resp.facetDistribution is None
    assert resp.facetStats is None
    assert resp.query_time_ms is None
    assert not h.called("_run_hybrid_search")


@pytest.mark.unit
def test_limit_docs_zero_is_rejected_by_the_request_model() -> None:
    """CHARACTERIZATION: the facets-only comments describe ``limit_docs=0``, but
    ``SearchChunksRequest.limit_docs`` is ``ge=1``, so that request cannot be
    built (HTTP callers get 422). The ``max(request.limit_docs, 0)`` branch in
    the fast path is therefore dead for ``0``; the smallest real value is 1."""
    with pytest.raises(ValidationError):
        SearchChunksRequest(query="", facets=["a"], limit_docs=0)


# 3 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_facets_with_real_query_runs_full_pipeline_not_fast_path(
    h: Harness,
) -> None:
    resp = await search_documents(make_request(query="vat", facets=["court_name"]))

    assert h.called("_run_hybrid_search")
    assert not h.called("meili_from_env")
    assert not h.called("meili_search")
    assert h.meili_calls == []
    assert resp.total_chunks == 1


# 4 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_happy_path_builds_response_from_helper_outputs(h: Harness) -> None:
    resp = await search_documents(make_request(limit_docs=20, offset=0))

    assert isinstance(resp, SearchChunksResponse)
    assert [c.document_id for c in resp.chunks] == ["doc-1"]
    assert resp.documents == []
    assert resp.total_chunks == 1
    assert resp.unique_documents == 0
    assert resp.query_time_ms == 12.34
    assert resp.timing_breakdown == TIMING
    assert resp.pagination == PaginationMetadata(
        offset=0, limit=20, loaded_count=1, has_more=False
    )
    assert resp.query_analysis_source == "llm"
    # rabbit mode: the thinking-only fields are withheld.
    assert resp.query_enhancement_used is False
    assert resp.enhanced_query is None
    assert resp.semantic_query is None
    assert resp.keyword_query is None
    assert resp.inferred_filters is None


@pytest.mark.unit
async def test_happy_path_helper_order(h: Harness) -> None:
    await search_documents(make_request())

    assert h.helper_calls() == [
        "_validate_search_query",
        "_prepare_search_queries",
        "_route_effective_alpha",
        "_generate_search_embedding",
        "_detect_search_language",
        "_build_search_rpc_params",
        "_get_search_client",
        "_run_hybrid_search",
        "_rerank_if_enabled",
        "_build_search_result_payload",
        "_get_search_client",  # second client for the estimated total
        "_get_estimated_total",
        "_build_search_timing_breakdown",
        "_build_search_pagination",
        # Second call: the telemetry block computes `language=` of its own.
        "_detect_search_language",
    ]
    # cache read bookends the pipeline, cache write follows it
    assert h.calls.index("get_cached_search") < h.calls.index("_prepare_search_queries")
    assert h.calls[-1] == "set_cached_search"


@pytest.mark.unit
async def test_happy_path_passes_values_between_helpers(h: Harness) -> None:
    req = make_request(limit_docs=7, offset=3, alpha=0.9, result_view="full")
    resp = await search_documents(req)

    # full-response cache: request-only key, user_id passed as keyword None
    ((a, kw),) = h.args["get_cached_search"]
    assert a == (req,) and kw == {"user_id": None}
    ((a, kw),) = h.args["set_cached_search"]
    assert len(a) == 2 and a[0] is req and a[1] is resp
    assert kw == {"user_id": None}
    # results cache: keyed on the keyword query, effective filters, alpha, paging
    ((_, kw),) = h.args["get_cached_results"]
    assert kw == {
        "query": "keyword q",
        "filters": EFFECTIVE_FILTERS,
        "alpha": 0.4,
        "limit": 7,
        "offset": 3,
    }
    ((_, kw),) = h.args["set_cached_results"]
    assert kw["filters"] == EFFECTIVE_FILTERS
    assert kw["limit"] == 7 and kw["offset"] == 3

    ((a, _),) = h.args["_prepare_search_queries"]
    assert a == (req, req.query)
    ((a, _),) = h.args["_route_effective_alpha"]
    assert a == (req.query, 0.9)
    ((a, _),) = h.args["_generate_search_embedding"]
    assert a == ("semantic q", 0.4)  # routed alpha, semantic query
    ((_, kw),) = h.args["_build_search_rpc_params"]
    assert kw["query_embedding"] == [0.1, 0.2]
    assert kw["keyword_query"] == "keyword q"
    assert kw["effective_alpha"] == 0.4
    assert kw["limit"] == 7
    assert kw["offset"] == 3
    assert kw["query_type"] == "keyword"
    assert kw["ef_search"] == 60  # offset > 0
    # effective filters and search language reach the RPC builder by keyword
    assert kw["effective_filters"] == EFFECTIVE_FILTERS
    assert kw["search_language"] == "pl"
    ((a, _), _second) = h.args["_detect_search_language"]  # 2nd call: telemetry
    assert a == ("keyword q", req.languages, EFFECTIVE_FILTERS["jurisdictions"])
    ((a, _),) = h.args["_run_hybrid_search"]
    assert a == (SUPABASE, {"rpc": "params"})
    ((a, kw),) = h.args["_rerank_if_enabled"]
    assert a == (req.query, RAW_RESULTS) and kw == {"top_k": 7}
    ((a, kw),) = h.args["_build_search_result_payload"]
    assert a == (RERANKED_RESULTS,) and kw == {"result_view": "full"}


@pytest.mark.unit
async def test_ef_search_is_100_on_first_page_and_60_after(h: Harness) -> None:
    await search_documents(make_request(offset=0))
    await search_documents(make_request(offset=5))
    efs = [kw["ef_search"] for _, kw in h.args["_build_search_rpc_params"]]
    assert efs == [100, 60]


@pytest.mark.unit
async def test_estimated_total_only_on_first_page_with_include_count(
    h: Harness,
) -> None:
    await search_documents(make_request(limit_docs=20, offset=0, include_count=True))
    assert h.called("_get_estimated_total")
    ((a, kw),) = h.args["_build_search_pagination"]
    assert a == (0, 20, 2)  # offset, limit, len(reranked results)
    assert kw == {"estimated_total": 42}

    h.calls.clear()
    h.args.clear()
    await search_documents(make_request(offset=5, include_count=True))
    await search_documents(make_request(offset=0, include_count=False))
    assert not h.called("_get_estimated_total")
    assert all(
        kw == {"estimated_total": None} for _, kw in h.args["_build_search_pagination"]
    )


@pytest.mark.unit
async def test_estimated_total_failure_is_swallowed(h: Harness) -> None:
    h.raise_in["_get_estimated_total"] = RuntimeError("count blew up")
    resp = await search_documents(make_request())
    assert h.called("_get_estimated_total")  # the raising stub was reached
    assert resp.total_chunks == 1
    ((_, kw),) = h.args["_build_search_pagination"]
    assert kw == {"estimated_total": None}


@pytest.mark.unit
async def test_results_cache_hit_skips_hybrid_search_and_write(h: Harness) -> None:
    h.cached_results = [{"id": "from-results-cache"}]
    await search_documents(make_request())

    assert not h.called("_run_hybrid_search")
    assert h.helper_calls().count("_get_search_client") == 1  # count client only
    assert not h.called("set_cached_results")
    ((a, _),) = h.args["_rerank_if_enabled"]
    assert a[1] == [{"id": "from-results-cache"}]
    ((_, kw),) = h.args["_build_search_timing_breakdown"]
    assert kw["search_time_ms"] == 0.0


@pytest.mark.unit
async def test_fresh_results_are_written_to_results_cache(h: Harness) -> None:
    await search_documents(make_request())
    ((_, kw),) = h.args["set_cached_results"]
    assert kw["query"] == "keyword q"
    assert kw["results"] == RAW_RESULTS
    assert kw["alpha"] == 0.4


# 5 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_full_response_cache_hit_short_circuits_pipeline(h: Harness) -> None:
    cached = SearchChunksResponse(chunks=[], total_chunks=0, unique_documents=0)
    h.cached_search = cached
    resp = await search_documents(make_request())

    assert resp is cached
    assert h.called("get_cached_search")
    assert not h.called("_prepare_search_queries")
    assert not h.called("_run_hybrid_search")
    assert not h.called("set_cached_search")


# 6 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_cache_lookup_failure_is_swallowed_and_pipeline_runs(
    h: Harness,
) -> None:
    h.cached_search_error = ConnectionError("redis down")
    resp = await search_documents(make_request())

    assert h.called("get_cached_search")  # the raising stub was reached
    assert h.called("_run_hybrid_search")
    assert resp.total_chunks == 1


@pytest.mark.unit
async def test_cache_write_failure_is_swallowed(
    h: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom(*a: Any, **kw: Any) -> None:
        h.record("set_cached_search", *a, **kw)
        raise ConnectionError("redis down")

    monkeypatch.setattr("app.search_cache.set_cached_search", boom)
    resp = await search_documents(make_request())
    assert h.called("set_cached_search")  # the raising stub was reached
    assert resp.total_chunks == 1


# 7 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_thinking_mode_skips_full_response_cache(h: Harness) -> None:
    h.cached_search = SearchChunksResponse(
        chunks=[], total_chunks=0, unique_documents=0
    )
    resp = await search_documents(make_request(mode="thinking"))

    assert not h.called("get_cached_search")
    assert not h.called("set_cached_search")
    assert h.called("_run_hybrid_search")
    assert resp.total_chunks == 1


@pytest.mark.unit
async def test_thinking_mode_exposes_query_analysis_fields(h: Harness) -> None:
    resp = await search_documents(make_request(mode="thinking"))
    assert resp.query_enhancement_used is True
    assert resp.enhanced_query == "enhanced q"
    assert resp.semantic_query == "semantic q"
    assert resp.keyword_query == "keyword q"
    assert resp.inferred_filters == {"inferred": True}


# 8 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_zero_results_in_thinking_mode_trigger_fallbacks(h: Harness) -> None:
    h.hybrid_results = []
    resp = await search_documents(make_request(mode="thinking", limit_docs=9))

    assert h.called("_run_zero_result_fallbacks")
    ((_, kw),) = h.args["_run_zero_result_fallbacks"]
    assert kw["query"] == "kradzież z włamaniem"
    assert kw["semantic_query"] == "semantic q"
    assert kw["keyword_query"] == "keyword q"
    assert kw["search_language"] == "pl"
    assert kw["effective_alpha"] == 0.4
    assert kw["initial_query_embedding"] == [0.1, 0.2]
    assert kw["supabase"] is SUPABASE
    assert kw["limit"] == 9
    assert kw["vector_fallback"] is False
    # fallback results feed the (stubbed) rerank step; time and query are folded in
    ((a, _),) = h.args["_rerank_if_enabled"]
    assert a[1] == FALLBACK_RESULTS
    ((_, tkw),) = h.args["_build_search_timing_breakdown"]
    assert tkw["search_time_ms"] == pytest.approx(12.34 + 5.0)
    assert tkw["fallback_time_ms"] == 5.0
    assert tkw["fallback_used"] is True
    assert tkw["fallback_stage"] == "relaxed"
    assert tkw["vector_fallback"] is True
    assert resp.enhanced_query == "fallback query"
    # fallback results are written to the results cache
    assert h.args["set_cached_results"][0][1]["results"] == FALLBACK_RESULTS


@pytest.mark.unit
async def test_zero_results_in_rabbit_mode_do_not_trigger_fallbacks(
    h: Harness,
) -> None:
    """CHARACTERIZATION: fallbacks are gated on ``mode == "thinking"``; a rabbit
    search with no hits goes straight to rerank with an empty list."""
    h.hybrid_results = []
    await search_documents(make_request(mode="rabbit"))

    assert not h.called("_run_zero_result_fallbacks")
    assert not h.called("set_cached_results")  # empty results are never cached
    ((a, _),) = h.args["_rerank_if_enabled"]
    assert a[1] == []


@pytest.mark.unit
async def test_thinking_mode_with_results_does_not_trigger_fallbacks(
    h: Harness,
) -> None:
    await search_documents(make_request(mode="thinking"))
    assert not h.called("_run_zero_result_fallbacks")


# 9 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_rerank_output_not_search_output_reaches_payload_builder(
    h: Harness,
) -> None:
    await search_documents(make_request(limit_docs=11))

    ((a, kw),) = h.args["_rerank_if_enabled"]
    assert a[1] == RAW_RESULTS  # the search step's output goes in
    assert kw == {"top_k": 11}
    ((a, _),) = h.args["_build_search_result_payload"]
    assert a[0] == RERANKED_RESULTS  # the rerank step's output goes on
    assert h.calls.index("_rerank_if_enabled") < h.calls.index(
        "_build_search_result_payload"
    )
    ((_, tkw),) = h.args["_build_search_timing_breakdown"]
    assert tkw["rerank_time_ms"] == 3.0


# Raise sites spanning the pipeline, all inside the handler's ``try``.
RAISE_SITES = (
    "_prepare_search_queries",
    "_route_effective_alpha",
    "_generate_search_embedding",
    "_detect_search_language",
    "_build_search_rpc_params",
    "get_cached_results",
    "_get_search_client",
    "_run_hybrid_search",
    "set_cached_results",
    "_rerank_if_enabled",
    "_build_search_result_payload",
    "_build_search_timing_breakdown",
    "_build_search_pagination",
)


# 10 ─────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
@pytest.mark.parametrize("site", RAISE_SITES)
async def test_unexpected_error_becomes_500_and_is_reported_to_sentry(
    h: Harness, site: str
) -> None:
    h.raise_in[site] = RuntimeError("boom")
    with pytest.raises(HTTPException) as exc:
        await search_documents(make_request(limit_docs=4))

    assert exc.value.status_code == 500
    assert exc.value.detail.startswith("Search failed:")
    assert "boom" in exc.value.detail
    ((a, kw),) = h.args["capture_exception"]
    assert isinstance(a[0], RuntimeError)
    assert kw == {"query": "kradzież z włamaniem", "limit": 4}
    assert not h.called("set_cached_search")


# 11 ─────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
@pytest.mark.parametrize("site", RAISE_SITES)
async def test_http_exception_from_a_helper_propagates_unwrapped(
    h: Harness, site: str
) -> None:
    h.raise_in[site] = HTTPException(status_code=404, detail="nope")
    with pytest.raises(HTTPException) as exc:
        await search_documents(make_request())

    assert exc.value.status_code == 404
    assert exc.value.detail == "nope"
    assert not h.called("capture_exception")


# 12 ─────────────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_legacy_route_delegates_to_the_search_pipeline(h: Harness) -> None:
    resp = await search_documents_legacy(
        DocumentRetrievalRequest(question="jaka kara za kradzież", mode="rabbit")
    )

    ((a, _),) = h.args["_prepare_search_queries"]
    sent_request, sent_query = a
    assert sent_query == "jaka kara za kradzież"
    assert sent_request.limit_docs == 20
    assert sent_request.api_version == "enhanced"
    assert sent_request.mode == "rabbit"
    assert resp.question == "jaka kara za kradzież"
    assert resp.question_rewritten is None
    assert [c.document_id for c in resp.chunks] == ["doc-1"]
    assert resp.pagination == PaginationMetadata(
        offset=0, limit=20, loaded_count=1, has_more=False
    )


@pytest.mark.unit
async def test_legacy_route_propagates_pipeline_errors(h: Harness) -> None:
    h.raise_in["_run_hybrid_search"] = HTTPException(status_code=503, detail="x")
    with pytest.raises(HTTPException) as exc:
        await search_documents_legacy(DocumentRetrievalRequest(question="q"))
    assert exc.value.status_code == 503


# Telemetry ──────────────────────────────────────────────────────────────────
@pytest.mark.unit
async def test_telemetry_is_recorded_for_a_non_empty_result(h: Harness) -> None:
    """REGRESSION: a search with hits must emit a trace.

    The telemetry block read ``c.document_id`` off chunks that are plain
    ``dict`` s. The ``AttributeError`` was swallowed by the surrounding
    ``except Exception``, so ``record_search`` fired only for a zero-chunk
    result -- the case nobody looks at. Asserting the preview's contents, not
    merely that the call happened, is what makes this catch a reversion: a
    preview built the old way never reaches ``record_search`` at all.
    """
    await search_documents(make_request())
    assert h.called("record_search")
    ((_, kw),) = h.args["record_search"]
    assert kw["hits"] == 1
    assert kw["chunks_preview"] == [{"document_id": "doc-1", "score": 0.75}]
    assert kw["query_type"] == "keyword"
    assert kw["thinking_mode"] is False


@pytest.mark.unit
async def test_telemetry_is_recorded_for_an_empty_result(
    h: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A zero-hit search is the one telemetry most wants: it is a miss."""
    monkeypatch.setattr(
        f"{SEARCH_MODULE}._build_search_result_payload",
        lambda *a, **kw: ([], []),
    )
    await search_documents(make_request())
    assert h.called("record_search")
    ((_, kw),) = h.args["record_search"]
    assert kw["hits"] == 0
    assert kw["chunks_preview"] == []


@pytest.mark.unit
async def test_telemetry_failure_never_breaks_the_search(
    h: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The swallowing except stays: a telemetry outage is not a search outage.

    It is what hid the bug above, so it is pinned deliberately rather than
    removed -- the fix is for the block not to raise, not for a raise to
    propagate.
    """
    monkeypatch.setattr(
        "app.search_telemetry.record_search",
        lambda **kw: (_ for _ in ()).throw(RuntimeError("langfuse down")),
    )
    response = await search_documents(make_request())
    assert response.total_chunks == 1


@pytest.mark.unit
async def test_route_delegates_to_run_document_search(monkeypatch):
    """The HTTP route is a thin delegate, so MCP and HTTP cannot drift."""
    sentinel = object()
    seen: dict[str, Any] = {}

    async def fake_run(request):
        seen["request"] = request
        return sentinel

    # The route resolves the name in the package namespace it is defined in.
    monkeypatch.setattr("app.judgments_pkg.run_document_search", fake_run)

    request = make_request()
    result = await search_documents(request)

    assert result is sentinel
    assert seen["request"] is request
