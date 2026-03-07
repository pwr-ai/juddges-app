#!/usr/bin/env python3
"""Load test for the Meilisearch autocomplete endpoint.

Usage:
    python scripts/loadtest_autocomplete.py                      # defaults
    python scripts/loadtest_autocomplete.py --rps 20 --duration 30
    python scripts/loadtest_autocomplete.py --url http://prod:8002

Requires: httpx (already a backend dependency).
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import statistics
import time

import httpx

# Sample queries for realistic load patterns
SAMPLE_QUERIES = [
    "contract",
    "criminal",
    "family law",
    "tax",
    "property dispute",
    "employment",
    "immigration",
    "human rights",
    "intellectual property",
    "bankruptcy",
    "fraud",
    "negligence",
    "custody",
    "divorce",
    "inheritance",
    "insurance",
    "debt",
    "lease",
    "eviction",
    "damages",
    "appeal",
    "sentencing",
    "judicial review",
    "umowa",
    "karne",
    "prawo rodzinne",
    "podatek",
    "nieruchomość",
    "zatrudnienie",
]


async def run_load_test(
    base_url: str,
    api_key: str,
    rps: int,
    duration: int,
) -> None:
    """Send autocomplete requests at target RPS for a given duration."""
    endpoint = f"{base_url.rstrip('/')}/api/search/autocomplete"
    headers = {"X-API-Key": api_key} if api_key else {}

    latencies: list[float] = []
    errors = 0
    status_counts: dict[int, int] = {}

    total_requests = rps * duration
    interval = 1.0 / rps if rps > 0 else 0

    print(f"Target: {endpoint}")
    print(f"Config: {rps} req/s x {duration}s = {total_requests} total requests")
    print("-" * 60)

    start = time.monotonic()

    async with httpx.AsyncClient(timeout=10.0) as client:
        sem = asyncio.Semaphore(rps * 2)  # cap in-flight requests

        async def fire(query: str) -> None:
            nonlocal errors
            async with sem:
                t0 = time.monotonic()
                try:
                    resp = await client.get(
                        endpoint,
                        params={"q": query, "limit": 10},
                        headers=headers,
                    )
                    latency_ms = (time.monotonic() - t0) * 1000
                    latencies.append(latency_ms)
                    status_counts[resp.status_code] = (
                        status_counts.get(resp.status_code, 0) + 1
                    )
                except Exception:
                    errors += 1

        tasks = []
        for i in range(total_requests):
            query = random.choice(SAMPLE_QUERIES)
            tasks.append(asyncio.create_task(fire(query)))
            # Pace requests
            elapsed = time.monotonic() - start
            expected = (i + 1) * interval
            if expected > elapsed:
                await asyncio.sleep(expected - elapsed)

        await asyncio.gather(*tasks)

    wall_time = time.monotonic() - start

    # Report
    print(f"\nCompleted in {wall_time:.1f}s")
    print(f"Requests:  {len(latencies)} OK, {errors} errors")
    print(f"Actual RPS: {len(latencies) / wall_time:.1f}")
    print()

    for code, count in sorted(status_counts.items()):
        print(f"  HTTP {code}: {count}")

    if latencies:
        latencies.sort()
        print(f"\nLatency (ms):")
        print(f"  min:  {latencies[0]:.1f}")
        print(f"  p50:  {statistics.median(latencies):.1f}")
        print(f"  p90:  {latencies[int(len(latencies) * 0.9)]:.1f}")
        print(f"  p99:  {latencies[int(len(latencies) * 0.99)]:.1f}")
        print(f"  max:  {latencies[-1]:.1f}")
        print(f"  mean: {statistics.mean(latencies):.1f}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Load test autocomplete endpoint")
    parser.add_argument(
        "--url",
        default=os.getenv("BACKEND_URL", "http://localhost:8004"),
        help="Backend base URL (default: $BACKEND_URL or localhost:8004)",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("BACKEND_API_KEY", ""),
        help="Backend API key (default: $BACKEND_API_KEY)",
    )
    parser.add_argument(
        "--rps",
        type=int,
        default=10,
        help="Target requests per second (default: 10)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=10,
        help="Test duration in seconds (default: 10)",
    )
    args = parser.parse_args()

    asyncio.run(
        run_load_test(
            base_url=args.url,
            api_key=args.api_key,
            rps=args.rps,
            duration=args.duration,
        )
    )


if __name__ == "__main__":
    main()
