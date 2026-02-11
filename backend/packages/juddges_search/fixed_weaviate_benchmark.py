#!/usr/bin/env python3
"""
Fixed Weaviate Query Performance Benchmark Suite

This version works around the transformer service dependency by using local embeddings
for vector search and focuses on BM25 search for reliable performance testing.
"""

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median, stdev
from typing import Dict, List, Tuple, Any, Optional

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

from juddges_search.db.weaviate_db import WeaviateLegalDatabase
from juddges_search.retrieval.weaviate_search import search_chunks_term
from juddges_search.embeddings import embed_texts

# Load environment variables
load_dotenv()

console = Console()

# Test queries for BM25 search (these work reliably)
BM25_QUERIES = [
    "PIT-37",
    "CIT-8", 
    "VAT-7",
    "ZUS DRA",
    "Art. 27 ust. 1",
    "§ 15 rozporządzenia",
    "ustawa z dnia 26 lipca 1991",
    "Dz.U. 2021 poz. 1540",
    "WSA w Warszawie",
    "NSA sygn. akt II FSK",
    "interpretacja indywidualna",
    "decyzja nr 0114-KDIP3-1.4010",
    "podatek dochodowy",
    "rozliczenie roczne",
    "ulgi podatkowe",
    "koszty uzyskania przychodu",
    "zwolnienia podatkowe",
    "ewidencja księgowa",
    "składki ubezpieczeniowe",
    "kontrola skarbowa"
]

# Additional vector queries for local embedding testing
VECTOR_QUERIES = [
    "podatek dochodowy od osób fizycznych",
    "rozliczenie roczne PIT",
    "ulgi podatkowe dla rodzin",
    "koszty uzyskania przychodu",
    "zwolnienia z podatku dochodowego",
    "podatek VAT od usług",
    "ewidencja księgowa przychodów",
    "składki na ubezpieczenia społeczne",
    "odliczenia od podstawy opodatkowania",
    "procedury kontroli skarbowej"
]

class PerformanceResult:
    def __init__(self, query_type: str, query: str, latency: float, results_count: int, error: Optional[str] = None):
        self.query_type = query_type
        self.query = query
        self.latency = latency
        self.results_count = results_count
        self.error = error
        self.timestamp = datetime.now(timezone.utc).isoformat()

