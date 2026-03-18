"""Edge case tests for schema generation."""

import pytest
from juddges_search.models import DocumentType
from langchain_openai import ChatOpenAI
from langgraph.graph import END

from schema_generator_agent.agents.agent_state import AgentState
from schema_generator_agent.agents.schema_generator import (
    SchemaGenerator,
    load_prompts,
    route_after_assessment,
    route_after_data_assessment_merger,
)


@pytest.fixture
def llm():
    """Create LLM instance for testing."""
    return ChatOpenAI(model="gpt-4o-mini", temperature=0.3)


@pytest.fixture
def prompts():
    """Load prompts for testing."""
    return load_prompts(DocumentType.JUDGMENT)


@pytest.fixture
def schema_generator(llm, prompts):
    """Create SchemaGenerator instance."""
    return SchemaGenerator(
        llm=llm,
        document_type=DocumentType.JUDGMENT,
        prompt_problem_definer_helper=prompts["problem_definer_helper_prompt"],
        prompt_problem_definer=prompts["problem_definer_prompt"],
        prompt_schema_generator=prompts["schema_generator_prompt"],
        prompt_schema_assessment=prompts["schema_assessment_prompt"],
        prompt_schema_refiner=prompts["schema_refiner_prompt"],
        prompt_query_generator=prompts["query_generator_prompt"],
        prompt_schema_data_assessment=prompts["schema_data_assessment_prompt"],
        prompt_schema_data_assessment_merger=prompts[
            "schema_data_assessment_merger_prompt"
        ],
        prompt_schema_data_refiner=prompts["schema_data_refiner_prompt"],
        use_interrupt=False,
    )


def test_route_after_assessment_needs_refinement():
    """Test routing when schema needs refinement."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result={"confidence_score": 0.6, "needs_refinement": True},
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    route = route_after_assessment(state)
    assert route == "llm_schema_refiner", (
        "Should route to refiner when needs refinement"
    )


def test_route_after_assessment_low_confidence():
    """Test routing when confidence is low."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=2,
        assessment_result={
            "confidence_score": 0.7,  # Below 0.85 threshold
            "needs_refinement": False,
        },
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    route = route_after_assessment(state)
    assert route == "llm_schema_refiner", (
        "Should route to refiner when confidence is low"
    )


def test_route_after_assessment_max_rounds():
    """Test that max refinement rounds are respected."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=5,  # At max rounds
        assessment_result={"confidence_score": 0.6, "needs_refinement": True},
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    route = route_after_assessment(state)
    assert route == "llm_schema_data_assessment", (
        "Should stop refining after max rounds"
    )


def test_route_after_assessment_high_confidence():
    """Test routing when schema has high confidence."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=1,
        assessment_result={"confidence_score": 0.9, "needs_refinement": False},
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    route = route_after_assessment(state)
    assert route == "llm_schema_data_assessment", (
        "Should proceed to data assessment when confident"
    )


def test_route_after_data_assessment_merger_needs_refinement():
    """Test routing after data assessment when refinement is needed."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        data_assessment_results=None,
        merged_data_assessment={"confidence_score": 0.7, "needs_refinement": True},
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    route = route_after_data_assessment_merger(state)
    assert route == "llm_schema_data_refiner", (
        "Should route to data refiner when needed"
    )


def test_route_after_data_assessment_merger_max_rounds():
    """Test that max data refinement rounds are respected."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        data_assessment_results=None,
        merged_data_assessment={"confidence_score": 0.6, "needs_refinement": True},
        data_refinement_rounds=5,  # At max
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    route = route_after_data_assessment_merger(state)
    assert route == END, "Should end after max data refinement rounds"


def test_route_after_data_assessment_merger_complete():
    """Test routing when data assessment is complete."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        data_assessment_results=None,
        merged_data_assessment={"confidence_score": 0.9, "needs_refinement": False},
        data_refinement_rounds=1,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    route = route_after_data_assessment_merger(state)
    assert route == END, "Should end when data assessment is complete"


def test_empty_user_input_handling():
    """Test that empty user input is handled gracefully."""
    from langchain_openai import ChatOpenAI

    from schema_generator_agent.agents.basic_agents import ProblemDefinerHelperAgent

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
    prompts = load_prompts(DocumentType.JUDGMENT)

    agent = ProblemDefinerHelperAgent(llm, prompts["problem_definer_helper_prompt"])

    # Empty user input should still be processed (may return clarification request)
    state = AgentState(
        messages=[],
        user_input="",
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

    result = agent(state)
    # Should return something even if input is empty
    assert "problem_help" in result


def test_very_long_user_input():
    """Test handling of very long user input."""
    from langchain_openai import ChatOpenAI

    from schema_generator_agent.agents.basic_agents import ProblemDefinerHelperAgent

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
    prompts = load_prompts(DocumentType.JUDGMENT)

    agent = ProblemDefinerHelperAgent(llm, prompts["problem_definer_helper_prompt"])

    # Very long input (but not exceeding token limits)
    long_input = "Extract party names and dates " * 50

    state = AgentState(
        messages=[],
        user_input=long_input,
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

    result = agent(state)
    assert "problem_help" in result
    assert result["problem_help"] is not None


def test_schema_history_accumulation():
    """Test that schema history accumulates correctly."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema={"type": "object", "properties": {}},
        schema_history=[
            {"type": "object", "properties": {"field1": {"type": "string"}}}
        ],
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

    # Schema history should be a list
    assert isinstance(state["schema_history"], list)
    assert len(state["schema_history"]) == 1


def test_missing_assessment_result():
    """Test routing when assessment_result is missing."""
    state = AgentState(
        messages=[],
        user_input="test",
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=None,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,  # Missing
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    # Should handle missing assessment gracefully
    route = route_after_assessment(state)
    # With no assessment and defaults, should route to data assessment
    assert route == "llm_schema_data_assessment"


def test_load_prompts_for_court_decision():
    """Test that prompts load correctly for court decision document type."""
    prompts = load_prompts(DocumentType.JUDGMENT)

    # Should have all required prompt keys
    expected_keys = [
        "problem_definer_helper_prompt",
        "problem_definer_prompt",
        "schema_generator_prompt",
        "schema_assessment_prompt",
        "schema_refiner_prompt",
        "query_generator_prompt",
        "schema_data_assessment_prompt",
        "schema_data_assessment_merger_prompt",
        "schema_data_refiner_prompt",
    ]

    for key in expected_keys:
        assert key in prompts, f"Missing prompt key: {key}"
        assert isinstance(prompts[key], str)
        assert len(prompts[key]) > 0
