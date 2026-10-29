"""End-to-end test cases against a live backend + real Supabase corpus.

Two groups:

1. **search** — 5+ representative Polish legal queries loaded from the shared
   fixture ``tests/fixtures/search_queries.yaml`` (same source the benchmark and
   pytest integration suite use). Each asserts real recall, a live embedding
   path (no silent vector fallback), query-type routing and latency.

2. **features** — every other read-only, prod-safe surface: health, document
   round-trip (the canonical "real Supabase" proof), metadata, similar docs,
   facets, autocomplete, query rewrite, Meili keyword + hybrid search,
   pagination, query-type routing contracts, input validation and auth gating.

All requests are read-only; nothing here mutates state.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
import yaml

from .engine import Case, CaseContext, SkipCase

FIXTURES_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "search_queries.yaml"

# A short, high-recall query used to discover a real document id from the live
# corpus when a dependent check needs one.
DISCOVERY_QUERY = "umowa"

# The MCP check authenticates with a per-user MCP key, not BACKEND_API_KEY.
MCP_KEY_ENV_VAR = "JUDDGES_MCP_KEY"
MCP_QUERY = "zachowek"
MCP_SNIPPET_MAX_CHARS = 600  # mirrors juddges_mcp.tools.search.SNIPPET_CHARS


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
def _detail(ctx: CaseContext, **kv: Any) -> None:
    """Attach structured detail to the currently-running case result."""
    bag = ctx.state.get("_details")
    if isinstance(bag, dict):
        bag.update(kv)


def _tb_get(tb: dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Read the first present, non-null timing-breakdown key (names vary)."""
    for key in keys:
        if tb.get(key) is not None:
            return tb[key]
    return default


def _search(
    ctx: CaseContext, query: str, *, limit_docs: int | None = None, **extra: Any
) -> tuple[dict[str, Any], float]:
    """POST /documents/search with the real request schema. Returns (data, wall_ms).

    Retries ONCE on a transient 5xx (e.g. a Postgres ``statement_timeout`` when
    the shared DB is briefly under load). The retry is intentionally narrow: a
    4xx (contract error) or a second 5xx is NOT swallowed, and the attempt count
    is recorded so a flaky backend is still visible in the report.
    """
    body: dict[str, Any] = {
        "query": query,
        "limit_docs": limit_docs or ctx.limit_docs,
        "include_count": True,
    }
    body.update(extra)

    last_exc: httpx.HTTPStatusError | None = None
    for attempt in (1, 2):
        t0 = time.perf_counter()
        resp = ctx.post("/documents/search", json=body, timeout=90.0)
        wall_ms = (time.perf_counter() - t0) * 1000
        if resp.status_code < 500:
            resp.raise_for_status()
            if attempt > 1:
                _detail(ctx, retried_after_5xx=True)
            return resp.json(), wall_ms
        # Transient server error — capture and retry once.
        last_exc = httpx.HTTPStatusError(
            f"HTTP {resp.status_code}: {resp.text[:160]}",
            request=resp.request,
            response=resp,
        )
    raise last_exc  # type: ignore[misc]


def _ensure_document_id(ctx: CaseContext) -> str:
    """Return a real document_id from the live corpus, discovering one if needed."""
    if ctx.state.get("document_id"):
        return str(ctx.state["document_id"])
    data, _ = _search(ctx, DISCOVERY_QUERY, limit_docs=10)
    chunks = data.get("chunks") or []
    if not chunks:
        raise SkipCase("live corpus returned no documents to derive an id from")
    doc_id = chunks[0].get("document_id")
    if not doc_id:
        raise SkipCase("search chunk is missing document_id")
    ctx.state["document_id"] = doc_id
    return str(doc_id)


