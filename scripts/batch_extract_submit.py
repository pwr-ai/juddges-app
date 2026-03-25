#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "anthropic>=0.40.0",
#     "supabase>=2.0.0",
#     "python-dotenv>=1.0.0",
#     "jinja2>=3.1.0",
#     "pyyaml>=6.0",
#     "rich>=13.0.0",
#     "loguru>=0.7.0",
# ]
# ///
"""
Batch Legal Document Extraction — Submit

Fetches legal documents from Supabase and submits them to the Anthropic Message Batches API
for structured extraction using base legal schemas.

Usage:
    uv run scripts/batch_extract_submit.py --jurisdiction PL --limit 500
    uv run scripts/batch_extract_submit.py --jurisdiction UK --limit 500
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import anthropic
import yaml
from dotenv import load_dotenv
from jinja2 import Template
from loguru import logger
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from supabase import Client, create_client

console = Console()


def load_env_vars() -> Dict[str, str]:
    """Load required environment variables."""
    # Load .env from project root
    project_root = Path(__file__).parent.parent
    env_path = project_root / ".env"

    if env_path.exists():
        load_dotenv(env_path)
        logger.info(f"Loaded environment from {env_path}")
    else:
        logger.warning(f"No .env file found at {env_path}")

    required_vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]
    env_vars = {}

    for var in required_vars:
        value = os.getenv(var)
        if not value:
            logger.error(f"Missing required environment variable: {var}")
            sys.exit(1)
        env_vars[var] = value

    return env_vars


def clean_schema_for_anthropic(schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove keys that Anthropic doesn't support from the schema recursively.

    Removes: $schema, x-* extension keys, uniqueItems, $id
    """
    if not isinstance(schema, dict):
        return schema

    cleaned = {}
    for key, value in schema.items():
        # Skip unsupported keys
        if key.startswith("x-") or key in ["$schema", "uniqueItems", "$id"]:
            continue

        # Recursively clean nested objects
        if isinstance(value, dict):
            cleaned[key] = clean_schema_for_anthropic(value)
        elif isinstance(value, list):
            cleaned[key] = [clean_schema_for_anthropic(item) for item in value]
        else:
            cleaned[key] = value

    return cleaned


def load_schema_files(jurisdiction: str) -> Dict[str, Any]:
    """Load schema and prompt files for the given jurisdiction."""
    project_root = Path(__file__).parent.parent
    config_base = project_root / "backend" / "packages" / "juddges_search" / "config"

    # Determine file paths based on jurisdiction
    if jurisdiction == "PL":
        schema_path = config_base / "schema" / "base_legal_schema_pl.json"
        instructions_path = config_base / "prompts" / "info_extraction_additional_instructions_pl.yaml"
        extraction_context_key = "pl"
        language = "pl"
    elif jurisdiction == "UK":
        schema_path = config_base / "schema" / "base_legal_schema_en.json"
        instructions_path = config_base / "prompts" / "info_extraction_additional_instructions_en.yaml"
        extraction_context_key = "en_uk"
        language = "en"
    else:
        raise ValueError(f"Unsupported jurisdiction: {jurisdiction}")

    # Load schema
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    # Clean schema for Anthropic
    schema = clean_schema_for_anthropic(schema)

    # Load additional instructions
    if not instructions_path.exists():
        raise FileNotFoundError(f"Instructions file not found: {instructions_path}")

    with open(instructions_path, "r", encoding="utf-8") as f:
        instructions_data = yaml.safe_load(f)

    additional_instructions = instructions_data.get("content", "")

    # Load jurisdiction mappings for extraction context
    mappings_path = config_base / "schema" / "jurisdiction_mappings.yaml"
    if not mappings_path.exists():
        raise FileNotFoundError(f"Jurisdiction mappings not found: {mappings_path}")

    with open(mappings_path, "r", encoding="utf-8") as f:
        mappings = yaml.safe_load(f)

    extraction_context = mappings.get("extraction_contexts", {}).get(extraction_context_key, "")

    # Load prompt template
    template_path = config_base / "prompts" / "info_extraction.jinja2"
    if not template_path.exists():
        raise FileNotFoundError(f"Prompt template not found: {template_path}")

    with open(template_path, "r", encoding="utf-8") as f:
        template_content = f.read()

    return {
        "schema": schema,
        "additional_instructions": additional_instructions,
        "extraction_context": extraction_context,
        "template": Template(template_content),
        "language": language
    }


