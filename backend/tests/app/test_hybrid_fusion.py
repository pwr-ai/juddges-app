"""Hybrid keyword + semantic fusion (issue #798).

Meilisearch's score-based ``semanticRatio`` merge flipped the top-k from pure
keyword to pure semantic around ratio 0.5. ``documents_search`` now fetches
both legs separately and fuses them with weighted RRF; these tests pin the
properties that make that a real blend.
"""

from unittest.mock import patch

import httpx
import pytest

from app.services.search import (
    MeiliSearchService,
    reciprocal_rank_fusion,
)

pytestmark = pytest.mark.unit

RATIOS = [round(i * 0.05, 2) for i in range(21)]  # 0.0, 0.05, ..., 1.0

# Disjoint top-10s, the shape measured on prod in #798: keyword and semantic
# retrieval agree on nothing in their first page.
KEYWORD_HITS = [{"id": f"kw-{i}", "case_number": f"K {i}/21"} for i in range(1, 31)]
SEMANTIC_HITS = [{"id": f"sem-{i}"} for i in range(1, 31)]


def _ids(hits):
    return [h["id"] for h in hits]


def _rank(hits, doc_id):
    return _ids(hits).index(doc_id)


class TestReciprocalRankFusion:
    def test_ratio_zero_is_keyword_order_and_one_is_semantic_order(self):
        at_zero = reciprocal_rank_fusion(KEYWORD_HITS, SEMANTIC_HITS, 0.0)
        at_one = reciprocal_rank_fusion(KEYWORD_HITS, SEMANTIC_HITS, 1.0)
        assert _ids(at_zero)[:30] == _ids(KEYWORD_HITS)
        assert _ids(at_one)[:30] == _ids(SEMANTIC_HITS)

    def test_balanced_ratio_mixes_both_sides_in_top_10(self):
        """#798 acceptance: ratio 0.5 top-10 holds keyword AND semantic hits."""
        top10 = _ids(reciprocal_rank_fusion(KEYWORD_HITS, SEMANTIC_HITS, 0.5)[:10])
        assert any(i.startswith("kw-") for i in top10), top10
        assert any(i.startswith("sem-") for i in top10), top10

    @pytest.mark.parametrize("ratio", [0.3, 0.4, 0.5, 0.6, 0.7, 0.75])
    def test_intermediate_ratios_blend_not_flip(self, ratio):
        """The bug: every ratio was all-keyword or all-semantic. Now the
        whole working range keeps both signals on the first page."""
        top10 = _ids(reciprocal_rank_fusion(KEYWORD_HITS, SEMANTIC_HITS, ratio)[:10])
        kw = sum(i.startswith("kw-") for i in top10)
        assert 0 < kw < 10, (ratio, top10)

    @pytest.mark.parametrize(
        ("ratio", "semantic_in_top_20"), [(0.25, 5), (0.5, 10), (0.75, 15)]
    )
    def test_semantic_share_tracks_the_ratio(self, ratio, semantic_in_top_20):
        """Single-list hits interleave in proportion to the ratio, so the
        frontend's 0.75 is ~3:1 semantic, not pure semantic."""
        top20 = _ids(reciprocal_rank_fusion(KEYWORD_HITS, SEMANTIC_HITS, ratio)[:20])
        assert sum(i.startswith("sem-") for i in top20) == semantic_in_top_20

    def test_blending_is_monotone_across_ratios(self):
        """Raising the ratio never pushes a semantic hit down nor a keyword hit
        up, and the semantic share of the top-10 never shrinks."""
        sem_ranks: dict[str, list[int]] = {d["id"]: [] for d in SEMANTIC_HITS}
        kw_ranks: dict[str, list[int]] = {d["id"]: [] for d in KEYWORD_HITS}
        sem_share: list[int] = []
        for ratio in RATIOS:
            fused = reciprocal_rank_fusion(KEYWORD_HITS, SEMANTIC_HITS, ratio)
            for doc_id, ranks in sem_ranks.items():
                ranks.append(_rank(fused, doc_id))
            for doc_id, ranks in kw_ranks.items():
                ranks.append(_rank(fused, doc_id))
            sem_share.append(sum(i.startswith("sem-") for i in _ids(fused[:10])))

        for doc_id, ranks in sem_ranks.items():
            assert ranks == sorted(ranks, reverse=True), (doc_id, ranks)
        for doc_id, ranks in kw_ranks.items():
            assert ranks == sorted(ranks), (doc_id, ranks)
        assert sem_share == sorted(sem_share), sem_share
        # And it actually moves gradually: more than two distinct mixes.
        assert len(set(sem_share)) > 2, sem_share

    def test_document_in_both_lists_beats_single_list_documents(self):
        keyword = [{"id": "a"}, {"id": "both"}, {"id": "b"}]
        semantic = [{"id": "c"}, {"id": "both"}, {"id": "d"}]
        fused = reciprocal_rank_fusion(keyword, semantic, 0.5)
        assert fused[0]["id"] == "both"
        assert len(fused) == 5  # deduplicated

    def test_keyword_copy_of_shared_hit_is_kept(self):
        keyword = [{"id": "x", "_formatted": {"title": "<mark>vat</mark>"}}]
        semantic = [{"id": "x", "_formatted": {"title": "vat"}}]
        fused = reciprocal_rank_fusion(keyword, semantic, 0.9)
        assert fused[0]["_formatted"]["title"] == "<mark>vat</mark>"

    def test_exact_case_number_is_pinned_to_rank_one(self):
        """#798 acceptance: an exact case number stays rank 1 in hybrid mode,
        even at the frontend's 0.75 when semantic retrieval misses it."""
        keyword = [
            {"id": "other", "case_number": "III Ca 1500/21"},
            {"id": "target", "case_number": "III Ca 1553/21"},
        ]
        fused = reciprocal_rank_fusion(
            keyword, SEMANTIC_HITS, 0.75, query="  iii ca  1553/21 "
        )
        assert fused[0]["id"] == "target"

    def test_no_pin_without_exact_case_number_match(self):
        keyword = [{"id": "kw", "case_number": "III Ca 1553/21"}]
        semantic = [{"id": "sem"}]
        fused = reciprocal_rank_fusion(keyword, semantic, 0.75, query="1553")
        assert fused[0]["id"] == "sem"

    def test_hits_without_id_are_ignored(self):
        fused = reciprocal_rank_fusion([{"title": "no id"}, {"id": "a"}], [], 0.5)
        assert _ids(fused) == ["a"]


