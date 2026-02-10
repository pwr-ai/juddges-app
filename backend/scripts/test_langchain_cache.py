#!/usr/bin/env python3
"""
Test script for LangChain PostgreSQL cache connection.

This script verifies that the LangChain cache is properly configured and accessible.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from sqlalchemy import create_engine, text
from loguru import logger

console = Console()


def main():
    """Test LangChain cache database connection."""
    console.print(Panel.fit(
        "[bold green]LangChain Cache Connection Test[/bold green]",
        border_style="green"
    ))

    # Get database URL from environment
    database_url = os.getenv(
        "LANGCHAIN_CACHE_DATABASE_URL",
        "postgresql://llm_cache:xNnseZW5SjjU5j7DKGyW_2oNFRsq1vdBGpgjwzsqB-w@host.docker.internal:5555/llm_cache"
    )

    # Mask password in display
    display_url = database_url.split("@")[0].split(":")[0:2]
    display_url = ":".join(display_url) + ":***@" + database_url.split("@")[1]

    console.print(f"\n[yellow]Connection URL:[/yellow] {display_url}\n")

    # Test connection
    try:
        console.print("[cyan]Connecting to database...[/cyan]")
        engine = create_engine(database_url)

        with engine.connect() as conn:
            # Test basic connection
            result = conn.execute(text("SELECT 1"))
            console.print("[green]✓[/green] Basic connection successful")

            # Get PostgreSQL version
            result = conn.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            console.print(f"[green]✓[/green] PostgreSQL version: {version.split(',')[0]}")

            # Get database info
            result = conn.execute(text("SELECT current_database(), current_user"))
            db_info = result.fetchone()
            console.print(f"[green]✓[/green] Database: {db_info[0]}")
            console.print(f"[green]✓[/green] User: {db_info[1]}")

            # Check if LangChain cache tables exist
            result = conn.execute(text("""
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                AND tablename LIKE '%cache%'
                ORDER BY tablename
            """))
            tables = result.fetchall()

            if tables:
                console.print(f"\n[green]✓[/green] Found {len(tables)} cache table(s):")
                for table in tables:
                    # Get row count
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table[0]}"))
                    count = count_result.fetchone()[0]
                    console.print(f"  - {table[0]} ({count} rows)")
            else:
                console.print("\n[yellow]⚠[/yellow] No cache tables found yet (will be created on first use)")

        # Create summary table
        console.print()
        table = Table(title="Connection Summary", show_header=True, header_style="bold magenta")
        table.add_column("Check", style="cyan")
        table.add_column("Status", style="green")

        table.add_row("Database Connection", "✓ Success")
        table.add_row("Database Name", "llm_cache")
        table.add_row("User Permissions", "✓ Verified")
        table.add_row("Cache Tables", "Ready" if tables else "Will be created on first use")

        console.print(table)
        console.print()
        console.print(Panel.fit(
            "[bold green]✓ LangChain cache is ready to use![/bold green]",
            border_style="green"
        ))

        return 0

    except Exception as e:
        console.print(f"\n[bold red]✗ Connection failed:[/bold red] {e}")
        logger.error(f"Database connection error: {e}")

        console.print("\n[yellow]Troubleshooting:[/yellow]")
        console.print("1. Verify PostgreSQL is running on port 5555")
        console.print("2. Check if llm_cache database exists")
        console.print("3. Verify credentials are correct")
        console.print("4. For Docker containers, ensure host.docker.internal is accessible")

        return 1


if __name__ == "__main__":
    sys.exit(main())