def fetch_documents(supabase: Client, jurisdiction: str, limit: int) -> List[Dict[str, Any]]:
    """Fetch candidate documents from Supabase."""
    console.print(f"[blue]Fetching documents for jurisdiction: {jurisdiction}[/blue]")

    # Fetch documents in pages
    page_size = 500
    all_documents = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task("Fetching documents...", total=limit)

        offset = 0
        while len(all_documents) < limit:
            remaining = limit - len(all_documents)
            current_limit = min(page_size, remaining)

            try:
                response = (
                    supabase.table("judgments")
                    .select("id, full_text, jurisdiction, court_name")
                    .eq("jurisdiction", jurisdiction)
                    .neq("base_extraction_status", "completed")
                    .order("id")
                    .range(offset, offset + current_limit - 1)
                    .execute()
                )

                batch_docs = response.data
                if not batch_docs:
                    logger.info(f"No more documents found after {len(all_documents)} records")
                    break

                all_documents.extend(batch_docs)
                offset += len(batch_docs)
                progress.update(task, completed=len(all_documents))

                if len(batch_docs) < current_limit:
                    logger.info(f"Reached end of available documents: {len(all_documents)} total")
                    break

            except Exception as e:
                logger.error(f"Failed to fetch documents: {e}")
                raise

    console.print(f"[green]Successfully fetched {len(all_documents)} documents[/green]")
    return all_documents


def build_extraction_prompt(document: Dict[str, Any], schema_data: Dict[str, Any]) -> str:
    """Build the extraction prompt for a single document."""
    return schema_data["template"].render(
        full_text=document["full_text"],
        schema=json.dumps(schema_data["schema"], indent=2),
        extraction_context=schema_data["extraction_context"],
        additional_instructions=schema_data["additional_instructions"],
        language=schema_data["language"]
    )


def create_batch_requests(
    documents: List[Dict[str, Any]],
    schema_data: Dict[str, Any],
    model: str,
    max_tokens: int
) -> List[Dict[str, Any]]:
    """Create Anthropic batch request list."""
    batch_requests = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task("Building extraction prompts...", total=len(documents))

        for doc in documents:
            try:
                prompt = build_extraction_prompt(doc, schema_data)

                request = {
                    "custom_id": doc["id"],
                    "params": {
                        "model": model,
                        "max_tokens": max_tokens,
                        "temperature": 0,
                        "messages": [
                            {"role": "user", "content": prompt}
                        ]
                    }
                }

                batch_requests.append(request)
                progress.advance(task)

            except Exception as e:
                logger.error(f"Failed to build prompt for document {doc['id']}: {e}")
                raise

    return batch_requests


def submit_batch(anthropic_client: anthropic.Anthropic, batch_requests: List[Dict[str, Any]]) -> str:
    """Submit batch to Anthropic and return batch ID."""
    console.print("[blue]Submitting batch to Anthropic...[/blue]")

    try:
        batch = anthropic_client.messages.batches.create(requests=batch_requests)
        batch_id = batch.id
        console.print(f"[green]Batch submitted successfully! ID: {batch_id}[/green]")
        return batch_id
    except Exception as e:
        logger.error(f"Failed to submit batch: {e}")
        raise


