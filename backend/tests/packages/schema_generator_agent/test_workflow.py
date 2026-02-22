"""Integration tests for schema generation workflow."""

import pytest
from langchain_openai import ChatOpenAI
from juddges_search.models import DocumentType

from schema_generator_agent.agents.schema_generator import SchemaGenerator, load_prompts


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
        prompt_problem_definer_helper=prompts["problem_definer_helper"],
        prompt_problem_definer=prompts["problem_definer"],
        prompt_schema_generator=prompts["schema_generator"],
        prompt_schema_assessment=prompts["schema_assessment"],
        prompt_schema_refiner=prompts["schema_refiner"],
        prompt_query_generator=prompts["query_generator"],
        prompt_schema_data_assessment=prompts["schema_data_assessment"],
        prompt_schema_data_assessment_merger=prompts["schema_data_assessment_merger"],
        prompt_schema_data_refiner=prompts["schema_data_refiner"],
        use_interrupt=False,
    )


@pytest.mark.integration
@pytest.mark.slow
def test_full_schema_generation_workflow(schema_generator):
    """Test complete schema generation workflow."""
    user_input = "Extract party names and judgment dates from court decisions"

    # Run workflow
    result = schema_generator.get_complete_results(user_input)

    # Assertions
    assert result["current_schema"] is not None, "No schema was generated"
    assert "properties" in result["current_schema"], "Schema missing properties"

    # Check that relevant fields are present (flexible matching)
    properties = result["current_schema"]["properties"]
    property_names = set(properties.keys())

    # Should have fields related to parties or names
    has_party_field = any(
        "party" in key.lower() or "name" in key.lower() for key in property_names
    )
    assert has_party_field, f"No party/name field found in: {property_names}"

    # Should have fields related to dates or judgment
    has_date_field = any(
        "date" in key.lower() or "judgment" in key.lower() for key in property_names
    )
    assert has_date_field, f"No date field found in: {property_names}"

    # Workflow metadata checks
    assert result["refinement_rounds"] >= 0, "Invalid refinement rounds count"
    assert len(result["messages"]) > 0, "No messages in conversation history"
    assert result["problem_definition"] is not None, "No problem definition created"


@pytest.mark.integration
@pytest.mark.slow
def test_schema_refinement_improves_quality(schema_generator):
    """Test that schema refinement produces a schema."""
    user_input = "Extract case details including parties, dates, and outcomes"

    # Run workflow
    result = schema_generator.get_complete_results(user_input)

    # Check that a schema was produced
    assert result["current_schema"] is not None
    assert "properties" in result["current_schema"]

    # Check that schema has multiple properties (should be refined)
    properties = result["current_schema"]["properties"]
    assert len(properties) >= 2, (
        f"Schema should have multiple properties, got: {list(properties.keys())}"
    )

    # Check assessment was performed
    assert result["assessment_result"] is not None
    assert "confidence_score" in result["assessment_result"]


@pytest.mark.integration
@pytest.mark.slow
def test_workflow_with_existing_schema(schema_generator):
    """Test workflow when starting with an existing schema."""
    user_input = "Add outcome and legal basis fields to the schema"

    existing_schema = {
        "type": "object",
        "properties": {
            "case_number": {"type": "string", "description": "Case identifier"}
        },
        "required": ["case_number"],
    }

    # Run workflow with existing schema
    result = schema_generator.get_complete_results(
        user_input, current_schema=existing_schema
    )

    # Check that schema was updated/generated
    assert result["current_schema"] is not None
    properties = result["current_schema"]["properties"]

    # Original field should still be present or schema should be regenerated
    assert len(properties) >= 1, "Schema should have at least one property"


@pytest.mark.integration
@pytest.mark.slow
def test_workflow_tracks_schema_history(schema_generator):
    """Test that workflow tracks schema evolution."""
    user_input = "Create schema for extracting legal citations"

    result = schema_generator.get_complete_results(user_input)

    # Check schema history is tracked
    assert "schema_history" in result
    assert isinstance(result["schema_history"], list)

    # History should contain at least the initial schema
    if result["current_schema"] is not None:
        assert len(result["schema_history"]) >= 1


@pytest.mark.integration
@pytest.mark.slow
def test_workflow_handles_complex_request(schema_generator):
    """Test workflow with complex multi-field extraction request."""
    user_input = """
    Create a schema to extract:
    - Court name and level
    - Case number and filing date
    - All parties involved (plaintiffs and defendants)
    - Legal issues and claims
    - Final judgment and reasoning
    - Cited legislation and precedents
    """

    result = schema_generator.get_complete_results(user_input)

    # Should produce a comprehensive schema
    assert result["current_schema"] is not None
    properties = result["current_schema"]["properties"]

    # Should have multiple fields for this complex request
    assert len(properties) >= 4, (
        f"Expected at least 4 fields for complex request, got {len(properties)}"
    )

    # Check that schema has proper structure
    assert result["current_schema"].get("type") == "object"


@pytest.mark.integration
def test_workflow_produces_valid_json_schema(schema_generator):
    """Test that produced schema is valid JSON Schema."""
    user_input = "Extract judge name and case summary"

    result = schema_generator.get_complete_results(user_input)

    schema = result["current_schema"]
    assert schema is not None

    # Basic JSON Schema validation
    assert "type" in schema
    assert schema["type"] == "object"
    assert "properties" in schema

    # Each property should have a type
    for prop_name, prop_def in schema["properties"].items():
        assert "type" in prop_def, f"Property {prop_name} missing type"
        assert isinstance(prop_def["type"], str), (
            f"Property {prop_name} type should be string"
        )