# ── documents_search wiring ────────────────────────────────────────────────


def _resp(status: int, data: dict) -> httpx.Response:
    return httpx.Response(status, json=data, request=httpx.Request("POST", "http://t"))


@pytest.fixture
def service():
    return MeiliSearchService(
        base_url="http://meili:7700",
        api_key="search-key",
        index_name="judgments",
    )


class TestDocumentsSearchFusion:
    @pytest.mark.asyncio
    async def test_fused_path_runs_keyword_and_pure_vector_legs(self, service):
        calls: list[dict] = []
        fake_vec = [0.1] * 1024

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            if "hybrid" in json:
                return _resp(
                    200,
                    {
                        "hits": SEMANTIC_HITS,
                        "estimatedTotalHits": 900,
                        "processingTimeMs": 40,
                    },
                )
            return _resp(
                200,
                {
                    "hits": KEYWORD_HITS,
                    "estimatedTotalHits": 120,
                    "processingTimeMs": 7,
                },
            )

        with (
            patch("app.services.search.embed_texts", return_value=fake_vec),
            patch("httpx.AsyncClient.post", new=fake_post),
        ):
            result = await service.documents_search(
                "burglary", limit=10, offset=10, semantic_ratio=0.5
            )

        assert len(calls) == 2
        kw_call = next(c for c in calls if "hybrid" not in c)
        sem_call = next(c for c in calls if "hybrid" in c)
        assert "vector" not in kw_call
        # Meili's own ratio merge is the bug — the vector leg is pure semantic.
        assert sem_call["hybrid"] == {"embedder": "bge-m3", "semanticRatio": 1.0}
        assert sem_call["vector"] == fake_vec
        # Both legs fetch a window from 0 deep enough for the requested page.
        for call in calls:
            assert call["offset"] == 0
            assert call["limit"] == 10 + 10 * 3

        expected = reciprocal_rank_fusion(
            KEYWORD_HITS, SEMANTIC_HITS, 0.5, query="burglary"
        )[10:20]
        assert result["hits"] == expected
        assert result["search_mode"] == "hybrid"
        assert result["offset"] == 10 and result["limit"] == 10
        assert result["estimatedTotalHits"] == 900
        assert result["processingTimeMs"] == 40

    @pytest.mark.asyncio
    async def test_fused_path_embedder_missing_falls_back_without_extra_call(
        self, service
    ):
        calls: list[dict] = []

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            if "hybrid" in json:
                return _resp(400, {"code": "invalid_search_embedder"})
            return _resp(200, {"hits": KEYWORD_HITS, "estimatedTotalHits": 30})

        with (
            patch("app.services.search.embed_texts", return_value=[0.1] * 1024),
            patch("httpx.AsyncClient.post", new=fake_post),
        ):
            result = await service.documents_search(
                "burglary", limit=5, semantic_ratio=0.5
            )

        # The keyword leg already ran, so no keyword retry of the vector leg.
        assert len(calls) == 2
        assert result["search_mode"] == "keyword_fallback"
        assert _ids(result["hits"]) == _ids(KEYWORD_HITS[:5])
        assert "_hybrid_fallback" not in result

    @pytest.mark.asyncio
    async def test_fused_path_embedding_failure_returns_keyword(self, service):
        calls: list[dict] = []

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            return _resp(200, {"hits": KEYWORD_HITS, "estimatedTotalHits": 30})

        with (
            patch("app.services.search.embed_texts", side_effect=RuntimeError("TEI")),
            patch("httpx.AsyncClient.post", new=fake_post),
        ):
            result = await service.documents_search(
                "burglary", limit=5, offset=5, semantic_ratio=0.75
            )

        assert len(calls) == 1 and "hybrid" not in calls[0]
        assert result["search_mode"] == "keyword"
        assert _ids(result["hits"]) == _ids(KEYWORD_HITS[5:10])

    @pytest.mark.asyncio
    async def test_ratio_zero_stays_a_single_keyword_call(self, service):
        calls: list[dict] = []

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            return _resp(200, {"hits": [], "estimatedTotalHits": 0})

        with patch("httpx.AsyncClient.post", new=fake_post):
            await service.documents_search("burglary", limit=10, offset=20)

        assert len(calls) == 1
        assert calls[0]["limit"] == 10 and calls[0]["offset"] == 20
