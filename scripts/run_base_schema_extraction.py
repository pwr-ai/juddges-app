"""
Batch-run base schema extraction for a demo corpus.

This script selects judgment IDs from Supabase and calls the backend
`/extractions/base-schema` endpoint in batches. It is intended for v1 demo
preparation, where we want a repeatable way to enrich a larger PL/UK subset
without manually triggering extraction jobs.

Examples:
    python scripts/run_base_schema_extraction.py --jurisdiction PL --limit 500
    python scripts/run_base_schema_extraction.py --jurisdiction UK --limit 500 --batch-size 25
    python scripts/run_base_schema_extraction.py --limit 1000 --include-completed --checkpoint .base_extract_demo.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

DEFAULT_CHECKPOINT = ".base_schema_extraction_checkpoint.json"
DEFAULT_FETCH_PAGE_SIZE = 500


@dataclass
class ExtractionBatchResult:
    requested: int
    completed: int
    failed: int
    failed_ids: list[str]


def load_checkpoint(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "completed_ids": [],
            "failed_ids": [],
            "last_run_at": None,
            "batches": [],
        }

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_checkpoint(path: Path, payload: dict[str, Any]) -> None:
    payload["last_run_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def build_client() -> Client:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
        )

    return create_client(supabase_url, supabase_key)


def fetch_candidate_ids(
    client: Client,
    *,
    jurisdiction: str | None,
    limit: int,
    include_completed: bool,
    completed_ids: set[str],
    fetch_page_size: int = DEFAULT_FETCH_PAGE_SIZE,
) -> list[str]:
    pending_ids: list[str] = []
    offset = 0

    while len(pending_ids) < limit:
        query = (
            client.table("judgments")
            .select("id")
            .order("id")
            .range(offset, offset + fetch_page_size - 1)
        )

        if jurisdiction:
            query = query.eq("jurisdiction", jurisdiction)

        if not include_completed:
            query = query.neq("base_extraction_status", "completed")

        response = query.execute()
        rows = response.data or []
        if not rows:
            break

        for row in rows:
            doc_id = row.get("id")
            if not doc_id or doc_id in completed_ids:
                continue

            pending_ids.append(doc_id)
            if len(pending_ids) >= limit:
                break

        if len(rows) < fetch_page_size:
            break

        offset += len(rows)

    return pending_ids


def call_base_schema_endpoint(
    *,
    backend_url: str,
    api_key: str | None,
    document_ids: list[str],
    llm_name: str,
    additional_instructions: str | None,
    timeout_seconds: int,
) -> ExtractionBatchResult:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    response = requests.post(
        f"{backend_url.rstrip('/')}/extractions/base-schema",
        headers=headers,
        json={
            "document_ids": document_ids,
            "llm_name": llm_name,
            "additional_instructions": additional_instructions,
        },
        timeout=timeout_seconds,
    )
    response.raise_for_status()

    payload = response.json()
    results = payload.get("results", [])
    failed_ids = [
        result["document_id"]
        for result in results
        if result.get("status") != "completed" and result.get("document_id")
    ]

    return ExtractionBatchResult(
        requested=len(document_ids),
        completed=payload.get("successful_extractions", 0),
        failed=payload.get("failed_extractions", 0),
        failed_ids=failed_ids,
    )


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Batch-run base schema extraction for a PL/UK demo corpus."
    )
    parser.add_argument("--jurisdiction", choices=["PL", "UK"], default=None)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--llm-name", default="gpt-4o-mini")
    parser.add_argument("--include-completed", action="store_true")
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--sleep-seconds", type=float, default=0.0)
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument("--additional-instructions", default=None)

    args = parser.parse_args()

    load_dotenv()

    backend_url = os.getenv("API_BASE_URL") or os.getenv("NEXT_PUBLIC_API_BASE_URL")
    backend_api_key = os.getenv("BACKEND_API_KEY")

    if not backend_url:
        print("Missing API_BASE_URL or NEXT_PUBLIC_API_BASE_URL.", file=sys.stderr)
        return 1

    checkpoint_path = Path(args.checkpoint)
    checkpoint = load_checkpoint(checkpoint_path)
    completed_ids = set(checkpoint.get("completed_ids", []))

    client = build_client()
    pending_ids = fetch_candidate_ids(
        client,
        jurisdiction=args.jurisdiction,
        limit=args.limit,
        include_completed=args.include_completed,
        completed_ids=completed_ids,
    )

    if not pending_ids:
        print("No matching documents require base schema extraction.")
        return 0

    print(
        f"Selected {len(pending_ids)} documents"
        f"{f' for {args.jurisdiction}' if args.jurisdiction else ''}."
    )

    total_completed = 0
    total_failed = 0

    for batch_number, batch_ids in enumerate(chunked(pending_ids, args.batch_size), start=1):
        print(f"[batch {batch_number}] extracting {len(batch_ids)} documents...")
        try:
            result = call_base_schema_endpoint(
                backend_url=backend_url,
                api_key=backend_api_key,
                document_ids=batch_ids,
                llm_name=args.llm_name,
                additional_instructions=args.additional_instructions,
                timeout_seconds=args.timeout_seconds,
            )
        except Exception as exc:
            print(f"[batch {batch_number}] failed: {exc}", file=sys.stderr)
            checkpoint.setdefault("failed_ids", []).extend(batch_ids)
            checkpoint.setdefault("batches", []).append(
                {
                    "batch": batch_number,
                    "requested_ids": batch_ids,
                    "completed": 0,
                    "failed": len(batch_ids),
                    "error": str(exc),
                }
            )
            save_checkpoint(checkpoint_path, checkpoint)
            continue

        total_completed += result.completed
        total_failed += result.failed

        successful_ids = [doc_id for doc_id in batch_ids if doc_id not in result.failed_ids]
        checkpoint.setdefault("completed_ids", []).extend(successful_ids)
        checkpoint.setdefault("failed_ids", []).extend(result.failed_ids)
        checkpoint.setdefault("batches", []).append(
            {
                "batch": batch_number,
                "requested_ids": batch_ids,
                "completed": result.completed,
                "failed": result.failed,
                "failed_ids": result.failed_ids,
            }
        )
        save_checkpoint(checkpoint_path, checkpoint)

        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    print(
        "Extraction complete: "
        f"completed={total_completed}, failed={total_failed}, "
        f"checkpoint={checkpoint_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
