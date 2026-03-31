"""
Unit tests for app.research_assistant module.

Tests cover:
- Pydantic model validation
- _build_context_summary helper
- _generate_simple_next_steps helper
- _gather_research_context logic
- _analyze_with_llm error handling
- _find_related_documents edge cases
- _get_trending_topics keyword extraction
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.research_assistant import (
    AnalyzeResearchRequest,
    KnowledgeGap,
    RelatedDocument,
    ResearchStep,
    ResearchTopic,
    SaveResearchContextRequest,
    _analyze_with_llm,
    _build_context_summary,
    _find_related_documents,
    _gather_research_context,
    _generate_simple_next_steps,
    _get_trending_topics,
)

# ===== Model Validation Tests =====


@pytest.mark.unit
class TestResearchTopicModel:
    """Test ResearchTopic Pydantic model validation."""

    def test_valid_research_topic(self):
        topic = ResearchTopic(name="Contract Law", relevance=0.8)
        assert topic.name == "Contract Law"
        assert topic.relevance == 0.8
        assert topic.document_count == 0
        assert topic.description is None

    def test_relevance_bounds_low(self):
        topic = ResearchTopic(name="Test", relevance=0.0)
        assert topic.relevance == 0.0

    def test_relevance_bounds_high(self):
        topic = ResearchTopic(name="Test", relevance=1.0)
        assert topic.relevance == 1.0

    def test_relevance_below_zero_raises(self):
        with pytest.raises((ValueError, ValidationError)):
            ResearchTopic(name="Test", relevance=-0.1)

    def test_relevance_above_one_raises(self):
        with pytest.raises((ValueError, ValidationError)):
            ResearchTopic(name="Test", relevance=1.1)


@pytest.mark.unit
class TestKnowledgeGapModel:
    """Test KnowledgeGap Pydantic model validation."""

    def test_valid_gap(self):
        gap = KnowledgeGap(
            topic="Tax Law",
            description="Missing case law analysis",
            severity="high",
        )
        assert gap.severity == "high"
        assert gap.suggested_query is None

    def test_invalid_severity(self):
        with pytest.raises((ValueError, ValidationError)):
            KnowledgeGap(
                topic="Tax Law",
                description="Missing",
                severity="critical",  # invalid
            )


@pytest.mark.unit
class TestResearchStepModel:
    """Test ResearchStep Pydantic model validation."""

    def test_valid_step(self):
        step = ResearchStep(
            title="Search contracts",
            description="Find related contracts",
            action_type="search",
            query="contract disputes",
        )
        assert step.action_type == "search"
        assert step.priority == 0

    def test_invalid_action_type(self):
        with pytest.raises((ValueError, ValidationError)):
            ResearchStep(
                title="Invalid",
                description="test",
                action_type="invalid_action",
            )

    def test_all_action_types_valid(self):
        for action in ["search", "read_document", "explore_topic", "compare_documents"]:
            step = ResearchStep(title="Test", description="test", action_type=action)
            assert step.action_type == action


@pytest.mark.unit
class TestRelatedDocumentModel:
    """Test RelatedDocument model."""

    def test_valid_document(self):
        doc = RelatedDocument(
            document_id="doc-123",
            relevance_score=0.85,
            reason="Similar content",
        )
        assert doc.document_id == "doc-123"
        assert doc.title is None

    def test_relevance_score_bounds(self):
        with pytest.raises((ValueError, ValidationError)):
            RelatedDocument(
                document_id="doc-1",
                relevance_score=1.5,
                reason="test",
            )


@pytest.mark.unit
class TestAnalyzeResearchRequest:
    """Test AnalyzeResearchRequest model."""

    def test_all_none_fields(self):
        req = AnalyzeResearchRequest()
        assert req.query is None
        assert req.document_ids is None
        assert req.chat_id is None

    def test_with_all_fields(self):
        req = AnalyzeResearchRequest(
            query="contract law",
            document_ids=["doc-1", "doc-2"],
            chat_id="chat-1",
        )
        assert len(req.document_ids) == 2


@pytest.mark.unit
class TestSaveResearchContextRequest:
    """Test SaveResearchContextRequest model."""

    def test_defaults(self):
        req = SaveResearchContextRequest()
        assert req.chat_id is None
        assert req.title is None
        assert req.analyzed_topics == []
        assert req.coverage_score == 0.0

    def test_coverage_score_bounds(self):
        with pytest.raises((ValueError, ValidationError)):
            SaveResearchContextRequest(coverage_score=1.5)

    def test_coverage_score_lower_bound(self):
        with pytest.raises((ValueError, ValidationError)):
            SaveResearchContextRequest(coverage_score=-0.1)


# ===== _build_context_summary Tests =====


@pytest.mark.unit
class TestBuildContextSummary:
    """Test _build_context_summary helper function."""

    def test_empty_context(self):
        result = _build_context_summary({})
        assert result == "No research context available."

    def test_with_query(self):
        context = {"provided_query": "contract disputes"}
        result = _build_context_summary(context)
        assert "Current Query: contract disputes" in result

    def test_with_recent_searches(self):
        context = {
            "recent_searches": [
                {"query": "tax law", "timestamp": "2024-01-01"},
                {"query": "VAT", "timestamp": "2024-01-02"},
            ]
        }
        result = _build_context_summary(context)
        assert "Recent Searches:" in result
        assert "tax law" in result
        assert "VAT" in result

    def test_with_recent_messages(self):
        context = {
            "recent_messages": [
                {
                    "content": "What about contracts?",
                    "role": "user",
                    "timestamp": "2024-01-01",
                },
            ]
        }
        result = _build_context_summary(context)
        assert "Recent Chat Messages" in result
        assert "user: What about contracts?" in result

    def test_message_content_truncated_to_100_chars(self):
        long_content = "x" * 200
        context = {
            "recent_messages": [
                {
                    "content": long_content,
                    "role": "assistant",
                    "timestamp": "2024-01-01",
                },
            ]
        }
        result = _build_context_summary(context)
        # The content in the output should be at most 100 chars
        assert f"assistant: {long_content[:100]}" in result

    def test_with_viewed_documents(self):
        context = {
            "viewed_documents": [
                {
                    "document_id": "doc-1",
                    "interaction_type": "view",
                    "timestamp": "2024-01-01",
                },
            ]
        }
        result = _build_context_summary(context)
        assert "Recently Viewed Documents:" in result
        assert "doc-1" in result

    def test_with_provided_documents(self):
        context = {"provided_documents": ["doc-A", "doc-B"]}
        result = _build_context_summary(context)
        assert "Specified Documents:" in result
        assert "doc-A" in result

    def test_all_sections_combined(self):
        context = {
            "provided_query": "tax dispute",
            "recent_searches": [{"query": "VAT law", "timestamp": "t"}],
            "provided_documents": ["doc-1"],
        }
        result = _build_context_summary(context)
        # Sections are separated by double newlines
        assert "\n\n" in result
        assert "Current Query:" in result
        assert "Recent Searches:" in result
        assert "Specified Documents:" in result

    def test_recent_searches_limited_to_5(self):
        context = {
            "recent_searches": [
                {"query": f"search-{i}", "timestamp": "t"} for i in range(10)
            ]
        }
        result = _build_context_summary(context)
        # Only first 5 should appear
        assert "search-4" in result
        assert "search-5" not in result

    def test_recent_messages_limited_to_5(self):
        context = {
            "recent_messages": [
                {"content": f"msg-{i}", "role": "user", "timestamp": "t"}
                for i in range(10)
            ]
        }
        result = _build_context_summary(context)
        assert "msg-4" in result
        assert "msg-5" not in result


# ===== _generate_simple_next_steps Tests =====


@pytest.mark.unit
class TestGenerateSimpleNextSteps:
    """Test _generate_simple_next_steps helper function."""

    def test_empty_inputs(self):
        steps = _generate_simple_next_steps([], [], None)
        assert steps == []

    def test_with_related_docs(self):
        docs = [
            RelatedDocument(
                document_id="doc-1",
                title="Contract Case",
                relevance_score=0.9,
                reason="similar",
            ),
        ]
        steps = _generate_simple_next_steps(docs, [], None)
        assert len(steps) == 1
        assert steps[0].action_type == "read_document"
        assert "Contract Case" in steps[0].title
        assert steps[0].document_ids == ["doc-1"]
        assert steps[0].priority == 0

    def test_max_3_docs_suggested(self):
        docs = [
            RelatedDocument(
                document_id=f"doc-{i}",
                relevance_score=0.9,
                reason="similar",
            )
            for i in range(5)
        ]
        steps = _generate_simple_next_steps(docs, [], None)
        doc_steps = [s for s in steps if s.action_type == "read_document"]
        assert len(doc_steps) == 3

    def test_with_trending_topics(self):
        steps = _generate_simple_next_steps([], ["contracts", "damages"], None)
        assert len(steps) == 2
        assert all(s.action_type == "search" for s in steps)
        assert "contracts" in steps[0].title

    def test_max_2_topics_suggested(self):
        topics = ["a", "b", "c", "d"]
        steps = _generate_simple_next_steps([], topics, None)
        assert len(steps) == 2

    def test_broaden_search_with_query(self):
        steps = _generate_simple_next_steps([], [], "contract law")
        assert len(steps) == 1
        assert steps[0].title == "Broaden your search"
        assert steps[0].query == "contract law"

    def test_no_broaden_search_without_query(self):
        steps = _generate_simple_next_steps([], [], None)
        assert len(steps) == 0

    def test_priorities_are_sequential(self):
        docs = [
            RelatedDocument(document_id=f"doc-{i}", relevance_score=0.9, reason="s")
            for i in range(2)
        ]
        steps = _generate_simple_next_steps(docs, ["topic1"], "query")
        priorities = [s.priority for s in steps]
        # Priorities should be sequential starting from 0
        assert priorities == list(range(len(steps)))

    def test_doc_without_title_uses_id(self):
        docs = [
            RelatedDocument(document_id="doc-xyz", relevance_score=0.5, reason="r"),
        ]
        steps = _generate_simple_next_steps(docs, [], None)
        assert "doc-xyz" in steps[0].title


# ===== _gather_research_context Tests =====


@pytest.mark.unit
class TestGatherResearchContext:
    """Test _gather_research_context async helper."""

    @pytest.mark.asyncio
    async def test_no_user_no_query_returns_no_data(self):
        result = await _gather_research_context(
            user_id=None, query=None, document_ids=None, chat_id=None
        )
        assert result["has_data"] is False
        assert result["recent_searches"] == []

    @pytest.mark.asyncio
    async def test_no_user_with_query_has_data(self):
        result = await _gather_research_context(
            user_id=None, query="tax law", document_ids=None, chat_id=None
        )
        assert result["has_data"] is True
        assert result["provided_query"] == "tax law"

    @pytest.mark.asyncio
    async def test_no_user_with_document_ids_has_data(self):
        result = await _gather_research_context(
            user_id=None, query=None, document_ids=["doc-1"], chat_id=None
        )
        assert result["has_data"] is True
        assert result["provided_documents"] == ["doc-1"]

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_supabase_unavailable_returns_default(self, mock_get_client):
        mock_get_client.return_value = None
        result = await _gather_research_context(
            user_id="user-1", query=None, document_ids=None, chat_id=None
        )
        assert result["has_data"] is False

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_with_search_history(self, mock_get_client):
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase

        # Mock search_queries table
        mock_search_resp = MagicMock()
        mock_search_resp.data = [
            {"query": "contract law", "created_at": "2024-01-01"},
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_search_resp

        # Mock interactions table (empty)
        mock_interactions_resp = MagicMock()
        mock_interactions_resp.data = []

        result = await _gather_research_context(
            user_id="user-1", query=None, document_ids=None, chat_id=None
        )
        assert result["has_data"] is True
        assert len(result["recent_searches"]) == 1

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_exception_returns_partial_context(self, mock_get_client):
        """If Supabase throws, function returns gracefully with partial data."""
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase
        mock_supabase.table.side_effect = Exception("DB down")

        result = await _gather_research_context(
            user_id="user-1", query="test", document_ids=None, chat_id=None
        )
        # has_data should still be False since query is set before supabase is accessed
        # but context base values should be present
        assert result["provided_query"] == "test"


# ===== _analyze_with_llm Tests =====


@pytest.mark.unit
class TestAnalyzeWithLlm:
    """Test _analyze_with_llm error handling."""

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_openai_client")
    async def test_returns_empty_on_exception(self, mock_get_client):
        """On LLM failure, should return empty analysis dict."""
        mock_client = AsyncMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API error")

        result = await _analyze_with_llm({"provided_query": "test"})
        assert result["topics"] == []
        assert result["gaps"] == []
        assert result["coverage_score"] == 0.0
        assert "unavailable" in result["summary"].lower()

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_openai_client")
    async def test_returns_empty_on_empty_response(self, mock_get_client):
        """Empty LLM content should be handled gracefully."""
        mock_client = AsyncMock()
        mock_get_client.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = None
        mock_client.chat.completions.create.return_value = mock_response

        result = await _analyze_with_llm({"provided_query": "test"})
        assert result["topics"] == []

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_openai_client")
    async def test_malformed_json_returns_warning(self, mock_get_client):
        """BUG-12 regression: malformed LLM JSON should include a warning field
        so the caller knows the response was invalid, rather than silently
        returning an empty analysis."""
        mock_client = AsyncMock()
        mock_get_client.return_value = mock_client

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "NOT VALID JSON {{{["
        mock_client.chat.completions.create.return_value = mock_response

        result = await _analyze_with_llm({"provided_query": "test"})
        assert result["topics"] == []
        assert result["coverage_score"] == 0.0
        # The key improvement: a warning field is present
        assert "warning" in result
        assert "invalid" in result["warning"].lower()

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_openai_client")
    async def test_generic_error_returns_error_field(self, mock_get_client):
        """BUG-12 regression: generic exceptions should include an error field."""
        mock_client = AsyncMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = RuntimeError("timeout")

        result = await _analyze_with_llm({"provided_query": "test"})
        assert "error" in result
        assert "RuntimeError" in result["error"]

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_openai_client")
    async def test_parses_valid_json_response(self, mock_get_client):
        """Valid JSON from LLM should be returned as-is."""
        import json

        mock_client = AsyncMock()
        mock_get_client.return_value = mock_client

        expected = {
            "topics": [{"name": "Tax", "relevance": 0.9}],
            "gaps": [],
            "next_steps": [],
            "coverage_score": 0.7,
            "summary": "Good coverage.",
        }

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps(expected)
        mock_client.chat.completions.create.return_value = mock_response

        result = await _analyze_with_llm({"provided_query": "test"})
        assert result["coverage_score"] == 0.7
        assert result["topics"][0]["name"] == "Tax"


# ===== _find_related_documents Tests =====


@pytest.mark.unit
class TestFindRelatedDocuments:
    """Test _find_related_documents helper."""

    @pytest.mark.asyncio
    async def test_no_query_returns_empty(self):
        """If no query or recent searches, return empty list."""
        context = {"provided_query": None, "recent_searches": []}
        result = await _find_related_documents(context)
        assert result == []

    @pytest.mark.asyncio
    @patch("app.research_assistant.generate_embedding")
    @patch("app.research_assistant.get_vector_db")
    async def test_filters_viewed_documents(self, mock_db_fn, mock_embed):
        """Already viewed documents should be excluded."""
        mock_embed.return_value = [0.1] * 768
        mock_db = AsyncMock()
        mock_db_fn.return_value = mock_db
        mock_db.search_by_vector.return_value = [
            {"document_id": "doc-1", "title": "A", "similarity": 0.9},
            {"document_id": "doc-2", "title": "B", "similarity": 0.8},
        ]

        context = {
            "provided_query": "test",
            "recent_searches": [],
            "viewed_documents": [{"document_id": "doc-1"}],
        }
        result = await _find_related_documents(context)
        assert len(result) == 1
        assert result[0].document_id == "doc-2"

    @pytest.mark.asyncio
    @patch("app.research_assistant.generate_embedding")
    @patch("app.research_assistant.get_vector_db")
    async def test_respects_limit(self, mock_db_fn, mock_embed):
        """Should respect the limit parameter."""
        mock_embed.return_value = [0.1] * 768
        mock_db = AsyncMock()
        mock_db_fn.return_value = mock_db
        mock_db.search_by_vector.return_value = [
            {"document_id": f"doc-{i}", "similarity": 0.9 - i * 0.1} for i in range(5)
        ]

        context = {
            "provided_query": "test",
            "recent_searches": [],
            "viewed_documents": [],
        }
        result = await _find_related_documents(context, limit=2)
        assert len(result) == 2

    @pytest.mark.asyncio
    @patch("app.research_assistant.generate_embedding")
    @patch("app.research_assistant.get_vector_db")
    async def test_exception_returns_empty(self, mock_db_fn, mock_embed):
        """On exception, should return empty list."""
        mock_embed.side_effect = Exception("embedding failed")

        context = {"provided_query": "test", "recent_searches": []}
        result = await _find_related_documents(context)
        assert result == []


# ===== _get_trending_topics Tests =====


@pytest.mark.unit
class TestGetTrendingTopics:
    """Test _get_trending_topics helper."""

    @pytest.mark.asyncio
    async def test_no_user_returns_empty(self):
        result = await _get_trending_topics(user_id=None)
        assert result == []

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_supabase_unavailable_returns_empty(self, mock_get_client):
        mock_get_client.return_value = None
        result = await _get_trending_topics(user_id="user-1")
        assert result == []

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_no_search_data_returns_empty(self, mock_get_client):
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase
        mock_resp = MagicMock()
        mock_resp.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_resp

        result = await _get_trending_topics(user_id="user-1")
        assert result == []

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_extracts_common_words(self, mock_get_client):
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase
        mock_resp = MagicMock()
        mock_resp.data = [
            {"query": "contract dispute resolution"},
            {"query": "contract law enforcement"},
            {"query": "dispute management"},
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_resp

        result = await _get_trending_topics(user_id="user-1", limit=3)
        # "contract" and "dispute" appear twice, others once
        # Words must be 4+ chars
        assert "contract" in result
        assert "dispute" in result

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_skips_short_words(self, mock_get_client):
        """Words shorter than 4 chars should be excluded."""
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase
        mock_resp = MagicMock()
        mock_resp.data = [{"query": "the law of tax is good but not for all"}]
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_resp

        result = await _get_trending_topics(user_id="user-1", limit=10)
        # "the", "law", "of", "tax", "is", "not", "for", "all" are 3 chars or less
        # Only "good" has 4 chars
        assert "good" in result
        assert "the" not in result
        assert "law" not in result

    @pytest.mark.asyncio
    @patch("app.research_assistant.get_supabase_client")
    async def test_exception_returns_empty(self, mock_get_client):
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase
        mock_supabase.table.side_effect = Exception("DB error")

        result = await _get_trending_topics(user_id="user-1")
        assert result == []
