#!/usr/bin/env python3
"""
Search Performance Benchmark for Juddges App

Benchmarks search latency and relevance at 6K document scale.
Tests hybrid, keyword, and vector search modes with representative queries.

Usage:
    python scripts/benchmark_search.py                                    # defaults
    python scripts/benchmark_search.py --backend-url http://localhost:8002
    python scripts/benchmark_search.py --iterations 5 --queries-file custom_queries.json
    python scripts/benchmark_search.py --warmup 3 --output results.json

Features:
- Representative Polish and English legal queries
- Multiple search modes (hybrid, keyword, vector)
- Performance percentiles (P50, P95, P99)
- Rich console output with pass/fail assessment
- JSON export for detailed analysis
"""

import json
import os
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    import requests
    from loguru import logger
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich.table import Table
    from rich.panel import Panel
    from dotenv import load_dotenv
except ImportError as e:
    import subprocess
    print(f"Missing dependency: {e}")
    print("Installing required packages...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-q",
            "requests", "loguru", "rich", "python-dotenv"
        ])
        # Re-import after installation
        import requests
        from loguru import logger
        from rich.console import Console
        from rich.progress import Progress, SpinnerColumn, TextColumn
        from rich.table import Table
        from rich.panel import Panel
        from dotenv import load_dotenv
        print("Dependencies installed successfully.")
    except Exception as install_error:
        print(f"Error: Failed to install dependencies: {install_error}")
        print("Please manually install: pip install requests loguru rich python-dotenv")
        sys.exit(1)

# Load environment variables
load_dotenv()

console = Console()

# Default benchmark queries (representative of legal search patterns)
BENCHMARK_QUERIES = [
    # Polish legal queries
    {"query": "kredyty frankowe", "language": "pl", "category": "financial"},
    {"query": "wymiar kary", "language": "pl", "category": "criminal"},
    {"query": "prawo pracy zwolnienie", "language": "pl", "category": "labor"},
    {"query": "odszkodowanie za wypadek", "language": "pl", "category": "civil"},
    {"query": "zamówienia publiczne", "language": "pl", "category": "administrative"},
    {"query": "podatek dochodowy odliczenia", "language": "pl", "category": "tax"},
    {"query": "umowa dzierżawy rozwiązanie", "language": "pl", "category": "civil"},
    {"query": "kara pozbawienia wolności", "language": "pl", "category": "criminal"},

    # English legal queries
    {"query": "intellectual property infringement", "language": "en", "category": "ip"},
    {"query": "judicial review administrative decision", "language": "en", "category": "administrative"},
    {"query": "employment discrimination", "language": "en", "category": "labor"},
    {"query": "contract breach damages", "language": "en", "category": "civil"},
    {"query": "criminal sentencing guidelines", "language": "en", "category": "criminal"},
    {"query": "corporate liability negligence", "language": "en", "category": "commercial"},
    {"query": "human rights violation", "language": "en", "category": "constitutional"},
    {"query": "family law custody", "language": "en", "category": "family"},
]

# Search configuration variants
SEARCH_VARIANTS = [
    {
        "name": "hybrid",
        "mode": "thinking",
        "alpha": 0.5,
        "description": "Hybrid search with AI query enhancement"
    },
    {
        "name": "keyword",
        "mode": "rabbit",
        "alpha": 0.0,
        "description": "Pure keyword/BM25 search"
    },
    {
        "name": "vector",
        "mode": "rabbit",
        "alpha": 1.0,
        "description": "Pure vector/semantic search"
    }
]

# Performance targets (milliseconds)
LATENCY_TARGETS = {
    "hybrid": 300,
    "keyword": 150,
    "vector": 200,
}

