#!/usr/bin/env python3
"""
Search Quality Evaluation Script for Juddges App

Evaluates search quality using multiple query sources:
- Built-in seed queries covering key legal topics
- Real user search logs from JSON log files
- Cross-jurisdictional queries from previous analysis
- All sources combined

Features:
- Relevance scoring using multiple heuristics
- Latency and performance metrics
- Result diversity analysis across courts/jurisdictions
- Comparison with previous evaluation runs
- Rich console output and JSON export

Usage:
    python scripts/search_quality_eval.py                           # Use seed queries
    python scripts/search_quality_eval.py --source logs --log-file path/to/logs.jsonl
    python scripts/search_quality_eval.py --source cross-queries    # Use cross-jurisdictional queries
    python scripts/search_quality_eval.py --source all             # Combine all sources
    python scripts/search_quality_eval.py --backend-url http://localhost:8002

Requirements:
    - Backend API running with search endpoint
    - Optional: log files with "query" field per line
    - Optional: data/cross_jurisdictional_queries.json from issue #11
"""

import json
import os
import statistics
import sys
import time
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    import requests
    from loguru import logger
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
    from rich.table import Table
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
        from rich.panel import Panel
        from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
        from rich.table import Table
        from dotenv import load_dotenv
        print("Dependencies installed successfully.")
    except Exception as install_error:
        print(f"Error: Failed to install dependencies: {install_error}")
        print("Please manually install: pip install requests loguru rich python-dotenv")
        sys.exit(1)

# Load environment variables
load_dotenv()

console = Console()

# Built-in seed queries covering key Polish and UK legal topics
SEED_QUERIES = [
    # Polish legal queries
    {
        "query": "kredyty frankowe odpowiedzialność banku",
        "language": "pl",
        "expected_topics": ["financial", "banking"],
        "description": "Swiss franc loans - bank liability"
    },
    {
        "query": "wymiar kary za przestępstwo",
        "language": "pl",
        "expected_topics": ["criminal"],
        "description": "Criminal sentencing and punishment"
    },
    {
        "query": "prawo pracy zwolnienie",
        "language": "pl",
        "expected_topics": ["labor"],
        "description": "Employment law - termination"
    },
    {
        "query": "odszkodowanie za wypadek",
        "language": "pl",
        "expected_topics": ["civil", "tort"],
        "description": "Accident compensation claims"
    },
    {
        "query": "zamówienia publiczne",
        "language": "pl",
        "expected_topics": ["administrative", "procurement"],
        "description": "Public procurement law"
    },
    {
        "query": "podatek dochodowy odliczenia",
        "language": "pl",
        "expected_topics": ["tax"],
        "description": "Income tax deductions"
    },
    {
        "query": "umowa dzierżawy rozwiązanie",
        "language": "pl",
        "expected_topics": ["civil", "property"],
        "description": "Lease agreement termination"
    },
    {
        "query": "naruszenie prawa autorskiego",
        "language": "pl",
        "expected_topics": ["ip", "copyright"],
        "description": "Copyright infringement"
    },

    # English legal queries (UK jurisdiction)
    {
        "query": "intellectual property patent infringement",
        "language": "en",
        "expected_topics": ["ip"],
        "description": "Patent infringement disputes"
    },
    {
        "query": "judicial review administrative decision",
        "language": "en",
        "expected_topics": ["administrative"],
        "description": "Administrative law challenges"
    },
    {
        "query": "employment discrimination",
        "language": "en",
        "expected_topics": ["labor"],
        "description": "Workplace discrimination"
    },
    {
        "query": "contract breach damages",
        "language": "en",
        "expected_topics": ["civil", "contract"],
        "description": "Contractual breach remedies"
    },
    {
        "query": "criminal sentencing guidelines",
        "language": "en",
        "expected_topics": ["criminal"],
        "description": "Sentencing principles and guidelines"
    },
    {
        "query": "corporate liability negligence",
        "language": "en",
        "expected_topics": ["commercial", "tort"],
        "description": "Corporate negligence liability"
    },
    {
        "query": "human rights violation",
        "language": "en",
        "expected_topics": ["constitutional"],
        "description": "Human rights breaches"
    },
    {
        "query": "family law custody",
        "language": "en",
        "expected_topics": ["family"],
        "description": "Child custody arrangements"
    },
    {
        "query": "planning permission appeal",
        "language": "en",
        "expected_topics": ["planning", "administrative"],
        "description": "Planning law appeals"
    },
    {
        "query": "consumer protection",
        "language": "en",
        "expected_topics": ["consumer", "commercial"],
        "description": "Consumer rights and protection"
    },
]

