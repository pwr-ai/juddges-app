"""Core engine: case model, HTTP context, runner, and rich reporting.

The engine is deliberately tiny and dependency-light. A *case* is a callable
that receives a :class:`CaseContext` and either returns a success message or
raises:

- ``AssertionError``         -> the check FAILED (a real defect)
- :class:`SkipCase`          -> the check was SKIPPED (precondition absent)
- any other ``Exception``    -> the check ERRORED (transport / contract bug)

Cases share a mutable ``state`` dict so an early search can stash a real
``document_id`` for later round-trip checks against Supabase.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import httpx
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

# Status constants (kept as plain strings so they serialize cleanly to JSON).
PASS = "pass"  # noqa: S105 - status label, not a secret
FAIL = "fail"
SKIP = "skip"
ERROR = "error"

_STATUS_STYLE = {
    PASS: ("green", "PASS"),
    FAIL: ("bold red", "FAIL"),
    SKIP: ("yellow", "SKIP"),
    ERROR: ("bold magenta", "ERR "),
}


class SkipCase(Exception):
    """Raised by a case when a precondition is missing (not a failure)."""


@dataclass
class CaseContext:
    """Shared execution context handed to every case."""

    client: httpx.Client
    api_key: str
    limit_docs: int = 50
    state: dict[str, Any] = field(default_factory=dict)

    def get(self, path: str, *, auth: bool = True, **kwargs: Any) -> httpx.Response:
        return self.client.get(path, headers=self._headers(auth), **kwargs)

    def post(self, path: str, *, auth: bool = True, **kwargs: Any) -> httpx.Response:
        return self.client.post(path, headers=self._headers(auth), **kwargs)

    def _headers(self, auth: bool) -> dict[str, str]:
        return {"X-API-Key": self.api_key} if auth else {}


@dataclass
class Case:
    """A single named end-to-end check."""

    feature: str
    name: str
    description: str
    fn: Callable[[CaseContext], str | None]


@dataclass
class CheckResult:
    feature: str
    name: str
    status: str
    duration_ms: float
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status in (PASS, SKIP)


def run_cases(
    ctx: CaseContext, cases: list[Case], console: Console | None = None
) -> list[CheckResult]:
    """Run cases sequentially, capturing status, timing and message."""
    console = console or Console()
    results: list[CheckResult] = []
    for case in cases:
        t0 = time.perf_counter()
        details: dict[str, Any] = {}
        ctx.state["_details"] = details
        try:
            message = case.fn(ctx) or "ok"
            status = PASS
        except SkipCase as exc:
            status, message = SKIP, str(exc) or "skipped"
        except AssertionError as exc:
            status, message = FAIL, str(exc) or "assertion failed"
        except httpx.HTTPError as exc:
            status, message = ERROR, f"{type(exc).__name__}: {exc}"
        except Exception as exc:  # report any unexpected error as ERROR
            status, message = ERROR, f"{type(exc).__name__}: {exc}"
        finally:
            ctx.state.pop("_details", None)
        duration_ms = (time.perf_counter() - t0) * 1000
        result = CheckResult(
            feature=case.feature,
            name=case.name,
            status=status,
            duration_ms=duration_ms,
            message=message,
            details=details,
        )
        results.append(result)
        _print_live_line(console, result)
    return results


def _print_live_line(console: Console, r: CheckResult) -> None:
    style, label = _STATUS_STYLE[r.status]
    line = Text()
    line.append(f"[{label}] ", style=style)
    line.append(f"{r.feature:<16}", style="dim")
    line.append(f" {r.name:<34} ")
    line.append(f"{r.duration_ms:>6.0f}ms  ", style="cyan")
    line.append(r.message, style=style if r.status in (FAIL, ERROR) else "")
    console.print(line)


def render_report(console: Console, results: list[CheckResult], api_url: str) -> int:
    """Render a grouped summary table and overall verdict. Returns exit code."""
    table = Table(title="E2E Live — results by feature", title_style="bold")
    table.add_column("Feature", style="bold")
    table.add_column("Check")
    table.add_column("Status", justify="center")
    table.add_column("ms", justify="right", style="cyan")
    table.add_column("Detail", overflow="fold")

    last_feature = None
    for r in results:
        style, label = _STATUS_STYLE[r.status]
        feature_cell = r.feature if r.feature != last_feature else ""
        last_feature = r.feature
        table.add_row(
            feature_cell,
            r.name,
            Text(label.strip(), style=style),
            f"{r.duration_ms:.0f}",
            r.message,
        )
    console.print()
    console.print(table)

    counts = {s: sum(1 for r in results if r.status == s) for s in _STATUS_STYLE}
    total = len(results)
    failed = counts[FAIL] + counts[ERROR]
    summary = (
        f"target: {api_url}\n"
        f"total: {total}   "
        f"[green]pass: {counts[PASS]}[/]   "
        f"[bold red]fail: {counts[FAIL]}[/]   "
        f"[bold magenta]error: {counts[ERROR]}[/]   "
        f"[yellow]skip: {counts[SKIP]}[/]"
    )
    verdict_style = "bold red" if failed else "bold green"
    verdict = "VERIFICATION FAILED" if failed else "ALL CHECKS PASSED"
    console.print(
        Panel(summary, title=verdict, border_style=verdict_style, expand=False)
    )
    return 1 if failed else 0


def write_json(path: Path, results: list[CheckResult], api_url: str) -> None:
    payload = {
        "api_url": api_url,
        "summary": {s: sum(1 for r in results if r.status == s) for s in _STATUS_STYLE},
        "results": [
            {
                "feature": r.feature,
                "name": r.name,
                "status": r.status,
                "duration_ms": round(r.duration_ms, 1),
                "message": r.message,
                "details": r.details,
            }
            for r in results
        ],
    }
    path.write_text(json.dumps(payload, indent=2, default=str))
