"""Search quality + latency benchmark for Juddges App.

Runs a fixture set of representative Polish legal queries against a live
backend (defaults to http://localhost:8004), records per-query timing and
hit count, and exits non-zero on any recall / latency threshold breach.

Usage:
    poetry run python scripts/search_benchmark.py
    poetry run python scripts/search_benchmark.py --api-url https://prod.example
    poetry run python scripts/search_benchmark.py --output results.json --runs 5

The fixture file lives at tests/fixtures/search_queries.yaml so the same
queries power pytest integration tests and this script.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import httpx
import yaml

FIXTURES_PATH = (
    Path(__file__).resolve().parent.parent
    / "tests"
    / "fixtures"
    / "search_queries.yaml"
)


@dataclass
class QueryResult:
    id: str
    chars: int
    query_type: str | None
    hits: int
    wall_ms_runs: list[float] = field(default_factory=list)
    embedding_ms: float = 0.0
    search_ms: float = 0.0
    vector_fallback: bool = False
    fallback_used: bool = False
    error: str | None = None

    @property
    def wall_ms_median(self) -> float:
        return statistics.median(self.wall_ms_runs) if self.wall_ms_runs else 0.0


def load_fixtures(path: Path) -> list[dict[str, Any]]:
    return yaml.safe_load(path.read_text())["queries"]


def call_search(
    client: httpx.Client, query: str, api_key: str, limit: int, thinking_mode: bool
) -> tuple[float, int, dict[str, Any], str | None]:
    body = {"query": query, "limit": limit, "thinking_mode": thinking_mode}
    t0 = time.perf_counter()
    try:
        resp = client.post(
            "/documents/search",
            json=body,
            headers={"X-API-Key": api_key},
            timeout=60.0,
        )
        resp.raise_for_status()
        data = resp.json()
        wall_ms = (time.perf_counter() - t0) * 1000
        return (
            wall_ms,
            resp.status_code,
            data,
            None,
        )
    except httpx.HTTPStatusError as exc:
        return (
            (time.perf_counter() - t0) * 1000,
            exc.response.status_code,
            {},
            f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
        )
    except Exception as exc:
        return (
            (time.perf_counter() - t0) * 1000,
            -1,
            {},
            f"{type(exc).__name__}: {exc}"[:200],
        )


def evaluate(fixture: dict[str, Any], result: QueryResult, runs: int) -> list[str]:
    """Return list of threshold violation messages (empty = pass)."""
    violations: list[str] = []
    if result.error:
        violations.append(f"{result.id}: error — {result.error}")
        return violations

    min_hits = fixture.get("min_hits", 0)
    if result.hits < min_hits:
        violations.append(f"{result.id}: {result.hits} hits < min_hits={min_hits}")

    max_wall = fixture.get("max_wall_ms")
    if max_wall and result.wall_ms_median > max_wall:
        violations.append(
            f"{result.id}: median {result.wall_ms_median:.0f}ms > max_wall_ms={max_wall}"
        )

    expected = fixture.get("expected_query_type")
    if expected and result.query_type != expected:
        violations.append(
            f"{result.id}: query_type={result.query_type!r} != expected {expected!r}"
        )

    forbidden = fixture.get("forbidden_query_type")
    if forbidden and result.query_type == forbidden:
        violations.append(
            f"{result.id}: query_type={forbidden!r} is forbidden (regression)"
        )

    if result.vector_fallback:
        violations.append(f"{result.id}: vector_fallback=true (embedding unhealthy)")

    return violations


def print_row(r: QueryResult) -> None:
    status = "ERR" if r.error else "OK"
    print(
        f"  [{status}] {r.id:<22} chars={r.chars:>5} hits={r.hits:>3} "
        f"type={r.query_type!s:<20} "
        f"wall={r.wall_ms_median:>6.0f}ms emb={r.embedding_ms:>5.0f}ms "
        f"search={r.search_ms:>6.0f}ms fallback={r.vector_fallback}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--api-url",
        default=os.getenv("BENCHMARK_API_URL", "http://localhost:8004"),
        help="Base URL of the backend API",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("BACKEND_API_KEY", ""),
        help="BACKEND_API_KEY value (defaults to env var)",
    )
    parser.add_argument("--limit", type=int, default=50, help="result_limit per query")
    parser.add_argument("--runs", type=int, default=3, help="runs per query (median)")
    parser.add_argument(
        "--thinking", action="store_true", help="call with thinking_mode=true"
    )
    parser.add_argument("--output", help="optional path to write full results as JSON")
    parser.add_argument(
        "--fixtures", default=str(FIXTURES_PATH), help="path to queries YAML"
    )
    parser.add_argument("--no-warmup", action="store_true", help="skip warmup query")
    args = parser.parse_args()

    if not args.api_key:
        print(
            "ERROR: BACKEND_API_KEY env var or --api-key flag is required",
            file=sys.stderr,
        )
        return 2

    fixtures = load_fixtures(Path(args.fixtures))
    print(
        f"Benchmark: {args.api_url}  runs={args.runs}  thinking={args.thinking}  "
        f"queries={len(fixtures)}"
    )

    with httpx.Client(base_url=args.api_url) as client:
        if not args.no_warmup:
            call_search(client, "warmup", args.api_key, 1, False)

        results: list[QueryResult] = []
        all_violations: list[str] = []
        for fixture in fixtures:
            q = " ".join(fixture["query"].split())  # collapse YAML block whitespace
            result = QueryResult(
                id=fixture["id"], chars=len(q), query_type=None, hits=0
            )
            last_data: dict[str, Any] = {}
            for _ in range(args.runs):
                wall_ms, _status, data, err = call_search(
                    client, q, args.api_key, args.limit, args.thinking
                )
                if err:
                    result.error = err
                    break
                last_data = data
                result.wall_ms_runs.append(wall_ms)

            if last_data:
                tb = last_data.get("timing_breakdown") or {}
                result.hits = len(last_data.get("chunks") or [])
                result.query_type = tb.get("query_type")
                result.embedding_ms = float(tb.get("embedding_ms") or 0)
                result.search_ms = float(tb.get("search_ms") or 0)
                result.vector_fallback = bool(tb.get("vector_fallback"))
                result.fallback_used = bool(tb.get("fallback_used"))

            results.append(result)
            print_row(result)
            all_violations.extend(evaluate(fixture, result, args.runs))

    print()
    if all_violations:
        print("VIOLATIONS:")
        for v in all_violations:
            print(f"  - {v}")
    else:
        print("All queries met their thresholds.")

    if args.output:
        payload = {
            "api_url": args.api_url,
            "runs": args.runs,
            "thinking": args.thinking,
            "results": [asdict(r) for r in results],
            "violations": all_violations,
        }
        Path(args.output).write_text(json.dumps(payload, indent=2))
        print(f"Wrote {args.output}")

    return 1 if all_violations else 0


if __name__ == "__main__":
    sys.exit(main())
