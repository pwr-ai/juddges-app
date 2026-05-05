"""Pure deduplication helpers for ingestion pipelines."""

from __future__ import annotations

from collections.abc import Iterable, Iterator


def dedupe_judgments(
    items: Iterable[dict],
    *,
    already_seen: set[str] | None = None,
    id_key: str = "judgment_id",
) -> Iterator[dict]:
    """Yield items whose `id_key` has not been seen before.

    Items missing `id_key` (or with None) are skipped. The caller's
    `already_seen` set is not mutated.
    """
    seen: set[str] = set(already_seen or ())
    for item in items:
        ident = item.get(id_key)
        if ident is None or ident in seen:
            continue
        seen.add(ident)
        yield item
