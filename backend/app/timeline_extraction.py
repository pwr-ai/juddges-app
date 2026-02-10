"""
Timeline extraction endpoint.

Extracts chronological events and dates from legal documents to create
interactive timelines. Uses AI to understand temporal relationships,
sequence events, and identify key milestones in legal proceedings.
"""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from ai_tax_search.db.supabase_db import get_vector_db
from ai_tax_search.llms import get_default_llm
from app.models import validate_id_format

router = APIRouter(prefix="/timeline", tags=["timeline"])


# ===== Prompt Templates =====

TIMELINE_SYSTEM_PROMPT = """You are a legal document analyst specializing in extracting chronological information from legal documents.
Your task is to identify and extract all events, dates, deadlines, and temporal references from legal documents.
You must return structured JSON data that can be used to create an interactive timeline visualization.
Be precise with dates and provide context for each event. If an exact date is not available, provide the best estimate with appropriate precision (year, month, or day).
Always respond in the same language as the source document."""

TIMELINE_EXTRACTION_PROMPT = """Analyze the following legal document(s) and extract all chronological events, dates, and temporal references.

For each event, identify:
1. The date or time period (as precise as possible)
2. A short title for the event
3. A description of what happened
4. The category of the event (filing, decision, deadline, hearing, appeal, enforcement, procedural, legislative, other)
5. The parties or entities involved
6. Any legal references associated with the event

Target extraction depth: {extraction_depth}

{focus_areas_instruction}

Document content:
{document_content}

Return a JSON object with the following structure:
{{
  "events": [
    {{
      "date": "YYYY-MM-DD or YYYY-MM or YYYY",
      "date_precision": "day" | "month" | "year",
      "title": "Short event title",
      "description": "Detailed description of the event",
      "category": "filing" | "decision" | "deadline" | "hearing" | "appeal" | "enforcement" | "procedural" | "legislative" | "other",
      "parties": ["Party 1", "Party 2"],
      "legal_references": ["Art. 123 of XYZ Act"],
      "importance": "high" | "medium" | "low"
    }}
  ],
  "timeline_summary": "Brief summary of the overall chronological narrative",
  "date_range": {{
    "earliest": "YYYY-MM-DD",
    "latest": "YYYY-MM-DD"
  }},
  "document_ids": ["doc_id_1"]
}}

Sort events chronologically from earliest to latest."""


# ===== Request/Response Models =====


