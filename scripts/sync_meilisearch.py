#!/usr/bin/env python3
"""CLI script for managing the Meilisearch judgments index.

Usage:
    python scripts/sync_meilisearch.py --setup       # Create + configure index
    python scripts/sync_meilisearch.py --full-sync   # Full data sync from Supabase
    python scripts/sync_meilisearch.py --all          # Both setup + sync
    python scripts/sync_meilisearch.py --stats        # Show index stats

Requires: MEILISEARCH_URL, MEILISEARCH_ADMIN_KEY, SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY environment variables.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

# Ensure the backend package is importable when running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv()

from app.services.meilisearch_config import (  # noqa: E402
    setup_meilisearch_index,
    transform_judgment_for_meilisearch,
)
from app.services.search import MeiliSearchService  # noqa: E402


def _get_supabase():
    """Lazy-import Supabase client to avoid import-time env var errors."""
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


async def cmd_setup(service: MeiliSearchService) -> None:
    """Create and configure the Meilisearch index."""
    print(f"Setting up Meilisearch index '{service.index_name}'...")
    success = await setup_meilisearch_index(service)
    if success:
        print("Index setup complete.")
    else:
        print("Index setup failed or was skipped — check logs above.")
        sys.exit(1)


async def cmd_full_sync(service: MeiliSearchService, batch_size: int = 500) -> None:
    """Sync all judgments from Supabase into Meilisearch."""
    supabase = _get_supabase()
    total = 0
    offset = 0

    print("Starting full sync from Supabase → Meilisearch...")

    while True:
        resp = (
            supabase.table("judgments")
            .select("*")
            .order("created_at")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break

        documents = [transform_judgment_for_meilisearch(r) for r in rows]
        result = await service.upsert_documents(documents)

        task_uid = result.get("taskUid")
        if task_uid is not None:
            await service.wait_for_task(task_uid, max_wait=120.0)

        total += len(documents)
        offset += batch_size
        print(f"  Synced {total} documents...")

    print(f"Full sync complete: {total} documents indexed.")


async def cmd_stats(service: MeiliSearchService) -> None:
    """Show index stats."""
    try:
        stats = await service.get_index_stats()
        print(f"Index: {service.index_name}")
        print(f"  Documents: {stats.get('numberOfDocuments', 'N/A')}")
        print(f"  Indexing:  {stats.get('isIndexing', 'N/A')}")
        field_dist = stats.get("fieldDistribution", {})
        if field_dist:
            print("  Field distribution:")
            for field, count in sorted(field_dist.items()):
                print(f"    {field}: {count}")
    except Exception as e:
        print(f"Failed to fetch stats: {e}")
        sys.exit(1)


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manage the Meilisearch judgments index."
    )
    parser.add_argument("--setup", action="store_true", help="Create + configure index")
    parser.add_argument(
        "--full-sync", action="store_true", help="Sync all judgments from Supabase"
    )
    parser.add_argument(
        "--all", action="store_true", help="Setup index then full sync"
    )
    parser.add_argument("--stats", action="store_true", help="Show index statistics")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Batch size for full sync (default: 500)",
    )

    args = parser.parse_args()

    if not any([args.setup, args.full_sync, args.all, args.stats]):
        parser.print_help()
        sys.exit(1)

    service = MeiliSearchService.from_env()

    if not service.admin_configured:
        print(
            "Error: MEILISEARCH_URL and MEILISEARCH_ADMIN_KEY must be set.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Health check first
    try:
        health = await service.health()
        print(f"Meilisearch status: {health.get('status', 'unknown')}")
    except Exception as e:
        print(f"Cannot reach Meilisearch at {service.base_url}: {e}", file=sys.stderr)
        sys.exit(1)

    if args.all:
        await cmd_setup(service)
        await cmd_full_sync(service, batch_size=args.batch_size)
    elif args.setup:
        await cmd_setup(service)
    elif args.full_sync:
        await cmd_full_sync(service, batch_size=args.batch_size)

    if args.stats or args.all:
        await cmd_stats(service)


if __name__ == "__main__":
    asyncio.run(main())
