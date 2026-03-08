"""LLM-powered query analysis for hybrid legal document search."""

from __future__ import annotations

import re
from typing import Literal

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

AllowedJurisdiction = Literal["PL", "UK"]


class QueryAnalysisResult(BaseModel):
    """Structured query analysis output used by /documents/search."""

    semantic_query: str = Field(
        description="Query optimized for semantic/vector retrieval."
    )
    keyword_query: str = Field(
        description="Query optimized for lexical/full-text retrieval."
    )
    jurisdictions: list[AllowedJurisdiction] | None = Field(
        default=None,
        description="Inferred jurisdictions filter, only if explicitly implied by the user.",
    )
    court_names: list[str] | None = Field(
        default=None,
        description="Inferred specific court names filter.",
    )
    court_levels: list[str] | None = Field(
        default=None,
        description="Inferred court level filter (e.g., Supreme Court, Appeal Court).",
    )
    case_types: list[str] | None = Field(
        default=None,
        description="Inferred case type filter (e.g., Criminal, Civil, Administrative).",
    )
    decision_types: list[str] | None = Field(
        default=None,
        description="Inferred decision type filter (e.g., Judgment, Order).",
    )
    outcomes: list[str] | None = Field(
        default=None,
        description="Inferred case outcomes filter.",
    )
    keywords: list[str] | None = Field(
        default=None,
        description="Inferred keyword filters for metadata keywords overlap.",
    )
    legal_topics: list[str] | None = Field(
        default=None,
        description="Inferred legal topic filters.",
    )
    cited_legislation: list[str] | None = Field(
        default=None,
        description="Inferred cited legislation filters.",
    )
    date_from: str | None = Field(
        default=None,
        description="Inferred decision date lower bound in ISO format YYYY-MM-DD.",
    )
    date_to: str | None = Field(
        default=None,
        description="Inferred decision date upper bound in ISO format YYYY-MM-DD.",
    )


QUERY_ANALYSIS_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a legal search query planner.

Given a user query, produce:
1) semantic_query: richer conceptual form for embedding/vector retrieval.
2) keyword_query: concise lexical form for PostgreSQL full-text search.
3) optional explicit filters only when strongly supported by the query text.

Filter extraction rules:
- Only extract filters if explicit or highly implied.
- Never guess jurisdiction/court/date when absent.
- jurisdictions: only use values "PL" or "UK".
- date_from/date_to must be valid ISO date strings YYYY-MM-DD.
- Keep lists short and precise.
- If unknown, use null.

Query rewrite rules:
- Preserve user intent.
- Keep both rewritten queries concise.
- Add legal synonyms/terms only when they improve recall.
- Avoid hallucinated statutes, case IDs, or court names.

