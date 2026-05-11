#!/usr/bin/env python3
"""Backfill Meilisearch ``_vectors`` for every judgment in Supabase.

Run once after deploying the hybrid-search code path. The incremental and
full-sync Celery tasks already embed going forward; this script seeds
embeddings across the existing corpus.

Idempotent: re-running re-embeds and overwrites. ~5 min wall-clock for
~12K rows. If the run is interrupted, just rerun it.

Usage (run inside the backend container per project convention):

    docker compose -f docker-compose.dev.yml exec backend \\
        poetry run python scripts/backfill_meilisearch_embeddings.py
    docker compose -f docker-compose.dev.yml exec backend \\
        poetry run python scripts/backfill_meilisearch_embeddings.py --batch-size 32
    docker compose -f docker-compose.dev.yml exec backend \\
        poetry run python scripts/backfill_meilisearch_embeddings.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv()

from rich.console import Console  # noqa: E402
from rich.progress import (  # noqa: E402
    BarColumn,
    MofNCompleteColumn,
    Progress,
    TextColumn,
    TimeElapsedColumn,
)

from app.services.meilisearch_config import (  # noqa: E402
    JUDGMENT_SYNC_COLUMNS,
    transform_judgment_for_meilisearch,
)
from app.services.meilisearch_embeddings import (  # noqa: E402
    attach_embedding,
    build_embed_text,
)
from app.services.search import MeiliSearchService  # noqa: E402

console = Console()


def _get_supabase():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


async def _embed_batch(rows: list[dict]) -> list[dict]:
    docs = [transform_judgment_for_meilisearch(r) for r in rows]
    return await asyncio.gather(
        *(attach_embedding(d, r) for d, r in zip(docs, rows, strict=True))
    )


async def run(*, batch_size: int, dry_run: bool, limit: int | None) -> None:
    sb = _get_supabase()
    service = MeiliSearchService.from_env()
    if not service.admin_configured and not dry_run:
        console.print("[red]Meilisearch admin not configured — aborting[/red]")
        sys.exit(1)

    total_resp = sb.table("judgments").select("id", count="exact").limit(1).execute()
    total = total_resp.count or 0
    if limit is not None:
        total = min(total, limit)
    console.print(f"Backfilling embeddings for [bold]{total}[/bold] judgments")

    offset = 0
    embedded = 0
    skipped = 0

    with Progress(
        TextColumn("[bold blue]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Embedding", total=total)

        while True:
            if limit is not None and offset >= limit:
                break
            page_end = offset + batch_size - 1

            resp = (
                sb.table("judgments")
                .select(JUDGMENT_SYNC_COLUMNS)
                .order("created_at")
                .range(offset, page_end)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break

            if dry_run:
                sample = build_embed_text(rows[0]) or "<EMPTY>"
                console.print(
                    f"[yellow]DRY[/yellow] offset={offset} sample embed text: "
                    f"{sample[:200]!r}"
                )
                break  # dry-run prints first batch only

            docs = await _embed_batch(rows)
            await service.upsert_documents(docs)

            for d in docs:
                if "_vectors" in d:
                    embedded += 1
                else:
                    skipped += 1
            offset += len(rows)
            progress.update(task, advance=len(rows))

    console.print(
        f"[green]Done.[/green] embedded={embedded} skipped={skipped} total={offset}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill Meilisearch BGE-M3 embeddings for judgments."
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=64,
        help="Rows per page / TEI batch (default: 64).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the first batch's embed_text and exit; no writes.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N rows total (default: all).",
    )
    args = parser.parse_args()

    asyncio.run(
        run(batch_size=args.batch_size, dry_run=args.dry_run, limit=args.limit)
    )


if __name__ == "__main__":
    main()
