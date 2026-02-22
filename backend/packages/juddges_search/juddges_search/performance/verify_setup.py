#!/usr/bin/env python3
"""
Verify performance benchmark setup and queries
"""

import os

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from .weaviate_benchmark import VECTOR_QUERIES, HYBRID_QUERIES, BM25_QUERIES

# Load environment variables
load_dotenv()

console = Console()


def check_environment() -> bool:
    """Check required environment variables"""
    required_vars = ["WV_URL", "WV_PORT", "WV_GRPC_PORT", "WV_API_KEY"]
    missing_vars = []

    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)

    if missing_vars:
        console.print(f"[red]Missing environment variables: {', '.join(missing_vars)}[/red]")
        return False

    console.print("[green]✅ All required environment variables are set[/green]")
    return True


def verify_queries() -> None:
    """Verify test queries are correctly configured"""

    # Create summary table
    table = Table(title="Query Verification", show_header=True, header_style="bold blue")
    table.add_column("Query Type", style="cyan", no_wrap=True)
    table.add_column("Count", style="green")
    table.add_column("Status", style="yellow")
    table.add_column("Sample Query", style="white")

    # Check each query type
    query_types = [("Vector", VECTOR_QUERIES), ("Hybrid", HYBRID_QUERIES), ("BM25", BM25_QUERIES)]

    total_queries = 0
    all_valid = True

    for query_type, queries in query_types:
        count = len(queries)
        total_queries += count

        if count == 12:
            status = "✅ Valid"
        else:
            status = f"❌ Expected 12, got {count}"
            all_valid = False

        sample_query = queries[0] if queries else "No queries"

        table.add_row(
            query_type, str(count), status, sample_query[:50] + "..." if len(sample_query) > 50 else sample_query
        )

    console.print("\n")
    console.print(table)

    # Summary
    summary_text = f"""
[blue]Query Summary:[/blue]
• Total queries: {total_queries}
• Expected total: 36 (12 per type)
• Status: {"✅ All valid" if all_valid and total_queries == 36 else "❌ Issues detected"}
    """

    console.print(Panel(summary_text, title="Query Analysis", border_style="green" if all_valid else "red"))


def show_sample_queries() -> None:
    """Display sample queries from each type"""

    console.print("\n[bold]Sample Queries by Type:[/bold]")

    # Vector queries
    console.print("\n[blue]Vector Queries (Semantic):[/blue]")
    for i, query in enumerate(VECTOR_QUERIES[:3], 1):
        console.print(f"  {i}. {query}")

    # Hybrid queries
    console.print("\n[green]Hybrid Queries (Mixed):[/green]")
    for i, query in enumerate(HYBRID_QUERIES[:3], 1):
        console.print(f"  {i}. {query}")

    # BM25 queries
    console.print("\n[yellow]BM25 Queries (Keywords):[/yellow]")
    for i, query in enumerate(BM25_QUERIES[:3], 1):
        console.print(f"  {i}. {query}")


def check_dependencies() -> None:
    """Check if required dependencies are available"""
    console.print("\n[bold]Dependency Check:[/bold]")

    dependencies = [("rich", "Console formatting"), ("dotenv", "Environment loading"), ("weaviate", "Weaviate client")]

    for package, description in dependencies:
        try:
            __import__(package)
            console.print(f"[green]✅ {package}[/green] - {description}")
        except ImportError:
            console.print(f"[red]❌ {package}[/red] - {description} - NOT AVAILABLE")


def main() -> None:
    """Main verification function"""
    console.print(
        Panel.fit("[bold blue]Weaviate Performance Benchmark Setup Verification[/bold blue]", border_style="blue")
    )

    # Check environment
    env_ok = check_environment()

    # Check dependencies
    check_dependencies()

    # Verify queries
    verify_queries()

    # Show sample queries
    show_sample_queries()

    # Final status
    if env_ok:
        console.print("\n[green]🎉 Setup verification complete! Ready to run benchmarks.[/green]")
        console.print("\nTo run benchmarks:")
        console.print("  python run_performance_tests.py")
        console.print("  python -m juddges_search.performance.cli")
    else:
        console.print("\n[red]⚠️  Setup issues detected. Please fix environment configuration.[/red]")


if __name__ == "__main__":
    main()
