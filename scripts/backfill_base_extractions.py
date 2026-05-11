#!/usr/bin/env python3
"""Backfill typed ``base_*`` columns from existing ``base_raw_extraction`` JSONB.

The base-schema extraction endpoint historically stored only the JSONB blob
and set ``base_extraction_status = 'completed'`` without copying values into
the typed columns. This script walks every completed row, runs the same
``promote_to_typed_columns`` helper used by the forward fix, and writes the
typed values back.

Usage:
    python scripts/backfill_base_extractions.py --dry-run --limit 5
    python scripts/backfill_base_extractions.py --batch-size 200
    python scripts/backfill_base_extractions.py --only-empty   # skip rows
                                                                # already populated
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

# Ensure the backend package is importable when running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

load_dotenv()

from app.extraction_domain.base_schema_promote import (  # noqa: E402
    ALL_TYPED_COLUMNS,
    promote_to_typed_columns,
)

console = Console()


def _get_supabase():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _is_already_populated(row: dict[str, Any]) -> bool:
    """True if at least one typed column is non-null."""
    return any(row.get(col) is not None for col in ALL_TYPED_COLUMNS)


def _summarize_payload(payload: dict[str, Any]) -> dict[str, int]:
    non_null = sum(1 for v in payload.values() if v is not None)
    return {"non_null_fields": non_null, "total_fields": len(payload)}


def _print_sample(row_id: str, payload: dict[str, Any]) -> None:
    table = Table(title=f"row {row_id}", show_header=True, header_style="bold")
    table.add_column("column")
    table.add_column("value")
    for col, val in payload.items():
        if val is None:
            continue
        text = repr(val)
        if len(text) > 80:
            text = text[:77] + "..."
        table.add_row(col, text)
    console.print(table)


def backfill(
    *,
    dry_run: bool,
    limit: int | None,
    batch_size: int,
    only_empty: bool,
    sample: int,
) -> None:
    sb = _get_supabase()

    select_cols = "id, base_raw_extraction, " + ", ".join(ALL_TYPED_COLUMNS)

    total_updated = 0
    total_skipped = 0
    total_seen = 0
    samples_shown = 0
    offset = 0

    while True:
        chunk_end = (
            min(offset + batch_size, offset + (limit - total_seen)) - 1
            if limit is not None
            else offset + batch_size - 1
        )
        resp = (
            sb.table("judgments")
            .select(select_cols)
            .eq("base_extraction_status", "completed")
            .order("created_at")
            .range(offset, chunk_end)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break

        for row in rows:
            total_seen += 1
            row_id = row["id"]

            if only_empty and _is_already_populated(row):
                total_skipped += 1
                continue

            payload = promote_to_typed_columns(row.get("base_raw_extraction"))

            if samples_shown < sample:
                _print_sample(row_id, payload)
                samples_shown += 1

            if dry_run:
                total_updated += 1
                continue

            try:
                sb.table("judgments").update(payload).eq("id", row_id).execute()
                total_updated += 1
            except Exception as exc:
                summary = _summarize_payload(payload)
                console.print(
                    f"[red]✗[/red] {row_id}: {exc} ({summary})",
                    highlight=False,
                )

        offset += batch_size

        if total_seen % 1000 == 0 or (limit is not None and total_seen >= limit):
            console.print(
                f"  processed {total_seen} rows "
                f"(updated={total_updated} skipped={total_skipped})"
            )

        if limit is not None and total_seen >= limit:
            break

    summary = Table(title="Backfill summary", show_header=False)
    summary.add_row("rows seen", str(total_seen))
    summary.add_row("rows updated", str(total_updated))
    summary.add_row("rows skipped (already populated)", str(total_skipped))
    summary.add_row("dry run", str(dry_run))
    console.print(summary)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill typed base_* columns from base_raw_extraction JSONB."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute updates but don't write to Supabase.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N rows (default: all completed rows).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Page size when reading from Supabase (default: 500).",
    )
    parser.add_argument(
        "--only-empty",
        action="store_true",
        help="Skip rows that already have any typed base_* value set.",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=0,
        help="Print the first N transformed payloads as tables (default: 0).",
    )
    args = parser.parse_args()

    backfill(
        dry_run=args.dry_run,
        limit=args.limit,
        batch_size=args.batch_size,
        only_empty=args.only_empty,
        sample=args.sample,
    )


if __name__ == "__main__":
    main()
