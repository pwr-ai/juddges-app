"""Unit tests for the search_judgments MCP tool.

Fixtures are real LegalDocument / DocumentChunk / SearchChunksResponse
instances, not mocks: a mock answers any attribute name, so a mapping built
on wrong field names would still pass. Only run_document_search is stubbed.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from juddges_mcp.principal import (
    MissingPrincipalError,
    reset_principal,
    set_principal,
)
from juddges_mcp.tools.search import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    SNIPPET_CHARS,
    ToolInputError,
    search_judgments,
)
from juddges_search.models import DocumentChunk, DocumentType, LegalDocument

from app.models import SearchChunksResponse

PATCH_TARGET = "juddges_mcp.tools.search.run_document_search"


@pytest.fixture
def principal():
    token = set_principal(MagicMock(id="user-123"))
    try:
        yield
    finally:
        reset_principal(token)


def _doc(document_id="doc-1", **overrides) -> LegalDocument:
    fields = {
        "document_id": document_id,
        "document_type": DocumentType.JUDGMENT,
        "country": "PL",
        "full_text": "A" * 50_000,
        "court_name": "Sąd Najwyższy",
        "document_number": "II CSK 1/20",
        "date_issued": datetime(2020, 3, 1, 12, 30),
        "source_url": "https://example.test/doc-1",
    }
    fields.update(overrides)
    return LegalDocument(**fields)


def _chunk(document_id="doc-1", **overrides) -> DocumentChunk:
    fields = {
        "document_id": document_id,
        "chunk_id": 1,
        "chunk_text": "Zachowek należy się zstępnym…",
        "combined_score": 0.91,
        "similarity": 0.5,
    }
    fields.update(overrides)
    return DocumentChunk(**fields)


def _response(chunks, documents) -> SearchChunksResponse:
    return SearchChunksResponse(
        chunks=chunks,
        documents=documents,
        total_chunks=len(chunks),
        unique_documents=len(chunks),
    )


def _patched(response):
    return patch(PATCH_TARGET, new=AsyncMock(return_value=response))


@pytest.mark.unit
class TestSearchJudgments:
    async def test_maps_hits_to_citations(self, principal):
        with _patched(_response([_chunk()], [_doc()])):
            [hit] = await search_judgments(query="zachowek")
        assert hit.id == "doc-1"
        assert hit.court == "Sąd Najwyższy"
        assert hit.case_number == "II CSK 1/20"
        assert hit.judgment_date == "2020-03-01"
        assert hit.jurisdiction == "PL"
        assert hit.url == "https://example.test/doc-1"
        assert hit.snippet == "Zachowek należy się zstępnym…"
        assert hit.score == pytest.approx(0.91)

    async def test_score_falls_back_to_similarity(self, principal):
        chunk = _chunk(combined_score=None, similarity=0.4)
        with _patched(_response([chunk], [_doc()])):
            [hit] = await search_judgments(query="zachowek")
        assert hit.score == pytest.approx(0.4)

    async def test_zero_combined_score_is_kept(self, principal):
        chunk = _chunk(combined_score=0.0, similarity=0.4)
        with _patched(_response([chunk], [_doc()])):
            [hit] = await search_judgments(query="zachowek")
        assert hit.score == 0.0

    async def test_missing_date_is_none(self, principal):
        with _patched(_response([_chunk()], [_doc(date_issued=None)])):
            [hit] = await search_judgments(query="zachowek")
        assert hit.judgment_date is None

    async def test_preserves_chunk_ranking_order(self, principal):
        chunks = [_chunk("c", combined_score=0.2), _chunk("a", combined_score=0.9)]
        chunks.append(_chunk("b", combined_score=0.5))
        docs = [_doc("a"), _doc("b"), _doc("c")]
        with _patched(_response(chunks, docs)):
            hits = await search_judgments(query="zachowek")
        # Deliberately not score-sorted: the tool must not re-rank.
        assert [h.id for h in hits] == ["c", "a", "b"]

    async def test_chunk_without_matching_document_is_kept(self, principal):
        chunks = [_chunk("known"), _chunk("orphan", chunk_text="orphan snippet")]
        with _patched(_response(chunks, [_doc("known")])):
            hits = await search_judgments(query="zachowek")
        assert [h.id for h in hits] == ["known", "orphan"]
        orphan = hits[1]
        assert orphan.snippet == "orphan snippet"
        assert orphan.score == pytest.approx(0.91)
        assert orphan.court is None
        assert orphan.case_number is None
        assert orphan.judgment_date is None
        assert orphan.jurisdiction is None
        assert orphan.url is None

    async def test_documents_none_still_returns_chunk_hits(self, principal):
        with _patched(_response([_chunk()], None)):
            [hit] = await search_judgments(query="zachowek")
        assert hit.id == "doc-1"
        assert hit.court is None

    async def test_never_returns_full_text(self, principal):
        chunk = _chunk(chunk_text="B" * 5_000)
        with _patched(_response([chunk], [_doc()])):
            [hit] = await search_judgments(query="zachowek")
        dumped = hit.model_dump()
        assert "full_text" not in dumped
        assert "A" * 100 not in str(dumped)
        assert len(hit.snippet) <= SNIPPET_CHARS
        assert len(hit.snippet) <= 600

    async def test_passes_filters_through(self, principal):
        mock = AsyncMock(return_value=_response([], []))
        with patch(PATCH_TARGET, new=mock):
            await search_judgments(
                query="fraud",
                jurisdiction="uk",
                court="Court of Appeal",
                date_from="2015-01-01",
                date_to="2024-12-31",
                limit=5,
            )
        sent = mock.call_args[0][0]
        assert sent.query == "fraud"
        assert sent.limit_docs == 5
        assert sent.jurisdictions == ["uk"]
        assert sent.court_names == ["Court of Appeal"]
        assert sent.date_from == "2015-01-01"
        assert sent.date_to == "2024-12-31"

    async def test_unset_filters_are_not_sent(self, principal):
        mock = AsyncMock(return_value=_response([], []))
        with patch(PATCH_TARGET, new=mock):
            await search_judgments(query="  zachowek ")
        sent = mock.call_args[0][0]
        assert sent.query == "zachowek"
        assert sent.jurisdictions is None
        assert sent.court_names is None
        assert sent.date_from is None
        assert sent.date_to is None

    async def test_default_limit_is_applied(self, principal):
        mock = AsyncMock(return_value=_response([], []))
        with patch(PATCH_TARGET, new=mock):
            await search_judgments(query="zachowek")
        assert mock.call_args[0][0].limit_docs == DEFAULT_LIMIT

    # Review Focus 4
    @pytest.mark.parametrize("bad_limit", [0, -1, MAX_LIMIT + 1, 10_000])
    async def test_out_of_range_limit_is_rejected(self, principal, bad_limit):
        with pytest.raises(ToolInputError) as exc:
            await search_judgments(query="zachowek", limit=bad_limit)
        assert "limit" in str(exc.value)

    # Review Focus 3
    async def test_reversed_date_range_is_rejected(self, principal):
        with pytest.raises(ToolInputError) as exc:
            await search_judgments(
                query="zachowek", date_from="2024-01-01", date_to="2015-01-01"
            )
        assert "date_from" in str(exc.value)

    @pytest.mark.parametrize("bad_date", ["yesterday", "2024-13-01", "01/02/2024"])
    async def test_unparseable_date_is_rejected(self, principal, bad_date):
        with pytest.raises(ToolInputError) as exc:
            await search_judgments(query="zachowek", date_from=bad_date)
        assert "date_from" in str(exc.value)

    async def test_blank_query_is_rejected(self, principal):
        with pytest.raises(ToolInputError):
            await search_judgments(query="   ")

    async def test_missing_principal_fails_the_call(self):
        with pytest.raises(MissingPrincipalError):
            await search_judgments(query="zachowek")
