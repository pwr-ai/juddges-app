"""The search_judgments MCP tool.

Returns citations and snippets only. A tool that returns whole judgments
fills the client's context window and is useless in practice; full text is
reachable through get_judgment on an id the caller chose.
"""

from datetime import date

from juddges_search.models import DocumentChunk, LegalDocument
from loguru import logger
from pydantic import BaseModel, Field

from app.judgments_pkg.search import run_document_search
from app.models import SearchChunksRequest
from juddges_mcp.principal import get_principal

DEFAULT_LIMIT = 10
MAX_LIMIT = 25
SNIPPET_CHARS = 600


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
        snippet=chunk.chunk_text[:SNIPPET_CHARS],
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

    Args:
        query: What to look for, in Polish or English.
        jurisdiction: Restrict to one jurisdiction: "PL" or "UK".
        court: Restrict to one court name.
        date_from: Earliest judgment date, ISO `YYYY-MM-DD`.
        date_to: Latest judgment date, ISO `YYYY-MM-DD`.
        limit: How many judgments to return (1-25).

    Returns:
        Hits with a citation and a snippet. Call `get_judgment` for full text.
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
