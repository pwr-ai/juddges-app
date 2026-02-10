"""
Legal argumentation analysis endpoint.

Analyzes legal arguments in documents identifying premises, conclusions,
and reasoning patterns. Helps users understand argument structure and
find potential counter-arguments.
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

router = APIRouter(prefix="/argumentation", tags=["argumentation"])


# ===== Prompt Constants =====

ARGUMENTATION_SYSTEM_PROMPT = """You are a legal argumentation analyst affiliated with WUST \
(Wroclaw University of Science and Technology). You specialize in \
analyzing the logical structure of legal arguments in tax law and \
administrative law documents.

Your task is to decompose legal arguments into their structural \
components: premises (both factual and legal), conclusions, reasoning \
patterns, and potential counter-arguments.

You must respond with valid JSON matching the requested schema."""

ARGUMENTATION_ANALYSIS_PROMPT = """Analyze the legal arguments in the following document(s). \
Identify all distinct arguments and break each one down into its structural components.

For each argument found, extract:
1. **Premises**: Both factual premises (facts of the case) and legal premises (statutes, \
regulations, legal principles cited)
2. **Conclusion**: The conclusion the argument reaches
3. **Reasoning pattern**: Classify the reasoning as one of: "deductive" (applying general \
rule to specific case), "analogical" (comparing to similar cases), "policy" (based on \
policy objectives or legislative intent), "textual" (strict interpretation of statutory \
text), or "teleological" (purpose-based interpretation)
4. **Strength**: Assess argument strength as "strong", "moderate", or "weak" based on \
the quality of premises and logical connection to the conclusion
5. **Counter-arguments**: Identify potential counter-arguments or weaknesses
6. **Supporting references**: Any legal bases, case citations, or statutory references

{focus_areas_instruction}

Document(s) to analyze:
{document_content}