# --------------------------------------------------------------------------- #
# Group 1: search cases (data-driven from the shared fixture)
# --------------------------------------------------------------------------- #
def _make_search_case(fixture: dict[str, Any]) -> Case:
    fid = fixture["id"]
    query = " ".join(fixture["query"].split())  # collapse YAML block whitespace
    min_hits = int(fixture.get("min_hits", 0))
    max_wall = fixture.get("max_wall_ms")
    expected = fixture.get("expected_query_type")
    forbidden = fixture.get("forbidden_query_type")

    def run(ctx: CaseContext) -> str:
        limit = max(ctx.limit_docs, min_hits + 5)
        data, wall_ms = _search(ctx, query, limit_docs=limit)
        tb = data.get("timing_breakdown") or {}
        chunks = data.get("chunks") or []
        hits = len(chunks)
        embedding_ms = _tb_get(tb, "embedding_ms", "embedding_time_ms", default=0) or 0
        fallback = _tb_get(tb, "vector_fallback", default=None)
        qtype = _tb_get(tb, "query_type", default=None)

        _detail(
            ctx,
            chars=len(query),
            hits=hits,
            unique_documents=data.get("unique_documents"),
            query_type=qtype,
            embedding_ms=embedding_ms,
            vector_fallback=fallback,
            wall_ms=round(wall_ms),
        )

        # Capture a real id for the round-trip / metadata checks.
        if chunks and not ctx.state.get("document_id"):
            ctx.state["document_id"] = chunks[0].get("document_id")

        # Hard correctness assertions.
        # vector_fallback=False is the authoritative "semantic path healthy"
        # signal. embedding_ms is NOT asserted >0: query embeddings are
        # Redis-cached, so a warm cache legitimately reports 0ms with the
        # vector search still running on the cached embedding.
        assert fallback is False, (
            f"vector_fallback={fallback!r} — embedding path unhealthy (no semantic search)"
        )
        assert hits >= min_hits, f"{hits} hits < min_hits={min_hits}"
        if expected:
            assert qtype == expected, f"query_type={qtype!r} != expected {expected!r}"
        if forbidden:
            assert qtype != forbidden, (
                f"query_type={forbidden!r} is forbidden (routing regression)"
            )

        # Latency is reported; a breach is a soft warning, not a failure
        # (avoids flakiness over a real network to prod).
        note = f"{hits} hits, type={qtype}, emb={embedding_ms:.0f}ms, {wall_ms:.0f}ms"
        if max_wall and wall_ms > max_wall:
            note += f"  (slow: > {max_wall}ms target)"
        return note

    return Case("search", fid, fixture.get("description", ""), run)


def _load_search_cases() -> list[Case]:
    fixtures = yaml.safe_load(FIXTURES_PATH.read_text())["queries"]
    return [_make_search_case(f) for f in fixtures]


# --------------------------------------------------------------------------- #
# Group 2: feature cases
# --------------------------------------------------------------------------- #
def _c_health_live(ctx: CaseContext) -> str:
    resp = ctx.get("/health", auth=False, timeout=15.0)
    resp.raise_for_status()
    data = resp.json()
    status = data.get("status")
    assert status == "healthy", f"/health status={status!r}, expected 'healthy'"
    _detail(ctx, version=data.get("version"))
    return f"healthy (v{data.get('version', '?')})"


def _c_health_status(ctx: CaseContext) -> str:
    resp = ctx.get("/health/status", timeout=30.0)
    # 503 is a valid contract response when a dependency is degraded.
    assert resp.status_code in (200, 503), f"unexpected status {resp.status_code}"
    data = resp.json()
    services = data.get("services") or {}
    assert services, "no services reported in /health/status"
    unhealthy = [
        n for n, s in services.items() if str(s.get("status")).lower() != "healthy"
    ]
    _detail(
        ctx, overall=data.get("status"), services=list(services), unhealthy=unhealthy
    )
    msg = f"overall={data.get('status')}, {len(services)} services"
    if unhealthy:
        msg += f", degraded={unhealthy}"
    return msg


