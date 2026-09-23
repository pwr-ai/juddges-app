"""
Precedent finder endpoint.

AI-powered system to find relevant precedent cases based on fact patterns
and legal issues. Uses semantic similarity and legal reasoning to rank results.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from juddges_search.db.supabase_db import get_vector_db
from juddges_search.llms import get_default_llm
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from app.judgments_pkg import generate_embedding
from app.judgments_pkg.query_attribute_parser import parse_query_attributes
from app.models import validate_id_format
from app.rate_limiter import limiter

router = APIRouter(prefix="/precedents", tags=["precedents"])

# Per-endpoint rate limit for precedent search (lighter than full analysis endpoints)
PRECEDENTS_RATE_LIMIT = "30/hour"

# Raw vector candidates exposed as the cohort (#724, spec §7.1). The ranked
# `precedents` slice is still taken from the top `limit` of this same pool, so a
# wider pool does not change what the LLM sees.
#
# Measured against production: `search_judgments_by_embedding` never sets
# `hnsw.ef_search`, so the index default of 40 caps the result set regardless
# of `match_count` — requesting 100 or 200 both returned 40 rows. 40 is what
# actually binds here, not an arbitrary choice; raising it needs an
# ef_search migration (tracked separately, out of scope for this PR).
COHORT_MATCH_COUNT = 40


# ===== Request/Response Models =====


class FindPrecedentsRequest(BaseModel):
    """Request model for finding precedent cases."""

    query: str = Field(
        description="Natural language description of the fact pattern, legal issue, or question to find precedents for",
        min_length=10,
        max_length=5000,
    )
    document_id: str | None = Field(
        default=None,
        description="Optional source document ID to find precedents for (uses document's content as context)",
    )
    filters: "PrecedentFilters | None" = Field(
        default=None,
        description="Optional filters to narrow down precedent search",
    )
    limit: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum number of precedent results to return",
    )
    include_analysis: bool = Field(
        default=True,
        description="Whether to include AI-powered relevance analysis for each result",
    )

    @field_validator("document_id")
    @classmethod
    def validate_document_id(cls, v: str | None) -> str | None:
        if v is not None:
            return validate_id_format(v, "document_id")
        return v


class PrecedentFilters(BaseModel):
    """Filters for narrowing down precedent search."""

    document_types: list[str] | None = Field(
        default=None,
        description="Filter by document types (e.g., 'judgment')",
    )
    court_names: list[str] | None = Field(
        default=None,
        description="Filter by court names",
    )
    date_from: str | None = Field(
        default=None,
        description="Filter by date range start (ISO format)",
    )
    date_to: str | None = Field(
        default=None,
        description="Filter by date range end (ISO format)",
    )
    legal_bases: list[str] | None = Field(
        default=None,
        description="Filter by specific legal bases (statutes/articles)",
    )
    outcome: str | None = Field(
        default=None,
        description="Filter by case outcome (e.g., 'upheld', 'overturned')",
    )
    language: str | None = Field(
        default=None,
        description="Filter by language code (e.g., 'pl', 'en')",
    )


class PrecedentMatch(BaseModel):
    """A single precedent match result."""

    document_id: str = Field(description="Document ID")
    title: str | None = Field(default=None, description="Document title")
    document_type: str | None = Field(default=None, description="Type of document")
    date_issued: str | None = Field(
        default=None, description="Date the document was issued"
    )
    court_name: str | None = Field(default=None, description="Court name")
    outcome: str | None = Field(default=None, description="Case outcome")
    legal_bases: list[str] | None = Field(default=None, description="Legal bases cited")
    summary: str | None = Field(default=None, description="Document summary")
    similarity_score: float = Field(
        description="Semantic similarity score (0.0 to 1.0)"
    )
    relevance_score: float | None = Field(
        default=None,
        description="AI-assessed relevance score (0.0 to 1.0)",
    )
    matching_factors: list[str] = Field(
        default_factory=list,
        description="Factors that make this a relevant precedent",
    )
    relevance_explanation: str | None = Field(
        default=None,
        description="Brief explanation of why this is a relevant precedent",
    )


class PrecedentCohortItem(BaseModel):
    """One raw vector candidate, before the LLM ranking pass (#724).

    Field names drop the `base_` prefix so the frontend can label them with the
    same helper the statistics view uses (#708).
    """

    document_id: str = Field(description="Judgment UUID")
    similarity_score: float = Field(description="Cosine similarity (0.0 to 1.0)")
    case_number: str | None = Field(default=None, description="Court case number")
    title: str | None = Field(default=None, description="Judgment title")
    jurisdiction: str | None = Field(default=None, description="PL or UK")
    court_name: str | None = Field(default=None, description="Court name")
    decision_date: str | None = Field(default=None, description="ISO decision date")
    appeal_outcome: list[str] = Field(
        default_factory=list, description="base_appeal_outcome values"
    )
    sentences_received: list[str] = Field(
        default_factory=list, description="base_sentences_received values"
    )
    convict_offences: list[str] = Field(
        default_factory=list, description="base_convict_offences values"
    )


class ResolvedCase(BaseModel):
    """A docket typed into the query box, resolved to a judgment (#724)."""

    case_number: str = Field(description="The case number detected in the query")
    document_id: str = Field(description="Judgment UUID it resolved to")
    title: str | None = Field(default=None, description="Judgment title")


class FindPrecedentsResponse(BaseModel):
    """Response model for precedent search."""

    query: str = Field(description="The original query")
    precedents: list[PrecedentMatch] = Field(description="Ranked precedent matches")
    total_found: int = Field(description="Total number of precedents found")
    search_strategy: str = Field(description="Description of the search strategy used")
    enhanced_query: str | None = Field(
        default=None,
        description="AI-enhanced version of the query used for search",
    )
    cohort: list[PrecedentCohortItem] = Field(
        description=(
            "Raw vector candidates (up to 40) with the fields the UI groups by, "
            "collected before the AI ranking pass. Present even when the ranking "
            "pass returns nothing."
        ),
    )
    resolved_case: ResolvedCase | None = Field(
        default=None,
        description=(
            "Set when the query text contained a case number that matched a "
            "judgment; that judgment was used as the source document."
        ),
    )


# ===== Prompt Templates =====


PRECEDENT_ANALYSIS_SYSTEM_PROMPT = """You are an expert legal research assistant developed by Wrocław University of Science and Technology (WUST). You specialize in analyzing Polish tax law, court judgments, tax interpretations, and criminal law judicial decisions.

Your task is to analyze a set of candidate documents and assess their relevance as legal precedents for a given query or fact pattern."""


PRECEDENT_ANALYSIS_PROMPT = """<task>
Analyze the following candidate documents and assess their relevance as precedents for the given query.
</task>

<query>
{query}
</query>

<candidate_documents>
{documents}
</candidate_documents>

<instructions>
For each candidate document, provide:
1. A relevance_score from 0.0 to 1.0 (how relevant this document is as a precedent)
2. A list of matching_factors (specific reasons why this is relevant)
3. A brief relevance_explanation (1-2 sentences explaining precedent value)

Focus on:
- Similarity of legal issues and fact patterns
- Applicability of legal reasoning and holdings
- Overlap in cited legal provisions
- Similar outcomes or interpretive approaches
- Court hierarchy relevance (higher court decisions are stronger precedents)

Respond in the same language as the query.
</instructions>

<output_format>
Return a JSON object with this structure:
{{
  "analyses": [
    {{
      "document_id": "...",
      "relevance_score": 0.85,
      "matching_factors": ["similar legal issue", "same legal basis cited"],
      "relevance_explanation": "This case addresses the same VAT deduction question..."
    }}
  ],
  "enhanced_query": "optional refined version of the original query"
}}
</output_format>"""


QUERY_ENHANCEMENT_PROMPT = """<task>
You are a legal research expert. Given a user's query about finding precedent cases, extract the core legal concepts and create an enhanced search query optimized for semantic similarity search.
</task>

<query>
{query}
</query>

<instructions>
- Identify the key legal issues, concepts, and fact patterns
- Create a concise, focused search query that captures the legal essence
- Include relevant legal terminology that would appear in matching documents
- Keep the enhanced query under 500 characters
- Respond in the same language as the input query
</instructions>

<output_format>
Return a JSON object:
{{
  "enhanced_query": "the enhanced search query",
  "legal_concepts": ["concept1", "concept2"]
}}
</output_format>"""


# ===== Helper Functions =====


async def _fetch_document_context(document_id: str) -> dict[str, Any] | None:
    """Fetch document content for context when searching by document ID."""
    db = get_vector_db()
    try:
        return await db.get_document_by_id(document_id)
    except Exception as e:
        logger.error(f"Error fetching document {document_id}: {e}")
        return None


def _format_candidate_for_analysis(doc: dict[str, Any]) -> str:
    """Format a candidate document for LLM analysis."""
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
    if doc.get("outcome"):
        parts.append(f"Outcome: {doc['outcome']}")
    if doc.get("legal_bases"):
        bases = doc["legal_bases"]
        if isinstance(bases, list):
            parts.append(f"Legal Bases: {', '.join(str(b) for b in bases)}")

    # Use summary or truncated full text
    content = doc.get("summary") or doc.get("thesis") or ""
    if not content and doc.get("full_text"):
        content = (
            doc["full_text"][:3000] + "..."
            if len(doc.get("full_text", "")) > 3000
            else doc.get("full_text", "")
        )
    if content:
        parts.append(f"Content: {content}")

    return "\n".join(parts)


async def _enhance_query(query: str) -> tuple[str, list[str]]:
    """Use LLM to enhance the search query for better semantic matching."""
    chat_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are a legal research query optimization expert."),
            ("human", "{prompt}"),
        ]
    )

    llm = get_default_llm(use_mini_model=True)
    parser = JsonOutputParser()
    chain = chat_prompt | llm | parser

    try:
        result = await chain.ainvoke(
            {"prompt": QUERY_ENHANCEMENT_PROMPT.format(query=query)}
        )
        enhanced = result.get("enhanced_query", query)
        concepts = result.get("legal_concepts", [])
        return enhanced, concepts
    except Exception as e:
        logger.warning(f"Query enhancement failed, using original query: {e}")
        return query, []


async def _analyze_precedents(
    query: str,
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Use LLM to analyze candidate documents for precedent relevance."""
    formatted_docs = "\n\n".join(
        _format_candidate_for_analysis(doc) for doc in candidates
    )

    chat_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", PRECEDENT_ANALYSIS_SYSTEM_PROMPT),
            ("human", "{prompt}"),
        ]
    )

    llm = get_default_llm(use_mini_model=False)
    parser = JsonOutputParser()
    chain = chat_prompt | llm | parser

    try:
        return await chain.ainvoke(
            {
                "prompt": PRECEDENT_ANALYSIS_PROMPT.format(
                    query=query,
                    documents=formatted_docs,
                )
            }
        )
    except Exception as e:
        logger.error(f"Precedent analysis LLM error: {e}")
        return {"analyses": [], "enhanced_query": None}


def _empty_precedents_response(
    query: str,
    enhanced_query: str | None,
    resolved_case: "ResolvedCase | None" = None,
    cohort: list[PrecedentCohortItem] | None = None,
) -> FindPrecedentsResponse:
    """Build a consistent empty response payload.

    `cohort` defaults to `[]` for the "no similar_results at all" path, but
    callers that already built a cohort before hitting an empty
    `candidates_data` (spec §7.1) pass it through so it survives.
    """
    return FindPrecedentsResponse(
        query=query,
        precedents=[],
        total_found=0,
        search_strategy="semantic_similarity",
        enhanced_query=enhanced_query,
        cohort=cohort if cohort is not None else [],
        resolved_case=resolved_case,
    )


async def _build_search_text(request: FindPrecedentsRequest) -> str:
    """Build semantic search text, enriched with source document context when available."""
    search_text = request.query
    if not request.document_id:
        return search_text

    doc_data = await _fetch_document_context(request.document_id)
    if not doc_data:
        logger.warning(
            f"Source document {request.document_id} not found, using query only"
        )
        return search_text

    doc_context = doc_data.get("summary") or doc_data.get("thesis") or ""
    if not doc_context:
        return search_text

    return f"{request.query}\n\nContext from document: {doc_context[:2000]}"


async def _search_precedent_candidates(
    db: Any, embedding: list[float]
) -> list[dict[str, Any]]:
    """Run vector similarity search with service-level error handling."""
    search_kwargs: dict[str, Any] = {
        "query_embedding": embedding,
        # The cohort needs the wide pool (#724); the ranked slice still comes
        # from `similar_results[:limit]`, so ranking is unaffected.
        "match_count": COHORT_MATCH_COUNT,
        "match_threshold": 0.3,
    }
    try:
        return await db.search_by_vector(**search_kwargs)
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        raise HTTPException(
            status_code=503,
            detail="Search service temporarily unavailable. Please try again.",
        )


async def _load_candidate_documents(
    similar_results: list[dict[str, Any]], limit: int
) -> list[dict[str, Any]]:
    """Fetch full document data for top candidate IDs and attach similarity score."""
    candidate_ids = [result.get("document_id") for result in similar_results[:limit]]
    similarity_map = {
        result.get("document_id"): result.get("similarity", 0.0)
        for result in similar_results
    }

    candidates_data: list[dict[str, Any]] = []
    for doc_id in candidate_ids:
        if not doc_id:
            continue
        doc_data = await _fetch_document_context(doc_id)
        if not doc_data:
            continue
        doc_data["_similarity_score"] = similarity_map.get(doc_id, 0.0)
        doc_data["document_id"] = doc_id
        candidates_data.append(doc_data)

    return candidates_data


async def _build_cohort(
    db: Any, similar_results: list[dict[str, Any]]
) -> list[PrecedentCohortItem]:
    """Assemble the raw candidate cohort in one batched select (#724).

    Order follows `similar_results` (already similarity-sorted by the RPC), not
    the order PostgREST happens to return rows in.
    """
    ordered_ids = [
        r.get("document_id") for r in similar_results if r.get("document_id")
    ]
    if not ordered_ids:
        return []

    try:
        rows = await db.get_cohort_fields_by_ids(ordered_ids)
    except Exception as e:
        logger.error(f"Cohort fetch failed: {e}")
        return []
    rows_by_id = {row.get("id"): row for row in rows}
    similarity_by_id = {
        r.get("document_id"): r.get("similarity") or 0.0 for r in similar_results
    }

    cohort: list[PrecedentCohortItem] = []
    for doc_id in ordered_ids:
        row = rows_by_id.get(doc_id)
        if not row:
            continue
        decision_date = row.get("decision_date")
        cohort.append(
            PrecedentCohortItem(
                document_id=doc_id,
                similarity_score=float(similarity_by_id.get(doc_id) or 0.0),
                case_number=row.get("case_number"),
                title=row.get("title"),
                jurisdiction=row.get("jurisdiction"),
                court_name=row.get("court_name"),
                decision_date=str(decision_date) if decision_date else None,
                appeal_outcome=list(row.get("base_appeal_outcome") or []),
                sentences_received=list(row.get("base_sentences_received") or []),
                convict_offences=list(row.get("base_convict_offences") or []),
            )
        )
    return cohort


async def _resolve_case_query(db: Any, query: str) -> ResolvedCase | None:
    """Detect a PL/UK docket in the query and resolve it to a judgment (#724).

    Reuses the search parser's patterns rather than a second copy of them. An
    unknown docket resolves to None: the text then goes through the normal
    semantic path, which is the right fallback for a typo.
    """
    case_number = parse_query_attributes(query).case_number
    if not case_number:
        return None

    try:
        row = await db.get_document_by_case_number(case_number)
    except Exception as e:
        logger.error(f"Case-number lookup failed for {case_number}: {e}")
        return None
    if not row or not row.get("id"):
        logger.info(
            f"Case number {case_number} not found; falling back to semantic search"
        )
        return None

    return ResolvedCase(
        case_number=case_number,
        document_id=str(row["id"]),
        title=row.get("title"),
    )


async def _build_analysis_map(
    request: FindPrecedentsRequest, candidates_data: list[dict[str, Any]]
) -> tuple[dict[str, dict[str, Any]], str | None]:
    """Run optional AI precedent analysis and map analysis by document ID."""
    if not request.include_analysis or not candidates_data:
        return {}, None

    analysis_result = await _analyze_precedents(request.query, candidates_data)
    analysis_map: dict[str, dict[str, Any]] = {}
    for analysis in analysis_result.get("analyses", []):
        doc_id = analysis.get("document_id")
        if doc_id:
            analysis_map[doc_id] = analysis
    return analysis_map, analysis_result.get("enhanced_query")


def _build_precedent_match(
    doc: dict[str, Any], analysis: dict[str, Any] | None = None
) -> PrecedentMatch:
    """Build API response model for a single precedent candidate."""
    analysis_data = analysis or {}
    doc_id = doc.get("document_id", "")
    similarity = doc.get("_similarity_score", 0.0)
    relevance_score = analysis_data.get("relevance_score")
    date_val = doc.get("date_issued")
    date_str = str(date_val) if date_val and not isinstance(date_val, str) else date_val

    return PrecedentMatch(
        document_id=doc_id,
        title=doc.get("title"),
        document_type=doc.get("document_type"),
        date_issued=date_str,
        court_name=doc.get("court_name"),
        outcome=doc.get("outcome"),
        legal_bases=doc.get("legal_bases")
        if isinstance(doc.get("legal_bases"), list)
        else None,
        summary=doc.get("summary"),
        similarity_score=round(similarity, 4),
        relevance_score=round(relevance_score, 4)
        if relevance_score is not None
        else None,
        matching_factors=analysis_data.get("matching_factors", []),
        relevance_explanation=analysis_data.get("relevance_explanation"),
    )


def _rank_precedents(precedents: list[PrecedentMatch]) -> list[PrecedentMatch]:
    """Sort precedents by weighted semantic + AI relevance score."""
    return sorted(
        precedents,
        key=lambda p: (
            0.4 * p.similarity_score + 0.6 * (p.relevance_score or p.similarity_score)
        ),
        reverse=True,
    )


# ===== Endpoint =====


@router.post(
    "/find",
    response_model=FindPrecedentsResponse,
    summary="Find relevant precedent cases",
    description=(
        "Find relevant precedent cases based on a fact pattern, legal issue, "
        "or source document. Uses semantic similarity combined with AI-powered "
        "legal reasoning to rank results by relevance."
    ),
)
@limiter.limit(PRECEDENTS_RATE_LIMIT)
async def find_precedents(
    request: Request, precedents_request: FindPrecedentsRequest
) -> FindPrecedentsResponse:
    """Find relevant precedent cases using semantic search and AI analysis."""
    logger.info(
        f"Precedent search request: query_length={len(precedents_request.query)}, "
        f"document_id={precedents_request.document_id}, limit={precedents_request.limit}"
    )

    db = get_vector_db()

    resolved_case: ResolvedCase | None = None
    effective_request = precedents_request
    if not precedents_request.document_id:
        resolved_case = await _resolve_case_query(db, precedents_request.query)
        if resolved_case:
            logger.info(
                f"Query resolved to case {resolved_case.case_number} "
                f"({resolved_case.document_id})"
            )
            effective_request = precedents_request.model_copy(
                update={"document_id": resolved_case.document_id}
            )

    search_text = await _build_search_text(effective_request)
    enhanced_text, _ = await _enhance_query(search_text)
    enhanced_query = enhanced_text if enhanced_text != search_text else None
    if enhanced_query:
        logger.info(f"Enhanced query: {enhanced_text[:200]}...")

    embedding = await generate_embedding(enhanced_text)
    similar_results = await _search_precedent_candidates(db=db, embedding=embedding)
    if not similar_results:
        return _empty_precedents_response(
            precedents_request.query, enhanced_query, resolved_case=resolved_case
        )

    if effective_request.document_id:
        similar_results = [
            result
            for result in similar_results
            if result.get("document_id") != effective_request.document_id
        ]
    if effective_request.filters:
        similar_results = _apply_filters(similar_results, effective_request.filters)

    cohort = await _build_cohort(db, similar_results)

    candidates_data = await _load_candidate_documents(
        similar_results, effective_request.limit
    )
    if not candidates_data:
        return _empty_precedents_response(
            precedents_request.query,
            enhanced_query,
            resolved_case=resolved_case,
            cohort=cohort,
        )

    analysis_map, analysis_enhanced_query = await _build_analysis_map(
        effective_request, candidates_data
    )
    if analysis_enhanced_query and not enhanced_query:
        enhanced_query = analysis_enhanced_query

    precedents = [
        _build_precedent_match(doc, analysis_map.get(doc.get("document_id", "")))
        for doc in candidates_data
    ]
    precedents = _rank_precedents(precedents)[: effective_request.limit]

    search_strategy = (
        "semantic_similarity + ai_analysis"
        if effective_request.include_analysis
        else "semantic_similarity"
    )

    return FindPrecedentsResponse(
        query=precedents_request.query,
        precedents=precedents,
        total_found=len(precedents),
        search_strategy=search_strategy,
        enhanced_query=enhanced_query,
        cohort=cohort,
        resolved_case=resolved_case,
    )


def _apply_filters(
    results: list[dict[str, Any]], filters: PrecedentFilters
) -> list[dict[str, Any]]:
    """Apply metadata filters to search results."""
    filtered = results

    if filters.document_types:
        filtered = [
            r for r in filtered if r.get("document_type") in filters.document_types
        ]

    if filters.court_names:
        court_lower = [c.lower() for c in filters.court_names]
        filtered = [
            r
            for r in filtered
            if r.get("court_name") and r["court_name"].lower() in court_lower
        ]

    if filters.language:
        filtered = [r for r in filtered if r.get("language") == filters.language]

    if filters.date_from:
        filtered = [
            r
            for r in filtered
            if r.get("date_issued") and str(r["date_issued"]) >= filters.date_from
        ]

    if filters.date_to:
        filtered = [
            r
            for r in filtered
            if r.get("date_issued") and str(r["date_issued"]) <= filters.date_to
        ]

    if filters.legal_bases:
        filter_bases_lower = {b.lower() for b in filters.legal_bases}
        filtered = [
            r
            for r in filtered
            if r.get("legal_bases")
            and any(
                b.lower() in filter_bases_lower
                for b in (
                    r["legal_bases"] if isinstance(r["legal_bases"], list) else []
                )
            )
        ]

    return filtered
