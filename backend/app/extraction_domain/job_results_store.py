"""Keyset-paged reads of per-document extraction results.

`extraction_job_results` mirrors `extraction_jobs.results` one row per document
(migration 20261127000001). Corpus jobs carry ~6k results (~15 MB), so readers
page through this table instead of selecting the whole JSONB column.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Iterator

RESULTS_TABLE = "extraction_job_results"
DEFAULT_PAGE_SIZE = 500


def iter_job_results(
    client: Any,
    job_id: str,
    *,
    bucket: str | None = None,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Iterator[dict[str, Any]]:
    """Yield a job's result `item` dicts in `position` order (keyset paging)."""
    last = 0
    while True:
        query = (
            client.table(RESULTS_TABLE).select("position, item").eq("job_id", job_id)
        )
        if bucket is not None:
            query = query.eq("bucket", bucket)
        rows = (
            query.gt("position", last).order("position").limit(page_size).execute().data
            or []
        )
        for row in rows:
            yield row.get("item") or {}
        if len(rows) < page_size:
            return
        last = rows[-1]["position"]
