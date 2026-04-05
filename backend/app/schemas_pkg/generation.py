"""
AI-powered schema generation: start, refine, get, and cancel generation sessions.
"""

import os
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from juddges_search.llms import get_default_llm
from juddges_search.models import DocumentType
from langgraph.types import Command
from loguru import logger
from schema_generator_agent.agents.agent_state import AgentState
from schema_generator_agent.agents.schema_generator import (
    SchemaGenerator,
    load_prompts,
)

from app.core.session_store import SESSION_TTL, SessionStore

from .models import (
    SchemaGenerationRequest,
    SchemaGenerationResponse,
    SchemaRefinementRequest,
)

# In-memory store for agent objects (not JSON-serializable, must stay in-process).
# session_id -> (agent, created_at)
_generation_sessions: dict[str, tuple[SchemaGenerator, datetime]] = {}


def _build_session_store() -> SessionStore:
    """Create a SessionStore backed by Redis when configured, otherwise in-memory only."""
    redis_host = os.getenv("REDIS_HOST", "").strip()
    if not redis_host:
        logger.info(
            "REDIS_HOST not set — schema session metadata stored in-memory only"
        )
        return SessionStore(redis_client=None)

    try:
        import redis.asyncio as aioredis

        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_auth = os.getenv("REDIS_AUTH") or None
        client = aioredis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_auth,
            db=2,  # Dedicated DB for schema generation session metadata
            decode_responses=True,
        )
        logger.info(
            f"Schema session store initialised with Redis at {redis_host}:{redis_port}"
        )
        return SessionStore(redis_client=client)
    except Exception as e:
        logger.warning(
            f"Failed to create Redis client for session store, falling back to in-memory: {e}"
        )
        return SessionStore(redis_client=None)


# Module-level SessionStore — holds serialisable session metadata in Redis.
_session_store: SessionStore = _build_session_store()


async def cleanup_expired_sessions():
    """
    No-op kept for backward compatibility.

    Redis TTL handles expiry of session metadata automatically.
    The in-memory agent dict is cleaned up on session cancellation or on
    404 responses (agent gone after restart).
    """
    logger.info(
        "cleanup_expired_sessions: Redis TTL handles session metadata expiry — "
        "no manual sweep needed"
    )


def get_or_create_generation_agent(
    session_id: str,
    document_type: DocumentType,
    request: Request,
) -> SchemaGenerator:
    """
    Get existing agent or create new one for the generation session.

    Args:
        session_id: Unique session identifier
        document_type: Type of document for schema generation
        request: FastAPI request object (for accessing app state)

    Returns:
        SchemaGenerator instance
    """
    if session_id in _generation_sessions:
        logger.info(f"Reusing existing generation agent for session: {session_id}")
        return _generation_sessions[session_id][0]

    logger.info(f"Creating new generation agent for session: {session_id}")
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

    _generation_sessions[session_id] = (agent, datetime.now(UTC))
    return agent


