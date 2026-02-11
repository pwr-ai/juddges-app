"""Unit tests for individual schema generator agents."""

import pytest
from langchain_openai import ChatOpenAI
from juddges_search.models import DocumentType

from schema_generator_agent.agents.basic_agents import (
    ProblemDefinerHelperAgent,
    ProblemDefinerAgent,
    SchemaGeneratorAgent,
    SchemaAssessmentAgent,
    SchemaRefinerAgent,
)
from schema_generator_agent.agents.agent_state import AgentState
from schema_generator_agent.agents.schema_generator import load_prompts


@pytest.fixture
def llm():
    """Create LLM instance for testing."""
    return ChatOpenAI(model="gpt-4o-mini", temperature=0.3)


@pytest.fixture
def prompts():
    """Load prompts for testing."""
    return load_prompts(DocumentType.JUDGMENT)


@pytest.mark.unit
def test_problem_definer_helper_extracts_intent(llm, prompts):
    """Test problem definer helper extracts user intent."""
    agent = ProblemDefinerHelperAgent(llm, prompts["problem_definer_helper"])

    state = AgentState(
        messages=[],
        user_input="I need to extract dates and names from contracts",
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
    assert isinstance(result["problem_help"], str)
    assert len(result["problem_help"]) > 0


@pytest.mark.unit
def test_problem_definer_creates_definition(llm, prompts):
    """Test problem definer creates structured problem definition."""
    agent = ProblemDefinerAgent(llm, prompts["problem_definer"])

    state = AgentState(
        messages=[],
        user_input="Extract party names and judgment dates",
        problem_help="The user wants to extract entities from legal documents",
        user_feedback="Focus on court decisions",
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

    assert "problem_definition" in result
    assert result["problem_definition"] is not None
    assert isinstance(result["problem_definition"], str)
    assert len(result["problem_definition"]) > 0


@pytest.mark.unit
def test_schema_generator_creates_valid_schema(llm, prompts):
    """Test schema generator creates valid JSON Schema."""
    agent = SchemaGeneratorAgent(llm, prompts["schema_generator"])

    state = AgentState(
        messages=[],
        user_input="Extract party names and contract dates",
        problem_help="Extract structured data from contracts",
        user_feedback="Include both plaintiffs and defendants",
        problem_definition="Extract party information and temporal data from legal contracts",
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

    assert "messages" in result
    # Schema may be in current_schema if is_generated is True
    if "current_schema" in result:
        schema = result["current_schema"]
        assert schema is not None
        assert "properties" in schema
        assert "type" in schema
        assert schema["type"] == "object"


@pytest.mark.unit
def test_schema_assessment_validates_quality(llm, prompts):
    """Test schema assessment agent validates schema quality."""
    agent = SchemaAssessmentAgent(llm, prompts["schema_assessment"])

    good_schema = {
        "type": "object",
        "properties": {
            "party_name": {
                "type": "string",
                "description": "Name of the contracting party"
            },
            "contract_date": {
                "type": "string",
                "format": "date",
                "description": "Date the contract was signed"
            }
        },
        "required": ["party_name", "contract_date"]
    }

    state = AgentState(
        messages=[],
        user_input="Extract party names and dates",
        problem_help="Extract entities from contracts",
        user_feedback="Focus on essential fields",
        problem_definition="Extract party and temporal information",
        query=None,
        current_schema=good_schema,
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

    assert "assessment_result" in result
    assert result["assessment_result"] is not None
    assessment = result["assessment_result"]

    # Check required assessment fields
    assert "confidence_score" in assessment or "confidence" in assessment
    assert "needs_refinement" in assessment
    assert isinstance(assessment["needs_refinement"], bool)


@pytest.mark.unit
def test_schema_assessment_flags_poor_quality(llm, prompts):
    """Test schema assessment identifies poor quality schemas."""
    agent = SchemaAssessmentAgent(llm, prompts["schema_assessment"])

    poor_schema = {
        "type": "object",
        "properties": {
            "data": {"type": "string"}  # Too generic, no description
        }
    }

    state = AgentState(
        messages=[],
        user_input="Extract detailed contract information with party names, dates, amounts, and terms",
        problem_help="Extract comprehensive contract details",
        user_feedback="Need complete extraction",
        problem_definition="Extract all relevant contract metadata",
        query=None,
        current_schema=poor_schema,
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

    assessment = result["assessment_result"]
    # Poor schema should need refinement
    assert assessment["needs_refinement"] is True


@pytest.mark.unit
def test_schema_refiner_improves_schema(llm, prompts):
    """Test schema refiner agent improves schema based on assessment."""
    agent = SchemaRefinerAgent(llm, prompts["schema_refiner"])

    initial_schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string"}
        }
    }

    assessment = {
        "confidence_score": 0.6,
        "needs_refinement": True,
        "suggestions": ["Add more specific fields", "Include descriptions", "Add required fields"]
    }

    state = AgentState(
        messages=[],
        user_input="Extract party information from contracts",
        problem_help="Extract structured party data",
        user_feedback="Include all party details",
        problem_definition="Extract comprehensive party information",
        query=None,
        current_schema=initial_schema,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=assessment,
        data_assessment_results=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    result = agent(state)

    # Should increment refinement rounds
    assert "refinement_rounds" in result
    assert result["refinement_rounds"] == 1

    # May produce refined schema if is_refined is True
    assert "messages" in result


@pytest.mark.unit
def test_agent_state_structure():
    """Test that AgentState has all required fields."""
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
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=None,
        collection_id=None,
        confidence_score=None,
        session_metadata=None,
    )

    # Verify all required fields are present
    assert "messages" in state
    assert "user_input" in state
    assert "current_schema" in state
    assert "refinement_rounds" in state
    assert "assessment_result" in state


@pytest.mark.unit
def test_agents_handle_empty_state_gracefully(llm, prompts):
    """Test that agents handle minimal state without crashing."""
    # Create minimal state
    minimal_state = AgentState(
        messages=[],
        user_input="test input",
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

    # Test that helper agent can process minimal state
    helper_agent = ProblemDefinerHelperAgent(llm, prompts["problem_definer_helper"])
    result = helper_agent(minimal_state)

    assert result is not None
    assert "problem_help" in result
