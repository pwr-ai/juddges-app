#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "anthropic>=0.40.0",
#     "supabase>=2.0.0",
#     "python-dotenv>=1.0.0",
#     "rich>=13.0.0",
#     "loguru>=0.7.0",
# ]
# ///
"""
Batch Extract Collection — Collect Results

Polls an Anthropic Message Batch for completion, downloads results,
stores extractions in Supabase, and saves full request/response audit data to disk.

Usage:
    uv run scripts/batch_extract_collect.py --manifest data/batch_extractions/PL_.../manifest.json
    uv run scripts/batch_extract_collect.py --manifest data/batch_extractions/UK_.../manifest.json --no-store
"""

import argparse
import json
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import anthropic
from dotenv import load_dotenv
from loguru import logger
from rich.console import Console
from rich.progress import Progress, TaskID, track
from rich.table import Table
from supabase import create_client, Client


# Configure loguru logger
logger.remove()  # Remove default handler
logger.add(
    sys.stderr,
    level="INFO",
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    colorize=True
)

console = Console()


class BatchProcessor:
    """Handles Anthropic Message Batch processing and result collection."""

    # Claude batch API pricing (50% discount from standard)
    BATCH_PRICING = {
        "claude-sonnet-4-6": {
            "input": 1.50,   # $1.50 per 1M tokens
            "output": 7.50   # $7.50 per 1M tokens
        }
    }

    def __init__(self, manifest_path: str, poll_interval: int = 60, no_store: bool = False):
        self.manifest_path = Path(manifest_path)
        self.poll_interval = poll_interval
        self.no_store = no_store

        # Will be loaded from manifest
        self.manifest = None
        self.batch_id = None
        self.jurisdiction = None
        self.document_ids = []
        self.output_dir = None
        self.model = None

        # Anthropic client
        self.anthropic_client = None

        # Supabase client
        self.supabase_client = None

        # Processing stats
        self.start_time = time.time()
        self.results_stats = {
            "total": 0,
            "succeeded": 0,
            "failed": 0,
            "failed_document_ids": [],
            "failed_reasons": {},
            "per_document": []
        }

    def load_environment(self) -> None:
        """Load environment variables from .env file."""
        # Load .env from project root
        project_root = Path(__file__).parent.parent
        env_path = project_root / ".env"
        if env_path.exists():
            load_dotenv(env_path)
            logger.info(f"Loaded environment from {env_path}")
        else:
            logger.warning(f"No .env file found at {env_path}")

        # Check required environment variables
        required_vars = ["ANTHROPIC_API_KEY"]
        if not self.no_store:
            required_vars.extend(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])

        missing_vars = [var for var in required_vars if not os.getenv(var)]
        if missing_vars:
            logger.error(f"Missing required environment variables: {missing_vars}")
            raise ValueError(f"Missing required environment variables: {missing_vars}")

    def initialize_clients(self) -> None:
        """Initialize Anthropic and Supabase clients."""
        # Initialize Anthropic client
        api_key = os.getenv("ANTHROPIC_API_KEY")
        self.anthropic_client = anthropic.Anthropic(api_key=api_key)
        logger.info("Initialized Anthropic client")

        # Initialize Supabase client (if storing)
        if not self.no_store:
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            self.supabase_client = create_client(supabase_url, supabase_key)
            logger.info("Initialized Supabase client")

    def load_manifest(self) -> None:
        """Load and validate manifest file."""
        if not self.manifest_path.exists():
            logger.error(f"Manifest file not found: {self.manifest_path}")
            raise FileNotFoundError(f"Manifest file not found: {self.manifest_path}")

        with open(self.manifest_path, 'r') as f:
            self.manifest = json.load(f)

        # Extract required fields
        self.batch_id = self.manifest.get("batch_id")
        self.jurisdiction = self.manifest.get("jurisdiction")
        self.document_ids = self.manifest.get("document_ids", [])
        self.output_dir = Path(self.manifest.get("output_dir", self.manifest_path.parent))
        self.model = self.manifest.get("model", "claude-sonnet-4-6")

        if not self.batch_id:
            logger.error("Missing 'batch_id' in manifest")
            raise ValueError("Missing 'batch_id' in manifest")

        logger.info(f"Loaded manifest: batch_id={self.batch_id}, jurisdiction={self.jurisdiction}, documents={len(self.document_ids)}")

    def poll_batch_status(self) -> Dict[str, Any]:
        """Poll batch status until completion."""
        console.print(f"\n[bold blue]Polling batch status for {self.batch_id}[/bold blue]")

        while True:
            try:
                batch = self.anthropic_client.messages.batches.retrieve(self.batch_id)

                # Convert to dict for easier handling
                batch_dict = batch.model_dump()
                status = batch_dict["processing_status"]
                request_counts = batch_dict.get("request_counts", {})

                # Create status table
                table = Table(title=f"Batch Status: {self.batch_id}")
                table.add_column("Status", style="cyan")
                table.add_column("Processing", justify="right")
                table.add_column("Succeeded", justify="right", style="green")
                table.add_column("Errored", justify="right", style="red")
                table.add_column("Canceled", justify="right", style="yellow")
                table.add_column("Expired", justify="right", style="magenta")

                table.add_row(
                    status,
                    str(request_counts.get("processing", 0)),
                    str(request_counts.get("succeeded", 0)),
                    str(request_counts.get("errored", 0)),
                    str(request_counts.get("canceled", 0)),
                    str(request_counts.get("expired", 0))
                )

                console.clear()
                console.print(table)

                elapsed = time.time() - self.start_time
                console.print(f"\n[dim]Elapsed time: {elapsed:.0f}s[/dim]")

                if status == "ended":
                    logger.info("Batch processing completed")
                    return batch_dict

                # Sleep before next poll
                logger.info(f"Batch still processing, sleeping {self.poll_interval}s...")
                time.sleep(self.poll_interval)

            except anthropic.NotFoundError:
                logger.error(f"Batch not found: {self.batch_id}")
                raise
            except Exception as e:
                logger.error(f"Error polling batch status: {e}")
                raise

    def extract_json_from_content(self, content: str) -> Optional[Dict[str, Any]]:
        """Extract JSON from assistant message content.

        Handles both plain JSON and JSON wrapped in markdown code fences.
        """
        content = content.strip()

        # Try to extract JSON from markdown code fences
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL | re.IGNORECASE)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            # Assume the entire content is JSON
            json_str = content

        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON: {e}")
            return None

    def process_batch_results(self, batch_dict: Dict[str, Any]) -> None:
        """Download and process batch results."""
        console.print(f"\n[bold green]Downloading batch results...[/bold green]")

        # Ensure output directories exist
        responses_dir = self.output_dir / "responses"
        responses_dir.mkdir(parents=True, exist_ok=True)

        try:
            results_stream = self.anthropic_client.messages.batches.results(self.batch_id)

            # Track progress — count all terminal states
            counts = batch_dict.get("request_counts", {})
            total_requests = sum(
                counts.get(k, 0)
                for k in ("succeeded", "errored", "canceled", "expired")
            )

            if total_requests == 0:
                logger.warning("No results to process")
                return

            with Progress() as progress:
                task = progress.add_task("Processing results...", total=total_requests)

                for result in results_stream:
                    try:
                        self._process_single_result(result, responses_dir, progress, task)
                    except Exception as e:
                        logger.error(f"Error processing result: {e}")
                        continue

            logger.info(f"Processed {self.results_stats['total']} results")

        except Exception as e:
            logger.error(f"Error downloading batch results: {e}")
            raise

    def _process_single_result(self, result: Any, responses_dir: Path, progress: Progress, task: TaskID) -> None:
        """Process a single batch result."""
        result_dict = result.model_dump()
        custom_id = result_dict.get("custom_id")

        if not custom_id:
            logger.warning("Result missing custom_id, skipping")
            progress.advance(task)
            return

        # Save complete raw result
        result_file = responses_dir / f"{custom_id}.json"
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(result_dict, f, ensure_ascii=False, indent=2)

        # Process based on result type
        result_type = result_dict.get("result", {}).get("type")

        if result_type == "succeeded":
            self._process_successful_result(result_dict, custom_id)
        else:
            self._process_failed_result(result_dict, custom_id)

        self.results_stats["total"] += 1
        progress.advance(task)

    def _process_successful_result(self, result_dict: Dict[str, Any], document_id: str) -> None:
        """Process a successful extraction result."""
        try:
            # Extract response data
            message = result_dict["result"]["message"]
            content_blocks = message.get("content", [])

            # Find the text content block
            assistant_text = None
            for block in content_blocks:
                if block.get("type") == "text":
                    assistant_text = block.get("text", "")
                    break

            if not assistant_text:
                raise ValueError("No text content in assistant response")

            # Extract JSON from content
            extracted_json = self.extract_json_from_content(assistant_text)

            if extracted_json is None:
                raise ValueError("Failed to parse JSON from assistant response")

            # Store in Supabase if not skipping
            if not self.no_store:
                self._update_supabase_extraction(
                    document_id=document_id,
                    extracted_json=extracted_json,
                    status="completed",
                    error_message=None
                )

            # Track usage statistics
            usage = result_dict["result"]["message"].get("usage", {})

            # Add to per-document stats
            self.results_stats["per_document"].append({
                "document_id": document_id,
                "status": "succeeded",
                "input_tokens": usage.get("input_tokens", 0),
                "output_tokens": usage.get("output_tokens", 0),
                "stop_reason": result_dict["result"]["message"].get("stop_reason", "unknown")
            })

            self.results_stats["succeeded"] += 1
            logger.debug(f"Successfully processed extraction for document {document_id}")

        except Exception as e:
            logger.error(f"Error processing successful result for {document_id}: {e}")
            self._handle_processing_error(document_id, str(e))

    def _process_failed_result(self, result_dict: Dict[str, Any], document_id: str) -> None:
        """Process a failed extraction result."""
        error_info = result_dict.get("result", {})
        error_type = error_info.get("type", "unknown")

        if error_type == "error":
            error_message = error_info.get("error", {}).get("message", "Unknown error")
        else:
            error_message = f"Request failed with type: {error_type}"

        logger.warning(f"Failed extraction for document {document_id}: {error_message}")

        # Store failure in Supabase if not skipping
        if not self.no_store:
            self._update_supabase_extraction(
                document_id=document_id,
                extracted_json=None,
                status="failed",
                error_message=error_message
            )

        # Track failure
        self.results_stats["failed"] += 1
        self.results_stats["failed_document_ids"].append(document_id)
        self.results_stats["failed_reasons"][document_id] = error_message

        # Add to per-document stats
        self.results_stats["per_document"].append({
            "document_id": document_id,
            "status": "failed",
            "input_tokens": 0,
            "output_tokens": 0,
            "stop_reason": "error"
        })

    def _handle_processing_error(self, document_id: str, error_message: str) -> None:
        """Handle errors that occur during processing of successful results."""
        logger.error(f"Processing error for document {document_id}: {error_message}")

        # Store failure in Supabase if not skipping
        if not self.no_store:
            self._update_supabase_extraction(
                document_id=document_id,
                extracted_json=None,
                status="failed",
                error_message=f"Processing error: {error_message}"
            )

        # Track failure
        self.results_stats["failed"] += 1
        self.results_stats["failed_document_ids"].append(document_id)
        self.results_stats["failed_reasons"][document_id] = error_message

        # Update per-document stats if already exists, otherwise add
        for doc_stat in self.results_stats["per_document"]:
            if doc_stat["document_id"] == document_id:
                doc_stat["status"] = "failed"
                return

        # If not found, add new entry
        self.results_stats["per_document"].append({
            "document_id": document_id,
            "status": "failed",
            "input_tokens": 0,
            "output_tokens": 0,
            "stop_reason": "processing_error"
        })

    def _update_supabase_extraction(self, document_id: str, extracted_json: Optional[Dict[str, Any]],
                                  status: str, error_message: Optional[str]) -> None:
        """Update judgment record in Supabase with extraction results."""
        try:
            update_data = {
                "base_extraction_status": status,
                "base_extraction_model": self.model,
                "base_extracted_at": datetime.now(timezone.utc).isoformat(),
            }

            if extracted_json is not None:
                update_data["base_raw_extraction"] = extracted_json
                update_data["base_extraction_error"] = None
            else:
                update_data["base_extraction_error"] = error_message

            result = self.supabase_client.table("judgments").update(update_data).eq("id", document_id).execute()

            if not result.data:
                logger.warning(f"No judgment found with ID {document_id} to update")
            else:
                logger.debug(f"Updated Supabase record for document {document_id}")

        except Exception as e:
            logger.error(f"Failed to update Supabase for document {document_id}: {e}")

    def _get_pricing(self) -> Optional[Dict[str, float]]:
        """Get pricing for the current model using prefix matching."""
        for model_prefix, pricing in self.BATCH_PRICING.items():
            if self.model.startswith(model_prefix):
                return pricing
        return None

    def calculate_cost_estimate(self) -> float:
        """Calculate estimated cost based on token usage."""
        pricing = self._get_pricing()
        if pricing is None:
            logger.warning(f"No pricing data for model {self.model}")
            return 0.0
        total_cost = 0.0

        for doc_stat in self.results_stats["per_document"]:
            input_tokens = doc_stat["input_tokens"]
            output_tokens = doc_stat["output_tokens"]

            # Calculate cost in USD
            input_cost = (input_tokens / 1_000_000) * pricing["input"]
            output_cost = (output_tokens / 1_000_000) * pricing["output"]
            total_cost += input_cost + output_cost

        return total_cost

    def generate_usage_statistics(self) -> Dict[str, Any]:
        """Generate comprehensive usage statistics."""
        if not self.results_stats["per_document"]:
            return {}

        input_tokens = [doc["input_tokens"] for doc in self.results_stats["per_document"]]
        output_tokens = [doc["output_tokens"] for doc in self.results_stats["per_document"]]

        return {
            "total_input_tokens": sum(input_tokens),
            "total_output_tokens": sum(output_tokens),
            "mean_input_tokens": int(statistics.mean(input_tokens)) if input_tokens else 0,
            "mean_output_tokens": int(statistics.mean(output_tokens)) if output_tokens else 0,
            "min_input_tokens": min(input_tokens) if input_tokens else 0,
            "max_input_tokens": max(input_tokens) if input_tokens else 0,
            "min_output_tokens": min(output_tokens) if output_tokens else 0,
            "max_output_tokens": max(output_tokens) if output_tokens else 0,
        }

    def generate_summary(self) -> None:
        """Generate comprehensive summary report."""
        console.print(f"\n[bold green]Generating summary report...[/bold green]")

        processing_duration = time.time() - self.start_time
        usage_stats = self.generate_usage_statistics()
        estimated_cost = self.calculate_cost_estimate()

        summary = {
            "batch_id": self.batch_id,
            "jurisdiction": self.jurisdiction,
            "model": self.model,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "total_documents": len(self.document_ids),
            "succeeded": self.results_stats["succeeded"],
            "failed": self.results_stats["failed"],
            "failed_document_ids": self.results_stats["failed_document_ids"],
            "failed_reasons": self.results_stats["failed_reasons"],
            "usage": usage_stats,
            "estimated_cost_usd": round(estimated_cost, 2),
            "processing_duration_seconds": int(processing_duration),
            "per_document": self.results_stats["per_document"]
        }

        # Save summary
        summary_path = self.output_dir / "summary.json"
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        # Update manifest with completion info
        self.manifest.update({
            "status": "completed",
            "completed_at": summary["completed_at"],
            "summary_path": str(summary_path)
        })

        with open(self.manifest_path, 'w', encoding='utf-8') as f:
            json.dump(self.manifest, f, ensure_ascii=False, indent=2)

        # Display summary table
        self._display_summary_table(summary)

        logger.info(f"Summary saved to {summary_path}")
        logger.info(f"Updated manifest at {self.manifest_path}")

    def _display_summary_table(self, summary: Dict[str, Any]) -> None:
        """Display a formatted summary table."""
        table = Table(title="Batch Processing Summary")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", justify="right")

        table.add_row("Batch ID", summary["batch_id"])
        table.add_row("Jurisdiction", summary["jurisdiction"])
        table.add_row("Model", summary["model"])
        table.add_row("Total Documents", str(summary["total_documents"]))
        table.add_row("Succeeded", f"[green]{summary['succeeded']}[/green]")
        table.add_row("Failed", f"[red]{summary['failed']}[/red]")

        if summary["usage"]:
            usage = summary["usage"]
            table.add_row("Total Input Tokens", f"{usage['total_input_tokens']:,}")
            table.add_row("Total Output Tokens", f"{usage['total_output_tokens']:,}")
            table.add_row("Mean Input Tokens", f"{usage['mean_input_tokens']:,}")
            table.add_row("Mean Output Tokens", f"{usage['mean_output_tokens']:,}")

        table.add_row("Estimated Cost", f"${summary['estimated_cost_usd']:.2f}")
        table.add_row("Duration", f"{summary['processing_duration_seconds']}s")

        console.print("\n")
        console.print(table)

        if summary["failed_document_ids"]:
            console.print(f"\n[red]Failed documents: {len(summary['failed_document_ids'])}[/red]")
            for doc_id in summary["failed_document_ids"][:5]:  # Show first 5
                reason = summary["failed_reasons"].get(doc_id, "Unknown error")
                console.print(f"  • {doc_id}: {reason}")
            if len(summary["failed_document_ids"]) > 5:
                console.print(f"  ... and {len(summary['failed_document_ids']) - 5} more")

    def run(self) -> int:
        """Run the complete batch collection process."""
        try:
            logger.info("Starting batch extraction collection")

            # Initialize
            self.load_environment()
            self.initialize_clients()
            self.load_manifest()

            # Poll for completion
            batch_dict = self.poll_batch_status()

            # Process results
            self.process_batch_results(batch_dict)

            # Generate summary
            self.generate_summary()

            console.print(f"\n[bold green]✅ Batch processing completed successfully![/bold green]")
            logger.info("Batch extraction collection completed successfully")

            return 0

        except KeyboardInterrupt:
            logger.warning("Process interrupted by user")
            console.print("\n[yellow]Process interrupted by user[/yellow]")
            return 1
        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            console.print(f"\n[red]❌ Error: {e}[/red]")
            return 1


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Poll Anthropic Message Batch and collect extraction results"
    )
    parser.add_argument(
        "--manifest",
        type=str,
        required=True,
        help="Path to manifest.json from submit script"
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=60,
        help="Seconds between status checks (default: 60)"
    )
    parser.add_argument(
        "--no-store",
        action="store_true",
        help="Skip Supabase storage, just save to disk"
    )

    args = parser.parse_args()

    processor = BatchProcessor(
        manifest_path=args.manifest,
        poll_interval=args.poll_interval,
        no_store=args.no_store
    )

    return processor.run()


if __name__ == "__main__":
    sys.exit(main())