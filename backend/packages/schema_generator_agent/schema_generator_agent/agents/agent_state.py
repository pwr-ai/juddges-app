# State management for the multi-agent system
import operator
from typing import Annotated, Any

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    """State shared across all agents in the schema processing workflow."""

    messages: Annotated[list, add_messages]  # Chat messages between agents
    user_input: str  # Original user request
    problem_help: str | None  # output from problem definer helper agent
    user_feedback: str | None  # feedback for the problem definer helper agent
    problem_definition: str | None  # problem definition
    query: str | None  # Query for the data agent
    current_schema: dict[str, Any] | None  # Current schema being processed
    schema_history: Annotated[list, operator.add]  # History of schemas being processed
    refinement_rounds: Annotated[int, operator.add]  # Number of refinement iterations
    assessment_result: dict[str, Any] | None  # Quality assessment results
    data_assessment_results: list[str] | None  # Data assessment results
    merged_data_assessment: dict[str, Any] | None  # Merged data assessment results
    data_refinement_rounds: Annotated[int, operator.add]  # Number of data refinement iterations

    # Schema Studio integration fields
    conversation_id: str | None  # Unique conversation session ID
    collection_id: str | None  # Associated document collection ID
    confidence_score: float | None  # Overall schema confidence score
    session_metadata: dict[str, Any] | None  # Additional session metadata
