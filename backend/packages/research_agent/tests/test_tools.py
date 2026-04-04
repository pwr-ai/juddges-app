"""Tests for Research Agent tool definitions."""

import pytest
from langchain_core.tools import BaseTool

from research_agent.tools import (
    analyze_argumentation,
    find_precedents,
    keyword_search,
    semantic_search,
    summarize_documents,
)


class TestToolDefinitions:
    """Verify all tools are properly defined LangChain tools."""

    @pytest.mark.parametrize(
        "tool_fn",
        [
            semantic_search,
            keyword_search,
            find_precedents,
            summarize_documents,
            analyze_argumentation,
        ],
    )
    def test_tool_is_langchain_tool(self, tool_fn):
        assert isinstance(tool_fn, BaseTool)

    @pytest.mark.parametrize(
        "tool_fn",
        [
            semantic_search,
            keyword_search,
            find_precedents,
            summarize_documents,
            analyze_argumentation,
        ],
    )
    def test_tool_has_description(self, tool_fn):
        assert tool_fn.description
        assert len(tool_fn.description) > 20

    def test_semantic_search_schema(self):
        schema = semantic_search.args_schema.model_json_schema()
        assert "query" in schema["properties"]

    def test_keyword_search_schema(self):
        schema = keyword_search.args_schema.model_json_schema()
        assert "query" in schema["properties"]

    def test_find_precedents_schema(self):
        schema = find_precedents.args_schema.model_json_schema()
        assert "fact_pattern" in schema["properties"]

    def test_summarize_documents_schema(self):
        schema = summarize_documents.args_schema.model_json_schema()
        assert "document_ids" in schema["properties"]

    def test_analyze_argumentation_schema(self):
        schema = analyze_argumentation.args_schema.model_json_schema()
        assert "document_ids" in schema["properties"]
