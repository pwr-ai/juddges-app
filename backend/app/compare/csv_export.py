"""Long-format CSV of a `CompareResponse` (Spec C AC5).

One row per (field, value, jurisdiction), so the file pivots in a spreadsheet
without any reshaping. A field with no values (tier `unavailable`/`empty`)
contributes no rows -- there is nothing to compare, and its coverage is
already visible on screen. `share` and `coverage` are empty cells (not
`None`) where the denominator is zero, matching the JSON `null`.

Numbers come straight from the response the UI rendered; nothing is
recomputed here, so the export and the charts can never disagree.
"""

from __future__ import annotations

import csv
import io
from typing import TYPE_CHECKING, Any

from app.compare.layout import JURISDICTIONS

if TYPE_CHECKING:
    from app.compare.models import CompareResponse

__all__ = ["CSV_COLUMNS", "csv_bytes", "to_csv_rows"]

CSV_COLUMNS: tuple[str, ...] = (
    "field",
    "value",
    "jurisdiction",
    "count",
    "share",
    "coverage",
    "covered",
    "total",
)

_UTF8_BOM = b"\xef\xbb\xbf"


def to_csv_rows(response: CompareResponse) -> list[dict[str, Any]]:
    """Flatten to long format, keeping the response's field and value order."""
    rows: list[dict[str, Any]] = []
    for field in response.fields:
        for value in field.values:
            for j in JURISDICTIONS:
                cov = field.coverage[j]
                rows.append(
                    {
                        "field": field.field,
                        "value": value.value,
                        "jurisdiction": j,
                        "count": value.counts.get(j, 0),
                        "share": value.shares.get(j),
                        "coverage": cov.ratio,
                        "covered": cov.covered,
                        "total": cov.total,
                    }
                )
    return rows


def csv_bytes(rows: list[dict[str, Any]]) -> bytes:
    """UTF-8 with BOM so Excel opens Polish labels correctly (same as results export)."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(CSV_COLUMNS), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return _UTF8_BOM + buffer.getvalue().encode("utf-8")
