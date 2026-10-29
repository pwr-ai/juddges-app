"""Complete, URL-safe Supabase fetch helpers for reasoning lines.

PostgREST caps every un-ranged select at ``max_rows`` (1000 on Supabase) and
``.in_()`` puts every value into the request URL (about 1000 UUIDs already
returns HTTP 400). Both failures are silent or late, so lines with thousands
of members must go through these helpers instead of a single ``.execute()``.
"""

from collections.abc import Callable, Sequence
from typing import Any

from loguru import logger

PAGE_SIZE = 1000
IN_BATCH_SIZE = 150


def fetch_all_pages(
    build_query: Callable[[], Any], page_size: int = PAGE_SIZE
) -> list[dict[str, Any]]:
    """Fetch every row of a query by paging with ``.range()``.

    ``build_query`` must return a fresh query builder on each call (supabase-py
    builders are not reusable after ``execute``). The query needs a stable
    ``.order()`` for pages to be consistent. Stops at the first short page.
    """
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = build_query().range(offset, offset + page_size - 1).execute()
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    logger.debug(
        f"fetch_all_pages: {len(rows)} rows in {offset // page_size + 1} pages"
    )
    return rows


def fetch_by_ids(
    client: Any,
    table: str,
    columns: str,
    ids: Sequence[str],
    id_column: str = "id",
    batch_size: int = IN_BATCH_SIZE,
) -> list[dict[str, Any]]:
    """Fetch rows whose ``id_column`` is in ``ids``, in URL-safe batches.

    Returns the concatenated rows of all batches (no ordering guarantee across
    batches). An empty ``ids`` makes no request.
    """
    rows: list[dict[str, Any]] = []
    for start in range(0, len(ids), batch_size):
        batch = list(ids[start : start + batch_size])
        response = client.table(table).select(columns).in_(id_column, batch).execute()
        rows.extend(response.data or [])
    return rows
