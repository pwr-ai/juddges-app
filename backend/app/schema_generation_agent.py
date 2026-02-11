import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from loguru import logger

from langgraph.types import Command
from pydantic import BaseModel, Field, ConfigDict
from juddges_search.models import DocumentType

from juddges_search.llms import get_default_llm
from schema_generator_agent.agents.agent_state import AgentState
from schema_generator_agent.agents.schema_generator import (
    SchemaGenerator,
    load_prompts,
)

router = APIRouter(prefix="/schema-generator-agent", tags=["schema-generator-agent"])

# Session storage: session_id -> (agent, created_at)
_sessions: dict[str, tuple[SchemaGenerator, datetime]] = {}


async def cleanup_expired_sessions():
    """Background task to clean up expired sessions."""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        now = datetime.now()
        expired = [
            sid
            for sid, (_, created) in _sessions.items()
            if now - created > timedelta(hours=1)
        ]
        for sid in expired:
            del _sessions[sid]
            logger.info(f"Cleaned up expired session: {sid}")


def get_or_create_agent(
    agent_id: str,
    document_type: DocumentType,
    request: Request,
) -> SchemaGenerator:
    """Get existing agent or create new one for the session."""
    if agent_id in _sessions:
        logger.info(f"Reusing existing agent for session: {agent_id}")
        return _sessions[agent_id][0]

    logger.info(f"Creating new agent for session: {agent_id}")
    llm = get_default_llm(use_mini_model=True)
    prompts = load_prompts(document_type=document_type)

    agent = SchemaGenerator(
        llm,
        document_type,
        prompts["problem_definer_helper_prompt"],
        prompts["problem_definer_prompt"],
        prompts["schema_generator_prompt"],
        prompts["schema_assessment_prompt"],
        prompts["schema_refiner_prompt"],
        prompts["query_generator_prompt"],
        prompts["schema_data_assessment_prompt"],
        prompts["schema_data_assessment_merger_prompt"],
        prompts["schema_data_refiner_prompt"],
        use_interrupt=True,
        graph_compilation_kwargs={"checkpointer": request.app.state.checkpointer},
    )

    _sessions[agent_id] = (agent, datetime.now())
    return agent


class SchemaGeneratorAgentInitialRequest(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    agent_id: str | None = Field(
        default=None, description="Unique identifier of an agent (auto-generated if not provided)"
    )
    prompt: str = Field(description="User prompt for generating schema")
    current_schema: dict[str, Any] = Field(
        default_factory=dict, description="Initial Schema"
    )
    document_type: DocumentType = Field(
        description="type of document the agent will use"
    )
    collection_id: str | None = Field(
        default=None, description="Associated collection ID"
    )


@router.post("/init-agent", deprecated=True)
async def init_schema_agent(
    params: SchemaGeneratorAgentInitialRequest, request: Request
):
    """
    Initialize a new schema generation session.

    **DEPRECATED**: This endpoint is deprecated. Use POST /schemas/generate instead.
    This endpoint will be removed in a future version.
    """
    logger.warning(
        "DEPRECATED: /init-agent is deprecated. Use POST /schemas/generate instead. "
        "This endpoint will be removed in a future version."
    )
    agent_id = params.agent_id or str(uuid.uuid4())

    agent = get_or_create_agent(
        agent_id=agent_id,
        document_type=DocumentType(params.document_type),
        request=request,
    )

    initial_state = AgentState(
        messages=[],
        user_input=params.prompt,
        problem_help=None,
        user_feedback=None,
        problem_definition=None,
        query=None,
        current_schema=params.current_schema,
        schema_history=[],
        refinement_rounds=0,
        assessment_result=None,
        merged_data_assessment=None,
        data_refinement_rounds=0,
        conversation_id=agent_id,
        collection_id=params.collection_id,
        confidence_score=None,
        session_metadata={"created_at": datetime.now().isoformat()},
    )

    response = await agent.graph.ainvoke(
        input=initial_state,
        config={"configurable": {"thread_id": agent_id}},
    )

    # Add session metadata to response
    response["agent_id"] = agent_id
    response["session_metadata"] = initial_state["session_metadata"]

    return response


class SchemaGeneratorAgentUserFeedbackRequest(BaseModel):
    agent_id: str = Field(description="Unique identifier of an agent")
    user_feedback: str = Field(description="User feedback for research questions")


@router.post("/invoke-schema", deprecated=True)
async def invoke_schema(
    params: SchemaGeneratorAgentUserFeedbackRequest, request: Request
):
    """
    Continue schema generation with user feedback.

    **DEPRECATED**: This endpoint is deprecated. Use POST /schemas/generate/{session_id}/refine instead.
    This endpoint will be removed in a future version.
    """
    logger.warning(
        "DEPRECATED: /invoke-schema is deprecated. Use POST /schemas/generate/{session_id}/refine instead. "
        "This endpoint will be removed in a future version."
    )
    if params.agent_id not in _sessions:
        raise HTTPException(
            status_code=404,
            detail=f"Agent session {params.agent_id} not found. Call /init-agent first.",
        )

    agent, _ = _sessions[params.agent_id]

    response = await agent.graph.ainvoke(
        Command(resume=params.user_feedback),
        config={"configurable": {"thread_id": params.agent_id}},
    )

    # Update confidence score from assessment if available
    if response.get("merged_data_assessment"):
        response["confidence_score"] = response["merged_data_assessment"].get(
            "confidence_score", 0.8
        )

    return response
