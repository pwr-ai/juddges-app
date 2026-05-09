"""
Schema Generator Chat API - Frontend-compatible endpoints.

This module provides chat-based endpoints that match the frontend's expectations,
bridging the gap between the frontend schema-chat page and the backend's
schema generation functionality.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from juddges_search.chains.schema_generation import generate_schema
from juddges_search.info_extraction.extractor import InformationExtractor
from juddges_search.llms import get_default_llm
from juddges_search.models import DocumentType
from langgraph.types import Command
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field
from schema_generator_agent.agents.agent_state import AgentState
from schema_generator_agent.agents.schema_generator import (
    SchemaGenerator,
    load_prompts,
)

# Import standardized error handling
from app.errors import (
    AppException,
    DatabaseError,
    ErrorCode,
    GenerationTimeoutError,
    RateLimitError,
)

# Import from schemas module to reuse session management
from app.schemas_pkg import _generation_sessions

router = APIRouter(prefix="/schema-generator", tags=["schema-generator-chat"])


# ============================================================================
# Request/Response Models for Frontend Compatibility
# ============================================================================


class ConversationMessage(BaseModel):
    """Message in conversation history."""

    model_config = ConfigDict(protected_namespaces=())

    role: str = Field(description="Message role: 'user' or 'assistant'")
    content: str = Field(description="Message content")
    schema_state: dict[str, Any] | None = Field(
        default=None, description="Schema state at this message"
    )


class SchemaChatRequest(BaseModel):
    """Request model matching frontend schema-chat page expectations."""

    model_config = ConfigDict(use_enum_values=True)

    message: str = Field(
        description="User's message",
        min_length=1,
    )
    collection_id: str | None = Field(
        default=None, description="Collection ID for context"
    )
    conversation_history: list[ConversationMessage] = Field(
        default_factory=list, description="Previous messages in conversation"
    )
    current_schema: dict[str, Any] | None = Field(
        default=None, description="Current schema being refined"
    )
    session_id: str | None = Field(
        default=None, description="Existing session ID for continuation"
    )
    agent_id: str | None = Field(
        default=None, description="Legacy agent ID (backward compatibility)"
    )
    document_type: str = Field(
        default="tax_interpretation", description="Document type for schema generation"
    )
    mode: str = Field(
        default="rabbit", description="Agent mode: 'rabbit' or 'thinking'"
    )


class SchemaChatResponse(BaseModel):
    """Response model matching frontend expectations."""

    model_config = ConfigDict(protected_namespaces=())

    message: str = Field(description="AI's response message")
    schema_definition: dict[str, Any] | None = Field(
        default=None, description="Generated or refined schema", alias="schema"
    )
    session_id: str = Field(description="Session ID for future requests")
    agent_id: str | None = Field(
        default=None, description="Agent ID (backward compatibility)"
    )
    confidence: float | None = Field(
        default=None, description="Confidence score (0.0-1.0)"
    )
    refinement_rounds: int = Field(
        default=0, description="Number of refinement iterations"
    )
    data_refinement_rounds: int = Field(
        default=0, description="Number of data refinement iterations"
    )
    needs_refinement: bool = Field(
        default=False, description="Whether schema needs further refinement"
    )


class SchemaTestRequest(BaseModel):
    """Request model for schema testing."""

    model_config = ConfigDict(protected_namespaces=())

    schema_definition: dict[str, Any] = Field(
        description="Schema to test", alias="schema"
    )
    collection_id: str = Field(description="Collection ID to test against")
    document_ids: list[str] = Field(description="Document IDs to test with")


class SchemaTestResult(BaseModel):
    """Test result for a single document."""

    document_id: str
    success: bool
    extracted_data: dict[str, Any] | None = None
    error: str | None = None
    execution_time: float


class SchemaTestResponse(BaseModel):
    """Response model for schema testing."""

    results: list[SchemaTestResult]
    statistics: dict[str, Any]


class SimpleSchemaGenerationRequest(BaseModel):
    """Request model for simple single-shot schema generation."""

    model_config = ConfigDict(protected_namespaces=())

    message: str = Field(
        description="Natural language description or structured specification of extraction needs",
        min_length=1,
    )
    schema_name: str = Field(
        default="InformationExtraction",
        description="Name for the generated schema",
        min_length=1,
        max_length=100,
    )
    schema_description: str | None = Field(
        default=None,
        description="Optional description for the schema",
        max_length=500,
    )
    existing_fields: list[dict[str, Any]] | None = Field(
        default=None,
        description="Existing fields to preserve/extend",
    )
    extraction_instructions: str | None = Field(
        default=None,
        description="User-provided extraction context and instructions",
        max_length=5000,
    )
    session_id: str | None = Field(
        default=None,
        description="Session ID (for frontend compatibility)",
    )
    collection_id: str | None = Field(
        default=None,
        description="Collection ID for context (optional)",
    )


class SimpleSchemaGenerationResponse(BaseModel):
    """Response model for simple schema generation."""

    model_config = ConfigDict(protected_namespaces=())

    message: str = Field(description="Human-readable response message")
    schema_definition: dict[str, Any] = Field(
        description="Generated JSON Schema", alias="schema"
    )
    session_id: str | None = Field(
        default=None, description="Session ID (for frontend compatibility)"
    )
    field_count: int = Field(description="Number of fields in generated schema")
    success: bool = Field(description="Whether generation succeeded")
    generated_prompt: str = Field(
        description="Full prompt used for generation (for storage)"
    )
    new_fields: list[str] = Field(
        default_factory=list,
        description="List of field names that were AI-generated (new)",
    )
    existing_field_count: int = Field(
        default=0, description="Number of preserved existing fields"
    )
    new_field_count: int = Field(
        default=0, description="Number of newly generated fields"
    )


# ============================================================================
# Helper Functions
# ============================================================================


def get_or_create_agent(
    session_id: str,
    document_type: DocumentType,
    request: Request,
) -> SchemaGenerator:
    """
    Get existing agent or create new one for the session.

    Reuses the _generation_sessions from app.schemas to maintain compatibility.
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


