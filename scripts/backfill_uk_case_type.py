#!/usr/bin/env python3
"""Backfill ``case_type`` / ``court_level`` for UK judgments (issue #799).

Recomputes both fields for ``jurisdiction = 'UK'`` rows in Supabase ``judgments``
from the neutral citation in ``case_number`` (``EWCA Crim`` -> Criminal / Court
of Appeal, ``EWCA Civ`` -> Civil / Court of Appeal, ``EWHC`` -> High Court),
then partially updates the matching Meilisearch documents (``id`` + those two
fields only; ``_vectors`` is never sent, so nothing is re-embedded).

Rows whose ``case_number`` carries no recognisable citation are left untouched.
The script is idempotent: only rows whose values would change are written.

Usage (dry-run is the default and writes nothing):
    python scripts/backfill_uk_case_type.py
    python scripts/backfill_uk_case_type.py --apply
    python scripts/backfill_uk_case_type.py --apply --skip-meili
    python scripts/backfill_uk_case_type.py --batch-size 500

Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEILISEARCH_URL and
MEILISEARCH_ADMIN_KEY (MEILISEARCH_INDEX_NAME defaults to ``judgments``).
"""

from __future__ import annotations

import importlib.util
import os
import sys
import time
from collections import Counter
from pathlib import Path

import httpx
from dotenv import load_dotenv
from loguru import logger
from rich.console import Console
from rich.table import Table
from supabase import create_client

load_dotenv()

console = Console()
PAGE_SIZE = 1000
TASK_TIMEOUT_S = 300
HELP = __doc__


def _load_classifier():
    """Load the dependency-free classifier by path (no backend deps needed)."""
    path = (
        Path(__file__).resolve().parent.parent
        / "backend"
        / "app"
        / "utils"
        / "uk_classification.py"
    )
    spec = importlib.util.spec_from_file_location("uk_classification", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.classify_uk_citation


def fetch_uk_rows(client) -> list[dict]:
    """Page through every UK row (id, case_number, case_type, court_level)."""
    rows: list[dict] = []
    start = 0
    while True:
        batch = (
            client.table("judgments")
            .select("id,case_number,case_type,court_level")
            .eq("jurisdiction", "UK")
            .order("id")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
            .data
        )
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def plan_changes(rows: list[dict], classify) -> tuple[list[dict], int]:
    """Return (changes, unmatched_count). A change is {id, case_type, court_level}."""
    changes: list[dict] = []
    unmatched = 0
    for row in rows:
        derived = classify(row.get("case_number"))
        if derived is None:
            unmatched += 1
            continue
        case_type, court_level = derived
        if (row.get("case_type"), row.get("court_level")) != (case_type, court_level):
            changes.append(
                {
                    "id": str(row["id"]),
                    "case_type": case_type,
                    "court_level": court_level,
                }
            )
    return changes, unmatched


def print_report(rows: list[dict], changes: list[dict], unmatched: int) -> None:
    after = {c["id"]: c for c in changes}
    table = Table(title="UK judgments: before -> after")
    table.add_column("field")
    table.add_column("value")
    table.add_column("before", justify="right")
    table.add_column("after", justify="right")
    for field in ("case_type", "court_level"):
        before_ct = Counter(r.get(field) for r in rows)
        after_ct = Counter(after.get(str(r["id"]), r).get(field) for r in rows)
        for value in sorted(set(before_ct) | set(after_ct), key=str):
            table.add_row(
                field, str(value), str(before_ct[value]), str(after_ct[value])
            )
    console.print(table)
    console.print(
        f"UK rows: {len(rows)} | to update: {len(changes)} | "
        f"no citation match (left untouched): {unmatched}"
    )


def update_supabase(client, changes: list[dict]) -> None:
    for i, ch in enumerate(changes, 1):
        (
            client.table("judgments")
            .update({"case_type": ch["case_type"], "court_level": ch["court_level"]})
            .eq("id", ch["id"])
            .execute()
        )
        if i % 500 == 0:
            logger.info("Supabase: updated {}/{}", i, len(changes))
    logger.info("Supabase: updated {} rows", len(changes))


def update_meili(changes: list[dict], batch_size: int) -> None:
    """Partial update (PUT /documents): only id + the two fields, no _vectors."""
    base = os.environ["MEILISEARCH_URL"].rstrip("/")
    index = os.getenv("MEILISEARCH_INDEX_NAME", "judgments")
    headers = {"Authorization": f"Bearer {os.environ['MEILISEARCH_ADMIN_KEY']}"}
    with httpx.Client(base_url=base, headers=headers, timeout=60.0) as http:
        for start in range(0, len(changes), batch_size):
            batch = changes[start : start + batch_size]
            resp = http.put(f"/indexes/{index}/documents", json=batch)
            resp.raise_for_status()
            uid = resp.json()["taskUid"]
            deadline = time.monotonic() + TASK_TIMEOUT_S
            while True:
                task = http.get(f"/tasks/{uid}").json()
                if task["status"] in ("succeeded", "failed", "canceled"):
                    break
                if time.monotonic() > deadline:
                    raise TimeoutError(f"Meili task {uid} did not finish")
                time.sleep(1)
            if task["status"] != "succeeded":
                raise RuntimeError(
                    f"Meili task {uid} {task['status']}: {task.get('error')}"
                )
            logger.info("Meili: updated {}/{}", start + len(batch), len(changes))


def main(argv: list[str]) -> int:
    if "-h" in argv or "--help" in argv:
        console.print(HELP)
        return 0
    apply = "--apply" in argv
    skip_meili = "--skip-meili" in argv
    batch_size = 1000
    if "--batch-size" in argv:
        batch_size = int(argv[argv.index("--batch-size") + 1])

    client = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )
    rows = fetch_uk_rows(client)
    changes, unmatched = plan_changes(rows, _load_classifier())
    print_report(rows, changes, unmatched)

    if not apply:
        console.print(
            "[yellow]Dry run: nothing written. Pass --apply to write.[/yellow]"
        )
        return 0
    if not changes:
        console.print("[green]Nothing to update.[/green]")
        return 0
    update_supabase(client, changes)
    if not skip_meili:
        update_meili(changes, batch_size)
    console.print("[green]Backfill complete.[/green]")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
