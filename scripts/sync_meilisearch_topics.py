#!/usr/bin/env python3
"""Rebuild the Meilisearch topics index from Supabase ``search_topics`` rows.

Usage:
    python scripts/sync_meilisearch_topics.py               # latest run
    python scripts/sync_meilisearch_topics.py --run-id ...  # specific run

This does not generate new topics. It only re-publishes an existing Supabase
snapshot to Meilisearch using the same atomic-swap flow as the generator.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.services.search_topics_store import get_latest_search_topics_run_id  # noqa: E402
from generate_search_topics import push_topics_run_to_meilisearch  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild the Meilisearch topics index from Supabase search_topics."
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default=None,
        help="Optional specific search_topics run_id to publish",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the interactive Meilisearch swap confirmation",
    )
    args = parser.parse_args()

    run_id = args.run_id or get_latest_search_topics_run_id()
    if not run_id:
        print("No search_topics runs found in Supabase.", file=sys.stderr)
        sys.exit(1)

    ok = await push_topics_run_to_meilisearch(run_id=run_id, auto_confirm=args.yes)
    if not ok:
        print(f"Failed to publish search_topics run {run_id}.", file=sys.stderr)
        sys.exit(1)

    print(f"Published search_topics run {run_id} to Meilisearch.")


if __name__ == "__main__":
    asyncio.run(main())
