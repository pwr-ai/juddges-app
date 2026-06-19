#!/usr/bin/env python3
"""Import a saved topics snapshot into Supabase ``search_topics``.

Accepts either:
- a JSON array of topic docs, or
- an object with a top-level ``topics`` array.

The script normalizes away export-only metadata and stores the snapshot as one
``run_id`` in Supabase using the existing search_topics store helper.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.services.search_topics_store import persist_search_topics_run  # noqa: E402


def _load_topics(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)

    if isinstance(data, list):
        topics = data
    elif isinstance(data, dict) and isinstance(data.get("topics"), list):
        topics = data["topics"]
    else:
        raise ValueError("input must be a JSON array or an object with a 'topics' array")

    normalized: list[dict[str, Any]] = []
    generated_at = datetime.now(UTC).isoformat()
    for topic in topics:
        normalized.append(
            {
                "id": topic["id"],
                "label_pl": topic["label_pl"],
                "label_en": topic["label_en"],
                "aliases_pl": topic.get("aliases_pl") or [],
                "aliases_en": topic.get("aliases_en") or [],
                "category": topic["category"],
                "doc_count": int(topic.get("doc_count", 0) or 0),
                "jurisdictions": topic.get("jurisdictions") or [],
                "generated_at": topic.get("generated_at") or generated_at,
                "corpus_snapshot": topic.get("corpus_snapshot"),
            }
        )
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import a saved topics snapshot into Supabase search_topics."
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to merged-topics.json or a compatible topic array JSON",
    )
    parser.add_argument(
        "--case-type",
        type=str,
        default="criminal",
        help="source_case_type to persist with the snapshot (default: criminal)",
    )
    args = parser.parse_args()

    topics = _load_topics(args.input)
    if not topics:
        print("No topics found in input.", file=sys.stderr)
        sys.exit(1)

    run_id = persist_search_topics_run(topics, case_type=args.case_type)
    print(f"Inserted {len(topics)} topics into Supabase search_topics with run_id={run_id}")


if __name__ == "__main__":
    main()
