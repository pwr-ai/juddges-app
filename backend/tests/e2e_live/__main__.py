"""CLI runner for the live e2e engine.

Usage:
    python -m tests.e2e_live                         # all checks vs localhost:8004
    python -m tests.e2e_live --url https://api.prod  # against production
    python -m tests.e2e_live --only search,documents # subset by feature
    python -m tests.e2e_live --json out.json         # also write JSON report
    python -m tests.e2e_live --list                  # list cases and exit

Config resolution (flags override env override defaults):
    --url   <- BENCHMARK_API_URL / JUDDGES_BENCHMARK_API_URL  (default localhost:8004)
    --key   <- BACKEND_API_KEY

The repo-root ``.env`` is loaded automatically so BACKEND_API_KEY is picked up.
Exit code is non-zero if any check fails or errors (CI / scripting friendly).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

from .cases import build_cases, feature_names
from .engine import CaseContext, render_report, run_cases, write_json

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_URL = "http://localhost:8004"


def _load_dotenv() -> None:
    """Best-effort load of repo-root .env without overriding the real environment."""
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path, override=False)
        return
    except ImportError:
        pass
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _flag(argv: list[str], name: str) -> str | None:
    """Read ``--name value`` or ``--name=value`` from argv (None if absent)."""
    for i, arg in enumerate(argv):
        if arg == name and i + 1 < len(argv):
            return argv[i + 1]
        if arg.startswith(name + "="):
            return arg.split("=", 1)[1]
    return None


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    console = Console()

    if "--help" in argv or "-h" in argv:
        console.print(__doc__)
        console.print(f"Known features: {', '.join(feature_names())}")
        return 0

    _load_dotenv()

    api_url = (
        _flag(argv, "--url")
        or os.getenv("BENCHMARK_API_URL")
        or os.getenv("JUDDGES_BENCHMARK_API_URL")
        or DEFAULT_URL
    ).rstrip("/")
    api_key = _flag(argv, "--key") or os.getenv("BACKEND_API_KEY", "")
    only_raw = _flag(argv, "--only")
    only = only_raw.split(",") if only_raw else None
    limit_docs = int(_flag(argv, "--limit-docs") or "50")
    json_out = _flag(argv, "--json")

    cases = build_cases(only)

    if "--list" in argv:
        table = Table(title="Live e2e cases")
        table.add_column("Feature", style="bold")
        table.add_column("Check")
        table.add_column("Description", overflow="fold")
        for c in cases:
            table.add_row(c.feature, c.name, c.description)
        console.print(table)
        return 0

    if not api_key:
        console.print(
            "[bold red]ERROR:[/] BACKEND_API_KEY not set (env or --key). "
            "Search endpoints are auth-gated and cannot be reached without it."
        )
        return 2

    if not cases:
        console.print(f"[yellow]No cases match --only={only_raw!r}.[/]")
        return 2

    console.rule("[bold]Juddges live e2e verification")
    console.print(
        f"target [cyan]{api_url}[/]   cases [cyan]{len(cases)}[/]   "
        f"limit_docs [cyan]{limit_docs}[/]"
        + (f"   only [cyan]{only_raw}[/]" if only_raw else "")
    )
    console.print()

    with httpx.Client(base_url=api_url, timeout=60.0) as client:
        ctx = CaseContext(client=client, api_key=api_key, limit_docs=limit_docs)
        results = run_cases(ctx, cases, console=console)

    exit_code = render_report(console, results, api_url)

    if json_out:
        path = Path(json_out)
        write_json(path, results, api_url)
        console.print(f"[dim]Wrote JSON report -> {path}[/]")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
