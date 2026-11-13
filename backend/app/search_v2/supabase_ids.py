"""Map Weaviate v2 judgment ids to ``judgments.id`` rows in Supabase.

Both sides key pl-court judgments on the source dataset's ``judgment_id``
(``<court>_<dept>_<repertory>_<number>_<year>_Uz_<date>_<seq>``), but most
Supabase PL rows store it cut to its first 40 characters, which drops the
decision date and sequence number. A match is therefore taken as:

1. an exact ``source_id`` match, else
2. the unique row whose ``source_id`` is the 40-character truncation, after
   discarding rows whose ``decision_date`` contradicts the Weaviate date.

Several rulings in one case share a truncation, so when the date cannot pick
one the result is ``None`` rather than a link to the wrong ruling.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import TYPE_CHECKING, Any

from loguru import logger

from app.core.supabase import get_async_supabase_client

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

SUPABASE_SOURCE_ID_PREFIX_LEN = 40
# Ids per PostgREST request: each id costs two quoted values in the URL.
LOOKUP_BATCH_SIZE = 25


def candidate_source_ids(judgment_ids: Iterable[str]) -> list[str]:
    """Each id followed by its truncation, deduplicated in order."""
    seen: dict[str, None] = {}
    for jid in judgment_ids:
        seen.setdefault(jid, None)
        seen.setdefault(jid[:SUPABASE_SOURCE_ID_PREFIX_LEN], None)
    return list(seen)


def _day(value: Any) -> str | None:
    return str(value)[:10] if value else None


def map_supabase_ids(
    hits: Sequence[tuple[str, str | None]], rows: Iterable[dict[str, Any]]
) -> dict[str, str | None]:
    """``{judgment_id: judgments.id | None}`` for ``(judgment_id, date_issued)`` pairs."""
    by_source_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_source_id[row["source_id"]].append(row)

    mapped: dict[str, str | None] = {}
    for jid, date_issued in hits:
        exact = by_source_id.get(jid, [])
        if len(exact) == 1:
            mapped[jid] = exact[0]["id"]
            continue
        candidates = by_source_id.get(jid[:SUPABASE_SOURCE_ID_PREFIX_LEN], [])
        day = _day(date_issued)
        if day:
            # Drop rows dated otherwise; undated rows survive only if nothing
            # matches the date exactly.
            same_day = [r for r in candidates if _day(r.get("decision_date")) == day]
            undated = [r for r in candidates if not r.get("decision_date")]
            candidates = same_day or undated
        mapped[jid] = candidates[0]["id"] if len(candidates) == 1 else None
    return mapped


async def lookup_supabase_ids(
    hits: Sequence[tuple[str, str | None]],
) -> dict[str, str | None]:
    """Batched Supabase lookup; any failure degrades to "no link", never an error."""
    empty: dict[str, str | None] = {jid: None for jid, _ in hits}
    if not hits:
        return empty
    try:
        client = await get_async_supabase_client()
        if client is None:
            return empty
        ids = [jid for jid, _ in hits]
        batches = [
            candidate_source_ids(ids[i : i + LOOKUP_BATCH_SIZE])
            for i in range(0, len(ids), LOOKUP_BATCH_SIZE)
        ]
        responses = await asyncio.gather(
            *(
                client.table("judgments")
                .select("id,source_id,decision_date")
                .in_("source_id", batch)
                .execute()
                for batch in batches
            )
        )
    except Exception as exc:
        logger.warning("search v2: Supabase id lookup failed: {}", exc)
        return empty
    rows = [row for response in responses for row in (response.data or [])]
    return map_supabase_ids(hits, rows)
