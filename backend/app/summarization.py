"""
Document summarization endpoint.

Generates concise summaries of legal documents using GPT-4 with adjustable
length and focus areas. Supports executive summaries, key findings, and
multi-document synthesis.
"""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from juddges_search.db.supabase_db import get_vector_db
from juddges_search.llms import get_default_llm
from juddges_search.prompts.summarization import (
    KEY_POINTS_EXTRACTION_PROMPT,
    KEY_POINTS_EXTRACTION_SYSTEM_PROMPT,
    SUMMARIZATION_SYSTEM_PROMPT,
    SUMMARY_LENGTH_MAP,
    SUMMARY_TYPE_PROMPTS,
)
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from app.models import validate_id_format

router = APIRouter(prefix="/summarize", tags=["summarization"])


# ===== Request/Response Models =====


class SummarizeRequest(BaseModel):
    """Request model for document summarization."""

    document_ids: list[str] = Field(
        description="List of document IDs to summarize",
        min_length=1,
        max_length=10,
    )
    summary_type: Literal["executive", "key_findings", "synthesis"] = Field(
        default="executive",
        description=(
            "Type of summary to generate: "
            "'executive' for concise overview, "
            "'key_findings' for extracted findings, "
            "'synthesis' for multi-document comparison"
        ),
    )
    length: Literal["short", "medium", "long"] = Field(
        default="medium",
        description="Summary length: 'short' (~150 words), 'medium' (~300 words), 'long' (~600 words)",
    )
    focus_areas: list[str] | None = Field(
        default=None,
        description="Optional focus areas for the summary (e.g., 'VAT deductions', 'sentencing factors')",
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


class SummarizeResponse(BaseModel):
    """Response model for document summarization."""

    summary: str = Field(description="Generated summary in markdown format")
    key_points: list[str] = Field(description="Key takeaway points from the summary")
    document_ids: list[str] = Field(description="Document IDs that were summarized")
    summary_type: str = Field(description="Type of summary generated")
    length: str = Field(description="Requested summary length")


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


def _format_document_for_summary(doc: dict[str, Any]) -> str:
    """Format a single document for the summarization prompt."""
    parts = []

    doc_id = doc.get("document_id", "unknown")
    parts.append(f"--- Document ID: {doc_id} ---")

    if doc.get("title"):
        parts.append(f"Title: {doc['title']}")

    if doc.get("document_type"):
        parts.append(f"Type: {doc['document_type']}")

    if doc.get("date_issued"):
        parts.append(f"Date: {doc['date_issued']}")

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
        # Truncate very long documents to fit within context limits
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
    response_model=SummarizeResponse,
    summary="Generate document summary",
    description=(
        "Generate a concise summary of one or more legal documents using GPT-4. "
        "Supports executive summaries, key findings extraction, and multi-document synthesis."
    ),
)
async def summarize_documents(request: SummarizeRequest) -> SummarizeResponse:
    """Generate an AI summary of legal documents."""
    logger.info(
        f"Summarization request: type={request.summary_type}, "
        f"length={request.length}, documents={request.document_ids}"
    )

    # Fetch documents
    documents = await _fetch_document_content(request.document_ids)

    if not documents:
        raise HTTPException(
            status_code=404,
            detail="None of the specified documents were found",
        )

    # Format document content
    formatted_docs = "\n\n".join(_format_document_for_summary(doc) for doc in documents)

    # Build focus areas instruction
    focus_instruction = ""
    if request.focus_areas:
        areas_str = ", ".join(request.focus_areas)
        focus_instruction = f"- Pay special attention to these focus areas: {areas_str}"

    # Select prompt template
    prompt_template = SUMMARY_TYPE_PROMPTS[request.summary_type]
    target_length = SUMMARY_LENGTH_MAP[request.length]

    # Build the prompt
    filled_prompt = prompt_template.format(
        target_length=target_length,
        document_content=formatted_docs,
        focus_areas_instruction=focus_instruction,
    )

    # Create the LLM chain
    chat_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SUMMARIZATION_SYSTEM_PROMPT),
            ("human", "{prompt}"),
        ]
    )

    llm = get_default_llm(use_mini_model=False)
    parser = JsonOutputParser()

    chain = chat_prompt | llm | parser

    try:
        result = await chain.ainvoke({"prompt": filled_prompt})
    except Exception as e:
        logger.error(f"Summarization LLM error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to generate summary. The AI service may be temporarily unavailable.",
        )

    # Extract and validate response
    summary_text = result.get("summary", "")
    key_points = result.get("key_points", [])
    doc_ids = result.get("document_ids", request.document_ids)

    if not summary_text:
        raise HTTPException(
            status_code=500,
            detail="The AI generated an empty summary. Please try again.",
        )

    return SummarizeResponse(
        summary=summary_text,
        key_points=key_points,
        document_ids=doc_ids,
        summary_type=request.summary_type,
        length=request.length,
    )


