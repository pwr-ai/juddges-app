from datetime import datetime

import typer
from juddges_search.retrieval.weaviate_search import (
    search_chunks,
    search_documents,
)
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

app = typer.Typer(help="Search documents and chunks with nice formatting")
console = Console()


def format_date(date_str: str | None) -> str:
    """Format date string nicely."""
    if not date_str:
        return "N/A"
    try:
        date_obj = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return date_obj.strftime("%d %B %Y")
    except (ValueError, AttributeError):
        return date_str


def display_document_results(results, query: str, search_type: str = "Documents"):
    """Display document search results in a nice table."""
    console.print(Rule(f"[bold blue]{search_type} Search Results[/bold blue]"))
    console.print(f"[italic]Query: {query}[/italic]\n")

    table = Table()
    table.add_column("Score", justify="right", style="cyan")
    table.add_column("Signature", style="green")
    table.add_column("Court", style="blue")
    table.add_column("Date", style="magenta")
    table.add_column("Excerpt", style="yellow", max_width=60)

    for result in results:
        table.add_row(
            f"{result['score']:.3f}",
            result["signature"] or "N/A",
            result["court_name"] or "N/A",
            format_date(result["date"]),
            result["excerpt"] or "N/A",
        )

    console.print(table)
    console.print("End of document results.\n")


def display_chunks_results(results, query: str):
    """Display chunk search results in panels."""
    console.print(Rule("[bold blue]Chunks Search Results[/bold blue]"))
    console.print(f"[italic]Query: {query}[/italic]\n")

    for result in results:
        panel = Panel(
            Text(result["chunk_text"] or "N/A", style="white"),
            title=f"Chunk {result['chunk_id']} (Score: {result['score']:.3f})",
            subtitle=f"Document ID: {result['document_id']}",
            style="blue",
        )
        console.print(panel)
        console.print("")

    console.print("End of chunk results.\n")


def run_all_searches(query: str, max_results: int):
    """Run all search types and display their results."""
    # Regular documents search
    with console.status("[bold green]Searching documents..."):
        results = search_documents(query, max_results)
        display_document_results(results, query, "Regular Documents")

    # Chunks search
    with console.status("[bold green]Searching chunks..."):
        results = search_chunks(query, max_results)
        display_chunks_results(results, query)


@app.command()
def search(
    query: str = typer.Argument(..., help="Search query"),
    max_results: int = typer.Option(10, help="Maximum number of results to display"),
    mode: str = typer.Option("judgments", help="Search mode: judgments, signature, chunks, or all"),
):
    """Search judgments or chunks with formatted output."""
    if mode == "all":
        run_all_searches(query, max_results)
    else:
        with console.status("[bold green]Searching..."):
            if mode == "documents":
                results = search_documents(query, max_results)
                display_document_results(results, query)
            elif mode == "chunks":
                results = search_chunks(query, max_results)
                display_chunks_results(results, query)
            else:
                console.print(f"[red]Invalid mode: {mode}")
                console.print("[yellow]Available modes: judgments, chunks, all")
                raise typer.Exit(1)

    console.print("Search completed.\n")


if __name__ == "__main__":
    app()