def _c_health_dependencies(ctx: CaseContext) -> str:
    resp = ctx.get("/health/dependencies", timeout=15.0)
    resp.raise_for_status()
    data = resp.json()
    critical = data.get("critical") or {}
    optional = data.get("optional") or {}
    assert critical, "no critical dependencies listed"
    _detail(ctx, critical=list(critical), optional=list(optional))
    return f"critical={list(critical)}, optional={list(optional)}"


def _c_document_roundtrip(ctx: CaseContext) -> str:
    """Search -> grab a real document_id -> fetch it. Proves the Supabase round-trip."""
    doc_id = _ensure_document_id(ctx)
    resp = ctx.get(f"/documents/{doc_id}", timeout=30.0)
    assert resp.status_code == 200, (
        f"GET /documents/{doc_id} -> {resp.status_code} "
        f"(search id did not resolve to a real Supabase row)"
    )
    document = (resp.json() or {}).get("document") or {}
    returned_id = document.get("document_id")
    assert returned_id == doc_id, f"id mismatch: asked {doc_id!r}, got {returned_id!r}"
    title = document.get("title") or document.get("court_name") or "(untitled)"
    _detail(
        ctx,
        document_id=doc_id,
        title=title,
        court=document.get("court_name"),
        date=document.get("date_issued"),
        country=document.get("country"),
    )
    return f"resolved {doc_id} -> {str(title)[:50]!r}"


def _c_document_metadata(ctx: CaseContext) -> str:
    doc_id = _ensure_document_id(ctx)
    resp = ctx.get(f"/documents/{doc_id}/metadata", timeout=30.0)
    assert resp.status_code == 200, f"metadata -> {resp.status_code}"
    data = resp.json()
    assert isinstance(data, dict) and data, "empty metadata payload"
    _detail(ctx, fields=sorted(data)[:15])
    return f"{len(data)} metadata fields"


def _c_document_similar(ctx: CaseContext) -> str:
    doc_id = _ensure_document_id(ctx)
    resp = ctx.get(f"/documents/{doc_id}/similar", params={"top_k": 5}, timeout=45.0)
    assert resp.status_code == 200, f"similar -> {resp.status_code}"
    data = resp.json()
    # Accept either a list or an envelope with a list inside.
    items = (
        data
        if isinstance(data, list)
        else (data.get("documents") or data.get("similar") or [])
    )
    _detail(ctx, count=len(items))
    return f"{len(items)} similar documents"


def _c_facets(ctx: CaseContext) -> str:
    resp = ctx.get("/documents/facets", timeout=30.0)
    resp.raise_for_status()
    facets = (resp.json() or {}).get("facets") or {}
    assert facets, "no facets returned (empty corpus or RPC failure)"
    sample = {k: len(v) for k, v in list(facets.items())[:6]}
    _detail(ctx, facet_types=list(facets), counts=sample)
    return f"{len(facets)} facet types: {sample}"


def _c_uk_case_type_contract(ctx: CaseContext) -> str:
    """Data contract (#799): no UK ``EWCA Crim`` judgment may be case_type=Civil.

    Fails on prod until ``scripts/backfill_uk_case_type.py --apply`` has run.
    """
    resp = ctx.get(
        "/api/search/documents",
        params={
            "q": "EWCA Crim",
            "limit": 100,
            "filters": 'jurisdiction = "UK" AND case_type = "Civil"',
        },
        timeout=30.0,
    )
    assert resp.status_code in (200, 503), f"meili search -> {resp.status_code}"
    if resp.status_code == 503:
        raise SkipCase("Meilisearch not configured (503)")
    docs = resp.json().get("documents") or []
    bad = [
        d.get("case_number")
        for d in docs
        if "ewca crim" in str(d.get("case_number", "")).lower()
        or "(crim)" in str(d.get("case_number", "")).lower()
    ]
    _detail(ctx, checked=len(docs), mislabelled=len(bad))
    assert not bad, (
        f"{len(bad)} UK EWCA Crim docs labelled Civil (e.g. {bad[:3]}); "
        "run scripts/backfill_uk_case_type.py --apply (#799)"
    )
    return f"{len(docs)} UK Civil docs checked, none are EWCA Crim"