class FixedWeaviateBenchmarkSuite:
    def __init__(self):
        self.results: List[PerformanceResult] = []
        self.db_manager: Optional[WeaviateLegalDatabase] = None

    async def setup(self) -> None:
        """Setup database connection"""
        self.db_manager = WeaviateLegalDatabase()

    async def teardown(self) -> None:
        """Clean up database connection"""
        if self.db_manager:
            await self.db_manager.close()

    async def measure_query_latency(self, query_func, *args, **kwargs) -> Tuple[float, Optional[Any], Optional[str]]:
        """Measure latency of a query function"""
        start_time = time.perf_counter()
        error_msg = None
        result = None
        
        try:
            result = await query_func(*args, **kwargs)
        except Exception as e:
            error_msg = str(e)
        
        end_time = time.perf_counter()
        latency = end_time - start_time
        
        return latency, result, error_msg

    async def run_bm25_search_tests(self, limit_queries: Optional[int] = None) -> None:
        """Run BM25 search performance tests"""
        console.print("\n[yellow]Running BM25 Search Tests...[/yellow]")
        
        queries = BM25_QUERIES[:limit_queries] if limit_queries else BM25_QUERIES
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("BM25 search tests", total=len(queries))
            
            for query in queries:
                latency, result, error = await self.measure_query_latency(
                    search_chunks_term,
                    query,
                    max_chunks=10
                )
                
                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("bm25", query, latency, results_count, error))
                
                progress.advance(task)

    async def run_local_vector_search_tests(self, limit_queries: Optional[int] = None) -> None:
        """Run vector search tests using local embeddings and direct similarity"""
        console.print("\n[blue]Running Local Vector Search Tests...[/blue]")
        
        queries = VECTOR_QUERIES[:limit_queries] if limit_queries else VECTOR_QUERIES
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task("Local vector search tests", total=len(queries))
            
            for query in queries:
                latency, result, error = await self.measure_query_latency(
                    self._local_vector_search,
                    query,
                    max_chunks=10
                )
                
                results_count = len(result) if result and not error else 0
                self.results.append(PerformanceResult("vector_local", query, latency, results_count, error))
                
                progress.advance(task)

    async def _local_vector_search(self, query: str, max_chunks: int = 10) -> List[Dict]:
        """
        Perform vector search using local embeddings and direct database queries
        This bypasses the need for external transformer services
        """
        try:
            # Generate query embedding locally
            query_vector = embed_texts(query)
            
            async with WeaviateLegalDatabase() as db:
                # Use near_vector instead of near_text to provide our own vectors
                response = await db.document_chunks_collection.query.near_vector(
                    near_vector=query_vector,
                    limit=max_chunks,
                    return_metadata=["score", "distance"],
                )
                
                # Convert to simple dict format for consistency
                results = []
                for obj in response.objects:
                    results.append({
                        "document_id": obj.properties.get("document_id", ""),
                        "chunk_text": obj.properties.get("chunk_text", "")[:100] + "...",
                        "score": getattr(obj.metadata, "score", 0.0),
                        "distance": getattr(obj.metadata, "distance", 1.0),
                    })
                
                return results
                
        except Exception as e:
            raise Exception(f"Local vector search failed: {str(e)}")

    def aggregate_results(self) -> Dict[str, Dict[str, float]]:
        """Aggregate performance results by query type"""
        aggregated = {}
        
        for query_type in ["bm25", "vector_local"]:
            type_results = [r for r in self.results if r.query_type == query_type and not r.error]
            
            if type_results:
                latencies = [r.latency for r in type_results]
                result_counts = [r.results_count for r in type_results]
                
                aggregated[query_type] = {
                    "count": len(type_results),
                    "avg_latency": mean(latencies),
                    "median_latency": median(latencies),
                    "min_latency": min(latencies),
                    "max_latency": max(latencies),
                    "std_latency": stdev(latencies) if len(latencies) > 1 else 0.0,
                    "avg_results": mean(result_counts),
                    "total_errors": len([r for r in self.results if r.query_type == query_type and r.error])
                }
        
        return aggregated

    def display_results(self, aggregated_results: Dict[str, Dict[str, float]]) -> None:
        """Display results using rich console formatting"""
        
        # Main results table
        table = Table(title="Fixed Weaviate Query Performance Results", show_header=True, header_style="bold magenta")
        table.add_column("Query Type", style="cyan", no_wrap=True)
        table.add_column("Count", style="green")
        table.add_column("Avg Latency (ms)", style="yellow")
        table.add_column("Median Latency (ms)", style="yellow")
        table.add_column("Min/Max (ms)", style="blue")
        table.add_column("Std Dev (ms)", style="red")
        table.add_column("Avg Results", style="green")
        table.add_column("Errors", style="red")

        for query_type, stats in aggregated_results.items():
            display_name = "BM25" if query_type == "bm25" else "Vector (Local)"
            table.add_row(
                display_name,
                str(stats["count"]),
                f"{stats['avg_latency']*1000:.2f}",
                f"{stats['median_latency']*1000:.2f}",
                f"{stats['min_latency']*1000:.2f}/{stats['max_latency']*1000:.2f}",
                f"{stats['std_latency']*1000:.2f}",
                f"{stats['avg_results']:.1f}",
                str(stats["total_errors"])
            )

        console.print("\n")
        console.print(table)

        # Performance insights
        if aggregated_results:
            fastest_type = min(aggregated_results.keys(), key=lambda x: aggregated_results[x]["avg_latency"])
            slowest_type = max(aggregated_results.keys(), key=lambda x: aggregated_results[x]["avg_latency"])
            
            insights_text = f"""
[green]Fastest Search Type:[/green] {fastest_type.upper()} ({aggregated_results[fastest_type]['avg_latency']*1000:.2f}ms avg)
[red]Slowest Search Type:[/red] {slowest_type.upper()} ({aggregated_results[slowest_type]['avg_latency']*1000:.2f}ms avg)

[blue]Performance Summary:[/blue]
• Total queries executed: {len(self.results)}
• Total errors: {sum(stats['total_errors'] for stats in aggregated_results.values())}
• Benchmark completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            """
            
            console.print(Panel(insights_text, title="Performance Insights", border_style="green"))

        # Error details if any
        errors = [r for r in self.results if r.error]
        if errors:
            error_table = Table(title="Errors Encountered", show_header=True, header_style="bold red")
            error_table.add_column("Query Type", style="cyan")
            error_table.add_column("Query", style="white")
            error_table.add_column("Error", style="red")
            
            for error_result in errors:
                error_table.add_row(
                    error_result.query_type,
                    error_result.query[:50] + "..." if len(error_result.query) > 50 else error_result.query,
                    error_result.error[:100] + "..." if len(error_result.error) > 100 else error_result.error
                )
            
            console.print("\n")
            console.print(error_table)

    def save_results_to_file(self, aggregated_results: Dict[str, Dict[str, float]]) -> None:
        """Save raw and aggregated results to JSON file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_dir = Path("performance_results")
        results_dir.mkdir(parents=True, exist_ok=True)
        
        # Save raw results
        raw_results_file = results_dir / f"fixed_weaviate_performance_raw_{timestamp}.json"
        raw_data = {
            "metadata": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "total_queries": len(self.results),
                "query_types": ["bm25", "vector_local"],
                "queries_per_type": {
                    "bm25": len([r for r in self.results if r.query_type == "bm25"]),
                    "vector_local": len([r for r in self.results if r.query_type == "vector_local"])
                },
                "environment": {
                    "weaviate_url": os.getenv("WV_URL", "localhost"),
                    "weaviate_port": os.getenv("WV_PORT", "8084"),
                    "note": "Using local embeddings for vector search"
                }
            },
            "raw_results": [
                {
                    "query_type": r.query_type,
                    "query": r.query,
                    "latency_seconds": r.latency,
                    "latency_ms": r.latency * 1000,
                    "results_count": r.results_count,
                    "error": r.error,
                    "timestamp": r.timestamp
                }
                for r in self.results
            ]
        }
        
        with open(raw_results_file, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, indent=2, ensure_ascii=False)
        
        # Save aggregated results
        agg_results_file = results_dir / f"fixed_weaviate_performance_summary_{timestamp}.json"
        agg_data = {
            "metadata": raw_data["metadata"],
            "aggregated_results": {
                query_type: {
                    **stats,
                    "avg_latency_ms": stats["avg_latency"] * 1000,
                    "median_latency_ms": stats["median_latency"] * 1000,
                    "min_latency_ms": stats["min_latency"] * 1000,
                    "max_latency_ms": stats["max_latency"] * 1000,
                    "std_latency_ms": stats["std_latency"] * 1000
                }
                for query_type, stats in aggregated_results.items()
            }
        }
        
        with open(agg_results_file, "w", encoding="utf-8") as f:
            json.dump(agg_data, f, indent=2, ensure_ascii=False)
        
        console.print("\n[green]Results saved to:[/green]")
        console.print(f"Raw data: {raw_results_file}")
        console.print(f"Summary: {agg_results_file}")

    async def run_benchmark(self, limit_queries: Optional[int] = None) -> None:
        """Run all performance benchmarks"""
        console.print(Panel.fit(
            "[bold blue]Fixed Weaviate Query Performance Benchmark Suite[/bold blue]\n"
            "Testing BM25 and Local Vector search performance",
            border_style="blue"
        ))
        
        # Display environment info
        env_info = f"""
[cyan]Environment Configuration:[/cyan]
• Weaviate URL: {os.getenv('WV_URL', 'localhost')}
• Weaviate Port: {os.getenv('WV_PORT', '8084')}
• GRPC Port: {os.getenv('WV_GRPC_PORT', '50051')}
• API Key: {'Set' if os.getenv('WV_API_KEY') else 'Not set'}
• Vector Search: Local embeddings (bypassing transformer service)
        """
        console.print(Panel(env_info, title="Configuration", border_style="cyan"))
        
        await self.setup()
        
        try:
            await self.run_bm25_search_tests(limit_queries)
            await self.run_local_vector_search_tests(limit_queries)
            
            aggregated = self.aggregate_results()
            self.display_results(aggregated)
            self.save_results_to_file(aggregated)
            
        finally:
            await self.teardown()

def main() -> None:
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Fixed Weaviate Performance Benchmark")
    parser.add_argument("--limit", type=int, help="Limit number of queries per type")
    args = parser.parse_args()
    
    suite = FixedWeaviateBenchmarkSuite()
    asyncio.run(suite.run_benchmark(args.limit))

if __name__ == "__main__":
    main()