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
    query_type: str | None = Field(
        default=None,
        description="Detected query type for diagnostic purposes (case_number, statute_reference, exact_phrase, conceptual, mixed).",
    )


QUERY_ANALYSIS_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a search query planner for a Polish and UK case-law
search engine. Users are lawyers, judges, and legal researchers.

Given a user query, produce:
1) semantic_query: richer conceptual form for BGE-M3 vector retrieval.
   - Expand with nearby legal concepts the user likely meant.
   - Preserve original language (do not translate PL↔EN).
2) keyword_query: concise lexical form for PostgreSQL websearch_to_tsquery.
   - MUST preserve every explicit article / code reference VERBATIM
     (e.g. "art. 415 k.c.", "art. 233 § 1 k.p.c.", "Section 2").
     These are load-bearing tokens the user expects to match literally.
   - Drop filler ("czy", "jak", "jakie", "please", "how").
3) optional explicit filters only when strongly supported by the query.

Filter extraction rules:
- Only extract filters if explicit or highly implied.
- Never guess jurisdiction/court/date when absent.
- jurisdictions: only use values "PL" or "UK".
- date_from/date_to must be valid ISO date strings YYYY-MM-DD.
- If unknown, use null.

Query rewrite rules:
- Preserve user intent.
- Keep both rewritten queries concise (<= ~20 tokens).
- Add legal synonyms only when they improve recall — no hallucinations.
- Do NOT invent case signatures, statutes, or court names.

Examples (Polish):

user: "zasiedzenie nieruchomości"
→ semantic: "zasiedzenie nieruchomości posiadanie samoistne upływ terminu"
  keyword: "zasiedzenie nieruchomości"

user: "Jakie są przesłanki uznania czynu za wypadek przy pracy?"
→ semantic: "wypadek przy pracy przesłanki uznania zdarzenie związek z pracą"
  keyword: "wypadek przy pracy przesłanki"

user: "odpowiedzialność na podstawie art. 415 k.c. w zw. z art. 361 k.c."
→ semantic: "odpowiedzialność deliktowa czyn niedozwolony związek przyczynowy"
  keyword: "odpowiedzialność art. 415 k.c. art. 361 k.c."