def format_response_message(agent_state: dict[str, Any]) -> str:
    """
    Format the agent state into a user-friendly message.

    Args:
        agent_state: The agent state response

    Returns:
        Formatted message for the user
    """
    # Check if we have a problem definition (initial response)
    if agent_state.get("problem_definition"):
        return agent_state["problem_definition"]

    # Check for assessment results
    if agent_state.get("merged_data_assessment"):
        assessment = agent_state["merged_data_assessment"]
        message_parts = []

        if assessment.get("overall_quality"):
            message_parts.append(f"Schema Quality: {assessment['overall_quality']}")

        if assessment.get("suggestions"):
            message_parts.append(
                "\nSuggestions:\n"
                + "\n".join(f"- {s}" for s in assessment["suggestions"])
            )

        if message_parts:
            return "\n".join(message_parts)

    # Check for user feedback prompt
    if agent_state.get("problem_help"):
        return agent_state["problem_help"]

    # Default message with schema info
    if agent_state.get("current_schema"):
        schema_fields = len(agent_state["current_schema"].get("properties", {}))
        return f"Generated schema with {schema_fields} fields. Review the schema and provide feedback for refinement."

    return "Schema generated successfully. Please review and provide feedback."


# ============================================================================
# API Endpoints
# ============================================================================


