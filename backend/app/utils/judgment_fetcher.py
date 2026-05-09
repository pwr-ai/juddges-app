"""Utility functions for fetching judgments from Supabase.

Function names (`get_documents_by_id`, `get_document_by_id`) deliberately keep
the `document_*` shape because they sit at the API boundary and many callers
still use that vocabulary; only the SELECT and row-mapping align with the
canonical `judgments` table.

Callers may pass either UUID `judgments.id` values or text `source_id` values
(produced by `cleanDocumentIdForUrl` from frontend). Both lookup paths run.
"""

import re
from typing import Any

from juddges_search.models import LegalDocument
from loguru import logger

from app.core.supabase import get_supabase_client

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# Column projection for judgments table.
# `embedding` is ~6KB per row and is only included when return_vectors=True.
_JUDGMENT_BASE_COLS = (
    "id, case_number, jurisdiction, court_name, court_level, "
    "decision_date, publication_date, title, summary, full_text, "
    "judges, case_type, decision_type, outcome, keywords, legal_topics, "
    "cited_legislation, metadata, source_dataset, source_id, source_url, "
    "created_at, updated_at"
)


def _row_to_legal_document(row: dict[str, Any], return_vectors: bool) -> LegalDocument:
    """Map a `judgments` row to the `LegalDocument` domain object."""
    jurisdiction = row.get("jurisdiction") or "PL"
    judges = row.get("judges")
    case_type_raw = row.get("case_type") or "criminal"
    return LegalDocument(
        # Prefer source_id when present so non-UUID callers round-trip the same
        # ID they passed in; fall back to the UUID for direct lookups.
        document_id=row.get("source_id") or row.get("id", ""),
        title=row.get("title"),
        summary=row.get("summary"),
        full_text=row.get("full_text", "") or "",
        # Every row in `judgments` is, by definition, a judgment. The free-text
        # `case_type` (Criminal/Civil/Administrative/...) maps to LegalDocument's
        # separate `case_type` field, not `document_type` (an enum of judgment/
        # tax_interpretation).
        document_type="judgment",
        case_type=case_type_raw.lower(),
        language="en" if jurisdiction == "UK" else "pl",
        country=jurisdiction,
        metadata=row.get("metadata") or {},
        publication_date=row.get("decision_date") or row.get("publication_date"),
        source_url=row.get("source_url"),
        court_name=row.get("court_name"),
        outcome=row.get("outcome"),
        judges=judges if isinstance(judges, list) else None,
        keywords=row.get("keywords") or [],
        vectors={"embedding": row.get("embedding")} if return_vectors else {},
    )


async def get_documents_by_id(
    document_ids: list[str],
    return_vectors: bool = False,
) -> list[LegalDocument]:
    """Fetch judgments by their IDs (either UUID or source_id text).

    Args:
        document_ids: Identifiers — UUIDs are matched against `judgments.id`,
            other strings against `judgments.source_id`.
        return_vectors: Whether to include the `embedding` column.

    Returns:
        List of LegalDocument objects.

    Raises:
        RuntimeError: If the underlying database query fails.
    """
    logger.info(f"Fetching {len(document_ids)} judgments from Supabase")

    if not document_ids:
        logger.warning("No document IDs provided, returning empty list")
        return []

    cols = _JUDGMENT_BASE_COLS + (", embedding" if return_vectors else "")
    uuid_ids = [i for i in document_ids if _UUID_RE.match(i)]
    text_ids = [i for i in document_ids if not _UUID_RE.match(i)]

    try:
        supabase = get_supabase_client()
        # Deduplicate by judgments.id since the same row can match both branches
        # when a caller passes both the UUID and the source_id for the same row.
        rows_by_id: dict[str, dict[str, Any]] = {}
        if uuid_ids:
            r = supabase.table("judgments").select(cols).in_("id", uuid_ids).execute()
            for row in r.data or []:
                rows_by_id[row["id"]] = row
        if text_ids:
            r = (
                supabase.table("judgments")
                .select(cols)
                .in_("source_id", text_ids)
                .execute()
            )
            for row in r.data or []:
                rows_by_id[row["id"]] = row
        rows = list(rows_by_id.values())
    except Exception as e:
        logger.exception(f"Failed to fetch judgments from Supabase: {e}")
        raise RuntimeError(f"Database query failed: {e}") from e

    if not rows:
        logger.warning(f"No judgments found for {len(document_ids)} IDs")
        return []

    documents: list[LegalDocument] = []
    for row in rows:
        try:
            documents.append(_row_to_legal_document(row, return_vectors))
        except Exception as e:
            row_id = row.get("source_id") or row.get("id")
            logger.error(
                f"Error converting judgments row to LegalDocument for id={row_id}: {e}"
            )

    logger.info(f"Successfully fetched {len(documents)} judgments from Supabase")

    if len(documents) < len(document_ids):
        # Match against both the UUID and the source_id form so a caller asking
        # for the UUID isn't reported as missing when source_id was returned.
        retrieved: set[str] = set()
        for row in rows:
            if row.get("id"):
                retrieved.add(row["id"])
            if row.get("source_id"):
                retrieved.add(row["source_id"])
        missing = [i for i in document_ids if i not in retrieved]
        if missing:
            logger.warning(
                f"Retrieved {len(documents)} of {len(document_ids)} requested judgments. "
                f"{len(missing)} not found. "
                f"Missing IDs: {missing[:10]}"
                + (
                    f"... and {len(missing) - 10} more"
                    if len(missing) > 10
                    else ""
                )
            )

    return documents


async def get_document_by_id(
    document_id: str, return_vectors: bool = False
) -> LegalDocument | None:
    """Get a single judgment by its UUID or source_id.

    Args:
        document_id: UUID or source_id text identifier.
        return_vectors: Whether to include the embedding column.

    Returns:
        LegalDocument or None if not found.
    """
    documents = await get_documents_by_id([document_id], return_vectors=return_vectors)
    return documents[0] if documents else None
