"""Workflow tests for schema_generator_agent using FakeChatModel."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit


def test_agent_state_constructs_with_required_fields():
    """The agent's working state model accepts the required input fields."""
    from schema_generator_agent.agents.agent_state import AgentState

    # Should be able to create minimal state
    state = AgentState(
        messages=[],
        user_input="Extract case numbers from legal judgments",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    assert state["user_input"] == "Extract case numbers from legal judgments"
    assert state["messages"] == []


def test_problem_definer_helper_node_executes(fake_llm_with_schema_response):
    """ProblemDefinerHelperAgent node runs and produces expected state updates."""
    from schema_generator_agent.agents.agent_state import AgentState
    from schema_generator_agent.agents.basic_agents import ProblemDefinerHelperAgent

    # Create node with fake LLM
    node = ProblemDefinerHelperAgent(
        llm=fake_llm_with_schema_response, prompt="Help with: {user_input}"
    )

    # Create initial state
    state = AgentState(
        messages=[],
        user_input="Extract case metadata",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    # Execute the node
    result = node(state)

    # Should return problem_help and messages
    assert "problem_help" in result
    assert "messages" in result
    assert len(result["messages"]) == 1


def test_schema_generator_agent_node_executes(fake_llm_with_schema_response):
    """SchemaGeneratorAgent node processes state and returns JSON schema."""
    from schema_generator_agent.agents.agent_state import AgentState
    from schema_generator_agent.agents.basic_agents import SchemaGeneratorAgent

    # Create node with fake LLM that returns JSON
    node = SchemaGeneratorAgent(
        llm=fake_llm_with_schema_response, prompt="Generate schema for: {problem_definition}"
    )

    # Create state with problem definition
    state = AgentState(
        messages=[],
        user_input="Extract case metadata",
        problem_help=None,
        user_feedback=None,
        problem_definition="Extract case number and court from legal documents",
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    # Execute the node
    result = node(state)

    # Should return current_schema and messages
    assert "current_schema" in result
    assert "messages" in result
    assert len(result["messages"]) == 1
    # Schema should be parsed from fake response
    assert result["current_schema"]["fields"]["case_number"] == "string"


def test_schema_generator_imports_successfully():
    """The full SchemaGenerator can be imported without errors."""
    # Note: Full instantiation requires LLMs with structured output support
    # which FakeChatModel doesn't provide. This test verifies imports work.

    from juddges_search.models import DocumentType

    from schema_generator_agent.agents.schema_generator import SchemaGenerator

    # Verify class exists and can be referenced
    assert SchemaGenerator is not None
    assert DocumentType.JUDGMENT is not None