@router.post("/chat", response_model=SchemaChatResponse)
async def schema_chat(
    params: SchemaChatRequest,
    request: Request,
) -> dict[str, Any]:
    """
    Process conversational messages for schema generation.

    This endpoint provides a chat-based interface for creating and refining
    extraction schemas. It maintains conversation state across requests using
    session IDs.

    Args:
        params: Chat request with message and context
        request: FastAPI request object

    Returns:
        Chat response with AI message and schema state

    Example:
        ```
        POST /api/schema-generator/chat
        {
            "message": "I need to extract drug information from court documents",
            "collection_id": "drug-cases",
            "document_type": "tax_interpretation",
            "mode": "rabbit"
        }
        ```
    """
    try:
        # Determine session ID (use existing or create new)
        session_id = params.session_id or params.agent_id or str(uuid.uuid4())

        logger.info(
            f"Processing schema chat request for session: {session_id}, "
            f"mode: {params.mode}, message length: {len(params.message)}"
        )

        # Get or create agent
        agent = get_or_create_agent(
            session_id=session_id,
            document_type=DocumentType(params.document_type),
            request=request,
        )

        # Determine if this is initial message or refinement
        is_initial = params.session_id is None and params.agent_id is None

        if is_initial:
            # Initial message - create new agent state
            logger.info(f"Creating new schema generation session: {session_id}")

            initial_state = AgentState(
                messages=[],
                user_input=params.message,
                problem_help=None,
                user_feedback=None,
                problem_definition=None,
                query=None,
                current_schema=params.current_schema or {},
                schema_history=[],
                refinement_rounds=0,
                assessment_result=None,
                merged_data_assessment=None,
                data_refinement_rounds=0,
                conversation_id=session_id,
                collection_id=params.collection_id,
                confidence_score=None,
                session_metadata={"created_at": datetime.now(UTC).isoformat()},
            )

            try:
                response = await agent.graph.ainvoke(
                    input=initial_state,
                    config={"configurable": {"thread_id": session_id}},
                )
            except Exception as e:
                logger.error(
                    f"Agent graph invocation failed for session {session_id}: {e}",
                    exc_info=True,
                )
                # Clean up failed session from in-memory agent store.
                _generation_sessions.pop(session_id, None)

                # Provide user-friendly error based on exception type
                error_str = str(e).lower()
                if "rate limit" in error_str:
                    raise RateLimitError(
                        "AI service rate limit reached. Please try again in a few moments."
                    ).to_http_exception()
                if "timeout" in error_str:
                    raise GenerationTimeoutError(
                        "Schema generation timed out. Please try with a shorter prompt or try again later."
                    ).to_http_exception()
                if "checkpointer" in error_str or "database" in error_str:
                    raise DatabaseError(
                        "Session storage service temporarily unavailable. Please try again later."
                    ).to_http_exception()
                raise AppException(
                    message=f"Failed to generate schema: {e!s}",
                    code=ErrorCode.INTERNAL_ERROR,
                    status_code=500,
                ).to_http_exception()
        else:
            # Continuation - use existing session with user feedback
            logger.info(f"Refining existing session: {session_id}")

            try:
                response = await agent.graph.ainvoke(
                    Command(resume=params.message),
                    config={"configurable": {"thread_id": session_id}},
                )
            except Exception as e:
                logger.error(
                    f"Agent graph refinement failed for session {session_id}: {e}",
                    exc_info=True,
                )

                # Provide user-friendly error based on exception type
                error_str = str(e).lower()
                if "rate limit" in error_str:
                    raise RateLimitError(
                        "AI service rate limit reached. Please try again in a few moments."
                    ).to_http_exception()
                if "timeout" in error_str:
                    raise GenerationTimeoutError(
                        "Schema refinement timed out. Please try with a shorter message or try again later."
                    ).to_http_exception()
                if "checkpointer" in error_str or "database" in error_str:
                    raise DatabaseError(
                        "Session storage service temporarily unavailable. Please try again later."
                    ).to_http_exception()
                raise AppException(
                    message=f"Failed to refine schema: {e!s}",
                    code=ErrorCode.INTERNAL_ERROR,
                    status_code=500,
                ).to_http_exception()

        # Extract response data
        confidence = None
        if response.get("merged_data_assessment"):
            confidence = response["merged_data_assessment"].get("confidence_score", 0.8)
        elif response.get("confidence_score"):
            confidence = response["confidence_score"]

        refinement_rounds = response.get("refinement_rounds", 0)
        data_refinement_rounds = response.get("data_refinement_rounds", 0)
        current_schema = response.get("current_schema")

        # Check if schema needs refinement
        needs_refinement = False
        if response.get("merged_data_assessment"):
            quality = response["merged_data_assessment"].get("overall_quality", "")
            needs_refinement = quality.lower() not in ["high", "excellent"]

        # Format response message
        message = format_response_message(response)

        logger.info(
            f"Schema chat response generated - session: {session_id}, "
            f"confidence: {confidence}, refinement_rounds: {refinement_rounds}"
        )

        return {
            "message": message,
            "schema": current_schema,
            "session_id": session_id,
            "agent_id": session_id,  # Backward compatibility
            "confidence": confidence,
            "refinement_rounds": refinement_rounds,
            "data_refinement_rounds": data_refinement_rounds,
            "needs_refinement": needs_refinement,
        }

    except HTTPException:
        # Re-raise HTTP exceptions (properly formatted errors from above)
        raise
    except AppException as e:
        # Re-raise our standardized exceptions
        raise e.to_http_exception()
    except Exception as e:
        logger.error(f"Unexpected error in schema chat request: {e}", exc_info=True)
        raise AppException(
            message="An unexpected error occurred. Please try again or contact support if the problem persists.",
            code=ErrorCode.INTERNAL_ERROR,
        ).to_http_exception()


