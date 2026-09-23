"""Resolve a base-schema filter to judgment ids, server-side, in one RPC call.

`list_extracted_filter_matches` (migration 20260920000001) returns every
matching (id, jurisdiction) without `extracted_data`, so callers that only need
ids — save-as-collection, PL/UK pairs, "which documents match" — do not page
`filter_documents_by_extracted_data` and do not move 10-20 MB per request.
The corpus is ~12k rows; if it ever grows past that, add p_limit/p_offset to
the RPC here, not at the call sites.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from loguru import logger

from app.config import settings
from app.models import JURISDICTIONS

FILTER_IDS_RPC = "list_extracted_filter_matches"

# Filter keys the by-jurisdiction callers (PL/UK compare, pair creation) never
# forward: they split the result by jurisdiction themselves, so honouring a
# caller's `jurisdiction` filter would silently blank one side.
IGNORED_FILTER_KEYS: tuple[str, ...] = ("jurisdiction",)
# Alias kept importable from here (historical name; env var and default are
# declared once, in app.config.settings) so existing callers/tests don't break.
SAVE_FROM_FILTER_MAX_DOCUMENTS: int = settings.SAVE_FROM_FILTER_MAX_DOCUMENTS


class FilterTooLargeError(Exception):
    """The filter matches more rows than one collection may hold."""

    def __init__(self, total: int, cap: int, jurisdiction: str | None = None) -> None:
        side = f" ({jurisdiction})" if jurisdiction else ""
        super().__init__(f"filter matches {total} documents{side}; cap is {cap}")
        self.total = total
        self.cap = cap
        self.jurisdiction = jurisdiction


@dataclass(frozen=True)
class FilterIdsResult:
    ids: list[str]
    by_jurisdiction: dict[str, list[str]]

    @property
    def total(self) -> int:
        return len(self.ids)


def strip_ignored(filters: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Drop `IGNORED_FILTER_KEYS` from a copy of `filters`; report which were present.

    Returns (clean_filters, ignored_keys). `ignored_keys` keeps the order of
    `IGNORED_FILTER_KEYS` so responses can echo it back deterministically.
    """
    ignored = [k for k in IGNORED_FILTER_KEYS if k in filters]
    clean = {k: v for k, v in filters.items() if k not in IGNORED_FILTER_KEYS}
    return clean, ignored


def resolve_filter_ids(
    client: Any, filters: dict[str, Any], text_query: str | None
) -> FilterIdsResult:
    """Every matching judgment id (RPC order) plus the PL/UK split."""
    response = client.rpc(
        FILTER_IDS_RPC, {"p_filters": filters, "p_text_query": text_query}
    ).execute()
    rows = list(response.data or [])
    ids = [str(row["id"]) for row in rows]
    by_jurisdiction: dict[str, list[str]] = {j: [] for j in JURISDICTIONS}
    for row in rows:
        side = row.get("jurisdiction")
        if side in by_jurisdiction:
            by_jurisdiction[side].append(str(row["id"]))
    logger.info(
        "resolve_filter_ids: {} ids ({})",
        len(ids),
        ", ".join(f"{j}={len(v)}" for j, v in by_jurisdiction.items()),
    )
    return FilterIdsResult(ids=ids, by_jurisdiction=by_jurisdiction)


def check_cap(
    result: FilterIdsResult,
    cap: int = SAVE_FROM_FILTER_MAX_DOCUMENTS,
    *,
    per_jurisdiction: bool = False,
) -> None:
    """Raise FilterTooLargeError when the whole set (or, for pairs, one side) exceeds `cap`."""
    if per_jurisdiction:
        for side in JURISDICTIONS:
            n = len(result.by_jurisdiction.get(side, []))
            if n > cap:
                raise FilterTooLargeError(total=n, cap=cap, jurisdiction=side)
        return
    if result.total > cap:
        raise FilterTooLargeError(total=result.total, cap=cap)
