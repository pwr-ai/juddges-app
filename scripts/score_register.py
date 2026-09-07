"""Score and rank a UX debt register.

Reads a ux-debt.yaml register, computes

    score = (severity_weight * reach * frequency_weight) / effort

Severity is weighted 3^(severity-1) — 1, 3, 9, 27 — because the cost of a defect
rises far faster than its ordinal rating. Linear severity lets a cosmetic issue
affecting everyone outrank a major one, which is the wrong answer.

and prints a ranked table, JSON, or a staleness report.

Usage:
    python3 score_register.py ux-debt.yaml
    python3 score_register.py ux-debt.yaml --top 10
    python3 score_register.py ux-debt.yaml --format json
    python3 score_register.py ux-debt.yaml --stale

Exits 1 on a malformed register so it can run as a CI gate.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

import yaml

FREQUENCY_WEIGHTS = {"high": 1.0, "medium": 0.6, "low": 0.3}
SEVERITY_WEIGHTS = {0: 0.0, 1: 1.0, 2: 3.0, 3: 9.0, 4: 27.0}
OPEN_STATES = {"accepted", "scheduled", "in-progress"}
VALID_STATES = OPEN_STATES | {"fixed", "wont-fix"}
REQUIRED_FIELDS = ("id", "title", "severity", "reach", "frequency", "effort", "state")


def validate(entry: dict, index: int) -> list[str]:
    """Return human-readable problems with one register entry."""
    where = entry.get("id") or f"entry #{index + 1}"
    problems = []

    missing = [f for f in REQUIRED_FIELDS if entry.get(f) is None]
    if missing:
        problems.append(f"{where}: missing {', '.join(missing)}")

    severity = entry.get("severity")
    if severity is not None and not (isinstance(severity, int) and 0 <= severity <= 4):
        problems.append(f"{where}: severity must be an integer 0-4, got {severity!r}")

    reach = entry.get("reach")
    if reach is not None and not (isinstance(reach, int | float) and 0 <= reach <= 1):
        problems.append(f"{where}: reach must be a fraction 0-1, got {reach!r}")

    frequency = entry.get("frequency")
    if frequency is not None and frequency not in FREQUENCY_WEIGHTS:
        problems.append(
            f"{where}: frequency must be one of "
            f"{', '.join(FREQUENCY_WEIGHTS)}, got {frequency!r}"
        )

    effort = entry.get("effort")
    if effort is not None and not (isinstance(effort, int | float) and effort > 0):
        problems.append(f"{where}: effort must be a positive number, got {effort!r}")

    state = entry.get("state")
    if state is not None and state not in VALID_STATES:
        problems.append(
            f"{where}: state must be one of {', '.join(sorted(VALID_STATES))}, "
            f"got {state!r}"
        )

    for field in ("review_by", "first_seen"):
        raw = entry.get(field)
        if raw is not None and as_date(raw) is None:
            problems.append(f"{where}: {field} is not a valid date, got {raw!r}")

    if not entry.get("evidence"):
        problems.append(f"{where}: evidence is required — a register entry is not an opinion")

    return problems


def score(entry: dict) -> float:
    severity = SEVERITY_WEIGHTS[entry["severity"]]
    frequency = FREQUENCY_WEIGHTS[entry["frequency"]]
    return (severity * entry["reach"] * frequency) / entry["effort"]


def load(path: Path) -> list[dict]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if data is None:
        return []
    if not isinstance(data, list):
        sys.exit(f"{path}: register must be a YAML list of entries")

    problems = []
    for index, entry in enumerate(data):
        if not isinstance(entry, dict):
            problems.append(
                f"entry #{index + 1}: must be a mapping of fields, got "
                f"{type(entry).__name__} ({entry!r}) — check for a missing `id:` key"
            )
            continue
        problems.extend(validate(entry, index))
    if problems:
        print(f"{len(problems)} problems in {path}:", file=sys.stderr)
        for p in problems:
            print(f"  {p}", file=sys.stderr)
        sys.exit(1)
    return data


def as_date(value: object) -> date | None:
    # datetime subclasses date, and PyYAML parses `2026-01-01 09:00:00` into a
    # datetime. Comparing that against a date raises TypeError, so narrow first.
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def print_table(entries: list[dict]) -> None:
    header = f"{'#':>3}  {'ID':<8} {'Sev':>3} {'Reach':>6} {'Freq':<6} {'Eff':>3} {'Score':>6}  {'State':<12} Title"
    print(header)
    print("-" * len(header))
    for rank, entry in enumerate(entries, 1):
        print(
            f"{rank:>3}  {entry['id']:<8} {entry['severity']:>3} "
            f"{entry['reach']:>6.2f} {entry['frequency']:<6} {entry['effort']:>3} "
            f"{score(entry):>6.2f}  {entry['state']:<12} {entry['title']}"
        )


def print_summary(all_entries: list[dict]) -> None:
    open_entries = [e for e in all_entries if e["state"] in OPEN_STATES]
    by_severity = dict.fromkeys(range(5), 0)
    for entry in open_entries:
        by_severity[entry["severity"]] += 1
    breakdown = " · ".join(f"{s}: {by_severity[s]}" for s in (4, 3, 2, 1, 0))
    print(f"\nOpen: {len(open_entries)} of {len(all_entries)}  ({breakdown})")


def print_stale(entries: list[dict]) -> int:
    today = date.today()
    stale = []
    undated = []
    for entry in entries:
        if entry["state"] not in OPEN_STATES:
            continue
        review_by = as_date(entry.get("review_by"))
        if review_by is None:
            undated.append(entry)
        elif review_by < today:
            stale.append((entry, (today - review_by).days))

    if not stale and not undated:
        print("No stale entries — every open item has a future review_by.")
        return 0

    for entry, overdue in sorted(stale, key=lambda pair: -pair[1]):
        print(f"{entry['id']:<8} {overdue:>4}d overdue  {entry['title']}")
    for entry in undated:
        print(f"{entry['id']:<8}   no review_by  {entry['title']}")
    print(f"\n{len(stale)} overdue, {len(undated)} without a review date.")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("register", type=Path, help="path to ux-debt.yaml")
    parser.add_argument(
        "--top", type=int, help="show only the top N by score (0 shows none)"
    )
    parser.add_argument(
        "--format", choices=("table", "json"), default="table", help="output format"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="include fixed and wont-fix entries (default: open only)",
    )
    parser.add_argument(
        "--stale",
        action="store_true",
        help="list open entries past their review_by; exits 1 if any",
    )
    args = parser.parse_args()

    if args.top is not None and args.top < 0:
        sys.exit("--top must be zero or greater")

    if not args.register.exists():
        sys.exit(f"{args.register}: no such file")

    all_entries = load(args.register)
    if not all_entries:
        print("Register is empty.")
        return 0

    if args.stale:
        return print_stale(all_entries)

    entries = all_entries if args.all else [e for e in all_entries if e["state"] in OPEN_STATES]
    entries.sort(key=score, reverse=True)
    if args.top is not None:
        entries = entries[: args.top]

    if args.format == "json":
        print(
            json.dumps(
                [{**e, "score": round(score(e), 4)} for e in entries],
                indent=2,
                default=str,
            )
        )
        return 0

    print_table(entries)
    print_summary(all_entries)
    return 0


if __name__ == "__main__":
    sys.exit(main())