@router.post("/test", response_model=SchemaTestResponse)
async def test_schema(
    params: SchemaTestRequest,
    request: Request,
) -> dict[str, Any]:
    """
    Test a schema against sample documents.

    This endpoint runs the schema on specified documents and returns
    extraction results and statistics.

    Args:
        params: Test request with schema and document IDs
        request: FastAPI request object

    Returns:
        Test results with success/failure statistics

    Example:
        ```
        POST /api/schema-generator/test
        {
            "schema": {...},
            "collection_id": "drug-cases",
            "document_ids": ["doc1", "doc2", "doc3"]
        }
        ```
    """
    try:
        logger.info(
            f"Testing schema against {len(params.document_ids)} documents "
            f"in collection: {params.collection_id}"
        )

        results = []
        successful = 0
        failed = 0
        total_time = 0.0

        # Import document fetcher
        from app.utils.judgment_fetcher import get_documents_by_id

        for doc_id in params.document_ids:
            start_time = datetime.now(UTC)

            try:
                # Retrieve document from Supabase by ID
                try:
                    documents = await get_documents_by_id([doc_id])
                    document = documents[0] if documents else None
                except Exception as e:
                    logger.error(f"Database query failed for document {doc_id}: {e}")
                    raise ValueError(f"Failed to retrieve document {doc_id}: {e!s}")

                if not document:
                    raise ValueError(f"Document {doc_id} not found in collection")

                # Safely extract document text
                doc_text = getattr(document, "full_text", None) or getattr(
                    document, "content", ""
                )

                if not doc_text or not isinstance(doc_text, str):
                    raise ValueError(
                        f"Document {doc_id} has no text content or invalid text format"
                    )

                # Initialize extractor with error handling
                try:
                    extractor = InformationExtractor(llm=get_default_llm())
                except Exception as e:
                    logger.error(f"Failed to initialize InformationExtractor: {e}")
                    raise ValueError(f"Failed to initialize extraction engine: {e!s}")

                # Perform extraction with error handling
                try:
                    extracted_data = extractor.extract(
                        text=doc_text,
                        schema=params.schema_definition,
                    )
                except Exception as e:
                    logger.error(f"Extraction failed for document {doc_id}: {e}")
                    raise ValueError(f"Extraction failed: {e!s}")

                execution_time = (datetime.now(UTC) - start_time).total_seconds() * 1000
                total_time += execution_time

                results.append(
                    SchemaTestResult(
                        document_id=doc_id,
                        success=True,
                        extracted_data=extracted_data,
                        error=None,
                        execution_time=execution_time,
                    ).model_dump()
                )
                successful += 1

            except ValueError as e:
                # User-friendly errors (document not found, missing content, etc.)
                execution_time = (datetime.now(UTC) - start_time).total_seconds() * 1000
                total_time += execution_time

                logger.warning(f"Document processing error for {doc_id}: {e}")

                results.append(
                    SchemaTestResult(
                        document_id=doc_id,
                        success=False,
                        extracted_data=None,
                        error=str(e),
                        execution_time=execution_time,
                    ).model_dump()
                )
                failed += 1

            except Exception as e:
                # Unexpected errors
                execution_time = (datetime.now(UTC) - start_time).total_seconds() * 1000
                total_time += execution_time

                logger.error(
                    f"Unexpected error extracting from document {doc_id}: {e}",
                    exc_info=True,
                )

                results.append(
                    SchemaTestResult(
                        document_id=doc_id,
                        success=False,
                        extracted_data=None,
                        error=f"Unexpected error: {e!s}",
                        execution_time=execution_time,
                    ).model_dump()
                )
                failed += 1

        # Calculate statistics
        total = len(params.document_ids)
        success_rate = (successful / total * 100) if total > 0 else 0
        avg_time = (total_time / total) if total > 0 else 0

        statistics = {
            "total": total,
            "successful": successful,
            "failed": failed,
            "success_rate": round(success_rate, 2),
            "average_time": round(avg_time, 2),
        }

        logger.info(
            f"Schema test completed - success_rate: {success_rate}%, "
            f"avg_time: {avg_time}ms"
        )

        return {
            "results": results,
            "statistics": statistics,
        }

    except HTTPException:
        # Re-raise HTTP exceptions from inner handlers
        raise
    except AppException as e:
        # Re-raise our standardized exceptions
        raise e.to_http_exception()
    except Exception as e:
        logger.error(f"Failed to test schema: {e}", exc_info=True)
        raise AppException(
            message=f"Failed to test schema: {e!s}", code=ErrorCode.INTERNAL_ERROR
        ).to_http_exception()


