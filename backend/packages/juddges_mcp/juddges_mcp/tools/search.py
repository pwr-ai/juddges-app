"""The search_judgments MCP tool.

Returns citations and snippets only. A tool that returns whole judgments
fills the client's context window and is useless in practice; full text is
reachable through get_judgment on an id the caller chose.
"""

import re
from datetime import date
from typing import Literal

from juddges_search.models import DocumentChunk, LegalDocument
from loguru import logger
from pydantic import BaseModel, Field

from app.judgments_pkg.search import run_document_search
from app.models import SearchChunksRequest
from juddges_mcp.principal import get_principal

DEFAULT_LIMIT = 10
MAX_LIMIT = 25
SNIPPET_CHARS = 600

SnippetSource = Literal["judgment_text", "summary", "title", "unknown"]

# The search RPC's `chunk_type` is the database's vocabulary; what an agent
# needs is whether the words are the court's. Anything not listed here maps to
# "unknown", never to "judgment_text": unknown provenance must not read as the
# court's own wording.
_SNIPPET_SOURCES: dict[str, SnippetSource] = {
    # Passages cut from the judgment's own text (document_chunks, or the
    # leading characters of full_text when a judgment has no summary).
    "section": "judgment_text",
    "paragraph_block": "judgment_text",
    "chunk": "judgment_text",
    "excerpt": "judgment_text",
    # The publisher-supplied summary, whole or run through ts_headline.
    "summary": "summary",
    "highlight": "summary",
    "title": "title",
}

# ts_headline markup meant for the web UI; noise for a model.
_HIGHLIGHT_TAGS = re.compile(r"</?mark>", re.IGNORECASE)


class ToolInputError(ValueError):
    """Invalid tool arguments. Surfaces to the client as a tool error."""


class JudgmentHit(BaseModel):
    """One search hit, carrying enough to verify it against the public record."""

    id: str
    court: str | None = None
    case_number: str | None = None
    judgment_date: str | None = None
    jurisdiction: str | None = None
    url: str | None = None
    snippet: str = Field(default="", max_length=SNIPPET_CHARS)
    snippet_source: SnippetSource = Field(
        default="unknown",
        description=(
            "Where the snippet's words come from: 'judgment_text' (a passage of "
            "the judgment itself), 'summary' (a publisher summary, not the "
            "court's words), 'title', or 'unknown'. Never quote a snippet as the "
            "court's words whatever this says; only get_judgment(section="
            "'full_text') is verbatim."
        ),
    )
    score: float | None = None


def _parse_date(value: str | None, field: str) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        raise ToolInputError(
            f"{field} must be an ISO date (YYYY-MM-DD); got {value!r}"
        ) from e


def _validate_limit(limit: int) -> int:
    if not isinstance(limit, int) or isinstance(limit, bool):
        raise ToolInputError("limit must be an integer")
    if limit < 1 or limit > MAX_LIMIT:
        raise ToolInputError(f"limit must be between 1 and {MAX_LIMIT}; got {limit}")
    return limit


def _normalise_jurisdiction(value: str | None) -> str | None:
    """Upper-case the caller's jurisdiction; absent stays absent.

    The column is constrained to 'PL' / 'UK' and nothing downstream folds
    case, so "pl" would match no row. None must stay None: a present filter
    suppresses the search's default jurisdiction inference.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError("jurisdiction must be a string")
    return value.strip().upper() or None


def _score(chunk: DocumentChunk) -> float | None:
    # combined_score is the hybrid-search rank score; similarity is the
    # fallback. Compare to None so a legitimate 0.0 is not skipped.
    if chunk.combined_score is not None:
        return chunk.combined_score
    return chunk.similarity


def _snippet(chunk: DocumentChunk) -> str:
    # Strip before slicing, so the budget holds text and a tag is never cut
    # in half ("<ma").
    return _HIGHLIGHT_TAGS.sub("", chunk.chunk_text)[:SNIPPET_CHARS]


def _snippet_source(chunk: DocumentChunk) -> SnippetSource:
    return _SNIPPET_SOURCES.get(chunk.chunk_type or "", "unknown")


def _normalise_court(value: str | None) -> str | None:
    """Return the caller's court name untouched; absent or blank becomes None.

    Neither case nor whitespace is altered: the SQL compares court_name exactly
    and case-sensitively against free text. A blank value must become None, or
    it would be sent as a filter that matches nothing.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError("court must be a string")
    return value if value.strip() else None


def _to_hit(chunk: DocumentChunk, doc: LegalDocument | None) -> JudgmentHit:
    """Build a hit from the ranked chunk, enriched by its document if present."""
    return JudgmentHit(
        id=chunk.document_id,
        court=doc.court_name if doc else None,
        case_number=doc.document_number if doc else None,
        judgment_date=(
            doc.date_issued.date().isoformat() if doc and doc.date_issued else None
        ),
        jurisdiction=doc.country if doc else None,
        url=doc.source_url if doc else None,
        snippet=_snippet(chunk),
        snippet_source=_snippet_source(chunk),
        score=_score(chunk),
    )


async def search_judgments(
    query: str,
    jurisdiction: str | None = None,
    court: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> list[JudgmentHit]:
    """Search Polish and UK judgments by meaning and keyword.

    If `jurisdiction` is omitted the search may infer one from the language of
    the query (for example Polish diacritics or stopwords restrict it to PL)
    and silently leave the other jurisdiction out. To cover both, make one
    call per jurisdiction.

    A snippet is a search excerpt, not a quotation. It is often derived from a
    publisher summary rather than the court's text (see `snippet_source`) and
    can join two fragments with " ... ". Never quote a snippet as the court's
    words: `get_judgment(section="full_text")` is the only verbatim source.

    Args:
        query: What to look for, in Polish or English.
        jurisdiction: Restrict to one jurisdiction: "PL" or "UK".
        court: Restrict to one court name, exactly as a hit returned it
            (matching is exact and case-sensitive).
        date_from: Earliest judgment date, ISO `YYYY-MM-DD`.
        date_to: Latest judgment date, ISO `YYYY-MM-DD`.
        limit: How many judgments to return (1-25).

    Returns:
        Hits with a citation, a snippet and its `snippet_source`. Call
        `get_judgment` for full text.
    """
    principal = get_principal()

    if not isinstance(query, str):
        raise ToolInputError("query must be a string")
    if not query.strip():
        raise ToolInputError("query must not be empty")

    limit = _validate_limit(limit)
    parsed_from = _parse_date(date_from, "date_from")
    parsed_to = _parse_date(date_to, "date_to")
    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise ToolInputError("date_from must not be later than date_to")

    jurisdiction = _normalise_jurisdiction(jurisdiction)
    court = _normalise_court(court)

    request = SearchChunksRequest(
        query=query.strip(),
        limit_docs=limit,
        jurisdictions=[jurisdiction] if jurisdiction else None,
        court_names=[court] if court else None,
        date_from=parsed_from.isoformat() if parsed_from else None,
        date_to=parsed_to.isoformat() if parsed_to else None,
    )

    logger.info(f"MCP search_judgments for {principal.id}: {query[:80]!r}")
    response = await run_document_search(request)

    # `chunks` is the ranked carrier (one per document, in rank order): keep
    # its order, never re-rank. `documents` supplies the citation fields and
    # is optional on the model, so join defensively.
    documents = {doc.document_id: doc for doc in response.documents or []}
    return [
        _to_hit(chunk, documents.get(chunk.document_id)) for chunk in response.chunks
    ]
