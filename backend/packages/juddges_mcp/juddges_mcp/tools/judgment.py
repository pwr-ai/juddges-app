"""The get_judgment and get_extracted_fields MCP tools.

Both read the shared corpus through the same accessor as `GET /documents/{id}`
and `GET /documents/{id}/metadata`. That accessor returns the raw `judgments`
row, so these tools read database column names, not `LegalDocument` fields.
The result keys follow `search_judgments` (`court`, `judgment_date`, `url`), so
an agent chaining search to get sees one name per field.

Provenance matters more than anything else here, because an agent that quotes
a summary as the court's words has misquoted a court. Three kinds of text come
back: the court's verbatim wording (`full_text`), publisher-supplied text that
is not verbatim (`summary`), and machine-generated sections written by the
extraction pass (everything else).
"""

from datetime import date, datetime
from typing import Any

from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.judgments_pkg import _extract_base_fields, _extract_extraction_fields
from app.models import validate_id_format
from app.services.audit_service import AuditService
from juddges_mcp.principal import get_principal
from juddges_mcp.tools.search import ToolInputError

# Sections a caller may ask for, mapped to the `judgments` column holding them.
# Only `full_text` is the court's own wording. `summary` is a plain source
# column filled by ingestion; the `structure_*` columns are written by the
# extraction pass.
SECTIONS: dict[str, str] = {
    "full_text": "full_text",
    "summary": "summary",
    "case_identification": "structure_case_identification_summary",
    "facts": "structure_facts_summary",
    "court_analysis": "structure_court_analysis_summary",
    "operative_part": "structure_operative_part_summary",
    "conclusion": "structure_conclusion_summary",
}

# Written by the extraction pass, not by the court or the publisher. Explicit
# rather than "everything but full_text": `summary` is publisher-supplied, and
# a new column should have to opt in to being labelled machine-generated.
_GENERATED_SECTIONS = frozenset(
    {
        "case_identification",
        "facts",
        "court_analysis",
        "operative_part",
        "conclusion",
    }
)

# Output key -> `judgments` column. Output keys match `JudgmentHit`.
_CITATION_COLUMNS: dict[str, str] = {
    "court": "court_name",
    "case_number": "case_number",
    "judgment_date": "decision_date",
    "jurisdiction": "jurisdiction",
    "url": "source_url",
}

# `NOT NULL DEFAULT 'pending'` columns: every real row carries them, which is
# why the extracted-field dicts are never empty. Surfaced separately so an
# agent can tell "not extracted yet" from "extracted, nothing found".
_STATUS_COLUMNS: dict[str, str] = {
    "base": "base_extraction_status",
    "structure": "structure_extraction_status",
    "deep_analysis": "deep_analysis_status",
}


class JudgmentNotFoundError(LookupError):
    """No judgment with that id. Surfaces to the client as a tool error."""


def _validate_id(value: Any) -> str:
    if not isinstance(value, str):
        raise ToolInputError("id must be a string")
    # Same validator as the HTTP routes, so a malformed id fails identically
    # on both transports instead of reaching the database over MCP.
    try:
        return validate_id_format(value, "id")
    except ValueError as e:
        raise ToolInputError(str(e)) from e


async def _load(document_id: str) -> dict[str, Any]:
    document = await get_vector_db().get_document_by_id(document_id)
    if not document:
        raise JudgmentNotFoundError(f"No judgment with id {document_id!r}")
    return document


async def _audit_view(user_id: str, document_id: str, tool: str) -> None:
    # Awaited, not fire-and-forget: a bare task can be garbage-collected before
    # it runs, silently dropping a compliance entry (#559). The service
    # swallows its own errors, so awaiting cannot break the read. Call only
    # after _load, so a 404 probe cannot manufacture a "viewed" entry.
    await AuditService.log_document_access(
        user_id=user_id,
        document_id=document_id,
        action="view",
        metadata={"transport": "mcp", "tool": tool},
    )


