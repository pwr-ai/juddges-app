"""Unit tests for juddges_search.retrieval.aggregation (#223).

Covers Reciprocal Rank Fusion, the rank-merging step on the hybrid search path.
"""

import pytest

from juddges_search.models import DocumentChunk
from juddges_search.retrieval.aggregation import reciprocal_rank_fusion

pytestmark = pytest.mark.unit


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