class SearchBenchmark:
    """Search benchmark runner with performance analysis."""

    def __init__(
        self,
        backend_url: str,
        api_key: str,
        iterations: int = 3,
        warmup: int = 2,
    ):
        self.backend_url = backend_url.rstrip("/")
        self.api_key = api_key
        self.iterations = iterations
        self.warmup = warmup
        self.results: List[Dict[str, Any]] = []

        # Setup session with headers
        self.session = requests.Session()
        if self.api_key:
            self.session.headers.update({"X-API-Key": self.api_key})

        logger.info(f"Initializing benchmark: {self.backend_url}, iterations={iterations}")

    def _make_search_request(
        self,
        query: str,
        mode: str,
        alpha: float,
        timeout: float = 30.0
    ) -> Tuple[Dict[str, Any], float]:
        """Make a single search request and measure latency."""

        payload = {
            "query": query,
            "mode": mode,
            "alpha": alpha,
            "limit_docs": 10,
            "limit_chunks": 150,
            "include_count": False,  # Skip count for faster benchmarks
        }

        start_time = time.perf_counter()
        try:
            response = self.session.post(
                f"{self.backend_url}/documents/search",
                json=payload,
                timeout=timeout
            )
            latency_ms = (time.perf_counter() - start_time) * 1000

            if response.status_code != 200:
                logger.error(f"Search failed: {response.status_code} - {response.text}")
                return {"error": f"HTTP {response.status_code}"}, latency_ms

            result = response.json()
            return result, latency_ms

        except requests.exceptions.Timeout:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"Search timeout after {timeout}s")
            return {"error": "timeout"}, latency_ms

        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"Search error: {e}")
            return {"error": str(e)}, latency_ms

    def _run_warmup(self, queries: List[Dict[str, str]]) -> None:
        """Run warmup queries to prime the search cache."""
        if self.warmup == 0:
            return

        console.print(f"[yellow]Running {self.warmup} warmup queries...[/yellow]")

        warmup_queries = queries[:self.warmup] if len(queries) >= self.warmup else queries

        for query_info in warmup_queries:
            # Just run hybrid search for warmup
            self._make_search_request(query_info["query"], "thinking", 0.5, timeout=10.0)

    def _calculate_percentiles(self, latencies: List[float]) -> Dict[str, float]:
        """Calculate latency percentiles."""
        if not latencies:
            return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "min": 0.0, "max": 0.0, "mean": 0.0}

        sorted_latencies = sorted(latencies)
        n = len(sorted_latencies)

        return {
            "p50": sorted_latencies[int(n * 0.5)] if n > 0 else 0.0,
            "p95": sorted_latencies[int(n * 0.95)] if n > 1 else sorted_latencies[0],
            "p99": sorted_latencies[int(n * 0.99)] if n > 2 else sorted_latencies[-1],
            "min": min(sorted_latencies),
            "max": max(sorted_latencies),
            "mean": statistics.mean(sorted_latencies),
        }

    def run_benchmark(self, queries: List[Dict[str, str]]) -> Dict[str, Any]:
        """Run the complete benchmark suite."""

        # Validate backend connectivity
        try:
            health_response = self.session.get(f"{self.backend_url}/health", timeout=5.0)
            if health_response.status_code != 200:
                console.print(f"[red]Backend health check failed: {health_response.status_code}[/red]")
                return {"error": "Backend not available"}
        except Exception as e:
            console.print(f"[red]Failed to connect to backend: {e}[/red]")
            return {"error": f"Connection failed: {e}"}

        # Run warmup
        self._run_warmup(queries)

        console.print(f"\n[green]Starting benchmark with {len(queries)} queries × {len(SEARCH_VARIANTS)} variants × {self.iterations} iterations[/green]\n")

        benchmark_start = time.perf_counter()

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
            transient=True,
        ) as progress:

            total_tests = len(queries) * len(SEARCH_VARIANTS) * self.iterations
            task = progress.add_task("Running benchmark...", total=total_tests)

            for query_info in queries:
                query = query_info["query"]

                for variant in SEARCH_VARIANTS:
                    variant_name = variant["name"]
                    mode = variant["mode"]
                    alpha = variant["alpha"]

                    # Collect latencies for this query/variant combination
                    latencies = []
                    error_count = 0
                    result_counts = []

                    for iteration in range(self.iterations):
                        progress.update(task, advance=1)
                        progress.update(task, description=f"Testing: {query[:30]}... ({variant_name})")

                        result, latency = self._make_search_request(query, mode, alpha)

                        if "error" in result:
                            error_count += 1
                            logger.warning(f"Query failed: {query} ({variant_name}) - {result['error']}")
                        else:
                            latencies.append(latency)
                            # Count results (try different response structure keys)
                            result_count = 0
                            if "results" in result:
                                result_count = len(result["results"])
                            elif "documents" in result:
                                result_count = len(result["documents"])
                            result_counts.append(result_count)

                    # Calculate statistics for this query/variant
                    if latencies:
                        percentiles = self._calculate_percentiles(latencies)
                        avg_results = statistics.mean(result_counts) if result_counts else 0

                        self.results.append({
                            "query": query,
                            "query_category": query_info.get("category", "unknown"),
                            "query_language": query_info.get("language", "unknown"),
                            "search_variant": variant_name,
                            "search_mode": mode,
                            "search_alpha": alpha,
                            "description": variant["description"],
                            "iterations": len(latencies),
                            "error_count": error_count,
                            "avg_results": avg_results,
                            "latency_ms": percentiles,
                            "raw_latencies": latencies,
                        })

        total_time = time.perf_counter() - benchmark_start

        console.print(f"\n[green]Benchmark completed in {total_time:.1f}s[/green]\n")

        return self._analyze_results()

    def _analyze_results(self) -> Dict[str, Any]:
        """Analyze benchmark results and generate summary."""

        if not self.results:
            return {"error": "No results to analyze"}

        # Group results by search variant for analysis
        variant_stats = {}

        for result in self.results:
            variant = result["search_variant"]
            if variant not in variant_stats:
                variant_stats[variant] = {
                    "queries": [],
                    "total_iterations": 0,
                    "total_errors": 0,
                    "all_latencies": [],
                    "passed": 0,
                    "failed": 0,
                }

            stats = variant_stats[variant]
            stats["queries"].append(result)
            stats["total_iterations"] += result["iterations"]
            stats["total_errors"] += result["error_count"]
            stats["all_latencies"].extend(result["raw_latencies"])

            # Check if this query passed the latency target
            p95_latency = result["latency_ms"]["p95"]
            target = LATENCY_TARGETS.get(variant, 300)

            if p95_latency <= target:
                stats["passed"] += 1
            else:
                stats["failed"] += 1

        # Calculate overall statistics
        for variant, stats in variant_stats.items():
            if stats["all_latencies"]:
                stats["overall_percentiles"] = self._calculate_percentiles(stats["all_latencies"])
                stats["target_ms"] = LATENCY_TARGETS.get(variant, 300)
                stats["passes_target"] = stats["overall_percentiles"]["p95"] <= stats["target_ms"]

        return {
            "timestamp": datetime.now().isoformat(),
            "config": {
                "backend_url": self.backend_url,
                "iterations": self.iterations,
                "warmup": self.warmup,
                "total_queries": len(set(r["query"] for r in self.results)),
                "total_variants": len(SEARCH_VARIANTS),
            },
            "targets": LATENCY_TARGETS,
            "results": self.results,
            "summary": variant_stats,
        }

    def display_results(self, analysis: Dict[str, Any]) -> None:
        """Display benchmark results in Rich format."""

        if "error" in analysis:
            console.print(f"[red]Error: {analysis['error']}[/red]")
            return

        # Main results table
        table = Table(title="Search Performance Benchmark Results")
        table.add_column("Query", style="cyan", width=30)
        table.add_column("Type", style="magenta", width=10)
        table.add_column("P50", style="green", justify="right")
        table.add_column("P95", style="yellow", justify="right")
        table.add_column("P99", style="red", justify="right")
        table.add_column("Results", style="blue", justify="right")
        table.add_column("Status", style="bold", justify="center")

        for result in self.results:
            query = result["query"][:28] + "..." if len(result["query"]) > 28 else result["query"]
            variant = result["search_variant"]
            percentiles = result["latency_ms"]
            avg_results = result["avg_results"]

            # Status based on P95 vs target
            target = LATENCY_TARGETS.get(variant, 300)
            status = "✓ PASS" if percentiles["p95"] <= target else "✗ FAIL"
            status_style = "green" if percentiles["p95"] <= target else "red"

            table.add_row(
                query,
                variant,
                f"{percentiles['p50']:.0f}ms",
                f"{percentiles['p95']:.0f}ms",
                f"{percentiles['p99']:.0f}ms",
                f"{avg_results:.1f}",
                f"[{status_style}]{status}[/{status_style}]"
            )

        console.print(table)
        console.print()

        # Summary panel
        summary_text = []
        overall_pass = True

        for variant, stats in analysis["summary"].items():
            target = stats["target_ms"]
            overall = stats["overall_percentiles"]
            passed = stats["passed"]
            total = passed + stats["failed"]

            status = "PASS" if stats["passes_target"] else "FAIL"
            if not stats["passes_target"]:
                overall_pass = False

            summary_text.append(
                f"[bold]{variant.upper()}[/bold] ({stats['target_ms']}ms target): "
                f"P95={overall['p95']:.0f}ms, "
                f"{passed}/{total} queries passed - "
                f"[{'green' if status == 'PASS' else 'red'}]{status}[/]"
            )

        final_status = "✓ BENCHMARK PASSED" if overall_pass else "✗ BENCHMARK FAILED"
        final_color = "green" if overall_pass else "red"

        summary_text.append("")
        summary_text.append(f"[bold {final_color}]{final_status}[/bold {final_color}]")

        console.print(
            Panel(
                "\n".join(summary_text),
                title="Performance Summary",
                border_style="green" if overall_pass else "red"
            )
        )


