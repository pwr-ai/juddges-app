"""Unit tests for scripts/generate_search_topics.py.

Tests:
1. Smoke test — 50-judgment fixture, dry-run, validates output JSON shape.
2. Slug determinism — make_slug produces stable output.
3. Atomic swap path — mocked Meilisearch, auto-confirm, asserts swapIndexes called.
4. No-confirmation path — user declines, asserts swapIndexes NOT called.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Module loading: load the script via importlib so it works regardless of
# whether ``scripts/`` is a package on sys.path (avoids any __init__.py
# ordering issues during test collection).
# ---------------------------------------------------------------------------


def _load_module():
    """Locate and load scripts/generate_search_topics.py via importlib."""
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        candidate = parent / "scripts" / "generate_search_topics.py"
        if candidate.is_file():
            spec = importlib.util.spec_from_file_location(
                "generate_search_topics", candidate
            )
            module = importlib.util.module_from_spec(spec)
            assert spec.loader is not None
            # Register under both names so patch() targets work.
            sys.modules["generate_search_topics"] = module
            sys.modules["scripts.generate_search_topics"] = module
            spec.loader.exec_module(module)
            return module
    pytest.skip("scripts/generate_search_topics.py not found in repo tree")


_mod = _load_module()

AlignmentOutput = _mod.AlignmentOutput
ClusterLabel = _mod.ClusterLabel
UnifiedConcept = _mod.UnifiedConcept
_fallback_alignment = _mod._fallback_alignment
align_concepts = _mod.align_concepts
label_all_clusters = _mod.label_all_clusters
make_slug = _mod.make_slug
run_pipeline = _mod.run_pipeline
push_topics_run_to_meilisearch = _mod.push_topics_run_to_meilisearch

_MODULE_NAME = "generate_search_topics"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_NOW = datetime(2026, 5, 11, 12, 0, 0, tzinfo=UTC).isoformat()


def _make_rows(n: int, jurisdiction: str = "UK") -> list[dict[str, Any]]:
    """Build n synthetic judgment rows with random embeddings."""
    rng = np.random.default_rng(seed=42)
    rows: list[dict[str, Any]] = []
    for i in range(n):
        emb = rng.uniform(-1, 1, size=64).tolist()
        rows.append(
            {
                "id": f"{jurisdiction.lower()}-{i:04d}",
                "title": f"Case {i} vs Crown — {jurisdiction} criminal matter {i % 10}",
                "summary": (
                    f"The defendant was charged with offence category {i % 8}. "
                    f"The court found the defendant {'guilty' if i % 2 == 0 else 'not guilty'}. "
                    f"Sentence imposed: {(i % 5) * 2} months."
                ),
                "embedding": emb,
                "department_name": "Wydział Karny" if jurisdiction == "PL" else None,
                "case_type": "Criminal",
                "jurisdiction": jurisdiction,
            }
        )
    return rows


def _make_cluster(
    label: str,
    doc_count: int,
    jur: str = "uk",
) -> dict[str, Any]:
    """Minimal labelled cluster dict."""
    return {
        "topic_id": 0,
        "keywords": [label.lower(), "criminal", "court"],
        "doc_count": doc_count,
        "representative_rows": [{"title": f"{label} case", "summary": f"{label} desc"}],
        "label": label,
        "label_keywords": [label.lower(), "offence"],
        "description": f"{label} criminal law cluster.",
    }


# ---------------------------------------------------------------------------
# 1. Slug determinism
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestMakeSlug:
    def test_ascii_label(self):
        assert make_slug("Drug trafficking") == "drug_trafficking"

    def test_polish_label(self):
        slug = make_slug("Handel narkotykami")
        assert slug == "handel_narkotykami"
        assert slug.isascii()

    def test_accented_chars(self):
        slug = make_slug("Kradziez z wlamaniem")
        assert slug.isascii()
        assert "_" in slug or slug.replace("_", "").isalpha()

    def test_deterministic_repeated_calls(self):
        label = "Zorganizowana przestępczość"
        assert make_slug(label) == make_slug(label)

    def test_special_characters_stripped(self):
        assert make_slug("(Drug/Narcotics) — offences!") == "drug_narcotics_offences"

    def test_empty_string(self):
        assert make_slug("") == "unknown"

    def test_same_concept_different_cases(self):
        # Case-insensitive
        assert make_slug("Fraud") == make_slug("fraud")


# ---------------------------------------------------------------------------
# 2. Fallback alignment (no LLM)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFallbackAlignment:
    def test_produces_concepts_from_pl_and_uk(self):
        pl = [_make_cluster("Rozboj", 50, "pl")]
        uk = [_make_cluster("Robbery", 60, "uk")]
        out = _fallback_alignment(pl, uk)
        assert len(out) == 2
        ids = {c.id for c in out}
        assert "rozboj" in ids
        assert "robbery" in ids

    def test_sets_correct_jurisdictions(self):
        pl = [_make_cluster("Morderstwo", 30, "pl")]
        uk = [_make_cluster("Homicide", 40, "uk")]
        out = _fallback_alignment(pl, uk)
        jur_map = {c.id: c.jurisdictions for c in out}
        assert jur_map["morderstwo"] == ["pl"]
        assert jur_map["homicide"] == ["uk"]


# ---------------------------------------------------------------------------
# 3. align_concepts with mocked LLM
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestAlignConcepts:
    def _mock_client(self, concepts: list[dict[str, Any]]) -> MagicMock:
        """Return an OpenAI client mock whose parse() returns AlignmentOutput."""
        unified = [UnifiedConcept(**c) for c in concepts]
        parsed = AlignmentOutput(concepts=unified)
        mock_msg = MagicMock()
        mock_msg.parsed = parsed
        mock_choice = MagicMock()
        mock_choice.message = mock_msg
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]

        client = MagicMock()
        client.beta.chat.completions.parse.return_value = mock_resp
        return client

    def test_merged_concept_has_both_jurisdictions(self):
        mock_concept = {
            "id": "drug_trafficking",
            "label_pl": "Handel narkotykami",
            "label_en": "Drug trafficking",
            "aliases_pl": ["narkomania"],
            "aliases_en": ["narcotics"],
            "category": "drug_offences",
            "doc_count": 100,
            "jurisdictions": ["pl", "uk"],
        }
        client = self._mock_client([mock_concept])
        pl = [_make_cluster("Handel narkotykami", 50, "pl")]
        uk = [_make_cluster("Drug trafficking", 50, "uk")]

        result = align_concepts(
            client,
            pl_clusters=pl,
            uk_clusters=uk,
            max_concepts=500,
            generated_at=_NOW,
            corpus_snapshot=1000,
        )

        assert len(result) == 1
        c = result[0]
        assert c["id"] == "drug_trafficking"
        assert "pl" in c["jurisdictions"] and "uk" in c["jurisdictions"]
        assert c["generated_at"] == _NOW
        assert c["corpus_snapshot"] == 1000

    def test_slug_is_regenerated_from_label_en(self):
        """Even if the LLM returns a non-slug id, make_slug normalises it."""
        mock_concept = {
            "id": "Some Weird ID",  # non-slug
            "label_pl": "Fraude",
            "label_en": "Fraud & Deception",
            "aliases_pl": [],
            "aliases_en": [],
            "category": "fraud",
            "doc_count": 10,
            "jurisdictions": ["uk"],
        }
        client = self._mock_client([mock_concept])
        result = align_concepts(
            client,
            pl_clusters=[],
            uk_clusters=[_make_cluster("Fraud", 10, "uk")],
            max_concepts=500,
            generated_at=_NOW,
            corpus_snapshot=500,
        )
        assert result[0]["id"] == "fraud_deception"

    def test_capped_at_max_concepts(self):
        concepts = [
            {
                "id": f"concept_{i}",
                "label_pl": f"Pojęcie {i}",
                "label_en": f"Concept {i}",
                "aliases_pl": [],
                "aliases_en": [],
                "category": "other",
                "doc_count": 100 - i,
                "jurisdictions": ["uk"],
            }
            for i in range(20)
        ]
        client = self._mock_client(concepts)
        result = align_concepts(
            client,
            pl_clusters=[],
            uk_clusters=[_make_cluster(f"C{i}", 10) for i in range(20)],
            max_concepts=5,
            generated_at=_NOW,
            corpus_snapshot=200,
        )
        assert len(result) <= 5

    def test_sorted_by_doc_count_desc(self):
        concepts = [
            {
                "id": f"c{i}",
                "label_pl": f"P{i}",
                "label_en": f"E{i}",
                "aliases_pl": [],
                "aliases_en": [],
                "category": "other",
                "doc_count": i * 10,
                "jurisdictions": ["uk"],
            }
            for i in range(5)
        ]
        client = self._mock_client(concepts)
        result = align_concepts(
            client,
            pl_clusters=[],
            uk_clusters=[_make_cluster(f"C{i}", i * 10) for i in range(5)],
            max_concepts=500,
            generated_at=_NOW,
            corpus_snapshot=100,
        )
        counts = [r["doc_count"] for r in result]
        assert counts == sorted(counts, reverse=True)


# ---------------------------------------------------------------------------
# 4. Smoke test — end-to-end dry-run on fixture corpus
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSmokeEndToEnd:
    """Run the full pipeline with mocked Supabase, BERTopic, and OpenAI calls."""

    def _cluster_label_mock(self, *args, **kwargs) -> ClusterLabel:
        return ClusterLabel(
            label="Drug trafficking",
            keywords=["narcotics", "trafficking", "drugs"],
            description="Criminal drug offences.",
        )

    def _alignment_mock(
        self,
        client,
        pl_clusters,
        uk_clusters,
        **kwargs,
    ) -> list[dict[str, Any]]:
        """Return a minimal but schema-valid list of concepts."""
        concepts: list[dict[str, Any]] = []
        for i, c in enumerate(pl_clusters[:3] + uk_clusters[:3]):
            jur = ["pl"] if i < 3 else ["uk"]
            if i < 3 and i < len(uk_clusters):
                jur = ["pl", "uk"]
            lbl_en = c.get("label", f"Concept {i}")
            concepts.append(
                {
                    "id": make_slug(lbl_en),
                    "label_pl": c.get("label", lbl_en),
                    "label_en": lbl_en,
                    "aliases_pl": c.get("label_keywords", [])[:3],
                    "aliases_en": c.get("label_keywords", [])[:3],
                    "category": "drug_offences",
                    "doc_count": c.get("doc_count", 10),
                    "jurisdictions": jur,
                    "generated_at": kwargs.get("generated_at", ""),
                    "corpus_snapshot": kwargs.get("corpus_snapshot", 0),
                }
            )
        return sorted(concepts, key=lambda x: x["doc_count"], reverse=True)[
            : kwargs.get("max_concepts", 500)
        ]

    @pytest.mark.asyncio
    async def test_dry_run_produces_valid_output(self, tmp_path):
        """Smoke test: 50-judgment fixture, dry-run, validates output shape."""

        pl_rows = _make_rows(25, jurisdiction="PL")
        uk_rows = _make_rows(25, jurisdiction="UK")

        output_file = tmp_path / "search-topics.json"

        # Mock Supabase pulls
        def _mock_pull(jurisdiction, case_type="criminal", sample=6000):
            return pl_rows if jurisdiction.lower() == "pl" else uk_rows

        # Mock count
        def _mock_count(case_type="criminal"):
            return 50

        # Mock BERTopic clustering: return 3 clusters per jurisdiction
        def _mock_cluster(rows, jurisdiction, nr_topics=75):
            clusters = [
                {
                    "topic_id": i,
                    "keywords": [f"keyword_{i}_{jurisdiction}"],
                    "doc_count": 8,
                    "representative_rows": rows[:3],
                }
                for i in range(3)
            ]
            topics = [i % 3 for i in range(len(rows))]
            texts = [r.get("summary", "") for r in rows]
            return clusters, topics, texts

        mock_openai_client = MagicMock()

        # Mock label_cluster to avoid real API calls
        def _mock_label_all(client, clusters, jurisdiction):
            return [
                {
                    **c,
                    "label": f"Label {c['topic_id']} {jurisdiction.upper()}",
                    "label_keywords": ["kw1", "kw2"],
                    "description": "Test description.",
                }
                for c in clusters
            ]

        with (
            patch(
                f"{_MODULE_NAME}.pull_criminal_judgments",
                side_effect=_mock_pull,
            ),
            patch(
                f"{_MODULE_NAME}.count_criminal_judgments",
                side_effect=_mock_count,
            ),
            patch(
                f"{_MODULE_NAME}.cluster_with_bertopic",
                side_effect=_mock_cluster,
            ),
            patch(
                f"{_MODULE_NAME}.label_all_clusters",
                side_effect=_mock_label_all,
            ),
            patch(
                f"{_MODULE_NAME}.align_concepts",
                side_effect=self._alignment_mock,
            ),
            patch(
                f"{_MODULE_NAME}._build_openai_client",
                return_value=mock_openai_client,
            ),
        ):
            await run_pipeline(
                jurisdictions="pl,uk",
                case_type="criminal",
                output=output_file,
                sample_per_jurisdiction=25,
                clusters_per_jurisdiction=3,
                max_concepts=500,
                dry_run=True,
            )

        # Validate file was written
        assert output_file.exists()
        with output_file.open() as fh:
            data = json.load(fh)

        assert isinstance(data, list)
        assert len(data) <= 500

        # Validate required fields on every concept
        required_fields = {
            "id",
            "label_pl",
            "label_en",
            "aliases_pl",
            "aliases_en",
            "category",
            "doc_count",
            "jurisdictions",
            "generated_at",
            "corpus_snapshot",
        }
        for concept in data:
            missing = required_fields - set(concept.keys())
            assert not missing, f"Concept {concept.get('id')} missing fields: {missing}"
            assert isinstance(concept["doc_count"], int)
            assert isinstance(concept["jurisdictions"], list)
            # generated_at must parse as ISO 8601
            datetime.fromisoformat(concept["generated_at"])

        # At least one concept should have both jurisdictions merged
        multi_jur = [c for c in data if set(c["jurisdictions"]) == {"pl", "uk"}]
        assert len(multi_jur) >= 1, "Expected at least one merged PL+UK concept"

    @pytest.mark.asyncio
    async def test_dry_run_does_not_touch_meilisearch(self, tmp_path):
        """Dry-run must never publish to Supabase or Meilisearch."""
        pl_rows = _make_rows(10, jurisdiction="PL")
        uk_rows = _make_rows(10, jurisdiction="UK")
        output_file = tmp_path / "topics.json"

        def _mock_pull(jurisdiction, **kw):
            return pl_rows if jurisdiction.lower() == "pl" else uk_rows

        def _mock_cluster(rows, jurisdiction, **kw):
            clusters = [
                {
                    "topic_id": 0,
                    "keywords": ["test"],
                    "doc_count": 5,
                    "representative_rows": rows[:2],
                }
            ]
            return clusters, [0] * len(rows), ["text"] * len(rows)

        def _mock_label_all(client, clusters, jurisdiction):
            return [
                {**c, "label": "Test", "label_keywords": [], "description": "Desc."}
                for c in clusters
            ]

        with (
            patch(
                f"{_MODULE_NAME}.pull_criminal_judgments",
                side_effect=_mock_pull,
            ),
            patch(f"{_MODULE_NAME}.count_criminal_judgments", return_value=20),
            patch(
                f"{_MODULE_NAME}.cluster_with_bertopic",
                side_effect=_mock_cluster,
            ),
            patch(
                f"{_MODULE_NAME}.label_all_clusters",
                side_effect=_mock_label_all,
            ),
            patch(
                f"{_MODULE_NAME}.align_concepts",
                side_effect=self._alignment_mock,
            ),
            patch(
                f"{_MODULE_NAME}._build_openai_client",
                return_value=MagicMock(),
            ),
            patch(
                f"{_MODULE_NAME}.persist_search_topics_run",
                new_callable=MagicMock,
            ) as mock_persist,
            patch(
                f"{_MODULE_NAME}.push_topics_run_to_meilisearch",
                new_callable=AsyncMock,
            ) as mock_push,
        ):
            await run_pipeline(
                jurisdictions="pl,uk",
                output=output_file,
                sample_per_jurisdiction=10,
                clusters_per_jurisdiction=1,
                max_concepts=500,
                dry_run=True,
            )

        mock_persist.assert_not_called()
        mock_push.assert_not_called()

    @pytest.mark.asyncio
    async def test_non_dry_run_persists_supabase_snapshot_before_meili_push(
        self, tmp_path
    ):
        """Real publish path must write to Supabase, then push that run to Meili."""
        pl_rows = _make_rows(6, jurisdiction="PL")
        uk_rows = _make_rows(6, jurisdiction="UK")
        output_file = tmp_path / "topics.json"

        def _mock_pull(jurisdiction, **kw):
            return pl_rows if jurisdiction.lower() == "pl" else uk_rows

        def _mock_cluster(rows, jurisdiction, **kw):
            clusters = [
                {
                    "topic_id": 0,
                    "keywords": ["test"],
                    "doc_count": 3,
                    "representative_rows": rows[:2],
                }
            ]
            return clusters, [0] * len(rows), ["text"] * len(rows)

        def _mock_label_all(client, clusters, jurisdiction):
            return [
                {**c, "label": "Test", "label_keywords": [], "description": "Desc."}
                for c in clusters
            ]

        with (
            patch(
                f"{_MODULE_NAME}.pull_criminal_judgments",
                side_effect=_mock_pull,
            ),
            patch(f"{_MODULE_NAME}.count_criminal_judgments", return_value=12),
            patch(
                f"{_MODULE_NAME}.cluster_with_bertopic",
                side_effect=_mock_cluster,
            ),
            patch(
                f"{_MODULE_NAME}.label_all_clusters",
                side_effect=_mock_label_all,
            ),
            patch(
                f"{_MODULE_NAME}.align_concepts",
                side_effect=self._alignment_mock,
            ),
            patch(
                f"{_MODULE_NAME}._build_openai_client",
                return_value=MagicMock(),
            ),
            patch(
                f"{_MODULE_NAME}.persist_search_topics_run",
                return_value="run-123",
            ) as mock_persist,
            patch(
                f"{_MODULE_NAME}.push_topics_run_to_meilisearch",
                new_callable=AsyncMock,
                return_value=True,
            ) as mock_push,
        ):
            await run_pipeline(
                jurisdictions="pl,uk",
                output=output_file,
                sample_per_jurisdiction=6,
                clusters_per_jurisdiction=1,
                max_concepts=500,
                dry_run=False,
            )

        mock_persist.assert_called_once()
        _, kwargs = mock_persist.call_args
        assert kwargs["case_type"] == "criminal"
        mock_push.assert_awaited_once_with(run_id="run-123")


# ---------------------------------------------------------------------------
# 5. Atomic swap path (auto-confirm YES)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestAtomicSwap:
    """Test push_to_meilisearch with a fully mocked MeiliSearchService."""

    def _build_mock_service(self) -> MagicMock:
        svc = MagicMock()
        svc.admin_configured = True
        svc.base_url = "http://meili:7700"
        svc.index_name = "topics_new"

        # All async admin methods succeed
        async def _ok(*a, **kw):
            return {"taskUid": 1, "status": "enqueued"}

        async def _ok_stats(*a, **kw):
            return {"status": "succeeded"}

        async def _ok_docs(*a, **kw):
            return {"results": []}

        svc.delete_index = AsyncMock(return_value={"status": "not_found"})
        svc.create_index = AsyncMock(return_value={"taskUid": 1})
        svc.configure_index = AsyncMock(return_value={"taskUid": 2})
        svc.upsert_documents = AsyncMock(return_value={"taskUid": 3})
        svc.wait_for_task = AsyncMock(return_value={"status": "succeeded"})
        svc.get_documents = AsyncMock(return_value={"results": []})
        svc.swap_indexes = AsyncMock(return_value={"taskUid": 4})
        svc.index_exists = AsyncMock(return_value=False)
        return svc

    @pytest.mark.asyncio
    async def test_swap_called_on_confirm_yes(self):
        """On user confirmation YES, swapIndexes must be called."""
        push_to_meilisearch = _mod.push_to_meilisearch

        mock_svc = self._build_mock_service()
        concepts = [
            {
                "id": "drug_trafficking",
                "label_pl": "Handel narkotykami",
                "label_en": "Drug trafficking",
                "aliases_pl": [],
                "aliases_en": [],
                "category": "drug_offences",
                "doc_count": 100,
                "jurisdictions": ["pl", "uk"],
                "generated_at": _NOW,
                "corpus_snapshot": 1000,
            }
        ]

        with (
            patch(
                f"{_MODULE_NAME}.MeiliSearchService",
                return_value=mock_svc,
            ),
            patch(
                f"{_MODULE_NAME}.setup_topics_meilisearch_index",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                f"{_MODULE_NAME}.Confirm.ask",
                return_value=True,
            ),
        ):
            result = await push_to_meilisearch(
                concepts, live_index="topics", staging_index="topics_new"
            )

        assert result is True
        mock_svc.swap_indexes.assert_called_once_with("topics", "topics_new")
        mock_svc.upsert_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_swap_not_called_on_confirm_no(self):
        """When user declines, swapIndexes must NOT be called."""
        push_to_meilisearch = _mod.push_to_meilisearch

        mock_svc = self._build_mock_service()
        concepts = [
            {
                "id": "fraud",
                "label_pl": "Oszustwo",
                "label_en": "Fraud",
                "aliases_pl": [],
                "aliases_en": [],
                "category": "fraud",
                "doc_count": 50,
                "jurisdictions": ["uk"],
                "generated_at": _NOW,
                "corpus_snapshot": 500,
            }
        ]

        with (
            patch(
                f"{_MODULE_NAME}.MeiliSearchService",
                return_value=mock_svc,
            ),
            patch(
                f"{_MODULE_NAME}.setup_topics_meilisearch_index",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                f"{_MODULE_NAME}.Confirm.ask",
                return_value=False,
            ),
        ):
            result = await push_to_meilisearch(
                concepts, live_index="topics", staging_index="topics_new"
            )

        assert result is False
        mock_svc.swap_indexes.assert_not_called()
        # The staging index SHOULD have been populated (upsert was called)
        mock_svc.upsert_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_topics_new_index_created_before_swap(self):
        """The staging index must be set up (delete → setup → upsert) before swap."""
        push_to_meilisearch = _mod.push_to_meilisearch

        mock_svc = self._build_mock_service()
        call_order: list[str] = []

        original_delete = mock_svc.delete_index

        async def _tracked_delete(*a, **kw):
            call_order.append("delete_index")
            return await original_delete(*a, **kw)

        async def _tracked_setup(svc):
            call_order.append("setup")
            return True

        async def _tracked_upsert(*a, **kw):
            call_order.append("upsert")
            return {"taskUid": 3}

        mock_svc.delete_index = _tracked_delete
        mock_svc.upsert_documents = _tracked_upsert

        with (
            patch(
                f"{_MODULE_NAME}.MeiliSearchService",
                return_value=mock_svc,
            ),
            patch(
                f"{_MODULE_NAME}.setup_topics_meilisearch_index",
                side_effect=_tracked_setup,
            ),
            patch(
                f"{_MODULE_NAME}.Confirm.ask",
                return_value=True,
            ),
        ):
            await push_to_meilisearch(
                [
                    {
                        "id": "homicide",
                        "label_pl": "Zabójstwo",
                        "label_en": "Homicide",
                        "aliases_pl": [],
                        "aliases_en": [],
                        "category": "violence",
                        "doc_count": 80,
                        "jurisdictions": ["pl"],
                        "generated_at": _NOW,
                        "corpus_snapshot": 800,
                    }
                ],
                live_index="topics",
                staging_index="topics_new",
            )

        # delete and setup must precede upsert
        assert call_order.index("delete_index") < call_order.index("upsert")


@pytest.mark.unit
class TestPushTopicsRunToMeili:
    @pytest.mark.asyncio
    async def test_loads_supabase_rows_and_pushes_meili_documents(self):
        rows = [
            {
                "id": "fraud",
                "label_pl": "Oszustwo",
                "label_en": "Fraud",
                "aliases_pl": ["wyłudzenie"],
                "aliases_en": ["deception"],
                "category": "fraud",
                "doc_count": 42,
                "jurisdictions": ["uk"],
                "generated_at": _NOW,
                "corpus_snapshot": 500,
            }
        ]
        expected_docs = [dict(rows[0])]

        with (
            patch(f"{_MODULE_NAME}.load_search_topics_run", return_value=rows),
            patch(
                f"{_MODULE_NAME}.topic_row_to_meilisearch_document",
                side_effect=lambda row: dict(row),
            ),
            patch(
                f"{_MODULE_NAME}.push_to_meilisearch",
                new_callable=AsyncMock,
                return_value=True,
            ) as mock_push,
        ):
            result = await push_topics_run_to_meilisearch(run_id="run-123")

        assert result is True
        mock_push.assert_awaited_once_with(
            expected_docs,
            live_index="topics",
            staging_index="topics_new",
        )