def _c_autocomplete(ctx: CaseContext) -> str:
    resp = ctx.get(
        "/api/search/autocomplete", params={"q": "umowa", "limit": 10}, timeout=20.0
    )
    assert resp.status_code in (200, 503), f"autocomplete -> {resp.status_code}"
    if resp.status_code == 503:
        raise SkipCase("Meilisearch not configured (503)")
    data = resp.json()
    hits = data.get("topic_hits")
    assert isinstance(hits, list), "topic_hits is not a list"
    if hits:
        first = hits[0]
        assert "id" in first and ("label_pl" in first or "label_en" in first), (
            "topic hit missing id/label fields"
        )
    _detail(ctx, hits=len(hits), processing_ms=data.get("processingTimeMs"))
    return f"{len(hits)} topic suggestions"


def _c_query_rewrite(ctx: CaseContext) -> str:
    resp = ctx.post(
        "/documents/search/rewrite",
        json={"query": "wypadek przy pracy odszkodowanie 2023"},
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    rewritten = data.get("rewritten_query")
    assert isinstance(rewritten, str) and rewritten.strip(), "empty rewritten_query"
    assert "filters" in data, "missing filters envelope"
    degraded = bool(data.get("degraded"))
    _detail(
        ctx,
        rewritten=rewritten,
        degraded=degraded,
        model=(data.get("diagnostics") or {}).get("model"),
    )
    return f"{'(degraded) ' if degraded else ''}rewrote -> {rewritten[:50]!r}"


def _c_meili_keyword(ctx: CaseContext) -> str:
    resp = ctx.get(
        "/api/search/documents",
        params={"q": "umowa", "limit": 10},
        timeout=20.0,
    )
    assert resp.status_code in (200, 503), f"meili search -> {resp.status_code}"
    if resp.status_code == 503:
        raise SkipCase("Meilisearch not configured (503)")
    data = resp.json()
    docs = data.get("documents")
    assert isinstance(docs, list), "documents is not a list"
    assert "pagination" in data, "missing pagination metadata"
    _detail(ctx, results=len(docs), total=data.get("total_count"))
    return f"{len(docs)} keyword hits (total={data.get('total_count')})"


def _c_meili_hybrid(ctx: CaseContext) -> str:
    resp = ctx.get(
        "/api/search/documents",
        params={
            "q": "odpowiedzialność odszkodowawcza",
            "limit": 10,
            "semantic_ratio": 0.5,
        },
        timeout=30.0,
    )
    assert resp.status_code in (200, 503), f"meili hybrid -> {resp.status_code}"
    if resp.status_code == 503:
        raise SkipCase("Meilisearch not configured (503)")
    docs = (resp.json() or {}).get("documents")
    assert isinstance(docs, list), "documents is not a list"
    _detail(ctx, results=len(docs))
    return f"{len(docs)} hybrid hits (semantic_ratio=0.5)"


def _c_pagination(ctx: CaseContext) -> str:
    page1, _ = _search(ctx, DISCOVERY_QUERY, limit_docs=5, offset=0)
    pg = page1.get("pagination") or {}
    assert pg, "no pagination metadata on /documents/search"
    assert pg.get("offset") == 0, f"page1 offset={pg.get('offset')!r}, expected 0"
    if not pg.get("has_more"):
        raise SkipCase("corpus too small to paginate (has_more=false)")
    page2, _ = _search(ctx, DISCOVERY_QUERY, limit_docs=5, offset=5)
    ids1 = {c.get("document_id") for c in (page1.get("chunks") or [])}
    ids2 = {c.get("document_id") for c in (page2.get("chunks") or [])}
    overlap = ids1 & ids2
    _detail(ctx, page1_docs=len(ids1), page2_docs=len(ids2), overlap=len(overlap))
    assert ids2 - ids1, "page 2 returned no new documents (pagination not advancing)"
    return f"page1={len(ids1)} docs, page2 added {len(ids2 - ids1)} new"


def _c_routing_case_number(ctx: CaseContext) -> str:
    data, _ = _search(ctx, "II CSK 604/17", limit_docs=5)
    qtype = _tb_get(data.get("timing_breakdown") or {}, "query_type")
    _detail(ctx, query_type=qtype)
    assert qtype == "case_number", (
        f"'II CSK 604/17' routed as {qtype!r}, expected 'case_number'"
    )
    return "sygnatura routed as case_number"


def _c_query_too_long(ctx: CaseContext) -> str:
    resp = ctx.post(
        "/documents/search",
        json={"query": "x" * 2015, "limit_docs": 3},
        timeout=20.0,
    )
    assert resp.status_code == 400, (
        f"expected 400 for >2000 chars, got {resp.status_code}"
    )
    body = resp.text.lower()
    assert "too long" in body, "400 body should mention 'too long'"
    return "2015-char query rejected with 400"


def _c_auth_required(ctx: CaseContext) -> str:
    resp = ctx.get("/documents/facets", auth=False, timeout=15.0)
    assert resp.status_code in (401, 403), (
        f"unauthenticated request returned {resp.status_code}, expected 401/403"
    )
    return f"unauthenticated request correctly blocked ({resp.status_code})"


def _c_embedding_coverage(ctx: CaseContext) -> str:
    resp = ctx.get("/documents/stats/embeddings", timeout=30.0)
    assert resp.status_code == 200, f"embedding stats -> {resp.status_code}"
    data = resp.json()
    assert isinstance(data, dict), "embedding stats payload is not an object"
    _detail(ctx, **{k: v for k, v in data.items() if isinstance(v, int | float | str)})
    return "embedding coverage stats returned"


def _c_topics_meta(ctx: CaseContext) -> str:
    resp = ctx.get("/api/search/topics/meta", timeout=15.0)
    assert resp.status_code in (200, 503), f"topics meta -> {resp.status_code}"
    if resp.status_code == 503:
        raise SkipCase("topics index not available (503)")
    data = resp.json()
    total = data.get("total_concepts")
    _detail(ctx, total_concepts=total, jurisdictions=data.get("jurisdictions"))
    return f"{total} topic concepts"


def _mcp_call(
    ctx: CaseContext, key: str, rpc_id: int, method: str, params: dict
) -> dict:
    """POST one JSON-RPC request to /mcp and return the decoded response.

    /mcp is stateless and answers as Server-Sent Events, so the JSON-RPC
    message is the last ``data:`` line of the body.
    """
    # ctx.client directly: ctx.post always builds its own headers, and /mcp
    # takes the MCP key rather than X-API-Key.
    resp = ctx.client.post(
        "/mcp",
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        },
        json={"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params},
        timeout=90.0,
    )
    assert resp.status_code == 200, (
        f"/mcp {method} -> {resp.status_code}: {resp.text[:200]}"
    )
    data_lines = [
        line[len("data:") :].strip()
        for line in resp.text.splitlines()
        if line.startswith("data:")
    ]
    assert data_lines, f"/mcp {method} returned no data frame: {resp.text[:200]!r}"
    message = json.loads(data_lines[-1])
    assert "error" not in message, f"/mcp {method} JSON-RPC error: {message['error']}"
    return message["result"]


def _c_mcp_search_judgments(ctx: CaseContext) -> str:
    key = os.getenv(MCP_KEY_ENV_VAR)
    if not key:
        raise SkipCase(
            f"{MCP_KEY_ENV_VAR} is not set; generate a key in /settings (MCP access)"
        )

    _mcp_call(
        ctx,
        key,
        1,
        "initialize",
        {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "e2e-live", "version": "0"},
        },
    )
    result = _mcp_call(
        ctx,
        key,
        2,
        "tools/call",
        {"name": "search_judgments", "arguments": {"query": MCP_QUERY, "limit": 5}},
    )
    assert not result.get("isError"), f"tool reported an error: {result.get('content')}"

    structured = result.get("structuredContent") or {}
    hits = structured.get("result")
    if hits is None:  # older servers: one JSON text block per hit
        hits = [
            json.loads(block["text"])
            for block in result.get("content") or []
            if block.get("type") == "text"
        ]

    _detail(ctx, hits=len(hits))
    assert hits, f"search_judgments({MCP_QUERY!r}) returned no hits"
    for hit in hits:
        assert hit.get("id"), f"hit without id: {hit}"
        assert hit.get("case_number"), f"hit {hit.get('id')} has no case_number"
        snippet_len = len(hit.get("snippet") or "")
        assert snippet_len <= MCP_SNIPPET_MAX_CHARS, (
            f"hit {hit['id']} snippet is {snippet_len} chars > {MCP_SNIPPET_MAX_CHARS}"
        )
    return f"{len(hits)} hits over MCP for {MCP_QUERY!r}"