# ===== Key Points Extraction Models =====


class KeyPointArgument(BaseModel):
    """A single argument extracted from the document."""

    party: str = Field(
        description="Who made this argument (e.g., 'taxpayer', 'tax authority', 'appellant')"
    )
    text: str = Field(description="The argument text")
    source_ref: str = Field(
        description="Paragraph number, section reference, or position in document"
    )


class KeyPointHolding(BaseModel):
    """A single holding or decision extracted from the document."""

    text: str = Field(description="The holding or decision text")
    source_ref: str = Field(
        description="Paragraph number, section reference, or position in document"
    )


class KeyPointLegalPrinciple(BaseModel):
    """A legal principle, rule, or precedent extracted from the document."""

    text: str = Field(description="The legal principle text")
    source_ref: str = Field(
        description="Paragraph number, section reference, or position in document"
    )
    legal_basis: str | None = Field(
        default=None,
        description="Specific statute, article, or case citation if mentioned",
    )


class KeyPointsRequest(BaseModel):
    """Request model for key points extraction."""

    document_id: str = Field(description="Document ID to extract key points from")
    focus_areas: list[str] | None = Field(
        default=None,
        description="Optional focus areas (e.g., 'VAT deductions', 'sentencing factors')",
        max_length=5,
    )

    @field_validator("document_id")
    @classmethod
    def validate_document_id(cls, v: str) -> str:
        return validate_id_format(v, "document_id")

    @field_validator("focus_areas")
    @classmethod
    def validate_focus_areas(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            return [area.strip() for area in v if area.strip()]
        return v


class KeyPointsResponse(BaseModel):
    """Response model for key points extraction."""

    arguments: list[KeyPointArgument] = Field(
        default_factory=list,
        description="Key arguments made by each party",
    )
    holdings: list[KeyPointHolding] = Field(
        default_factory=list,
        description="Court's or authority's holdings and decisions",
    )
    legal_principles: list[KeyPointLegalPrinciple] = Field(
        default_factory=list,
        description="Legal principles, rules, and precedents",
    )
    document_id: str = Field(description="Document ID that was analyzed")


# ===== Key Points Extraction Endpoint =====


@router.post(
    "/key-points",
    response_model=KeyPointsResponse,
    summary="Extract key arguments, holdings, and legal principles",
    description=(
        "Extract and structure key arguments, holdings, and legal principles "
        "from a legal document using AI. Each extracted point includes a "
        "reference to its source paragraph in the document."
    ),
)
async def extract_key_points(request: KeyPointsRequest) -> KeyPointsResponse:
    """Extract structured key points from a legal document."""
    logger.info(f"Key points extraction request: document={request.document_id}")

    # Fetch document
    documents = await _fetch_document_content([request.document_id])

    if not documents:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    # Format document content (use higher char limit for key points extraction)
    doc = documents[0]
    formatted_doc = _format_document_for_summary(doc)

    # Build focus areas instruction
    focus_instruction = ""
    if request.focus_areas:
        areas_str = ", ".join(request.focus_areas)
        focus_instruction = f"- Pay special attention to these focus areas: {areas_str}"

    # Build the prompt
    filled_prompt = KEY_POINTS_EXTRACTION_PROMPT.format(
        document_content=formatted_doc,
        focus_areas_instruction=focus_instruction,
    )

    # Create the LLM chain
    chat_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", KEY_POINTS_EXTRACTION_SYSTEM_PROMPT),
            ("human", "{prompt}"),
        ]
    )

    llm = get_default_llm(use_mini_model=False)
    parser = JsonOutputParser()

    chain = chat_prompt | llm | parser

    try:
        result = await chain.ainvoke({"prompt": filled_prompt})
    except Exception as e:
        logger.error(f"Key points extraction LLM error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to extract key points. The AI service may be temporarily unavailable.",
        )

    # Parse and validate response
    arguments = [
        KeyPointArgument(**arg)
        for arg in result.get("arguments", [])
        if isinstance(arg, dict) and arg.get("text")
    ]
    holdings = [
        KeyPointHolding(**h)
        for h in result.get("holdings", [])
        if isinstance(h, dict) and h.get("text")
    ]
    legal_principles = [
        KeyPointLegalPrinciple(**lp)
        for lp in result.get("legal_principles", [])
        if isinstance(lp, dict) and lp.get("text")
    ]

    if not arguments and not holdings and not legal_principles:
        raise HTTPException(
            status_code=500,
            detail="The AI could not extract any key points from this document. Please try again.",
        )

    return KeyPointsResponse(
        arguments=arguments,
        holdings=holdings,
        legal_principles=legal_principles,
        document_id=request.document_id,
    )
