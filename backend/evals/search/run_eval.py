"""Offline retrieval evaluation for /api/search/documents (issue #831).

Runs every golden-set query through ``MeiliSearchService.documents_search`` --
the call behind ``GET /api/search/documents`` -- once per search mode, and
reports recall@k, nDCG@k, MRR@k and wall-clock latency p50/p95.

Modes map onto the endpoint's ``semantic_ratio``:

* ``keyword``    -> 0.0 (what anonymous callers always get, #565)
* ``semantic``   -> 1.0
* ``hybrid:0.5`` -> 0.5 (any ratio in (0, 1))

It calls the service in-process, so it needs the same env as the backend
(``MEILISEARCH_*`` plus the TEI embedding service for any ratio > 0) and skips
HTTP, auth, rate limits and the guest gate. Run it inside the **dev** backend
container; it refuses to start where ``PYTHON_ENV`` (or ``ENVIRONMENT``/``APP_ENV``)
is production.

Usage (from ``backend/``)::

    python -m evals.search.run_eval [--k 10] [--modes keyword,semantic,hybrid:0.5]
        [--golden PATH] [--category case_number] [--jurisdiction PL]
        [--runs 1] [--ids-only] [--jurisdiction-filter]
        [--json out.json] [--baseline before.json] [--max-drop 0.02]

``--baseline`` turns the run into a gate: exit 1 if any mode present in both
runs lost more than ``--max-drop`` (absolute) on nDCG@k, recall@k or MRR@k.

See docs/how-to/evaluate-search-quality.md.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from loguru import logger
from rich.console import Console
from rich.table import Table

from evals.search.cli import flag, has_flag, production_marker
from evals.search.golden import (
    GOLDEN_SET_PATH,
    GoldenQuery,
    grade_hits,
    load_golden_set,
)
from evals.search.metrics import (
    mean,
    ndcg_at_k,
    percentile,
    recall_at_k,
    reciprocal_rank,
)

if TYPE_CHECKING:
    from app.services.search import MeiliSearchService

DEFAULT_MODES = "keyword,semantic,hybrid:0.25,hybrid:0.5,hybrid:0.75"
GATED_METRICS = ("ndcg", "recall", "mrr")
EXIT_OK, EXIT_REGRESSION, EXIT_USAGE, EXIT_DEGRADED = 0, 1, 2, 3


# ── modes ───────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Mode:
    name: str
    semantic_ratio: float


def parse_modes(spec: str) -> list[Mode]:
    """Parse ``keyword,semantic,hybrid:0.5`` into :class:`Mode` objects."""
    modes: list[Mode] = []
    for raw in (part.strip() for part in spec.split(",")):
        if not raw:
            continue
        if raw == "keyword":
            modes.append(Mode("keyword", 0.0))
        elif raw == "semantic":
            modes.append(Mode("semantic", 1.0))
        elif raw.startswith("hybrid:"):
            ratio = float(raw.split(":", 1)[1])
            if not 0.0 < ratio < 1.0:
                raise ValueError(f"hybrid ratio must be in (0, 1), got {ratio}")
            modes.append(Mode(f"hybrid:{ratio:g}", ratio))
        else:
            raise ValueError(
                f"unknown mode {raw!r} (expected keyword, semantic or hybrid:<ratio>)"
            )
    if not modes:
        raise ValueError("no modes given")
    if len({m.name for m in modes}) != len(modes):
        raise ValueError(f"duplicate mode in {spec!r}")
    return modes


# ── per-query evaluation ───────────────────────────────────────────────────


@dataclass
class QueryOutcome:
    qid: str
    mode: str
    category: str
    jurisdiction: str
    grades: list[int]
    recall: float
    ndcg: float
    mrr: float
    strict_ndcg: float | None
    latencies_ms: list[float] = field(default_factory=list)
    search_mode: str | None = None
    degraded: bool = False
    error: str | None = None


def score_query(
    query: GoldenQuery,
    hits: list[dict[str, Any]],
    k: int,
    *,
    match_case_number: bool = True,
) -> tuple[list[int], float, float, float, float | None]:
    """Grade ``hits`` and return ``(grades, recall, ndcg, rr, strict_ndcg)``.

    ``strict_ndcg`` re-scores against the non-heuristic labels only, and is
    None when the query has none.
    """
    grades = grade_hits(hits, query, match_case_number=match_case_number)
    relevant = query.grades
    strict = query.without_heuristic()
    strict_ndcg = None
    if strict.relevant:
        strict_grades = grade_hits(hits, strict, match_case_number=match_case_number)
        strict_ndcg = ndcg_at_k(strict_grades, strict.grades, k)
    return (
        grades,
        recall_at_k(grades, relevant, k),
        ndcg_at_k(grades, relevant, k),
        reciprocal_rank(grades, k),
        strict_ndcg,
    )


async def evaluate_mode(
    service: MeiliSearchService,
    queries: list[GoldenQuery],
    mode: Mode,
    k: int,
    *,
    runs: int = 1,
    jurisdiction_filter: bool = False,
    match_case_number: bool = True,
) -> list[QueryOutcome]:
    outcomes: list[QueryOutcome] = []
    for query in queries:
        filters = (
            f'jurisdiction = "{query.jurisdiction}"' if jurisdiction_filter else None
        )
        latencies: list[float] = []
        result: dict[str, Any] = {}
        error: str | None = None
        for _ in range(runs):
            t0 = time.perf_counter()
            try:
                result = await service.documents_search(
                    query=query.query,
                    limit=k,
                    offset=0,
                    filters=filters,
                    semantic_ratio=mode.semantic_ratio,
                )
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"[:300]
                logger.warning("{} [{}] failed: {}", query.qid, mode.name, error)
                break
            latencies.append((time.perf_counter() - t0) * 1000)

        hits = result.get("hits", []) if not error else []
        grades, recall, ndcg, rr, strict_ndcg = score_query(
            query, hits, k, match_case_number=match_case_number
        )
        search_mode = result.get("search_mode")
        # A ratio > 0 that came back as anything but "hybrid" ran keyword-only
        # (TEI down, or the embedder missing in Meili): its scores describe the
        # keyword engine, not the mode asked for.
        degraded = bool(error) or (mode.semantic_ratio > 0 and search_mode != "hybrid")
        outcomes.append(
            QueryOutcome(
                qid=query.qid,
                mode=mode.name,
                category=query.category,
                jurisdiction=query.jurisdiction,
                grades=grades,
                recall=recall,
                ndcg=ndcg,
                mrr=rr,
                strict_ndcg=strict_ndcg,
                latencies_ms=latencies,
                search_mode=search_mode,
                degraded=degraded,
                error=error,
            )
        )
    return outcomes


# ── aggregation ────────────────────────────────────────────────────────────


def summarize(outcomes: list[QueryOutcome]) -> dict[str, Any]:
    """Mean metrics and latency percentiles over a slice of outcomes."""
    latencies = [ms for o in outcomes for ms in o.latencies_ms]
    strict = [o.strict_ndcg for o in outcomes if o.strict_ndcg is not None]
    return {
        "queries": len(outcomes),
        "recall": mean([o.recall for o in outcomes]),
        "ndcg": mean([o.ndcg for o in outcomes]),
        "mrr": mean([o.mrr for o in outcomes]),
        "strict_ndcg": mean(strict) if strict else None,
        "p50_ms": percentile(latencies, 50) if latencies else None,
        "p95_ms": percentile(latencies, 95) if latencies else None,
        "degraded": sum(1 for o in outcomes if o.degraded),
    }


def build_summary(
    outcomes: list[QueryOutcome], modes: list[Mode]
) -> dict[str, dict[str, Any]]:
    """``{mode: {"overall": {...}, "by_category": {...}, "by_jurisdiction": {...}}}``."""
    summary: dict[str, dict[str, Any]] = {}
    for mode in modes:
        rows = [o for o in outcomes if o.mode == mode.name]
        summary[mode.name] = {
            "semantic_ratio": mode.semantic_ratio,
            "overall": summarize(rows),
            "by_category": {
                cat: summarize([o for o in rows if o.category == cat])
                for cat in sorted({o.category for o in rows})
            },
            "by_jurisdiction": {
                jur: summarize([o for o in rows if o.jurisdiction == jur])
                for jur in sorted({o.jurisdiction for o in rows})
            },
        }
    return summary


def compare_to_baseline(
    current: dict[str, dict[str, Any]],
    baseline: dict[str, dict[str, Any]],
    max_drop: float,
) -> list[str]:
    """Regressions of more than ``max_drop`` on any gated metric, per mode.

    Only modes present in both summaries are compared; a mode missing from the
    baseline is new, not a regression.
    """
    regressions: list[str] = []
    for mode, block in current.items():
        if mode not in baseline:
            continue
        now, before = block["overall"], baseline[mode]["overall"]
        for metric in GATED_METRICS:
            drop = before[metric] - now[metric]
            if drop > max_drop:
                regressions.append(
                    f"{mode}: {metric} {before[metric]:.3f} -> {now[metric]:.3f} "
                    f"(-{drop:.3f} > {max_drop:.3f})"
                )
    return regressions


# ── rendering ──────────────────────────────────────────────────────────────


def _fmt(value: float | None, digits: int = 3) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def _ms(value: float | None) -> str:
    return "—" if value is None else f"{value:.0f}"


def render(console: Console, summary: dict[str, dict[str, Any]], k: int) -> None:
    table = Table(title=f"Search quality @ k={k} (all labels)")
    for col in ("mode", "ratio", "n", f"recall@{k}", f"nDCG@{k}", f"MRR@{k}"):
        table.add_column(col, justify="right" if col != "mode" else "left")
    table.add_column(f"nDCG@{k} strict", justify="right")
    table.add_column("p50 ms", justify="right")
    table.add_column("p95 ms", justify="right")
    table.add_column("degraded", justify="right")
    for mode, block in summary.items():
        o = block["overall"]
        table.add_row(
            mode,
            f"{block['semantic_ratio']:g}",
            str(o["queries"]),
            _fmt(o["recall"]),
            _fmt(o["ndcg"]),
            _fmt(o["mrr"]),
            _fmt(o["strict_ndcg"]),
            _ms(o["p50_ms"]),
            _ms(o["p95_ms"]),
            f"[red]{o['degraded']}[/]" if o["degraded"] else "0",
        )
    console.print(table)

    for group in ("by_category", "by_jurisdiction"):
        keys = sorted({key for block in summary.values() for key in block[group]})
        breakdown = Table(title=f"nDCG@{k} / recall@{k} {group.replace('_', ' ')}")
        breakdown.add_column("mode")
        for key in keys:
            breakdown.add_column(key, justify="right")
        for mode, block in summary.items():
            cells = []
            for key in keys:
                s = block[group].get(key)
                cells.append(
                    "—" if s is None else f"{_fmt(s['ndcg'])} / {_fmt(s['recall'])}"
                )
            breakdown.add_row(mode, *cells)
        console.print(breakdown)


# ── entry point ────────────────────────────────────────────────────────────

USAGE = __doc__ or ""


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


async def _run(argv: list[str], console: Console) -> int:
    from app.services.search import MeiliSearchService

    k = int(flag(argv, "--k") or "10")
    if not 1 <= k <= 100:
        console.print("[bold red]--k must be in 1..100[/] (the endpoint's limit cap)")
        return EXIT_USAGE
    modes = parse_modes(flag(argv, "--modes") or DEFAULT_MODES)
    runs = max(1, int(flag(argv, "--runs") or "1"))
    golden_path = Path(flag(argv, "--golden") or GOLDEN_SET_PATH)
    category = flag(argv, "--category")
    jurisdiction = flag(argv, "--jurisdiction")
    json_out = flag(argv, "--json")
    baseline_path = flag(argv, "--baseline")
    max_drop = float(flag(argv, "--max-drop") or "0.02")
    match_case_number = not has_flag(argv, "--ids-only")
    jurisdiction_filter = has_flag(argv, "--jurisdiction-filter")

    queries = load_golden_set(golden_path)
    if category:
        queries = [q for q in queries if q.category == category]
    if jurisdiction:
        queries = [q for q in queries if q.jurisdiction == jurisdiction.upper()]
    if not queries:
        console.print("[bold red]No golden queries left after filtering.[/]")
        return EXIT_USAGE

    service = MeiliSearchService.from_env()
    if not service.configured:
        console.print(
            "[bold red]Meilisearch is not configured[/] (MEILISEARCH_URL / keys)."
        )
        return EXIT_USAGE

    console.print(
        f"[bold]Search eval[/] index={service.index_name} url={service.base_url} "
        f"queries={len(queries)} k={k} runs={runs} "
        f"modes={','.join(m.name for m in modes)}"
    )
    outcomes: list[QueryOutcome] = []
    try:
        for mode in modes:
            # Warm-up: the first call pays connection setup (and TEI cold start
            # for ratio > 0); keep it out of the latency percentiles.
            try:
                await service.documents_search(
                    query=queries[0].query, limit=1, semantic_ratio=mode.semantic_ratio
                )
            except Exception as exc:
                logger.warning("warm-up for {} failed: {}", mode.name, exc)
            with console.status(f"running {mode.name} ..."):
                outcomes += await evaluate_mode(
                    service,
                    queries,
                    mode,
                    k,
                    runs=runs,
                    jurisdiction_filter=jurisdiction_filter,
                    match_case_number=match_case_number,
                )
    finally:
        await service.aclose()

    summary = build_summary(outcomes, modes)
    render(console, summary, k)

    degraded = {
        m: s["overall"]["degraded"]
        for m, s in summary.items()
        if s["overall"]["degraded"]
    }
    if degraded:
        console.print(
            f"[bold red]DEGRADED[/] {degraded}: these modes fell back to keyword or "
            "errored; their numbers are not the mode's. Check TEI and the Meili embedder."
        )

    regressions: list[str] = []
    if baseline_path:
        baseline = json.loads(Path(baseline_path).read_text(encoding="utf-8"))
        regressions = compare_to_baseline(summary, baseline["summary"], max_drop)
        if regressions:
            console.print("[bold red]REGRESSIONS vs baseline:[/]")
            for line in regressions:
                console.print(f"  - {line}")
        else:
            console.print(
                f"[green]No metric dropped more than {max_drop} vs baseline.[/]"
            )

    if json_out:
        payload = {
            "created_at": datetime.now(UTC).isoformat(),
            "k": k,
            "runs": runs,
            "index": service.index_name,
            "golden_set": str(golden_path),
            "golden_set_sha256": _file_sha256(golden_path),
            "filters": {
                "category": category,
                "jurisdiction": jurisdiction,
                "jurisdiction_filter": jurisdiction_filter,
                "ids_only": not match_case_number,
            },
            "summary": summary,
            "queries": [asdict(o) for o in outcomes],
            "regressions": regressions,
        }
        Path(json_out).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        console.print(f"Wrote {json_out}")

    if degraded:
        return EXIT_DEGRADED
    return EXIT_REGRESSION if regressions else EXIT_OK


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    console = Console()
    if has_flag(argv, "--help") or has_flag(argv, "-h"):
        console.print(USAGE)
        return EXIT_OK
    marker = production_marker()
    if marker:
        console.print(
            f"[bold red]Refusing to run:[/] {marker} marks this as production. "
            "Run the eval in the dev backend container."
        )
        return EXIT_USAGE
    try:
        return asyncio.run(_run(argv, console))
    except ValueError as exc:
        console.print(f"[bold red]{exc}[/]")
        return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