# Quality thresholds for evaluation
QUALITY_THRESHOLDS = {
    "coverage": 0.85,  # 85% of queries should return results
    "min_results_avg": 3.0,  # Average 3+ results per query
    "max_latency_p95": 2000,  # 95th percentile under 2 seconds
    "diversity_min": 0.3,  # At least 30% of results should be diverse
}

class SearchQualityEvaluator:
    """Evaluates search quality across multiple query sources."""

    def __init__(
        self,
        backend_url: str,
        api_key: str,
        max_queries: int = 100,
    ):
        """
        Initialize search quality evaluator.

        Args:
            backend_url: Base URL of the backend API
            api_key: API key for backend authentication
            max_queries: Maximum queries to process per source
        """
        self.backend_url = backend_url.rstrip("/")
        self.api_key = api_key
        self.max_queries = max_queries
        self.results: List[Dict[str, Any]] = []
        self.data_dir = Path("data")
        self.data_dir.mkdir(exist_ok=True)

        # Setup session with headers
        self.session = requests.Session()
        if self.api_key:
            self.session.headers.update({"X-API-Key": self.api_key})

        logger.info(f"Initialized evaluator: {self.backend_url}, max_queries={max_queries}")

    def _check_backend_connectivity(self) -> bool:
        """Check if backend is accessible."""
        try:
            response = self.session.get(f"{self.backend_url}/health", timeout=10.0)
            if response.status_code == 200:
                logger.info("Backend health check passed")
                return True
            else:
                logger.error(f"Backend health check failed: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Failed to connect to backend: {e}")
            return False

    def _deduplicate_queries(self, queries: List[str]) -> List[str]:
        """
        Remove near-duplicate queries using string similarity.

        Args:
            queries: List of query strings

        Returns:
            Deduplicated list of queries
        """
        if not queries:
            return []

        deduplicated = []
        similarity_threshold = 0.8

        for query in queries:
            is_duplicate = False
            for existing in deduplicated:
                similarity = SequenceMatcher(None, query.lower(), existing.lower()).ratio()
                if similarity >= similarity_threshold:
                    is_duplicate = True
                    break

            if not is_duplicate:
                deduplicated.append(query)

        removed_count = len(queries) - len(deduplicated)
        if removed_count > 0:
            logger.info(f"Removed {removed_count} near-duplicate queries")

        return deduplicated

    def load_seed_queries(self) -> List[Dict[str, Any]]:
        """Load built-in seed queries."""
        logger.info(f"Loading {len(SEED_QUERIES)} seed queries")
        return SEED_QUERIES.copy()

    def load_log_queries(self, log_file_path: str) -> List[Dict[str, Any]]:
        """
        Load queries from JSON log file.

        Args:
            log_file_path: Path to log file (JSONL format)

        Returns:
            List of query dictionaries
        """
        if not Path(log_file_path).exists():
            raise FileNotFoundError(f"Log file not found: {log_file_path}")

        queries = []

        try:
            with open(log_file_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue

                    try:
                        log_entry = json.loads(line)
                        if "query" in log_entry and log_entry["query"].strip():
                            queries.append(log_entry["query"].strip())
                    except json.JSONDecodeError as e:
                        logger.warning(f"Invalid JSON at line {line_num}: {e}")
                        continue

        except Exception as e:
            raise ValueError(f"Error reading log file: {e}")

        # Deduplicate and limit
        queries = self._deduplicate_queries(queries)
        if len(queries) > self.max_queries:
            queries = queries[:self.max_queries]
            logger.info(f"Sampled {self.max_queries} queries from {len(queries)} available")

        # Convert to query objects
        query_objects = []
        for query in queries:
            query_objects.append({
                "query": query,
                "language": "unknown",
                "expected_topics": [],
                "description": "User query from logs",
                "source": "logs"
            })

        logger.info(f"Loaded {len(query_objects)} queries from log file")
        return query_objects

    def load_cross_queries(self) -> List[Dict[str, Any]]:
        """Load cross-jurisdictional queries from data/cross_jurisdictional_queries.json."""
        cross_file = self.data_dir / "cross_jurisdictional_queries.json"

        if not cross_file.exists():
            raise FileNotFoundError(
                f"Cross-jurisdictional queries file not found: {cross_file}\n"
                f"Please run 'python scripts/generate_cross_queries.py' first"
            )

        try:
            with open(cross_file, 'r', encoding='utf-8') as f:
                cross_data = json.load(f)

            query_objects = []
            cross_queries = cross_data.get("queries", [])

            for item in cross_queries:
                # Add Polish queries
                for pl_query in item.get("queries_pl", []):
                    query_objects.append({
                        "query": pl_query,
                        "language": "pl",
                        "expected_topics": [item.get("uk_category", "").lower()],
                        "description": f"Polish query for: {item.get('uk_topic_label', '')}",
                        "source": "cross-jurisdictional",
                        "confidence": item.get("coverage_confidence", "unknown")
                    })

                # Add English queries
                for en_query in item.get("queries_en", []):
                    query_objects.append({
                        "query": en_query,
                        "language": "en",
                        "expected_topics": [item.get("uk_category", "").lower()],
                        "description": f"English query for: {item.get('uk_topic_label', '')}",
                        "source": "cross-jurisdictional",
                        "confidence": item.get("coverage_confidence", "unknown")
                    })

            # Limit if needed
            if len(query_objects) > self.max_queries:
                query_objects = query_objects[:self.max_queries]
                logger.info(f"Sampled {self.max_queries} cross-queries from {len(query_objects)} available")

            logger.info(f"Loaded {len(query_objects)} cross-jurisdictional queries")
            return query_objects

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in cross-queries file: {e}")
        except Exception as e:
            raise ValueError(f"Error loading cross-queries: {e}")

    def _make_search_request(self, query: str) -> Tuple[Dict[str, Any], float]:
        """
        Make a single search request and measure latency.

        Args:
            query: Search query string

        Returns:
            Tuple of (response_data, latency_ms)
        """
        payload = {
            "query": query,
            "limit_docs": 20,  # Get more docs for diversity analysis
            "limit_chunks": 100,  # Minimum required by API
            "mode": "thinking",  # Use hybrid search
            "alpha": 0.5,  # Balanced hybrid
            "fetch_full_documents": True,
        }

        start_time = time.perf_counter()
        try:
            response = self.session.post(
                f"{self.backend_url}/documents/search",
                json=payload,
                timeout=30.0
            )
            latency_ms = (time.perf_counter() - start_time) * 1000

            if response.status_code != 200:
                logger.error(f"Search failed: {response.status_code} - {response.text}")
                return {"error": f"HTTP {response.status_code}"}, latency_ms

            result = response.json()
            return result, latency_ms

        except requests.exceptions.Timeout:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"Search timeout for query: {query}")
            return {"error": "timeout"}, latency_ms

        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"Search error for query '{query}': {e}")
            return {"error": str(e)}, latency_ms

    def _calculate_relevance_score(
        self,
        query: str,
        documents: List[Dict[str, Any]]
    ) -> float:
        """
        Calculate relevance score based on query term presence in results.

        Args:
            query: Original search query
            documents: List of document results

        Returns:
            Relevance score between 0.0 and 1.0
        """
        if not documents:
            return 0.0

        # Extract meaningful query terms (remove common stopwords)
        stopwords = {
            "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
            "i", "w", "z", "na", "do", "nie", "się", "jest", "za", "od", "że", "jak", "ale"
        }

        query_terms = [
            term.lower() for term in query.split()
            if len(term) > 2 and term.lower() not in stopwords
        ]

        if not query_terms:
            return 0.5  # Neutral score for queries without meaningful terms

        relevance_scores = []

        for doc in documents:
            # Check title, summary, and content fields
            text_fields = []
            if isinstance(doc, dict):
                text_fields.extend([
                    doc.get("title", ""),
                    doc.get("summary", ""),
                    doc.get("content", ""),
                    doc.get("case_name", ""),
                    doc.get("description", "")
                ])

            combined_text = " ".join(text_fields).lower()

            # Calculate term match ratio
            matched_terms = sum(1 for term in query_terms if term in combined_text)
            term_ratio = matched_terms / len(query_terms) if query_terms else 0

            relevance_scores.append(term_ratio)

        # Return average relevance across all results
        return statistics.mean(relevance_scores) if relevance_scores else 0.0

    def _calculate_diversity_score(self, documents: List[Dict[str, Any]]) -> float:
        """
        Calculate diversity score based on unique courts/jurisdictions.

        Args:
            documents: List of document results

        Returns:
            Diversity score between 0.0 and 1.0
        """
        if not documents:
            return 0.0

        # Extract unique sources
        courts: Set[str] = set()
        jurisdictions: Set[str] = set()

        for doc in documents:
            if isinstance(doc, dict):
                # Court identifiers
                court = doc.get("court", "")
                issuing_body = doc.get("issuing_body", "")
                if court:
                    courts.add(court.lower())
                if issuing_body:
                    courts.add(issuing_body.lower())

                # Jurisdiction identifiers
                jurisdiction = doc.get("jurisdiction", "")
                country = doc.get("country", "")
                if jurisdiction:
                    jurisdictions.add(jurisdiction.lower())
                if country:
                    jurisdictions.add(country.lower())

        # Calculate diversity ratio
        total_docs = len(documents)
        unique_courts = len(courts)
        unique_jurisdictions = len(jurisdictions)

        # Combine court and jurisdiction diversity
        court_diversity = min(unique_courts / total_docs, 1.0) if total_docs > 0 else 0.0
        jurisdiction_diversity = min(unique_jurisdictions / total_docs, 1.0) if total_docs > 0 else 0.0

        # Weight equally
        return (court_diversity + jurisdiction_diversity) / 2.0

    def _evaluate_single_query(self, query_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate a single query and return metrics.

        Args:
            query_info: Query dictionary with metadata

        Returns:
            Evaluation result dictionary
        """
        query = query_info["query"]

        # Make search request
        response, latency_ms = self._make_search_request(query)

        if "error" in response:
            return {
                "query": query,
                "query_info": query_info,
                "success": False,
                "error": response["error"],
                "latency_ms": latency_ms,
                "result_count": 0,
                "relevance_score": 0.0,
                "diversity_score": 0.0,
            }

        # Extract results
        documents = response.get("documents", [])
        chunks = response.get("chunks", [])
        result_count = len(documents)

        # Calculate metrics
        relevance_score = self._calculate_relevance_score(query, documents)
        diversity_score = self._calculate_diversity_score(documents)

        return {
            "query": query,
            "query_info": query_info,
            "success": True,
            "latency_ms": latency_ms,
            "result_count": result_count,
            "relevance_score": relevance_score,
            "diversity_score": diversity_score,
            "total_chunks": response.get("total_chunks", 0),
            "query_time_ms": response.get("query_time_ms", 0),
        }

    def evaluate_queries(self, queries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Evaluate a list of queries and return aggregate metrics.

        Args:
            queries: List of query dictionaries

        Returns:
            Evaluation summary with metrics
        """
        if not self._check_backend_connectivity():
            return {"error": "Backend not accessible"}

        console.print(f"\n[green]Evaluating {len(queries)} queries...[/green]\n")

        evaluation_results = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=console,
            transient=True,
        ) as progress:

            task = progress.add_task("Evaluating queries...", total=len(queries))

            for query_info in queries:
                progress.update(task, description=f"Searching: {query_info['query'][:50]}...")

                result = self._evaluate_single_query(query_info)
                evaluation_results.append(result)

                progress.advance(task)

        # Calculate aggregate metrics
        successful_queries = [r for r in evaluation_results if r["success"]]
        failed_queries = [r for r in evaluation_results if not r["success"]]

        if not evaluation_results:
            return {"error": "No queries evaluated"}

        # Coverage metrics
        total_queries = len(evaluation_results)
        successful_count = len(successful_queries)
        coverage = successful_count / total_queries if total_queries > 0 else 0.0

        # Performance metrics
        if successful_queries:
            latencies = [r["latency_ms"] for r in successful_queries]
            result_counts = [r["result_count"] for r in successful_queries]
            relevance_scores = [r["relevance_score"] for r in successful_queries]
            diversity_scores = [r["diversity_score"] for r in successful_queries]

            # Calculate percentiles
            sorted_latencies = sorted(latencies)
            n = len(sorted_latencies)
            latency_metrics = {
                "mean": statistics.mean(latencies),
                "median": statistics.median(latencies),
                "p95": sorted_latencies[int(n * 0.95)] if n > 0 else 0,
                "p99": sorted_latencies[int(n * 0.99)] if n > 0 else 0,
                "min": min(latencies),
                "max": max(latencies),
            }

            quality_metrics = {
                "mean_results_per_query": statistics.mean(result_counts),
                "median_results_per_query": statistics.median(result_counts),
                "mean_relevance_score": statistics.mean(relevance_scores),
                "mean_diversity_score": statistics.mean(diversity_scores),
                "queries_with_results": sum(1 for count in result_counts if count > 0),
                "queries_with_no_results": sum(1 for count in result_counts if count == 0),
            }
        else:
            latency_metrics = {}
            quality_metrics = {}

        # Quality assessment
        quality_pass = self._assess_quality(coverage, latency_metrics, quality_metrics)

        return {
            "timestamp": datetime.now().isoformat(),
            "total_queries": total_queries,
            "successful_queries": successful_count,
            "failed_queries": len(failed_queries),
            "coverage": coverage,
            "latency_metrics": latency_metrics,
            "quality_metrics": quality_metrics,
            "quality_thresholds": QUALITY_THRESHOLDS,
            "quality_assessment": quality_pass,
            "detailed_results": evaluation_results,
            "error_summary": self._summarize_errors(failed_queries),
        }

    def _assess_quality(
        self,
        coverage: float,
        latency_metrics: Dict[str, float],
        quality_metrics: Dict[str, float]
    ) -> Dict[str, bool]:
        """Assess whether quality thresholds are met."""
        assessment = {}

        # Coverage check
        assessment["coverage_pass"] = coverage >= QUALITY_THRESHOLDS["coverage"]

        # Latency check
        if latency_metrics and "p95" in latency_metrics:
            assessment["latency_pass"] = latency_metrics["p95"] <= QUALITY_THRESHOLDS["max_latency_p95"]
        else:
            assessment["latency_pass"] = False

        # Results quantity check
        if quality_metrics and "mean_results_per_query" in quality_metrics:
            assessment["results_pass"] = quality_metrics["mean_results_per_query"] >= QUALITY_THRESHOLDS["min_results_avg"]
        else:
            assessment["results_pass"] = False

        # Diversity check
        if quality_metrics and "mean_diversity_score" in quality_metrics:
            assessment["diversity_pass"] = quality_metrics["mean_diversity_score"] >= QUALITY_THRESHOLDS["diversity_min"]
        else:
            assessment["diversity_pass"] = False

        # Overall assessment
        assessment["overall_pass"] = all([
            assessment["coverage_pass"],
            assessment["latency_pass"],
            assessment["results_pass"],
            assessment["diversity_pass"]
        ])

        return assessment

    def _summarize_errors(self, failed_queries: List[Dict[str, Any]]) -> Dict[str, int]:
        """Summarize error types from failed queries."""
        error_counts = {}
        for query in failed_queries:
            error_type = query.get("error", "unknown")
            error_counts[error_type] = error_counts.get(error_type, 0) + 1
        return error_counts

    def display_results(self, evaluation: Dict[str, Any]) -> None:
        """Display evaluation results using Rich formatting."""
        if "error" in evaluation:
            console.print(f"[red]Evaluation error: {evaluation['error']}[/red]")
            return

        # Summary panel
        summary_text = self._build_summary_text(evaluation)
        console.print(Panel(summary_text, title="🔍 Search Quality Evaluation Summary", border_style="blue"))

        # Detailed metrics table
        self._display_metrics_table(evaluation)

        # Quality assessment
        self._display_quality_assessment(evaluation)

        # Sample results (if available)
        if evaluation.get("detailed_results"):
            self._display_sample_results(evaluation["detailed_results"][:10])

    def _build_summary_text(self, evaluation: Dict[str, Any]) -> str:
        """Build summary text for the panel."""
        metrics = evaluation.get("quality_metrics", {})
        latency = evaluation.get("latency_metrics", {})

        return f"""
[bold]Query Execution Summary[/bold]

📊 [cyan]Coverage Metrics[/cyan]
   • Total queries evaluated: [green]{evaluation['total_queries']:,}[/green]
   • Successful queries: [green]{evaluation['successful_queries']:,}[/green]
   • Failed queries: [red]{evaluation['failed_queries']:,}[/red]
   • Success rate: [{"green" if evaluation['coverage'] >= QUALITY_THRESHOLDS['coverage'] else "red"}]{evaluation['coverage']:.1%}[/]

⚡ [cyan]Performance Metrics[/cyan]
   • Mean latency: [blue]{latency.get('mean', 0):.0f}ms[/blue]
   • P95 latency: [{"green" if latency.get('p95', float('inf')) <= QUALITY_THRESHOLDS['max_latency_p95'] else "red"}]{latency.get('p95', 0):.0f}ms[/]
   • P99 latency: [blue]{latency.get('p99', 0):.0f}ms[/blue]

📈 [cyan]Quality Metrics[/cyan]
   • Avg results per query: [{"green" if metrics.get('mean_results_per_query', 0) >= QUALITY_THRESHOLDS['min_results_avg'] else "red"}]{metrics.get('mean_results_per_query', 0):.1f}[/]
   • Mean relevance score: [blue]{metrics.get('mean_relevance_score', 0):.2f}[/blue]
   • Mean diversity score: [{"green" if metrics.get('mean_diversity_score', 0) >= QUALITY_THRESHOLDS['diversity_min'] else "red"}]{metrics.get('mean_diversity_score', 0):.2f}[/]
"""

    def _display_metrics_table(self, evaluation: Dict[str, Any]) -> None:
        """Display detailed metrics in a table."""
        table = Table(title="📈 Detailed Performance Metrics")
        table.add_column("Metric", style="cyan", width=30)
        table.add_column("Value", style="green", justify="right")
        table.add_column("Threshold", style="yellow", justify="right")
        table.add_column("Status", style="bold", justify="center")

        metrics = evaluation.get("quality_metrics", {})
        latency = evaluation.get("latency_metrics", {})
        assessment = evaluation.get("quality_assessment", {})

        # Add rows
        rows = [
            ("Coverage Rate", f"{evaluation['coverage']:.1%}", f"{QUALITY_THRESHOLDS['coverage']:.1%}", assessment.get("coverage_pass", False)),
            ("P95 Latency (ms)", f"{latency.get('p95', 0):.0f}", f"{QUALITY_THRESHOLDS['max_latency_p95']:.0f}", assessment.get("latency_pass", False)),
            ("Avg Results/Query", f"{metrics.get('mean_results_per_query', 0):.1f}", f"{QUALITY_THRESHOLDS['min_results_avg']:.1f}", assessment.get("results_pass", False)),
            ("Diversity Score", f"{metrics.get('mean_diversity_score', 0):.2f}", f"{QUALITY_THRESHOLDS['diversity_min']:.2f}", assessment.get("diversity_pass", False)),
        ]

        for metric, value, threshold, passed in rows:
            status = "✓ PASS" if passed else "✗ FAIL"
            status_style = "green" if passed else "red"
            table.add_row(metric, value, threshold, f"[{status_style}]{status}[/{status_style}]")

        console.print(table)

    def _display_quality_assessment(self, evaluation: Dict[str, Any]) -> None:
        """Display overall quality assessment."""
        assessment = evaluation.get("quality_assessment", {})
        overall_pass = assessment.get("overall_pass", False)

        status_text = "[bold green]✓ QUALITY TARGETS MET[/bold green]" if overall_pass else "[bold red]✗ QUALITY TARGETS NOT MET[/bold red]"
        border_style = "green" if overall_pass else "red"

        console.print(f"\n{Panel(status_text, border_style=border_style)}")

    def _display_sample_results(self, sample_results: List[Dict[str, Any]]) -> None:
        """Display sample query results."""
        console.print("\n[bold]📋 Sample Query Results[/bold]")

        table = Table()
        table.add_column("Query", style="cyan", width=35)
        table.add_column("Results", style="green", justify="right")
        table.add_column("Latency", style="blue", justify="right")
        table.add_column("Relevance", style="yellow", justify="right")
        table.add_column("Status", style="bold", justify="center")

        for result in sample_results:
            query = result["query"][:32] + "..." if len(result["query"]) > 32 else result["query"]

            if result["success"]:
                results_count = str(result["result_count"])
                latency = f"{result['latency_ms']:.0f}ms"
                relevance = f"{result['relevance_score']:.2f}"
                status = "[green]✓[/green]"
            else:
                results_count = "0"
                latency = f"{result['latency_ms']:.0f}ms"
                relevance = "0.00"
                status = f"[red]✗ {result.get('error', 'error')}[/red]"

            table.add_row(query, results_count, latency, relevance, status)

        console.print(table)

    def save_results(self, evaluation: Dict[str, Any], source: str) -> Path:
        """
        Save evaluation results to JSON file.

        Args:
            evaluation: Evaluation results dictionary
            source: Query source name for filename

        Returns:
            Path to saved file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"search_quality_results_{source}_{timestamp}.json"
        output_path = self.data_dir / filename

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(evaluation, f, indent=2, ensure_ascii=False)

        logger.info(f"Results saved to {output_path}")
        return output_path

    def load_previous_results(self, source: str) -> Optional[Dict[str, Any]]:
        """
        Load most recent previous results for comparison.

        Args:
            source: Query source name

        Returns:
            Previous results dictionary or None if not found
        """
        pattern = f"search_quality_results_{source}_*.json"
        matching_files = list(self.data_dir.glob(pattern))

        if not matching_files:
            return None

        # Get most recent file
        latest_file = max(matching_files, key=lambda p: p.stat().st_mtime)

        try:
            with open(latest_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load previous results from {latest_file}: {e}")
            return None

    def compare_with_previous(
        self,
        current: Dict[str, Any],
        previous: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compare current results with previous run."""
        comparison = {}

        # Compare key metrics
        metrics_to_compare = [
            ("coverage", "coverage"),
            ("latency_metrics.p95", "p95_latency"),
            ("quality_metrics.mean_results_per_query", "avg_results"),
            ("quality_metrics.mean_relevance_score", "relevance"),
            ("quality_metrics.mean_diversity_score", "diversity"),
        ]

        for current_path, comparison_key in metrics_to_compare:
            # Extract values using path notation
            current_value = self._get_nested_value(current, current_path)
            previous_value = self._get_nested_value(previous, current_path)

            if current_value is not None and previous_value is not None:
                delta = current_value - previous_value
                delta_percent = (delta / previous_value * 100) if previous_value != 0 else 0

                comparison[comparison_key] = {
                    "current": current_value,
                    "previous": previous_value,
                    "delta": delta,
                    "delta_percent": delta_percent,
                    "improved": delta >= 0 if comparison_key != "p95_latency" else delta <= 0  # Lower latency is better
                }

        return comparison

    def _get_nested_value(self, data: Dict[str, Any], path: str) -> Optional[float]:
        """Get nested dictionary value using dot notation."""
        keys = path.split('.')
        value = data

        try:
            for key in keys:
                value = value[key]
            return value
        except (KeyError, TypeError):
            return None

    def display_comparison(self, comparison: Dict[str, Any]) -> None:
        """Display comparison with previous results."""
        console.print("\n[bold]📊 Comparison with Previous Run[/bold]")

        table = Table()
        table.add_column("Metric", style="cyan")
        table.add_column("Previous", style="dim", justify="right")
        table.add_column("Current", style="green", justify="right")
        table.add_column("Change", style="bold", justify="right")
        table.add_column("Status", style="bold", justify="center")

        metric_names = {
            "coverage": "Coverage Rate",
            "p95_latency": "P95 Latency (ms)",
            "avg_results": "Avg Results/Query",
            "relevance": "Relevance Score",
            "diversity": "Diversity Score",
        }

        for key, name in metric_names.items():
            if key in comparison:
                data = comparison[key]
                previous = data["previous"]
                current = data["current"]
                delta_percent = data["delta_percent"]
                improved = data["improved"]

                # Format values based on type
                if key == "coverage":
                    prev_str = f"{previous:.1%}"
                    curr_str = f"{current:.1%}"
                elif key == "p95_latency":
                    prev_str = f"{previous:.0f}ms"
                    curr_str = f"{current:.0f}ms"
                else:
                    prev_str = f"{previous:.2f}"
                    curr_str = f"{current:.2f}"

                # Format change
                if delta_percent > 0:
                    change_str = f"+{delta_percent:.1f}%"
                elif delta_percent < 0:
                    change_str = f"{delta_percent:.1f}%"
                else:
                    change_str = "0.0%"

                # Status
                if improved:
                    status = "[green]↗ Better[/green]"
                elif abs(delta_percent) < 1.0:  # Less than 1% change
                    status = "[yellow]→ Same[/yellow]"
                else:
                    status = "[red]↘ Worse[/red]"

                table.add_row(name, prev_str, curr_str, change_str, status)

        console.print(table)