Respond with a JSON object with this exact structure:
{{
  "arguments": [
    {{
      "title": "Brief title summarizing the argument",
      "party": "Who makes this argument (e.g., taxpayer, tax authority, court)",
      "factual_premises": ["List of factual claims or findings"],
      "legal_premises": ["List of legal rules, statutes, or principles cited"],
      "conclusion": "The conclusion reached",
      "reasoning_pattern": "deductive|analogical|policy|textual|teleological",
      "strength": "strong|moderate|weak",
      "strength_explanation": "Brief explanation of why this strength was assigned",
      "counter_arguments": ["Potential counter-arguments or weaknesses"],
      "legal_references": ["Cited statutes, articles, case numbers"],
      "source_section": "Section or paragraph where this argument appears"
    }}
  ],
  "overall_analysis": {{
    "dominant_reasoning_pattern": "The most common reasoning pattern used",
    "argument_flow": "Brief description of how arguments connect and build on each other",
    "key_disputes": ["Main points of contention between parties"],
    "strongest_argument_index": 0
  }}
}}"""


# ===== Request/Response Models =====


class ArgumentationRequest(BaseModel):
    """Request to analyze legal arguments in documents."""

    document_ids: list[str] = Field(
        description="List of document IDs to analyze for argumentation",
        min_length=1,
        max_length=5,
    )
    focus_areas: list[str] | None = Field(
        default=None,
        description="Optional focus areas (e.g., 'VAT deductions', 'transfer pricing')",
        max_length=5,
    )
    detail_level: Literal["basic", "detailed"] = Field(
        default="detailed",
        description="Level of detail: 'basic' for main arguments only, 'detailed' for full analysis",
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


class ArgumentPremise(BaseModel):
    """A premise in a legal argument - either factual or legal."""

    text: str = Field(description="The premise text")
    premise_type: Literal["factual", "legal"] = Field(
        description="Whether this is a factual or legal premise"
    )


class Argument(BaseModel):
    """A structured legal argument with premises, conclusion, and analysis."""

    title: str = Field(description="Brief title summarizing the argument")
    party: str = Field(
        description="Who makes this argument (e.g., taxpayer, tax authority, court)"
    )
    factual_premises: list[str] = Field(
        default_factory=list, description="Factual claims or findings"
    )
    legal_premises: list[str] = Field(
        default_factory=list, description="Legal rules, statutes, or principles cited"
    )
    conclusion: str = Field(description="The conclusion reached by this argument")
    reasoning_pattern: Literal[
        "deductive", "analogical", "policy", "textual", "teleological"
    ] = Field(description="Classification of the reasoning pattern used")
    strength: Literal["strong", "moderate", "weak"] = Field(
        description="Assessment of argument strength"
    )
    strength_explanation: str = Field(
        description="Explanation of the strength assessment"
    )
    counter_arguments: list[str] = Field(
        default_factory=list, description="Potential counter-arguments or weaknesses"
    )
    legal_references: list[str] = Field(
        default_factory=list,
        description="Cited statutes, articles, case numbers",
    )
    source_section: str | None = Field(
        default=None,
        description="Section or paragraph where this argument appears",
    )


class OverallAnalysis(BaseModel):
    """Overall analysis of the argumentation structure."""

    dominant_reasoning_pattern: str = Field(
        description="The most common reasoning pattern used"
    )
    argument_flow: str = Field(
        description="How arguments connect and build on each other"
    )
    key_disputes: list[str] = Field(
        default_factory=list,
        description="Main points of contention between parties",
    )
    strongest_argument_index: int = Field(
        default=0, description="Index of the strongest argument"
    )


class ArgumentationResponse(BaseModel):
    """Response from argumentation analysis."""

    arguments: list[Argument] = Field(description="List of identified arguments")
    overall_analysis: OverallAnalysis = Field(
        description="Overall analysis of the argumentation"
    )
    document_ids: list[str] = Field(description="Document IDs that were analyzed")
    argument_count: int = Field(description="Total number of arguments found")


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


def _format_document_for_analysis(doc: dict[str, Any]) -> str:
    """Format a single document for the argumentation analysis prompt."""
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
    "/analyze",
    response_model=ArgumentationResponse,
    summary="Analyze legal arguments in documents",
    description=(
        "Analyze legal arguments in one or more documents, identifying premises, "
        "conclusions, reasoning patterns, and potential counter-arguments. "
        "Uses AI to decompose complex legal reasoning into structured components."
    ),
)
async def analyze_arguments(
    request: ArgumentationRequest,
) -> ArgumentationResponse:
    """Analyze the argumentation structure of legal documents."""
    logger.info(
        f"Argumentation analysis request: documents={request.document_ids}, "
        f"detail_level={request.detail_level}"
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
        _format_document_for_analysis(doc) for doc in documents
    )

    # Build focus areas instruction
    focus_instruction = ""
    if request.focus_areas:
        areas_str = ", ".join(request.focus_areas)
        focus_instruction = (
            f"Pay special attention to arguments related to: {areas_str}"
        )

    # Build the prompt
    filled_prompt = ARGUMENTATION_ANALYSIS_PROMPT.format(
        document_content=formatted_docs,
        focus_areas_instruction=focus_instruction,
    )

    # Create the LLM chain
    chat_prompt = ChatPromptTemplate.from_messages([
        ("system", ARGUMENTATION_SYSTEM_PROMPT),
        ("human", "{prompt}"),
    ])

    llm = get_default_llm(use_mini_model=False)
    parser = JsonOutputParser()

    chain = chat_prompt | llm | parser

    try:
        result = await chain.ainvoke({"prompt": filled_prompt})
    except Exception as e:
        logger.error(f"Argumentation analysis LLM error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to analyze arguments. The AI service may be temporarily unavailable.",
        )

    # Parse arguments from response
    raw_arguments = result.get("arguments", [])
    valid_reasoning_patterns = {
        "deductive", "analogical", "policy", "textual", "teleological",
    }
    valid_strengths = {"strong", "moderate", "weak"}

    arguments: list[Argument] = []
    for arg in raw_arguments:
        if not isinstance(arg, dict) or not arg.get("conclusion"):
            continue

        # Normalize reasoning pattern
        pattern = arg.get("reasoning_pattern", "deductive").lower()
        if pattern not in valid_reasoning_patterns:
            pattern = "deductive"

        # Normalize strength
        strength = arg.get("strength", "moderate").lower()
        if strength not in valid_strengths:
            strength = "moderate"

        arguments.append(
            Argument(
                title=arg.get("title", "Untitled argument"),
                party=arg.get("party", "Unknown"),
                factual_premises=arg.get("factual_premises", []),
                legal_premises=arg.get("legal_premises", []),
                conclusion=arg["conclusion"],
                reasoning_pattern=pattern,
                strength=strength,
                strength_explanation=arg.get(
                    "strength_explanation", "No explanation provided"
                ),
                counter_arguments=arg.get("counter_arguments", []),
                legal_references=arg.get("legal_references", []),
                source_section=arg.get("source_section"),
            )
        )

    if not arguments:
        raise HTTPException(
            status_code=500,
            detail="The AI could not identify any arguments in the document(s). "
            "Please try again or try a different document.",
        )

    # Parse overall analysis
    raw_overall = result.get("overall_analysis", {})
    if not isinstance(raw_overall, dict):
        raw_overall = {}

    strongest_idx = raw_overall.get("strongest_argument_index", 0)
    if not isinstance(strongest_idx, int) or strongest_idx >= len(arguments):
        strongest_idx = 0

    overall_analysis = OverallAnalysis(
        dominant_reasoning_pattern=raw_overall.get(
            "dominant_reasoning_pattern", "deductive"
        ),
        argument_flow=raw_overall.get(
            "argument_flow", "Arguments were analyzed independently."
        ),
        key_disputes=raw_overall.get("key_disputes", []),
        strongest_argument_index=strongest_idx,
    )

    return ArgumentationResponse(
        arguments=arguments,
        overall_analysis=overall_analysis,
        document_ids=request.document_ids,
        argument_count=len(arguments),
    )