def _iso_date(value: Any) -> str | None:
    # The driver hands back a str for a DATE column over PostgREST, but a
    # date or datetime elsewhere; `JudgmentHit.judgment_date` is always a
    # string, so normalise to match it. datetime is checked first: it is a
    # date subclass and would otherwise keep its time part.
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value)
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return text


def _citation(document: dict[str, Any]) -> dict[str, Any]:
    citation: dict[str, Any] = {"id": document.get("id")}
    for key, column in _CITATION_COLUMNS.items():
        citation[key] = document.get(column)
    citation["judgment_date"] = _iso_date(citation["judgment_date"])
    return citation


async def get_judgment(id: str, section: str | None = None) -> dict[str, Any]:
    """Fetch one judgment's text, or a single named section of it.

    Only `full_text` is the court's verbatim wording. `summary` is supplied by
    the publisher and is not verbatim. Every other section is machine-generated
    by an automated extraction pass. Never quote or cite anything but
    `full_text` as the court's own words.

    Args:
        id: The judgment id, as returned by `search_judgments`.
        section: One of `full_text`, `summary`, `case_identification`,
            `facts`, `court_analysis`, `operative_part`, `conclusion`. Omit
            for the full text. `full_text` is verbatim; `summary` is
            publisher-supplied, not verbatim; the rest are machine-generated.

    Returns:
        The citation fields plus `text`, its length in `chars`, and `empty`
        when the section exists but holds nothing. `generated` is true when
        `text` was machine-generated by the extraction pass; it is false for
        both `full_text` and the publisher's `summary`, so check `section`
        too before treating `text` as verbatim.
    """
    principal = get_principal()
    document_id = _validate_id(id)

    if section is not None and not isinstance(section, str):
        raise ToolInputError("section must be a string")
    if section is not None and section not in SECTIONS:
        available = ", ".join(SECTIONS)
        raise ToolInputError(
            f"Unknown section {section!r}. Available sections: {available}"
        )

    document = await _load(document_id)
    await _audit_view(principal.id, document_id, "get_judgment")

    name = section or "full_text"
    # `or ""`: an unextracted column is NULL, not an empty string.
    text = document.get(SECTIONS[name]) or ""

    logger.info(f"MCP get_judgment for {principal.id}: {document_id} ({name})")
    result = _citation(document)
    result["section"] = name
    result["text"] = text
    result["chars"] = len(text)
    result["empty"] = text == ""
    result["generated"] = name in _GENERATED_SECTIONS
    return result


async def get_extracted_fields(id: str) -> dict[str, Any]:
    """Fetch the structured fields already extracted for one judgment.

    Reads stored values only; it never runs the extraction agent, so it costs
    nothing per call. The values are machine-extracted, not the court's own
    wording.

    Args:
        id: The judgment id, as returned by `search_judgments`.

    Returns:
        The citation fields plus `extraction_status`, `base_fields` and
        `extraction_fields`. `extraction_status` holds the `base`, `structure`
        and `deep_analysis` states (`pending`, `completed` or `failed`):
        `pending` means not extracted yet, `completed` with few fields means
        extracted and little found. The two field dicts also carry those
        bookkeeping columns (`base_extraction_status`, ...) next to the real
        extracted values, so they are non-null for any stored judgment; do not
        read a status entry as a legal finding.
    """
    principal = get_principal()
    document_id = _validate_id(id)

    document = await _load(document_id)
    await _audit_view(principal.id, document_id, "get_extracted_fields")

    logger.info(f"MCP get_extracted_fields for {principal.id}: {document_id}")
    result = _citation(document)
    result["extraction_status"] = {
        key: document.get(column) for key, column in _STATUS_COLUMNS.items()
    }
    result["base_fields"] = _extract_base_fields(document)
    result["extraction_fields"] = _extract_extraction_fields(document)
    return result
