"""Unit tests for juddges_search.retrieval pure helpers (#223).

Covers the property parsers, document-id normalisation, date parsing, score
extraction, and Reciprocal Rank Fusion — the rank/parse logic that previously
had zero coverage despite sitting on every search request's hot path.
"""

from datetime import datetime

import pytest

from juddges_search.models import DocumentChunk
from juddges_search.retrieval.aggregation import reciprocal_rank_fusion
from juddges_search.retrieval.utils import (
    extract_score_from_obj,
    generate_document_id_variants,
    get_chunk_document_id,
    get_chunk_score,
    normalize_document_id,
    parse_date,
    parse_list_property,
    parse_string_property,
)

pytestmark = pytest.mark.unit


class _Raw:
    """Minimal stand-in for a raw search-result object."""

    def __init__(self, properties=None, uuid=None):
        self.properties = properties if properties is not None else {}
        if uuid is not None:
            self.uuid = uuid


class TestParseListProperty:
    def test_list_passthrough(self):
        assert parse_list_property(["a", "b"]) == ["a", "b"]

    def test_json_string_list_parsed(self):
        assert parse_list_property('["a", "b"]') == ["a", "b"]

    def test_non_list_json_string_returns_empty(self):
        assert parse_list_property('{"a": 1}') == []

    def test_plain_string_returns_empty(self):
        assert parse_list_property("not json") == []

    def test_other_types_return_empty(self):
        assert parse_list_property(None) == []
        assert parse_list_property(42) == []


class TestParseStringProperty:
    def test_none_returns_empty_string(self):
        assert parse_string_property(None) == ""

    def test_string_passthrough(self):
        assert parse_string_property("hello") == "hello"

    def test_non_string_json_encoded(self):
        assert parse_string_property({"a": 1}) == '{"a": 1}'

    def test_non_ascii_preserved(self):
        assert parse_string_property(["łódź"]) == '["łódź"]'


class TestNormalizeDocumentId:
    def test_strips_doc_prefix_and_lowercases(self):
        assert normalize_document_id("/doc/ABC123") == "abc123"

    def test_strips_whitespace(self):
        assert normalize_document_id("  ABC123  ") == "abc123"

    def test_combined(self):
        assert normalize_document_id("/doc/  ABC123  ") == "abc123"

    def test_empty(self):
        assert normalize_document_id("") == ""


class TestGenerateDocumentIdVariants:
    def test_empty_returns_empty_list(self):
        assert generate_document_id_variants("") == []

    def test_prefixed_id_dedups(self):
        assert generate_document_id_variants("/doc/ABC123") == ["/doc/ABC123", "ABC123"]

    def test_bare_id_gets_prefixed_variant(self):
        assert generate_document_id_variants("ABC123") == ["ABC123", "/doc/ABC123"]


class TestParseDate:
    def test_none(self):
        assert parse_date(None) is None

    def test_datetime_passthrough(self):
        dt = datetime(2024, 1, 1)
        assert parse_date(dt) is dt

    def test_iso_string(self):
        assert parse_date("2024-06-15T10:30:00") == datetime(2024, 6, 15, 10, 30, 0)

    def test_zulu_suffix_handled(self):
        parsed = parse_date("2024-06-15T10:30:00Z")
        assert parsed is not None
        assert parsed.year == 2024 and parsed.tzinfo is not None

    def test_blank_string(self):
        assert parse_date("   ") is None

    def test_unparseable_returns_none(self):
        assert parse_date("not-a-date") is None


class TestExtractScoreFromObj:
    def test_present(self):
        assert extract_score_from_obj(_Raw({"confidence_score": 0.75})) == 0.75

    def test_coerced_to_float(self):
        assert extract_score_from_obj(_Raw({"confidence_score": 1})) == 1.0

    def test_missing(self):
        assert extract_score_from_obj(_Raw({})) is None

    def test_no_properties(self):
        assert extract_score_from_obj(object()) is None


class TestChunkAccessors:
    def _chunk(self, **kw):
        base = {"document_id": "d1", "chunk_id": 1, "chunk_text": "t"}
        base.update(kw)
        return DocumentChunk(**base)

    def test_score_from_document_chunk(self):
        assert get_chunk_score(self._chunk(confidence_score=0.5)) == 0.5

    def test_score_defaults_zero(self):
        assert get_chunk_score(self._chunk()) == 0.0

    def test_score_from_raw_obj(self):
        assert get_chunk_score(_Raw({"confidence_score": 0.3})) == 0.3

    def test_document_id_from_chunk(self):
        assert get_chunk_document_id(self._chunk()) == "d1"

    def test_document_id_from_raw_obj(self):
        assert get_chunk_document_id(_Raw({"document_id": "raw-1"})) == "raw-1"

    def test_document_id_missing(self):
        assert get_chunk_document_id(_Raw({})) is None


class TestReciprocalRankFusion:
    def _chunk(self, chunk_id, text, score=None):
        return DocumentChunk(document_id="d", chunk_id=chunk_id, chunk_text=text, confidence_score=score)

    def test_empty_input(self):
        assert reciprocal_rank_fusion([]) == []

    def test_single_list_preserves_order(self):
        a = self._chunk(1, "a")
        b = self._chunk(2, "b")
        fused = reciprocal_rank_fusion([[a, b]])
        assert [c.chunk_id for c in fused] == [1, 2]

    def test_chunk_in_both_lists_ranks_highest(self):
        # B appears in both lists → its summed RRF score must top A and C.
        a = self._chunk(1, "a")
        b = self._chunk(2, "b")
        c = self._chunk(3, "c")
        fused = reciprocal_rank_fusion([[a, b], [b, c]], k=60)
        assert fused[0].chunk_id == 2

    def test_confidence_score_becomes_rrf_score(self):
        b = self._chunk(2, "b")
        fused = reciprocal_rank_fusion([[b], [b]], k=60)
        # Same chunk ranked #1 in two queries: 1/61 + 1/61.
        assert fused[0].confidence_score == pytest.approx(2 / 61)

    def test_dedup_by_id_and_text(self):
        b1 = self._chunk(2, "b")
        b2 = self._chunk(2, "b")
        fused = reciprocal_rank_fusion([[b1], [b2]])
        assert len(fused) == 1