def load_queries_from_file(file_path: str) -> List[Dict[str, str]]:
    """Load queries from a JSON file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Support both array of query objects and simple string arrays
        if isinstance(data, list):
            if all(isinstance(q, str) for q in data):
                # Simple string array
                return [{"query": q, "category": "custom", "language": "unknown"} for q in data]
            elif all(isinstance(q, dict) and "query" in q for q in data):
                # Array of query objects
                return data

        raise ValueError("File must contain array of query strings or query objects with 'query' field")

    except Exception as e:
        console.print(f"[red]Error loading queries from {file_path}: {e}[/red]")
        sys.exit(1)


def parse_args() -> Dict[str, Any]:
    """Parse command line arguments without argparse."""
    args = {
        "backend_url": os.getenv("BACKEND_URL", "http://localhost:8004"),
        "api_key": os.getenv("BACKEND_API_KEY", ""),
        "iterations": 3,
        "warmup": 2,
        "queries_file": None,
        "output": None,
        "help": False,
    }

    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]

        if arg in ("--help", "-h"):
            args["help"] = True
        elif arg == "--backend-url" and i + 1 < len(sys.argv):
            args["backend_url"] = sys.argv[i + 1]
            i += 1
        elif arg == "--api-key" and i + 1 < len(sys.argv):
            args["api_key"] = sys.argv[i + 1]
            i += 1
        elif arg == "--iterations" and i + 1 < len(sys.argv):
            try:
                args["iterations"] = int(sys.argv[i + 1])
                if args["iterations"] < 1:
                    raise ValueError("iterations must be >= 1")
            except ValueError as e:
                console.print(f"[red]Error: --iterations {e}[/red]")
                sys.exit(1)
            i += 1
        elif arg == "--warmup" and i + 1 < len(sys.argv):
            try:
                args["warmup"] = int(sys.argv[i + 1])
                if args["warmup"] < 0:
                    raise ValueError("warmup must be >= 0")
            except ValueError as e:
                console.print(f"[red]Error: --warmup {e}[/red]")
                sys.exit(1)
            i += 1
        elif arg == "--queries-file" and i + 1 < len(sys.argv):
            args["queries_file"] = sys.argv[i + 1]
            i += 1
        elif arg == "--output" and i + 1 < len(sys.argv):
            args["output"] = sys.argv[i + 1]
            i += 1
        else:
            console.print(f"[red]Unknown argument: {arg}[/red]")
            sys.exit(1)

        i += 1

    return args


def print_help() -> None:
    """Print help information."""
    help_text = """
