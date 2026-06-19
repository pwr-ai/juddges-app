#!/usr/bin/env python3
"""Validate curated search topics before publishing.

Supports validating:
- a JSON file containing topics, or
- a Supabase ``search_topics`` run (default: latest run).

Errors:
- duplicate ids within the validated batch
- missing required fields

Warnings:
- duplicate normalized labels within the batch
- exact normalized label/alias collisions across different ids
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.services.search_topics_store import (  # noqa: E402
    get_latest_search_topics_run_id,
    load_search_topics_run,
)

REQUIRED_FIELDS = {
    "id",
    "label_pl",
    "label_en",
    "aliases_pl",
    "aliases_en",
    "category",
    "jurisdictions",
}


def _normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _load_topics_from_file(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("topics"), list):
        return data["topics"]
    raise ValueError("input must be a JSON array or an object with a 'topics' array")


def _load_topics(args: argparse.Namespace) -> tuple[list[dict[str, Any]], str]:
    if args.input:
        return _load_topics_from_file(args.input), f"file:{args.input}"

    run_id = args.run_id or get_latest_search_topics_run_id()
    if not run_id:
        raise ValueError("no search_topics run found in Supabase")
    return load_search_topics_run(run_id), f"supabase-run:{run_id}"


def _string_values(topic: dict[str, Any]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for field in ("label_pl", "label_en"):
        value = topic.get(field)
        if isinstance(value, str) and value.strip():
            pairs.append((field, value))
    for field in ("aliases_pl", "aliases_en"):
        for value in topic.get(field) or []:
            if isinstance(value, str) and value.strip():
                pairs.append((field, value))
    return pairs


def validate_topics(topics: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    ids_seen: set[str] = set()
    normalized_labels_en: defaultdict[str, list[str]] = defaultdict(list)
    normalized_labels_pl: defaultdict[str, list[str]] = defaultdict(list)
    normalized_strings: defaultdict[str, list[tuple[str, str, str]]] = defaultdict(list)

    for idx, topic in enumerate(topics):
        missing = REQUIRED_FIELDS - set(topic.keys())
        if missing:
            errors.append(
                f"topic[{idx}] id={topic.get('id', '<missing>')} missing fields: {sorted(missing)}"
            )
            continue

        topic_id = topic["id"]
        if topic_id in ids_seen:
            errors.append(f"duplicate id in batch: {topic_id}")
        ids_seen.add(topic_id)

        for field in ("label_pl", "label_en"):
            if not isinstance(topic.get(field), str) or not topic[field].strip():
                errors.append(f"topic id={topic_id} has invalid {field}")

        for field in ("aliases_pl", "aliases_en", "jurisdictions"):
            if not isinstance(topic.get(field), list):
                errors.append(f"topic id={topic_id} has invalid {field}; expected list")

        norm_en = _normalize_text(topic["label_en"])
        norm_pl = _normalize_text(topic["label_pl"])
        if norm_en:
            normalized_labels_en[norm_en].append(topic_id)
        if norm_pl:
            normalized_labels_pl[norm_pl].append(topic_id)

        for field, value in _string_values(topic):
            normalized = _normalize_text(value)
            if normalized:
                normalized_strings[normalized].append((topic_id, field, value))

    for normalized, ids in normalized_labels_en.items():
        distinct_ids = sorted(set(ids))
        if len(distinct_ids) > 1:
            warnings.append(
                f"duplicate normalized English label '{normalized}' across ids {distinct_ids}"
            )

    for normalized, ids in normalized_labels_pl.items():
        distinct_ids = sorted(set(ids))
        if len(distinct_ids) > 1:
            warnings.append(
                f"duplicate normalized Polish label '{normalized}' across ids {distinct_ids}"
            )

    for normalized, entries in normalized_strings.items():
        ids = sorted({topic_id for topic_id, _, _ in entries})
        if len(ids) <= 1:
            continue
        pretty_entries = ", ".join(
            f"{topic_id}:{field}='{value}'" for topic_id, field, value in entries
        )
        warnings.append(
            f"exact normalized string collision '{normalized}' across ids {ids} -> {pretty_entries}"
        )

    return errors, warnings


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate search_topics content.")
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Optional JSON file to validate instead of reading from Supabase",
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default=None,
        help="Specific search_topics run_id to validate (defaults to latest)",
    )
    args = parser.parse_args()

    topics, source = _load_topics(args)
    errors, warnings = validate_topics(topics)

    print(f"source={source}")
    print(f"topics={len(topics)}")
    print(f"errors={len(errors)}")
    print(f"warnings={len(warnings)}")

    if warnings:
        print("\nWarnings:")
        for warning in warnings:
            print(f"- {warning}")

    if errors:
        print("\nErrors:")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