@router.post("/simple", response_model=SimpleSchemaGenerationResponse)
async def generate_schema_simple(
    params: SimpleSchemaGenerationRequest,
    request: Request,
) -> dict[str, Any]:
    """
    Generate a JSON Schema from a natural language description.

    This endpoint provides a simple, single-shot approach to schema generation
    without the complexity of multi-turn conversations or agent systems.

    Args:
        params: Schema generation request with user's description
        request: FastAPI request object

    Returns:
        Generated schema with metadata

    Example:
        ```
        POST /api/schema-generator/simple
        {
            "message": "Extract party names, contract dates, and monetary amounts",
            "schema_name": "ContractExtraction",
            "extraction_instructions": "These are Polish legal contracts from 2020-2024"
        }
        ```
    """
    try:
        logger.info(
            f"Simple schema generation request - name: {params.schema_name}, "
            f"message length: {len(params.message)}, "
            f"existing_fields: {len(params.existing_fields or [])}, "
            f"instructions length: {len(params.extraction_instructions or '')}"
        )

        # Generate schema using the simple chain
        result = await generate_schema(
            user_request=params.message,
            schema_name=params.schema_name,
            schema_description=params.schema_description,
            existing_fields=params.existing_fields,
            extraction_instructions=params.extraction_instructions,
        )

        generated_schema = result["schema"]
        generated_prompt = result["generated_prompt"]
        new_fields = result.get("new_fields", [])
        existing_field_count = result.get("existing_field_count", 0)
        new_field_count = result.get("new_field_count", 0)

        # Count total fields
        field_count = len(generated_schema.get("properties", {}))

        # Generate response message with info about new vs existing fields
        response_message = _generate_simple_response_message(
            generated_schema, field_count, new_fields, existing_field_count
        )

        logger.info(
            f"Schema generated successfully - "
            f"total: {field_count}, existing: {existing_field_count}, new: {new_field_count}"
        )

        return {
            "message": response_message,
            "schema": generated_schema,
            "session_id": params.session_id,
            "field_count": field_count,
            "success": True,
            "generated_prompt": generated_prompt,
            "new_fields": new_fields,
            "existing_field_count": existing_field_count,
            "new_field_count": new_field_count,
        }

    except ValueError as e:
        logger.warning(f"Schema generation validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schema generation failed: {e!s}",
        )
    except Exception as e:
        logger.error(f"Schema generation error: {e}", exc_info=True)
        raise AppException(
            message=f"Failed to generate schema: {e!s}",
            code=ErrorCode.INTERNAL_ERROR,
        ).to_http_exception()


def _generate_simple_response_message(
    schema: dict[str, Any],
    field_count: int,
    new_fields: list[str] | None = None,
    existing_field_count: int = 0,
) -> str:
    """Generate a human-readable response message describing the schema."""
    properties = schema.get("properties", {})

    # Different messages based on whether we're extending existing schema
    if existing_field_count > 0 and new_fields:
        # Extending existing schema
        new_fields_preview = ", ".join(new_fields[:5])
        if len(new_fields) > 5:
            new_fields_preview += f", and {len(new_fields) - 5} more"

        return (
            f"I've added {len(new_fields)} new field(s) to your schema: {new_fields_preview}. "
            f"Your {existing_field_count} existing field(s) have been preserved. "
            f"The new fields are marked for review - check them in the visual editor."
        )
    # New schema generation
    field_names = list(properties.keys())[:5]
    fields_preview = ", ".join(field_names)

    if field_count > 5:
        fields_preview += f", and {field_count - 5} more"

    return (
        f"I've generated an extraction schema with {field_count} field(s): "
        f"{fields_preview}. "
        f"Each field is configured for OpenAI structured output compatibility. "
        f"Review the schema and let me know if you'd like any modifications."
    )