def save_batch_files(
    batch_id: str,
    batch_requests: List[Dict[str, Any]],
    jurisdiction: str,
    model: str,
    limit: int,
    max_tokens: int,
    output_dir: str
) -> Path:
    """Save manifest and individual request files."""
    # Create output directory
    date_str = datetime.now().strftime("%Y-%m-%d")
    batch_id_short = batch_id[-8:]  # Last 8 characters
    batch_dir = Path(output_dir) / f"{jurisdiction}_{date_str}_{batch_id_short}"
    batch_dir.mkdir(parents=True, exist_ok=True)

    requests_dir = batch_dir / "requests"
    requests_dir.mkdir(exist_ok=True)

    # Save manifest
    manifest = {
        "batch_id": batch_id,
        "model": model,
        "jurisdiction": jurisdiction,
        "created_at": datetime.now().isoformat(),
        "document_count": len(batch_requests),
        "document_ids": [req["custom_id"] for req in batch_requests],
        "limit": limit,
        "max_tokens": max_tokens,
        "status": "submitted",
        "output_dir": str(batch_dir)
    }

    manifest_path = batch_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # Save individual request files
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task("Saving request files...", total=len(batch_requests))

        for request in batch_requests:
            doc_id = request["custom_id"]
            request_path = requests_dir / f"{doc_id}.json"

            with open(request_path, "w", encoding="utf-8") as f:
                json.dump(request["params"], f, indent=2, ensure_ascii=False)

            progress.advance(task)

    console.print(f"[green]Batch files saved to: {batch_dir}[/green]")
    logger.info(f"Manifest saved: {manifest_path}")
    logger.info(f"Request files saved: {requests_dir}")

    return batch_dir


def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Submit legal documents to Anthropic Message Batches API for structured extraction"
    )
    parser.add_argument(
        "--jurisdiction",
        choices=["PL", "UK"],
        required=True,
        help="Jurisdiction to process (PL or UK)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="Maximum number of documents to process (default: 500)"
    )
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-6",
        help="Anthropic model to use (default: claude-sonnet-4-6)"
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=16000,
        help="Maximum tokens per request (default: 16000)"
    )
    parser.add_argument(
        "--output-dir",
        default="data/batch_extractions",
        help="Output directory for batch files (default: data/batch_extractions)"
    )

    return parser.parse_args()


def main() -> int:
    """Main function."""
    try:
        # Configure logger
        logger.remove()
        logger.add(sys.stderr, level="INFO", format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | {message}")

        # Parse arguments
        args = parse_arguments()

        console.print(f"[bold blue]Legal Document Batch Extraction[/bold blue]")
        console.print(f"Jurisdiction: {args.jurisdiction}")
        console.print(f"Document limit: {args.limit}")
        console.print(f"Model: {args.model}")
        console.print(f"Max tokens: {args.max_tokens}")
        console.print()

        # Load environment variables
        env_vars = load_env_vars()

        # Initialize clients
        supabase = create_client(env_vars["SUPABASE_URL"], env_vars["SUPABASE_SERVICE_ROLE_KEY"])
        anthropic_client = anthropic.Anthropic(api_key=env_vars["ANTHROPIC_API_KEY"])

        # Load schema files
        logger.info(f"Loading schema files for jurisdiction: {args.jurisdiction}")
        schema_data = load_schema_files(args.jurisdiction)

        # Fetch documents
        documents = fetch_documents(supabase, args.jurisdiction, args.limit)

        if not documents:
            console.print("[yellow]No documents found matching criteria[/yellow]")
            logger.info("No documents to process, exiting cleanly")
            return 0

        # Create batch requests
        batch_requests = create_batch_requests(documents, schema_data, args.model, args.max_tokens)

        # Submit batch
        batch_id = submit_batch(anthropic_client, batch_requests)

        # Save files
        batch_dir = save_batch_files(
            batch_id=batch_id,
            batch_requests=batch_requests,
            jurisdiction=args.jurisdiction,
            model=args.model,
            limit=args.limit,
            max_tokens=args.max_tokens,
            output_dir=args.output_dir
        )

        console.print(f"\n[bold green]✅ Batch submission completed successfully![/bold green]")
        console.print(f"Batch ID: {batch_id}")
        console.print(f"Documents submitted: {len(batch_requests)}")
        console.print(f"Output directory: {batch_dir}")

        logger.info("Batch extraction submission completed successfully")
        return 0

    except KeyboardInterrupt:
        console.print("\n[yellow]Operation cancelled by user[/yellow]")
        return 1
    except Exception as e:
        console.print(f"\n[red]Error: {e}[/red]")
        logger.error(f"Script failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())