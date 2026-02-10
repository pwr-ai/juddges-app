#!/usr/bin/env python3
"""
Command-line interface for Weaviate performance benchmarks
"""

import argparse
from typing import Optional

from rich.console import Console

from .weaviate_benchmark import WeaviateBenchmarkSuite

console = Console()

def create_parser() -> argparse.ArgumentParser:
    """Create argument parser"""
    parser = argparse.ArgumentParser(
        description="Weaviate Query Performance Benchmark Suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                    # Run all benchmarks (short queries only)
  %(prog)s --long             # Run all benchmarks including long queries
  %(prog)s --long-only        # Run only long query benchmarks
  %(prog)s --vector           # Run only vector search tests
  %(prog)s --hybrid           # Run only hybrid search tests
  %(prog)s --bm25             # Run only BM25 search tests
  %(prog)s --queries 5        # Run only 5 queries per type
        """
    )

    parser.add_argument(
        "--vector",
        action="store_true",
        help="Run only vector search benchmarks"
    )

    parser.add_argument(
        "--hybrid",
        action="store_true",
        help="Run only hybrid search benchmarks"
    )

    parser.add_argument(
        "--bm25",
        action="store_true",
        help="Run only BM25 search benchmarks"
    )

    parser.add_argument(
        "--long",
        action="store_true",
        help="Include long query benchmarks (100-300 character queries)"
    )

    parser.add_argument(
        "--long-only",
        action="store_true",
        help="Run only long query benchmarks (skip short queries)"
    )

    parser.add_argument(
        "--queries",
        type=int,
        help="Limit number of queries per type (default: all)"
    )

    parser.add_argument(
        "--max-docs",
        type=int,
        default=10,
        help="Maximum documents to retrieve per query (default: 10)"
    )

    parser.add_argument(
        "--output-dir",
        type=str,
        default="performance_results",
        help="Output directory for results (default: performance_results)"
    )

    return parser

async def main_async(args: Optional[argparse.Namespace] = None) -> None:
    """Async main function"""
    if args is None:
        parser = create_parser()
        args = parser.parse_args()

    suite = WeaviateBenchmarkSuite()

    # Modify suite behavior based on arguments
    if args.queries:
        # Limit queries if specified
        from . import weaviate_benchmark
        weaviate_benchmark.VECTOR_QUERIES = weaviate_benchmark.VECTOR_QUERIES[:args.queries]
        weaviate_benchmark.HYBRID_QUERIES = weaviate_benchmark.HYBRID_QUERIES[:args.queries]
        weaviate_benchmark.BM25_QUERIES = weaviate_benchmark.BM25_QUERIES[:args.queries]
        weaviate_benchmark.VECTOR_QUERIES_LONG = weaviate_benchmark.VECTOR_QUERIES_LONG[:args.queries]
        weaviate_benchmark.HYBRID_QUERIES_LONG = weaviate_benchmark.HYBRID_QUERIES_LONG[:args.queries]
        weaviate_benchmark.BM25_QUERIES_LONG = weaviate_benchmark.BM25_QUERIES_LONG[:args.queries]

    include_long = args.long or args.long_only
    long_only = args.long_only

    console.print(f"[cyan]Running benchmarks with max_docs={args.max_docs}[/cyan]")
    if include_long:
        console.print("[cyan]Long queries (100-300 chars) enabled[/cyan]")

    await suite.setup()

    try:
        # Determine which tests to run
        run_all = not any([args.vector, args.hybrid, args.bm25])

        # Run short query benchmarks (unless --long-only)
        if not long_only:
            if args.vector or run_all:
                await suite.run_vector_search_tests()

            if args.hybrid or run_all:
                await suite.run_hybrid_search_tests()

            if args.bm25 or run_all:
                await suite.run_bm25_search_tests()

        # Run long query benchmarks if requested
        if include_long:
            if args.vector or run_all:
                await suite.run_vector_long_search_tests()

            if args.hybrid or run_all:
                await suite.run_hybrid_long_search_tests()

            if args.bm25 or run_all:
                await suite.run_bm25_long_search_tests()

        # Display and save results
        aggregated = suite.aggregate_results()
        suite.display_results(aggregated)
        suite.save_results_to_file(aggregated)

    finally:
        await suite.teardown()

def main() -> None:
    """Main CLI entry point"""
    import asyncio
    asyncio.run(main_async())

if __name__ == "__main__":
    main()