def parse_args() -> Dict[str, Any]:
    """Parse command line arguments manually (no argparse/click)."""
    args = {
        "source": "seeds",  # Default to seed queries
        "log_file": None,
        "backend_url": os.getenv("BACKEND_URL", "http://localhost:8004"),
        "api_key": os.getenv("BACKEND_API_KEY", ""),
        "max_queries": 100,
        "output": None,
        "help": False,
    }

    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]

        if arg in ("--help", "-h"):
            args["help"] = True
        elif arg == "--source" and i + 1 < len(sys.argv):
            valid_sources = ["seeds", "logs", "cross-queries", "all"]
            source = sys.argv[i + 1]
            if source not in valid_sources:
                console.print(f"[red]Error: --source must be one of: {', '.join(valid_sources)}[/red]")
                sys.exit(1)
            args["source"] = source
            i += 1
        elif arg == "--log-file" and i + 1 < len(sys.argv):
            args["log_file"] = sys.argv[i + 1]
            i += 1
        elif arg == "--backend-url" and i + 1 < len(sys.argv):
            args["backend_url"] = sys.argv[i + 1]
            i += 1
        elif arg == "--api-key" and i + 1 < len(sys.argv):
            args["api_key"] = sys.argv[i + 1]
            i += 1
        elif arg == "--max-queries" and i + 1 < len(sys.argv):
            try:
                args["max_queries"] = int(sys.argv[i + 1])
                if args["max_queries"] < 1:
                    raise ValueError("max-queries must be >= 1")
            except ValueError as e:
                console.print(f"[red]Error: --max-queries {e}[/red]")
                sys.exit(1)
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
🔍 Search Quality Evaluation Script for Juddges App