_FEATURE_CASES: list[Case] = [
    Case("health", "liveness", "GET /health is healthy", _c_health_live),
    Case(
        "health", "deep_status", "GET /health/status dependency check", _c_health_status
    ),
    Case(
        "health",
        "dependencies",
        "GET /health/dependencies inventory",
        _c_health_dependencies,
    ),
    Case(
        "documents",
        "roundtrip",
        "search id -> GET /documents/{id} (real Supabase)",
        _c_document_roundtrip,
    ),
    Case("documents", "metadata", "GET /documents/{id}/metadata", _c_document_metadata),
    Case("documents", "similar", "GET /documents/{id}/similar", _c_document_similar),
    Case("documents", "facets", "GET /documents/facets", _c_facets),
    Case(
        "documents",
        "embedding_coverage",
        "GET /documents/stats/embeddings",
        _c_embedding_coverage,
    ),
    Case(
        "documents",
        "uk_case_type_contract",
        "UK EWCA Crim docs are not case_type=Civil (#799)",
        _c_uk_case_type_contract,
    ),
    Case("autocomplete", "topics", "GET /api/search/autocomplete", _c_autocomplete),
    Case("autocomplete", "topics_meta", "GET /api/search/topics/meta", _c_topics_meta),
    Case("rewrite", "llm_rewrite", "POST /documents/search/rewrite", _c_query_rewrite),
    Case("meili", "keyword", "GET /api/search/documents (keyword)", _c_meili_keyword),
    Case(
        "meili",
        "hybrid",
        "GET /api/search/documents (semantic_ratio=0.5)",
        _c_meili_hybrid,
    ),
    Case("search", "pagination", "POST /documents/search offset paging", _c_pagination),
    Case(
        "search",
        "routing_case_number",
        "sygnatura routes as case_number",
        _c_routing_case_number,
    ),
    Case("validation", "query_too_long", ">2000-char query -> 400", _c_query_too_long),
    Case("auth", "api_key_required", "missing X-API-Key -> 401/403", _c_auth_required),
    Case(
        "mcp",
        "search_judgments",
        "POST /mcp tools/call search_judgments (needs JUDDGES_MCP_KEY)",
        _c_mcp_search_judgments,
    ),
]


def build_cases(only: list[str] | None = None) -> list[Case]:
    """Return all cases, optionally filtered to the given feature names."""
    cases = _load_search_cases() + _FEATURE_CASES
    if only:
        wanted = {f.strip().lower() for f in only}
        cases = [c for c in cases if c.feature.lower() in wanted]
    return cases


def feature_names() -> list[str]:
    seen: list[str] = []
    for c in build_cases():
        if c.feature not in seen:
            seen.append(c.feature)
    return seen