class TimelineExtractionRequest(BaseModel):
    """Request model for timeline extraction."""

    document_ids: list[str] = Field(
        description="List of document IDs to extract timeline from",
        min_length=1,
        max_length=10,
    )
    extraction_depth: Literal["basic", "detailed", "comprehensive"] = Field(
        default="detailed",
        description=(
            "Depth of extraction: "
            "'basic' for key dates only, "
            "'detailed' for all events with context, "
            "'comprehensive' for full temporal analysis"
        ),
    )
    focus_areas: list[str] | None = Field(
        default=None,
        description="Optional focus areas (e.g., 'deadlines', 'court hearings', 'filings')",
        max_length=5,
    )

    @field_validator("document_ids")
    @classmethod
    def validate_document_ids(cls, v: list[str]) -> list[str]:
        return [validate_id_format(doc_id, "document_id") for doc_id in v]

    @field_validator("focus_areas")
    @classmethod
    def validate_focus_areas(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            return [area.strip() for area in v if area.strip()]
        return v


class TimelineEvent(BaseModel):
    """A single event in the timeline."""

    date: str = Field(description="Date in YYYY-MM-DD, YYYY-MM, or YYYY format")
    date_precision: Literal["day", "month", "year"] = Field(
        description="Precision of the date"
    )
    title: str = Field(description="Short event title")
    description: str = Field(description="Detailed description of the event")
    category: Literal[
        "filing", "decision", "deadline", "hearing", "appeal",
        "enforcement", "procedural", "legislative", "other"
    ] = Field(description="Category of the event")
    parties: list[str] = Field(
        default_factory=list, description="Parties or entities involved"
    )
    legal_references: list[str] = Field(
        default_factory=list, description="Legal references associated"
    )
    importance: Literal["high", "medium", "low"] = Field(
        default="medium", description="Importance level of the event"
    )


class TimelineDateRange(BaseModel):
    """Date range of the timeline."""

    earliest: str | None = Field(default=None, description="Earliest date")
    latest: str | None = Field(default=None, description="Latest date")


class TimelineExtractionResponse(BaseModel):
    """Response model for timeline extraction."""

    events: list[TimelineEvent] = Field(description="Extracted timeline events")
    timeline_summary: str = Field(description="Summary of the chronological narrative")
    date_range: TimelineDateRange = Field(description="Date range of the timeline")
    document_ids: list[str] = Field(description="Document IDs that were analyzed")
    total_events: int = Field(description="Total number of events extracted")
    extraction_depth: str = Field(description="Extraction depth used")


# ===== Helper Functions =====


async def _fetch_document_content(document_ids: list[str]) -> list[dict[str, Any]]:
    """Fetch document content from the vector database."""
    db = get_vector_db()
    documents = []

    for doc_id in document_ids:
        try:
            doc_data = await db.get_document_by_id(doc_id)
            if doc_data:
                documents.append(doc_data)
            else:
                logger.warning(f"Document {doc_id} not found in database")
        except Exception as e:
            logger.error(f"Error fetching document {doc_id}: {e}")

    return documents


def _format_document_for_timeline(doc: dict[str, Any]) -> str:
    """Format a single document for the timeline extraction prompt."""
    parts = []

    doc_id = doc.get("document_id", "unknown")
    parts.append(f"--- Document ID: {doc_id} ---")

    if doc.get("title"):
        parts.append(f"Title: {doc['title']}")

    if doc.get("document_type"):
        parts.append(f"Type: {doc['document_type']}")

    if doc.get("date_issued"):
        parts.append(f"Date Issued: {doc['date_issued']}")

    if doc.get("court_name"):
        parts.append(f"Court: {doc['court_name']}")

    if doc.get("issuing_body"):
        body = doc["issuing_body"]
        if isinstance(body, dict):
            parts.append(f"Issuing Body: {body.get('name', str(body))}")
        else:
            parts.append(f"Issuing Body: {body}")

    # Use full_text if available, otherwise use summary + thesis
    content = doc.get("full_text", "")
    if content:
        max_chars = 15000
        if len(content) > max_chars:
            content = content[:max_chars] + "\n[... document truncated for length ...]"
        parts.append(f"\nContent:\n{content}")
    else:
        if doc.get("summary"):
            parts.append(f"\nSummary:\n{doc['summary']}")
        if doc.get("thesis"):
            parts.append(f"\nThesis:\n{doc['thesis']}")

    if doc.get("legal_bases"):
        bases = doc["legal_bases"]
        if isinstance(bases, list):
            parts.append(f"\nLegal Bases: {', '.join(str(b) for b in bases)}")

    return "\n".join(parts)


# ===== Endpoint =====


@router.post(
    "",
    response_model=TimelineExtractionResponse,
    summary="Extract timeline from legal documents",
    description=(
        "Extract chronological events and dates from one or more legal documents "
        "to create an interactive timeline. Uses AI to identify temporal relationships "
        "and sequence events in legal proceedings."
    ),
)
async def extract_timeline(request: TimelineExtractionRequest) -> TimelineExtractionResponse:
    """Extract a chronological timeline from legal documents."""
    logger.info(
        f"Timeline extraction request: depth={request.extraction_depth}, "
        f"documents={request.document_ids}"
    )

    # Fetch documents
    documents = await _fetch_document_content(request.document_ids)

    if not documents:
        raise HTTPException(
            status_code=404,
            detail="None of the specified documents were found",
        )

    # Format document content
    formatted_docs = "\n\n".join(
        _format_document_for_timeline(doc) for doc in documents
    )

    # Build focus areas instruction
    focus_instruction = ""
    if request.focus_areas:
        areas_str = ", ".join(request.focus_areas)
        focus_instruction = f"- Pay special attention to these temporal aspects: {areas_str}"

    # Build the prompt
    filled_prompt = TIMELINE_EXTRACTION_PROMPT.format(
        extraction_depth=request.extraction_depth,
        document_content=formatted_docs,
        focus_areas_instruction=focus_instruction,
    )

    # Create the LLM chain
    chat_prompt = ChatPromptTemplate.from_messages([
        ("system", TIMELINE_SYSTEM_PROMPT),
        ("human", "{prompt}"),
    ])

    llm = get_default_llm(use_mini_model=False)
    parser = JsonOutputParser()

    chain = chat_prompt | llm | parser

    try:
        result = await chain.ainvoke({"prompt": filled_prompt})
    except Exception as e:
        logger.error(f"Timeline extraction LLM error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to extract timeline. The AI service may be temporarily unavailable.",
        )

    # Parse events
    events = []
    for event_data in result.get("events", []):
        if isinstance(event_data, dict) and event_data.get("date") and event_data.get("title"):
            try:
                events.append(TimelineEvent(**event_data))
            except Exception as e:
                logger.warning(f"Skipping invalid event: {e}")

    if not events:
        raise HTTPException(
            status_code=500,
            detail="The AI could not extract any timeline events from these documents. Please try again.",
        )

    # Extract metadata
    timeline_summary = result.get("timeline_summary", "")
    date_range_data = result.get("date_range", {})
    doc_ids = result.get("document_ids", request.document_ids)

    return TimelineExtractionResponse(
        events=events,
        timeline_summary=timeline_summary,
        date_range=TimelineDateRange(
            earliest=date_range_data.get("earliest"),
            latest=date_range_data.get("latest"),
        ),
        document_ids=doc_ids,
        total_events=len(events),
        extraction_depth=request.extraction_depth,
    )