Return JSON following the schema exactly.""",
        ),
        ("human", "{query}"),
    ]
)


def create_query_analysis_chain(
    llm: ChatOpenAI | None = None,
):
    """Create query analysis chain with structured output."""
    if llm is None:
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.1,
            max_tokens=500,
        )

    model = llm.with_structured_output(QueryAnalysisResult)
    return QUERY_ANALYSIS_PROMPT | model


async def analyze_query(
    query: str,
    llm: ChatOpenAI | None = None,
) -> QueryAnalysisResult:
    """Analyze a user query into semantic/keyword rewrites plus inferred filters."""
    chain = create_query_analysis_chain(llm)
    result = await chain.ainvoke({"query": query})

    # Defensive fallback in case any field comes back empty/null unexpectedly.
    if not result.semantic_query:
        result.semantic_query = query
    if not result.keyword_query:
        result.keyword_query = query

    return result


def _normalize_query_for_keywords(query: str) -> str:
    """Normalize query for lexical/full-text retrieval."""
    cleaned = re.sub(r"[^\w\s]", " ", query.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or query


def _expand_semantic_query(query: str) -> str:
    """Apply lightweight semantic expansion when LLM analysis is unavailable."""
    base = _normalize_query_for_keywords(query)
    tokens = set(base.split())

    synonyms = {
        "contract": {"agreement", "contractual", "breach"},
        "breach": {"violation", "nonperformance"},
        "negligence": {"liability", "duty", "care"},
        "appeal": {"appellate", "challenge"},
        "tax": {"vat", "fiscal"},
        "vat": {"tax"},
        "criminal": {"offence", "sentencing", "conviction"},
        "fraud": {"deception", "dishonesty"},
        "lease": {"tenancy", "property"},
        "termination": {"rescission", "ending"},
        "murder": {"homicide", "manslaughter", "killing"},
        "conviction": {"convicted", "guilty", "sentence"},
        "damages": {"compensation", "remedy"},
        "sentencing": {"sentence", "punishment"},
        "property": {"estate", "land", "ownership"},
    }

    expanded = set(tokens)
    for token in list(tokens):
        expanded |= synonyms.get(token, set())

    # Keep query concise while improving recall.
    ordered = base.split() + [t for t in sorted(expanded) if t not in tokens]
    return " ".join(ordered[:24]).strip() or query


def _extract_year_bounds(query: str) -> tuple[str | None, str | None]:
    years = [int(y) for y in re.findall(r"\b(19\d{2}|20\d{2}|21\d{2})\b", query)]
    years = [y for y in years if 1900 <= y <= 2199]
    if not years:
        return None, None

    if len(years) >= 2:
        year_from = min(years)
        year_to = max(years)
    else:
        year_from = years[0]
        year_to = years[0]

    return f"{year_from:04d}-01-01", f"{year_to:04d}-12-31"


def _contains_any_terms(text: str, terms: tuple[str, ...]) -> bool:
    """Return True when any term is present as a whole-word phrase in text."""
    for term in terms:
        pattern = rf"\b{re.escape(term)}\b"
        if re.search(pattern, text):
            return True
    return False


def _heuristic_query_analysis(query: str) -> QueryAnalysisResult:
    """Best-effort deterministic fallback when LLM analysis is unavailable."""
    lower = query.lower()
    keyword_query = _normalize_query_for_keywords(query)
    semantic_query = _expand_semantic_query(query)

    jurisdictions: list[AllowedJurisdiction] | None = None
    has_uk = bool(
        re.search(r"\buk\b", lower)
        or any(
            token in lower
            for token in ("united kingdom", "english court", "england", "british")
        )
    )
    has_pl = bool(
        re.search(r"\bpl\b", lower)
        or any(token in lower for token in ("poland", "polish", "polski", "polska"))
        or re.search(r"[ąćęłńóśźż]", lower)  # Polish diacritics indicate PL
    )
    if has_uk:
        jurisdictions = ["UK"]
    elif has_pl:
        jurisdictions = ["PL"]

    # Keep heuristic filters high-precision: infer case type only from explicit terms.
    case_types: list[str] | None = None
    if _contains_any_terms(lower, ("criminal", "offence", "offense", "sentencing")):
        case_types = ["Criminal"]
    elif _contains_any_terms(lower, ("civil",)):
        case_types = ["Civil"]
    elif _contains_any_terms(lower, ("administrative",)):
        case_types = ["Administrative"]

    court_levels: list[str] | None = None
    if "supreme court" in lower:
        court_levels = ["Supreme Court"]
    elif "appeal court" in lower:
        court_levels = ["Appeal Court"]
    elif "high court" in lower:
        court_levels = ["High Court"]

    date_from, date_to = _extract_year_bounds(query)

    return QueryAnalysisResult(
        semantic_query=semantic_query,
        keyword_query=keyword_query,
        jurisdictions=jurisdictions,
        court_levels=court_levels,
        case_types=case_types,
        keywords=None,
        date_from=date_from,
        date_to=date_to,
    )


async def analyze_query_with_fallback(
    query: str,
    llm: ChatOpenAI | None = None,
) -> tuple[QueryAnalysisResult, Literal["llm", "heuristic"], str | None]:
    """Analyze query with LLM first; fall back to heuristic analysis on error."""
    try:
        result = await analyze_query(query, llm=llm)
        return result, "llm", None
    except Exception as e:
        fallback = _heuristic_query_analysis(query)
        return fallback, "heuristic", str(e)
