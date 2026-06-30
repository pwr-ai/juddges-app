"""Unit tests for juddges_search.retrieval.supabase_search public API (#223).

The search functions are thin async wrappers over a singleton SupabaseSearchClient.
These tests stub the client (no Supabase, no embeddings) and assert the wrappers
forward the result limit + filters correctly, surface empty results, and that the
singleton lifecycle (create-once / reset) holds.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from juddges_search.models import DocumentChunk
from juddges_search.retrieval import supabase_search as ss

pytestmark = pytest.mark.unit


def _chunk(chunk_id: int = 1, text: str = "x") -> DocumentChunk:
    return DocumentChunk(document_id="doc-1", chunk_id=chunk_id, chunk_text=text)


@pytest.fixture(autouse=True)
def _clean_singleton():
    ss.reset_search_client()
    yield
    ss.reset_search_client()


class TestSingleton:
    def test_get_search_client_is_created_once(self, monkeypatch):
        instances = []

        class DummyClient:
            def __init__(self):
                self.client = SimpleNamespace()
                instances.append(self)

        monkeypatch.setattr(ss, "SupabaseSearchClient", DummyClient)

        first = ss.get_search_client()
        second = ss.get_search_client()

        assert first is second
        assert len(instances) == 1

    def test_reset_forces_a_new_instance(self, monkeypatch):
        class DummyClient:
            def __init__(self):
                self.client = SimpleNamespace()

        monkeypatch.setattr(ss, "SupabaseSearchClient", DummyClient)

        first = ss.get_search_client()
        ss.reset_search_client()
        second = ss.get_search_client()

        assert first is not second


class TestSearchChunks:
    async def test_forwards_limit_and_filters(self, monkeypatch):
        fake = SimpleNamespace(hybrid_search_chunks=AsyncMock(return_value=[_chunk()]))
        monkeypatch.setattr(ss, "get_search_client", lambda: fake)

        out = await ss.search_chunks("q", max_chunks=7, languages=["pl"])

        assert out == [_chunk()]
        fake.hybrid_search_chunks.assert_awaited_once_with(
            query="q", match_count=7, languages=["pl"], document_types=None
        )

    async def test_empty_result_passthrough(self, monkeypatch):
        fake = SimpleNamespace(hybrid_search_chunks=AsyncMock(return_value=[]))
        monkeypatch.setattr(ss, "get_search_client", lambda: fake)

        assert await ss.search_chunks("q") == []


class TestSearchChunksTerm:
    async def test_forwards_to_full_text_search(self, monkeypatch):
        fake = SimpleNamespace(full_text_search_chunks=AsyncMock(return_value=[]))
        monkeypatch.setattr(ss, "get_search_client", lambda: fake)

        out = await ss.search_chunks_term("statute", max_chunks=3)

        assert out == []
        fake.full_text_search_chunks.assert_awaited_once_with(
            query="statute", match_count=3, languages=None, document_types=None
        )


class TestSearchChunksVector:
    async def test_embeds_then_forwards_to_vector_search(self, monkeypatch):
        fake = SimpleNamespace(vector_search_chunks=AsyncMock(return_value=[_chunk()]))
        monkeypatch.setattr(ss, "get_search_client", lambda: fake)
        monkeypatch.setattr(ss, "embed_texts", lambda q: [0.1, 0.2, 0.3])

        out = await ss.search_chunks_vector("q", max_chunks=5)

        assert out == [_chunk()]
        kwargs = fake.vector_search_chunks.await_args.kwargs
        assert kwargs["match_count"] == 5
        assert kwargs["query_embedding"] == [0.1, 0.2, 0.3]
