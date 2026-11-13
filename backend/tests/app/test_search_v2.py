"""POST /search/v2 — test search over the Weaviate v2 corpus (issue #867).

Everything runs against fakes: the TEI embedder is an ``httpx.MockTransport``,
Weaviate is a stub collection object and the Supabase lookup is a dependency
override, so no test touches the network.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from app.search_v2 import api as search_v2_api
from app.search_v2.config import load_settings
from app.search_v2.engine import (
    QUERY_PREFIX,
    ChunkHit,
    TeiQueryEmbedder,
    WeaviateV2Engine,
    maxp,
)
from app.search_v2.supabase_ids import candidate_source_ids, map_supabase_ids
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit]


# ---------------------------------------------------------------------------
# MaxP aggregation
# ---------------------------------------------------------------------------


def _chunk(jid: str, idx: int, score: float) -> ChunkHit:
    return ChunkHit(
        judgment_id=jid, chunk_idx=idx, chunk_text=f"{jid}#{idx}", score=score
    )


def test_maxp_scores_each_judgment_by_its_best_chunk():
    hits = maxp(
        [
            _chunk("a", 0, 0.4),
            _chunk("b", 3, 0.9),
            _chunk("a", 7, 0.8),
            _chunk("c", 1, 0.1),
        ],
        k=10,
    )
    assert [(h.judgment_id, h.score, h.best_chunk.chunk_idx) for h in hits] == [
        ("b", 0.9, 3),
        ("a", 0.8, 7),
        ("c", 0.1, 1),
    ]


def test_maxp_truncates_to_k_and_keeps_input_order_on_ties():
    hits = maxp([_chunk("x", 0, 0.5), _chunk("y", 0, 0.5), _chunk("z", 0, 0.2)], k=2)
    assert [h.judgment_id for h in hits] == ["x", "y"]


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def test_load_settings_is_none_without_host_or_tei():
    assert load_settings({}) is None
    assert load_settings({"WEAVIATE_V2_HTTP_HOST": "wv"}) is None
    assert load_settings({"WEAVIATE_V2_TEI_URL": "http://tei"}) is None


def test_load_settings_defaults_ports_and_optional_key():
    settings = load_settings(
        {"WEAVIATE_V2_HTTP_HOST": "wv", "WEAVIATE_V2_TEI_URL": "http://tei:80"}
    )
    assert settings is not None
    assert (settings.http_port, settings.grpc_port, settings.api_key) == (
        8080,
        50051,
        None,
    )


# ---------------------------------------------------------------------------
# Query prefix: only the embedding input carries "query: ", BM25 gets raw text
# ---------------------------------------------------------------------------


def test_tei_embedder_prefixes_query_and_truncates():
    seen: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/embed"
        seen.append(json.loads(request.content))
        return httpx.Response(200, json=[[0.1, 0.2]])

    embedder = TeiQueryEmbedder(
        "http://tei",
        client=httpx.Client(
            base_url="http://tei", transport=httpx.MockTransport(handler)
        ),
    )
    assert embedder.embed_query("zachowek") == [0.1, 0.2]
    assert seen == [{"inputs": [f"{QUERY_PREFIX}zachowek"], "truncate": True}]
    assert QUERY_PREFIX == "query: "


def _embedder_answering(statuses: list[int]) -> tuple[TeiQueryEmbedder, list[int]]:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        code = statuses[len(calls)]
        calls.append(code)
        return httpx.Response(code, json=[[1.0]] if code == 200 else {"error": "busy"})

    client = httpx.Client(base_url="http://tei", transport=httpx.MockTransport(handler))
    return TeiQueryEmbedder("http://tei", client=client, retry_delays_s=(0, 0)), calls


def test_tei_embedder_retries_when_tei_sheds_load():
    embedder, calls = _embedder_answering([429, 503, 200])
    assert embedder.embed_query("x") == [1.0]
    assert calls == [429, 503, 200]


def test_tei_embedder_gives_up_after_the_retries():
    embedder, calls = _embedder_answering([429, 429, 429])
    with pytest.raises(httpx.HTTPStatusError):
        embedder.embed_query("x")
    assert calls == [429, 429, 429]


class _FakeEmbedder:
    def __init__(self):
        self.queries: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.queries.append(text)
        return [0.5, 0.5]


class _FakeQuery:
    def __init__(self, chunks: list[dict], judgments: list[dict]):
        self._chunks = chunks
        self._judgments = judgments
        self.hybrid_calls: list[dict[str, Any]] = []
        self.fetch_calls: list[dict[str, Any]] = []

    def hybrid(self, **kwargs):
        self.hybrid_calls.append(kwargs)
        return SimpleNamespace(
            objects=[
                SimpleNamespace(
                    properties={k: v for k, v in c.items() if k != "score"},
                    metadata=SimpleNamespace(score=c["score"]),
                )
                for c in self._chunks
            ]
        )

    def fetch_objects(self, **kwargs):
        self.fetch_calls.append(kwargs)
        return SimpleNamespace(
            objects=[SimpleNamespace(properties=dict(j)) for j in self._judgments]
        )


class _FakeWeaviate:
    def __init__(self, chunks: list[dict], judgments: list[dict]):
        self.chunks = _FakeQuery(chunks, [])
        self.judgments = _FakeQuery([], judgments)
        self.collections = SimpleNamespace(use=self._use)

    def _use(self, name: str):
        return SimpleNamespace(
            query={"JudgmentChunks": self.chunks, "Judgments": self.judgments}[name]
        )

    def close(self):
        pass


_SETTINGS = load_settings(
    {"WEAVIATE_V2_HTTP_HOST": "wv", "WEAVIATE_V2_TEI_URL": "http://tei"}
)


def test_engine_search_runs_hybrid_with_raw_text_and_prefixed_vector():
    fake = _FakeWeaviate(
        chunks=[
            {"judgment_id": "j1", "chunk_idx": 2, "chunk_text": "best", "score": 0.9},
            {"judgment_id": "j1", "chunk_idx": 0, "chunk_text": "worse", "score": 0.3},
            {"judgment_id": "j2", "chunk_idx": 5, "chunk_text": "second", "score": 0.6},
        ],
        judgments=[
            {"judgment_id": "j1", "document_number": "I C 1/20", "court_name": "SO"},
            {"judgment_id": "j2", "document_number": "II K 2/21", "court_name": "SR"},
        ],
    )
    embedder = _FakeEmbedder()
    engine = WeaviateV2Engine(
        _SETTINGS, embedder=embedder, client_factory=lambda s: fake
    )

    results = engine.search("zachowek", limit=1, alpha=0.25)

    assert embedder.queries == ["zachowek"]
    call = fake.chunks.hybrid_calls[0]
    assert call["query"] == "zachowek"  # BM25 side never sees the prefix
    assert call["vector"] == [0.5, 0.5]
    assert call["alpha"] == 0.25
    assert call["query_properties"] == ["chunk_text"]
    assert call["target_vector"] == "default"
    assert call["limit"] == 100
    assert [hit.judgment_id for hit, _ in results] == ["j1"]
    assert results[0][0].best_chunk.chunk_text == "best"
    assert results[0][1]["document_number"] == "I C 1/20"
    # Only the ranked judgments are fetched, and never the full text.
    assert "full_text" not in fake.judgments.fetch_calls[0]["return_properties"]


# ---------------------------------------------------------------------------
# supabase_id mapping
# ---------------------------------------------------------------------------

_FULL = "151500000001006_II_AKa_000145_2013_Uz_2013-05-14_001"
_FULL_B = "151500000001006_II_AKa_000145_2013_Uz_2013-09-02_001"
_OTHER = "154505000007503_XXV_C_000672_2016_Uz_2016-11-03_002"


def test_candidate_source_ids_adds_the_40_char_truncation():
    assert candidate_source_ids([_FULL, _OTHER, _FULL]) == [
        _FULL,
        _FULL[:40],
        _OTHER,
        _OTHER[:40],
    ]


def test_map_supabase_ids_prefers_exact_match():
    rows = [
        {"id": "exact", "source_id": _OTHER, "decision_date": "2016-11-03"},
        {"id": "trunc", "source_id": _OTHER[:40], "decision_date": "2016-11-03"},
    ]
    assert map_supabase_ids([(_OTHER, "2016-11-03")], rows) == {_OTHER: "exact"}


def test_map_supabase_ids_accepts_a_unique_truncated_match():
    rows = [{"id": "trunc", "source_id": _FULL[:40], "decision_date": "2013-05-14"}]
    assert map_supabase_ids([(_FULL, "2013-05-14T00:00:00Z")], rows) == {_FULL: "trunc"}


def test_map_supabase_ids_breaks_truncation_ties_by_date_or_gives_up():
    rows = [
        {"id": "may", "source_id": _FULL[:40], "decision_date": "2013-05-14"},
        {"id": "sep", "source_id": _FULL[:40], "decision_date": "2013-09-02"},
    ]
    assert map_supabase_ids([(_FULL, "2013-05-14"), (_FULL_B, "2013-09-02")], rows) == {
        _FULL: "may",
        _FULL_B: "sep",
    }
    # No date to disambiguate: never guess.
    assert map_supabase_ids([(_FULL, None)], rows) == {_FULL: None}


def test_map_supabase_ids_rejects_a_truncated_match_on_another_date():
    rows = [{"id": "sep", "source_id": _FULL[:40], "decision_date": "2013-09-02"}]
    assert map_supabase_ids([(_FULL, "2013-05-14")], rows) == {_FULL: None}


def test_map_supabase_ids_is_none_when_absent():
    assert map_supabase_ids([(_OTHER, "2016-11-03")], []) == {_OTHER: None}


# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------


class _StubEngine:
    def __init__(self, results):
        self.results = results
        self.calls: list[tuple[str, int, float]] = []

    def search(self, query: str, limit: int, alpha: float):
        self.calls.append((query, limit, alpha))
        return self.results

    def reset(self):
        pass


@pytest.fixture
def stub_engine():
    hit = maxp([ChunkHit("j1", 4, "x" * 2000, 0.87)], k=1)[0]
    props = {
        "judgment_id": "j1",
        "document_number": "I C 1/20",
        "court_name": "Sąd Okręgowy",
        "date_issued": "2020-01-02T00:00:00Z",
        "thesis": "t" * 2000,
        "source_id": "j1",
    }
    engine = _StubEngine([(hit, props)])
    app.dependency_overrides[search_v2_api.get_engine] = lambda: engine

    async def _lookup(pairs):
        return {jid: "11111111-1111-4111-a111-111111111111" for jid, _ in pairs}

    app.dependency_overrides[search_v2_api.get_supabase_lookup] = lambda: _lookup
    try:
        yield engine
    finally:
        app.dependency_overrides.pop(search_v2_api.get_engine, None)
        app.dependency_overrides.pop(search_v2_api.get_supabase_lookup, None)


async def test_search_v2_requires_a_signed_in_user(
    client, valid_api_headers, stub_engine
):
    response = await client.post(
        "/search/v2", json={"query": "zachowek"}, headers=valid_api_headers
    )
    assert response.status_code in (401, 403)
    assert stub_engine.calls == []


async def test_search_v2_requires_the_api_key(client, valid_jwt_headers, stub_engine):
    response = await client.post(
        "/search/v2",
        json={"query": "zachowek"},
        headers={"Authorization": valid_jwt_headers["Authorization"]},
    )
    assert response.status_code in (401, 403)


async def test_search_v2_returns_503_when_not_configured(
    authenticated_client, monkeypatch
):
    for name in ("WEAVIATE_V2_HTTP_HOST", "WEAVIATE_V2_TEI_URL"):
        monkeypatch.delenv(name, raising=False)
    response = await authenticated_client.post("/search/v2", json={"query": "zachowek"})
    assert response.status_code == 503
    assert response.json()["detail"] == "search v2 not configured"


@pytest.mark.parametrize(
    "body",
    [
        {"query": ""},
        {"query": "   "},
        {"query": "x", "limit": 0},
        {"query": "x", "limit": 51},
        {"query": "x", "alpha": -0.1},
        {"query": "x", "alpha": 1.5},
        {},
    ],
)
async def test_search_v2_validates_the_request(authenticated_client, stub_engine, body):
    response = await authenticated_client.post("/search/v2", json=body)
    assert response.status_code == 422
    assert stub_engine.calls == []


async def test_search_v2_returns_judgments(authenticated_client, stub_engine):
    response = await authenticated_client.post(
        "/search/v2", json={"query": " zachowek "}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert stub_engine.calls == [("zachowek", 10, 0.25)]
    assert body["engine"] == "weaviate-v2"
    assert body["took_ms"] >= 0
    [result] = body["results"]
    assert result["judgment_id"] == "j1"
    assert result["signature"] == "I C 1/20"
    assert result["court_name"] == "Sąd Okręgowy"
    assert result["decision_date"] == "2020-01-02"
    assert result["score"] == pytest.approx(0.87)
    assert result["best_chunk"]["chunk_idx"] == 4
    assert len(result["best_chunk"]["text"]) <= 801
    assert len(result["thesis"]) <= 601
    assert result["source_id"] == "j1"
    assert result["supabase_id"] == "11111111-1111-4111-a111-111111111111"


async def test_search_v2_maps_backend_failures_to_503_and_reconnects(
    authenticated_client, stub_engine
):
    resets: list[bool] = []

    def _fail(query, limit, alpha):
        raise httpx.ConnectError("weaviate down")

    stub_engine.search = _fail
    stub_engine.reset = lambda: resets.append(True)
    response = await authenticated_client.post("/search/v2", json={"query": "x"})
    assert response.status_code == 503
    assert response.json()["detail"] == "search v2 unavailable"
    assert resets == [True]