user: "II CSK 604/17"
→ semantic: "II CSK 604/17"
  keyword: "II CSK 604/17"

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
        # GPT-5 is a reasoning model by default; without reasoning_effort
        # it consumes the entire completion budget on hidden reasoning tokens,
        # leaving nothing for the structured output (observed 500/500 reasoning
        # with a "length limit reached" parse error). For query planning we
        # don't need deep thinking — "minimal" keeps it close to the old
        # gpt-4o-mini latency (~2-3s vs 5-6s).
        # max_completion_tokens > reasoning + JSON output size; 2000 is safe.
        llm = ChatOpenAI(
            model="gpt-5-mini",
            max_completion_tokens=2000,
            reasoning_effort="minimal",
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


# Polish case number: optional roman numeral division + department code + digits/year
# e.g. "II K 123/20", "III KK 45/21", "I ACa 789/19", "V CSK 12/22"
_POLISH_CASE_RE = re.compile(
    r"\b(?:I{1,3}|IV|V|VI|VII|VIII|IX|X)?\s*"
    r"[A-Z]{1,5}(?:a|b)?\s+"
    r"\d{1,5}/\d{2,4}\b"
)

# UK neutral citations: [YYYY] COURT digits, e.g. "[2020] UKSC 1", "[2019] EWCA Civ 123"
_UK_CASE_RE = re.compile(
    r"\[\d{4}\]\s+(?:UKSC|UKHL|EWCA|EWHC|UKUT|UKFTT|UKPC|UKAT)"
    r"(?:\s+(?:Civ|Crim|Admin|QB|Ch|Fam|Pat|IP|Costs|TCC|Comm|Admlty))?"
    r"\s+\d+"
)

# Polish statute references: "art. 148 kk", "Art. 2 kpc", "§ 5 ust. 1", or "§12"
# UK statute references: "Section 2 Criminal Justice Act", "s. 47 PACE"
_STATUTE_RE = re.compile(
    r"(?:"
    r"\bArt(?:ykuł|ykul|\.)\s*\d+"  # Polish: Art. 148 or Artykuł 148
    r"|\bart\.\s*\d+"  # Polish short: art. 148
    r"|§\s*\d+"  # § symbol
    r"|\bSection\s+\d+"  # UK: Section 2
    r"|\bs\.\s*\d+"  # UK short: s. 47
    r"|\b(?:kk|kpc|kpk|kc|kpa|kks|kro|kw)\b"  # Polish code abbrevs
    r"|Criminal Justice Act"
    r"|(?:Police and Criminal Evidence|Misuse of Drugs|Theft|Fraud) Act"
    r")",
    re.IGNORECASE,
)

# Queries wrapped in double quotes
_EXACT_PHRASE_RE = re.compile(r'^\s*"[^"]+"\s*$')


# A case number must take up at least this fraction of the stripped query
# to trigger case_number routing. Prevents long paragraphs that happen to
# cite "II CSK 604/17" from being routed as a signature lookup.
_CASE_NUMBER_MIN_COVERAGE = 0.30
_CASE_NUMBER_MAX_QUERY_LEN = 80


def _is_case_number_dominant(query: str) -> bool:
    """Case-number routing should fire only when the signature *is* the query,
    not merely mentioned inside a longer legal text.

    Two conditions must both hold:
    - query length ≤ 80 chars (signatures alone are short)
    - matched case-number substring covers ≥ 30% of the stripped query
    """
    stripped_len = len(query.strip())
    if stripped_len == 0 or stripped_len > _CASE_NUMBER_MAX_QUERY_LEN:
        return False
    for rx in (_POLISH_CASE_RE, _UK_CASE_RE):
        m = rx.search(query)
        if m and len(m.group(0)) / stripped_len >= _CASE_NUMBER_MIN_COVERAGE:
            return True
    return False


def classify_and_route_query(query: str) -> tuple[str, float]:
    """Classify query type and return (query_type, recommended_alpha).

    Query types and their optimal alpha:
    - 'case_number': queries like "III KK 123/20", "C-123/19" → alpha=0.1 (mostly text)
    - 'statute_reference': queries like "art. 148 kk", "Section 2 Criminal Justice Act" → alpha=0.2
    - 'exact_phrase': quoted queries like '"strict liability"' → alpha=0.15
    - 'conceptual': abstract concepts like "duty of care in medical negligence" → alpha=0.8 (mostly vector)
    - 'mixed': default/fallback → alpha=0.5
    """
    # Exact-phrase check first — the surrounding quotes are the decisive signal.
    if _EXACT_PHRASE_RE.match(query):
        return "exact_phrase", 0.15

    # Only route as case_number when the signature is the dominant part of the
    # query. Using .search() naively fires on any paragraph that cites case law.
    if _is_case_number_dominant(query):
        return "case_number", 0.1

    if _STATUTE_RE.search(query):
        return "statute_reference", 0.2

    # Conceptual queries: 4+ words and none of the specific identifier patterns above.
    word_count = len(query.split())
    if word_count >= 4:
        return "conceptual", 0.8

    return "mixed", 0.5


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
    query_type, _ = classify_and_route_query(query)

    return QueryAnalysisResult(
        semantic_query=semantic_query,
        keyword_query=keyword_query,
        jurisdictions=jurisdictions,
        court_levels=court_levels,
        case_types=case_types,
        keywords=None,
        date_from=date_from,
        date_to=date_to,
        query_type=query_type,
    )


def analyze_query_heuristic(query: str) -> QueryAnalysisResult:
    """Public helper for deterministic query analysis without LLM calls."""
    return _heuristic_query_analysis(query)


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
