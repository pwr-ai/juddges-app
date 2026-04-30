"""Integration test — full agent loop with mocked LLM and tool dependencies.

Verifies the complete Research Agent cycle: plan -> execute -> analyze -> report.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from research_agent.graph import ResearchAgent

# ---------------------------------------------------------------------------
# Mock LLM responses
# ---------------------------------------------------------------------------

PLANNER_RESPONSE = {
    "goal": "Find precedents for VAT deduction on mixed-use vehicles",
    "strategy": "Search semantically then analyze",
    "steps": [
        {
            "tool": "semantic_search",
            "query": "VAT deduction mixed-use vehicle",
            "reason": "Broad search",
        },
        {
            "tool": "semantic_search",
            "query": "VAT vehicle deduction court ruling",
            "reason": "Targeted follow-up",
        },
        {
            "tool": "find_precedents",
            "query": "50% VAT deduction mixed-use vehicle",
            "reason": "Find similar precedents",
        },
    ],
}

ANALYZER_RESPONSE = {
    "new_findings": [
        {
            "type": "precedent",
            "content": "NSA ruled 50% deduction",
            "source_document_ids": ["doc-1"],
            "confidence": 0.9,
        }
    ],
    "new_contradictions": [],
    "overall_confidence": 0.9,
    "needs_user_input": False,
    "should_continue": False,
    "reasoning": "High confidence found",
}

REPORT_WRITER_RESPONSE = {
    "summary": "Research found clear precedent for 50% VAT deduction on mixed-use vehicles.",
    "key_findings": [
        {
            "title": "50% deduction rule",
            "description": "NSA established the 50% deduction standard",
            "confidence": 0.9,
            "sources": ["doc-1"],
        }
    ],
    "gaps": ["EU rulings not explored"],
    "recommendations": ["Review CJEU case law"],
    "sources": [{"document_id": "doc-1", "relevance": "Primary precedent"}],
}


def _make_mock_llm() -> MagicMock:
    """Create a mock LLM that returns different responses for each node.

    The agent calls LLM three times in sequence:
    1. PlannerNode
    2. AnalyzerNode
    3. ReportWriterNode
    """
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(
        side_effect=[
            AIMessage(content=json.dumps(PLANNER_RESPONSE)),
            AIMessage(content=json.dumps(ANALYZER_RESPONSE)),
            AIMessage(content=json.dumps(REPORT_WRITER_RESPONSE)),
        ]
    )
    return mock_llm


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_agent_loop_completes():
    """Agent should plan -> execute -> analyze -> report in a single loop."""

    mock_llm = _make_mock_llm()

    # Mock the lazy imports inside tool functions.
    # semantic_search uses: from juddges_search.retrieval.supabase_search import search_chunks
    # find_precedents uses: from app.documents_pkg.utils import generate_embedding
    #                       from juddges_search.db.supabase_db import get_vector_db

    mock_search_chunks = AsyncMock(return_value=[])
    mock_generate_embedding = AsyncMock(return_value=[0.1] * 768)

    mock_vector_db = MagicMock()
    mock_vector_db.search_by_vector = AsyncMock(return_value=[])
    mock_get_vector_db = MagicMock(return_value=mock_vector_db)

    with (
        patch(
            "juddges_search.retrieval.supabase_search.search_chunks",
            mock_search_chunks,
            create=True,
        ),
        patch(
            "app.documents_pkg.utils.generate_embedding",
            mock_generate_embedding,
            create=True,
        ),
        patch(
            "juddges_search.db.supabase_db.get_vector_db",
            mock_get_vector_db,
            create=True,
        ),
    ):
        agent = ResearchAgent(llm=mock_llm, max_iterations=3)
        initial_state = agent.create_initial_state(
            session_id="test-session-001",
            mode="guided",
            query="What are the precedents for VAT deduction on mixed-use vehicles?",
        )

        result = await agent.graph.ainvoke(initial_state)

    # ---- Assertions ----

    # The agent completed the loop
    assert result["should_stop"] is True
    assert result["iteration"] >= 1

    # The planner produced a research plan
    plan = result.get("research_plan")
    assert plan is not None
    assert "goal" in plan
    assert "steps" in plan
    assert len(plan["steps"]) >= 1

    # The analyzer extracted findings
    assert len(result["findings"]) >= 1
    assert result["findings"][0]["type"] == "precedent"

    # Confidence was set by the analyzer
    assert result["confidence"] >= 0.85

    # The LLM was called exactly 3 times (planner, analyzer, report_writer)
    assert mock_llm.ainvoke.call_count == 3

    # The executor ran the first step (semantic_search) before the analyzer
    # stopped the loop — only one step is executed per iteration.
    assert mock_search_chunks.call_count == 1