def register_generation_routes(router: APIRouter) -> None:
    """Register all generation route handlers on the given router."""

    @router.post(
        "/generate",
        response_model=SchemaGenerationResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def start_schema_generation(
        params: SchemaGenerationRequest,
        request: Request,
    ) -> dict[str, Any]:
        """
        Start a new AI-powered schema generation session.

        This endpoint initializes a conversational agent that helps users create
        schemas through an iterative refinement process.

        Args:
            params: Schema generation parameters including initial prompt
            request: FastAPI request object

        Returns:
            Initial session state with session_id for future refinements

        Example:
            ```
            POST /schemas/generate
            {
                "prompt": "Create a schema for extracting drug-related information from court judgments",
                "document_type": "judgment",
                "collection_id": "drug-cases-2024"
            }
            ```
        """
        try:
            session_id = str(uuid.uuid4())
            logger.info(f"Starting schema generation session: {session_id}")

            agent = get_or_create_generation_agent(
                session_id=session_id,
                document_type=DocumentType(params.document_type),
                request=request,
            )

            created_at = datetime.now(UTC)
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
                conversation_id=session_id,
                collection_id=params.collection_id,
                confidence_score=None,
                session_metadata={"created_at": created_at.isoformat()},
            )

            response = await agent.graph.ainvoke(
                input=initial_state,
                config={"configurable": {"thread_id": session_id}},
            )

            # Persist serialisable metadata to Redis (TTL-managed).
            await _session_store.set(
                session_id,
                {
                    "created_at": created_at.isoformat(),
                    "status": "active",
                    "document_type": params.document_type,
                    "collection_id": params.collection_id,
                },
                ttl=SESSION_TTL,
            )

            # Add session metadata to response
            response["session_id"] = session_id
            response["status"] = "active"

            logger.info(
                f"Schema generation session {session_id} initialized successfully"
            )
            return response

        except Exception as e:
            logger.error(f"Failed to start schema generation: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to start schema generation: {e!s}",
            )

    @router.post(
        "/generate/{session_id}/refine",
        response_model=SchemaGenerationResponse,
    )
    async def refine_schema(
        session_id: str,
        params: SchemaRefinementRequest,
        request: Request,
    ) -> dict[str, Any]:
        """
        Refine an existing schema generation session with user feedback.

        This endpoint allows users to provide feedback and continue the iterative
        schema refinement process.

        Args:
            session_id: Unique session identifier from the initial generation
            params: Refinement parameters with user feedback
            request: FastAPI request object

        Returns:
            Updated session state with refined schema

        Raises:
            HTTPException: If session not found or invalid

        Example:
            ```
            POST /schemas/generate/{session_id}/refine
            {
                "user_feedback": "Add a field for drug quantity in grams"
            }
            ```
        """
        try:
            if session_id not in _generation_sessions:
                logger.warning(f"Generation session not found: {session_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Generation session '{session_id}' not found. Start a new session with POST /schemas/generate",
                )

            logger.info(f"Refining schema generation session: {session_id}")
            agent, _ = _generation_sessions[session_id]

            response = await agent.graph.ainvoke(
                Command(resume=params.user_feedback),
                config={"configurable": {"thread_id": session_id}},
            )

            # Update confidence score from assessment if available
            if response.get("merged_data_assessment"):
                response["confidence_score"] = response["merged_data_assessment"].get(
                    "confidence_score", 0.8
                )

            response["session_id"] = session_id
            response["status"] = "active"

            logger.info(f"Schema generation session {session_id} refined successfully")
            return response

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to refine schema for session {session_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to refine schema: {e!s}",
            )

    @router.get("/generate/{session_id}", response_model=SchemaGenerationResponse)
    async def get_generation_session(session_id: str) -> dict[str, Any]:
        """
        Get the current state of a schema generation session.

        Args:
            session_id: Unique session identifier

        Returns:
            Current session state including schema and conversation history

        Raises:
            HTTPException: If session not found
        """
        try:
            # Check in-memory agent first; fall back to Redis metadata for
            # sessions whose agent has been lost (e.g. after a restart).
            in_memory = session_id in _generation_sessions
            metadata = await _session_store.get(session_id)

            if not in_memory and metadata is None:
                logger.warning(f"Generation session not found: {session_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Generation session '{session_id}' not found",
                )

            logger.info(f"Retrieving generation session: {session_id}")

            if in_memory:
                _agent, created_at = _generation_sessions[session_id]
                created_at_iso = created_at.isoformat()
            else:
                # Agent lost (process restart) but metadata still alive in Redis.
                created_at_iso = (metadata or {}).get("created_at", "")

            return {
                "session_id": session_id,
                "status": "active",
                "session_metadata": {
                    "created_at": created_at_iso,
                },
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to get generation session {session_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve session: {e!s}",
            )

    @router.delete("/generate/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def cancel_generation_session(session_id: str) -> None:
        """
        Cancel and delete a schema generation session.

        This cleans up resources associated with the session.

        Args:
            session_id: Unique session identifier

        Raises:
            HTTPException: If session not found
        """
        try:
            in_memory = session_id in _generation_sessions
            metadata = await _session_store.get(session_id)

            if not in_memory and metadata is None:
                logger.warning(f"Generation session not found: {session_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Generation session '{session_id}' not found",
                )

            logger.info(f"Cancelling generation session: {session_id}")

            # Remove agent from memory (if present).
            _generation_sessions.pop(session_id, None)

            # Remove metadata from Redis / fallback dict.
            await _session_store.delete(session_id)

            logger.info(f"Generation session {session_id} cancelled successfully")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to cancel generation session {session_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to cancel session: {e!s}",
            )