USAGE:
    python scripts/search_quality_eval.py [OPTIONS]

OPTIONS:
    --source SOURCE        Query source: seeds, logs, cross-queries, all (default: seeds)
    --log-file FILE        Path to JSON log file (required for --source logs)
    --backend-url URL      Backend API base URL (default: $BACKEND_URL or http://localhost:8004)
    --api-key KEY         API key for backend auth (default: $BACKEND_API_KEY)
    --max-queries N       Maximum queries per source (default: 100)
    --output FILE         Save results to specific file path
    -h, --help           Show this help

QUERY SOURCES:
    seeds              Built-in seed queries covering key legal topics
    logs               Real user queries from JSON log file (one query per line)
    cross-queries      Cross-jurisdictional queries from data/cross_jurisdictional_queries.json
    all                Combine all available sources

EXAMPLES:
    python scripts/search_quality_eval.py
    python scripts/search_quality_eval.py --source logs --log-file user_queries.jsonl
    python scripts/search_quality_eval.py --source cross-queries --max-queries 50
    python scripts/search_quality_eval.py --source all --backend-url http://localhost:8002

LOG FILE FORMAT (JSONL):
    {"query": "kredyty frankowe", "timestamp": "2024-01-01T10:00:00Z"}
    {"query": "patent infringement", "user": "user123"}
    {"query": "umowa dzierżawy"}

QUALITY THRESHOLDS:
    • Coverage: 85% of queries return results
    • Latency P95: ≤ 2000ms
    • Avg results: ≥ 3.0 per query
    • Diversity: ≥ 0.3 (30% unique courts/jurisdictions)

OUTPUT:
    • Rich console display with metrics and assessment
    • JSON export with detailed results and timing breakdown
    • Comparison with previous runs (if available)
"""
    console.print(help_text)


def main() -> None:
    """Main entry point for search quality evaluation."""

    # Configure logging
    logger.remove()
    logger.add(sys.stderr, level="WARNING", format="<level>{level}</level>: {message}")

    # Parse arguments
    args = parse_args()

    if args["help"]:
        print_help()
        return

    # Validate source-specific requirements
    if args["source"] == "logs" and not args["log_file"]:
        console.print("[red]Error: --log-file is required when using --source logs[/red]")
        sys.exit(1)

    # Initialize evaluator
    evaluator = SearchQualityEvaluator(
        backend_url=args["backend_url"],
        api_key=args["api_key"],
        max_queries=args["max_queries"]
    )

    try:
        all_queries = []
        source_info = []

        # Load queries based on source
        if args["source"] in ["seeds", "all"]:
            seed_queries = evaluator.load_seed_queries()
            all_queries.extend(seed_queries)
            source_info.append(f"seeds: {len(seed_queries)}")

        if args["source"] in ["logs", "all"]:
            if args["log_file"]:
                log_queries = evaluator.load_log_queries(args["log_file"])
                all_queries.extend(log_queries)
                source_info.append(f"logs: {len(log_queries)}")
            elif args["source"] == "all":
                console.print("[yellow]Warning: Skipping log queries (no --log-file provided)[/yellow]")

        if args["source"] in ["cross-queries", "all"]:
            try:
                cross_queries = evaluator.load_cross_queries()
                all_queries.extend(cross_queries)
                source_info.append(f"cross-queries: {len(cross_queries)}")
            except FileNotFoundError as e:
                if args["source"] == "cross-queries":
                    console.print(f"[red]Error: {e}[/red]")
                    sys.exit(1)
                else:
                    console.print(f"[yellow]Warning: Skipping cross-queries: {e}[/yellow]")

        if not all_queries:
            console.print("[red]Error: No queries loaded[/red]")
            sys.exit(1)

        console.print(f"[blue]Loaded queries from sources: {', '.join(source_info)}[/blue]")

        # Run evaluation
        evaluation = evaluator.evaluate_queries(all_queries)

        if "error" in evaluation:
            console.print(f"[red]Evaluation failed: {evaluation['error']}[/red]")
            sys.exit(1)

        # Display results
        evaluator.display_results(evaluation)

        # Load and compare with previous results
        previous_results = evaluator.load_previous_results(args["source"])
        if previous_results:
            comparison = evaluator.compare_with_previous(evaluation, previous_results)
            evaluator.display_comparison(comparison)
        else:
            console.print("\n[dim]No previous results found for comparison[/dim]")

        # Save results
        if args["output"]:
            output_path = Path(args["output"])
        else:
            output_path = evaluator.save_results(evaluation, args["source"])

        console.print(f"\n[green]✅ Evaluation complete! Results saved to: {output_path}[/green]")

        # Exit with error if quality targets not met
        assessment = evaluation.get("quality_assessment", {})
        if not assessment.get("overall_pass", False):
            console.print("[yellow]⚠️  Quality thresholds not met[/yellow]")
            sys.exit(1)

    except KeyboardInterrupt:
        console.print("\n[yellow]Evaluation interrupted by user[/yellow]")
        sys.exit(130)
    except Exception as e:
        console.print(f"\n[red]Evaluation failed: {e}[/red]")
        logger.exception("Evaluation error")
        sys.exit(1)


if __name__ == "__main__":
    main()