Search Performance Benchmark for Juddges App

USAGE:
    python scripts/benchmark_search.py [OPTIONS]

OPTIONS:
    --backend-url URL      Backend base URL (default: $BACKEND_URL or http://localhost:8004)
    --api-key KEY         Backend API key (default: $BACKEND_API_KEY)
    --iterations N        Number of iterations per query (default: 3)
    --warmup N           Number of warmup queries (default: 2, 0 to disable)
    --queries-file FILE   Load custom queries from JSON file
    --output FILE         Save detailed results to JSON file
    -h, --help           Show this help message

EXAMPLES:
    python scripts/benchmark_search.py
    python scripts/benchmark_search.py --backend-url http://localhost:8002
    python scripts/benchmark_search.py --iterations 5 --warmup 3
    python scripts/benchmark_search.py --queries-file custom_queries.json --output results.json

QUERIES FILE FORMAT:
    [
        {"query": "contract law", "category": "civil", "language": "en"},
        {"query": "prawo umów", "category": "civil", "language": "pl"}
    ]

    Or simple array: ["contract law", "prawo umów"]

PERFORMANCE TARGETS:
    - Keyword search (BM25): < 150ms P95
    - Vector search (semantic): < 200ms P95
    - Hybrid search (enhanced): < 300ms P95
"""
    console.print(help_text)


def main() -> None:
    """Main benchmark runner."""

    # Configure loguru to be less verbose
    logger.remove()
    logger.add(sys.stderr, level="WARNING", format="<level>{level}</level>: {message}")

    args = parse_args()

    if args["help"]:
        print_help()
        return

    # Load queries
    if args["queries_file"]:
        queries = load_queries_from_file(args["queries_file"])
        console.print(f"[blue]Loaded {len(queries)} custom queries from {args['queries_file']}[/blue]")
    else:
        queries = BENCHMARK_QUERIES
        console.print(f"[blue]Using {len(queries)} default benchmark queries[/blue]")

    # Initialize and run benchmark
    benchmark = SearchBenchmark(
        backend_url=args["backend_url"],
        api_key=args["api_key"],
        iterations=args["iterations"],
        warmup=args["warmup"],
    )

    try:
        analysis = benchmark.run_benchmark(queries)
        benchmark.display_results(analysis)

        # Save detailed results if requested
        if args["output"]:
            output_path = Path(args["output"])
            output_path.parent.mkdir(parents=True, exist_ok=True)

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(analysis, f, indent=2, ensure_ascii=False)

            console.print(f"\n[green]Detailed results saved to: {output_path}[/green]")

        # Exit with error code if benchmark failed
        if "summary" in analysis:
            failed_variants = [
                variant for variant, stats in analysis["summary"].items()
                if not stats.get("passes_target", False)
            ]
            if failed_variants:
                console.print(f"\n[red]Benchmark failed for variants: {', '.join(failed_variants)}[/red]")
                sys.exit(1)
        else:
            console.print(f"\n[red]Benchmark failed: {analysis.get('error', 'Unknown error')}[/red]")
            sys.exit(1)

    except KeyboardInterrupt:
        console.print("\n[yellow]Benchmark interrupted by user[/yellow]")
        sys.exit(130)
    except Exception as e:
        console.print(f"\n[red]Benchmark failed with error: {e}[/red]")
        logger.exception("Benchmark error")
        sys.exit(1)


if __name__ == "__main__":
    main()