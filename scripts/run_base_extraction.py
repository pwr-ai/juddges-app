"""Batch base-schema extraction for remaining judgments using Anthropic models.

Usage:
    # Set ANTHROPIC_API_KEY first (or it will be loaded from .env)
    export ANTHROPIC_API_KEY=sk-ant-...

    # Run with defaults (claude-sonnet-4-6, batch of 50, 5 concurrent)
    python scripts/run_base_extraction.py

    # Use Opus for higher quality
    python scripts/run_base_extraction.py --model claude-opus-4-6

    # Adjust concurrency and batch size
    python scripts/run_base_extraction.py --concurrency 10 --batch-size 100

    # Process only UK or PL
    python scripts/run_base_extraction.py --jurisdiction UK
    python scripts/run_base_extraction.py --jurisdiction PL

    # Retry failed only
    python scripts/run_base_extraction.py --failed-only

    # Dry run (count without processing)
    python scripts/run_base_extraction.py --dry-run

    # Limit total documents processed
    python scripts/run_base_extraction.py --limit 100

    # Resume from a previous checkpoint
    python scripts/run_base_extraction.py --checkpoint data/extraction_checkpoint_20260320_120000.jsonl

    # Custom report path
    python scripts/run_base_extraction.py --report data/my_report.json
"""

import argparse
import asyncio
import json
import os
import sys
import time
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger
from supabase import create_client

# Load .env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

# Default directories
DATA_DIR = PROJECT_ROOT / "data"

# Schema paths
SCHEMA_DIR = (
    PROJECT_ROOT / "backend" / "packages" / "juddges_search" / "config" / "schema"
)
BASE_SCHEMA_EN = SCHEMA_DIR / "base_legal_schema_en.json"
BASE_SCHEMA_PL = SCHEMA_DIR / "base_legal_schema_pl.json"
PROMPTS_DIR = (
    PROJECT_ROOT / "backend" / "packages" / "juddges_search" / "config" / "prompts"
)


def _default_checkpoint_path() -> Path:
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    return DATA_DIR / f"extraction_checkpoint_{ts}.jsonl"


def _default_report_path() -> Path:
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    return DATA_DIR / f"extraction_report_{ts}.json"


def load_checkpoint(path: Path) -> dict[str, str]:
    """Load checkpoint file. Returns {doc_id: status} for completed/failed docs."""
    checkpoint = {}
    if not path.exists():
        return checkpoint
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            checkpoint[entry["doc_id"]] = entry["status"]
    return checkpoint


def append_checkpoint(
    path: Path, doc_id: str, status: str, jurisdiction: str, error: str | None = None
):
    """Append a single result to the checkpoint JSONL file."""
    entry = {
        "doc_id": doc_id,
        "status": status,
        "jurisdiction": jurisdiction,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    if error:
        entry["error"] = error[:500]
    with open(path, "a") as f:
        f.write(json.dumps(entry) + "\n")


def generate_report(
    checkpoint_path: Path,
    report_path: Path,
    args,
    elapsed_seconds: float,
    total_found: int,
    skipped: int,
):
    """Generate a JSON completion report from the checkpoint file."""
    checkpoint = load_checkpoint(checkpoint_path)

    completed = sum(1 for s in checkpoint.values() if s == "completed")
    failed = sum(1 for s in checkpoint.values() if s == "failed")

    # Re-read checkpoint for jurisdiction breakdown
    by_jurisdiction: dict[str, dict[str, int]] = {}
    if checkpoint_path.exists():
        with open(checkpoint_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                j = entry.get("jurisdiction", "?")
                if j not in by_jurisdiction:
                    by_jurisdiction[j] = {"completed": 0, "failed": 0}
                by_jurisdiction[j][entry["status"]] = (
                    by_jurisdiction[j].get(entry["status"], 0) + 1
                )

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "model": args.model,
        "jurisdiction_filter": args.jurisdiction,
        "failed_only": args.failed_only,
        "total_found": total_found,
        "skipped_from_checkpoint": skipped,
        "completed": completed,
        "failed": failed,
        "elapsed_seconds": round(elapsed_seconds, 1),
        "docs_per_second": round((completed + failed) / elapsed_seconds, 2)
        if elapsed_seconds > 0
        else 0,
        "by_jurisdiction": by_jurisdiction,
        "checkpoint_file": str(checkpoint_path),
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    logger.info(f"Report saved to {report_path}")
    return report


def load_schema(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def clean_schema_for_anthropic(schema: dict) -> dict:
    """Remove x-extension properties and unsupported keys for Anthropic tool calling."""
    import re

    clean = deepcopy(schema)
    unsupported_keys = {"uniqueItems", "$schema"}

    def _clean(obj):
        if isinstance(obj, dict):
            return {
                k: _clean(v)
                for k, v in obj.items()
                if not k.startswith("x-") and k not in unsupported_keys
            }
        elif isinstance(obj, list):
            return [_clean(item) for item in obj]
        return obj

    result = _clean(clean)

    # Sanitize title to be valid Anthropic tool name (alphanumeric, underscores, hyphens)
    if "title" in result:
        result["title"] = re.sub(r"[^a-zA-Z0-9_-]", "_", result["title"]).strip("_")[
            :64
        ]

    return result


def load_additional_instructions(language: str) -> str:
    """Load extraction instructions from YAML config."""
    import yaml

    instruction_file = (
        PROMPTS_DIR / f"info_extraction_additional_instructions_{language}.yaml"
    )
    if not instruction_file.exists():
        return ""
    with open(instruction_file) as f:
        data = yaml.safe_load(f)
    return data.get("content", "")


def build_extraction_prompt(full_text: str, language: str) -> str:
    """Build the extraction prompt following the same pattern as the existing system."""
    additional_instructions = load_additional_instructions(language)

    extraction_context = (
        "Extract structured information from legal documents using the provided schema."
    )

    labels = {
        "en": {"judgment": "Judgment text to analyze:"},
        "pl": {"judgment": "Tekst orzeczenia do analizy:"},
    }
    label = labels.get(language, labels["en"])

    parts = [extraction_context, ""]
    if additional_instructions:
        parts.append(additional_instructions)
        parts.append("")
    parts.append(f"{label['judgment']}")
    parts.append("====")
    parts.append(full_text)
    parts.append("====")

    return "\n".join(parts)


def get_supabase_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def fetch_pending_judgments(
    supabase,
    jurisdiction: str | None = None,
    failed_only: bool = False,
    limit: int | None = None,
    batch_size: int = 500,
) -> list[dict]:
    """Fetch judgments that need extraction."""
    query = supabase.table("judgments").select("id, jurisdiction, court_name")

    if failed_only:
        query = query.eq("base_extraction_status", "failed")
    else:
        query = query.in_("base_extraction_status", ["pending", "failed"])

    if jurisdiction:
        query = query.eq("jurisdiction", jurisdiction)

    # Paginate to avoid hitting Supabase row limits
    all_docs = []
    offset = 0
    while True:
        page = query.range(offset, offset + batch_size - 1).execute()
        if not page.data:
            break
        all_docs.extend(page.data)
        if limit and len(all_docs) >= limit:
            all_docs = all_docs[:limit]
            break
        if len(page.data) < batch_size:
            break
        offset += batch_size

    return all_docs


def fetch_document_text(supabase, doc_id: str) -> str | None:
    """Fetch full_text for a single judgment."""
    result = (
        supabase.table("judgments")
        .select("full_text")
        .eq("id", doc_id)
        .maybe_single()
        .execute()
    )
    if result and result.data:
        return result.data.get("full_text")
    return None


def save_extraction_result(
    supabase,
    doc_id: str,
    extracted_data: dict,
    model_name: str,
):
    """Save successful extraction to the judgments table."""
    supabase.table("judgments").update(
        {
            "base_raw_extraction": extracted_data,
            "base_extraction_status": "completed",
            "base_extraction_model": model_name,
            "base_extraction_error": None,
            "base_extracted_at": datetime.now(UTC).isoformat(),
        }
    ).eq("id", doc_id).execute()


def save_extraction_failure(supabase, doc_id: str, error_msg: str, model_name: str):
    """Save failed extraction to the judgments table."""
    supabase.table("judgments").update(
        {
            "base_extraction_status": "failed",
            "base_extraction_model": model_name,
            "base_extraction_error": error_msg[:1000],
            "base_extracted_at": datetime.now(UTC).isoformat(),
        }
    ).eq("id", doc_id).execute()


async def extract_single_document(
    model,
    schema: dict,
    supabase_client,
    doc: dict,
    model_name: str,
    semaphore: asyncio.Semaphore,
    checkpoint_path: Path | None = None,
) -> tuple[str, bool, str]:
    """Extract a single document. Returns (doc_id, success, message)."""
    doc_id = doc["id"]
    jurisdiction = doc.get("jurisdiction", "UK")
    language = "pl" if jurisdiction == "PL" else "en"

    async with semaphore:
        try:
            # Fetch full text
            full_text = fetch_document_text(supabase_client, doc_id)
            if not full_text:
                save_extraction_failure(
                    supabase_client, doc_id, "Document has no text content", model_name
                )
                if checkpoint_path:
                    append_checkpoint(
                        checkpoint_path,
                        doc_id,
                        "failed",
                        jurisdiction,
                        "No text content",
                    )
                return doc_id, False, "No text content"

            # Build prompt
            prompt = build_extraction_prompt(full_text, language)

            # Select schema variant
            schema_to_use = schema[language]

            # Create structured output model
            structured_model = model.with_structured_output(schema_to_use)

            # Call the model
            result = await structured_model.ainvoke(prompt)

            # Convert to dict if needed
            if hasattr(result, "model_dump"):
                extracted_data = result.model_dump()
            elif isinstance(result, dict):
                extracted_data = result
            else:
                extracted_data = dict(result)

            # Save result
            save_extraction_result(supabase_client, doc_id, extracted_data, model_name)
            if checkpoint_path:
                append_checkpoint(checkpoint_path, doc_id, "completed", jurisdiction)
            return doc_id, True, "OK"

        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            try:
                save_extraction_failure(supabase_client, doc_id, error_msg, model_name)
            except Exception:
                pass
            if checkpoint_path:
                append_checkpoint(
                    checkpoint_path, doc_id, "failed", jurisdiction, error_msg
                )
            return doc_id, False, error_msg


async def run_extraction(args):
    """Main extraction loop."""
    from langchain_anthropic import ChatAnthropic

    # Validate API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set. Export it or add to .env file.")
        sys.exit(1)

    # Initialize model
    model = ChatAnthropic(
        model=args.model,
        temperature=0,
        max_tokens=4096,
        anthropic_api_key=api_key,
    )
    logger.info(f"Using model: {args.model}")

    # Load schemas
    en_schema = clean_schema_for_anthropic(load_schema(BASE_SCHEMA_EN))
    pl_schema = clean_schema_for_anthropic(load_schema(BASE_SCHEMA_PL))
    schemas = {"en": en_schema, "pl": pl_schema}
    logger.info(
        f"Loaded EN schema ({len(en_schema.get('properties', {}))} fields) and PL schema ({len(pl_schema.get('properties', {}))} fields)"
    )

    # Initialize Supabase
    supabase = get_supabase_client()

    # Set up checkpoint
    checkpoint_path = (
        Path(args.checkpoint) if args.checkpoint else _default_checkpoint_path()
    )
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    # Load existing checkpoint for resume
    existing_checkpoint = (
        load_checkpoint(checkpoint_path) if checkpoint_path.exists() else {}
    )
    already_done_ids = {
        doc_id
        for doc_id, status in existing_checkpoint.items()
        if status == "completed"
    }
    if already_done_ids:
        logger.info(
            f"Loaded checkpoint with {len(already_done_ids)} already-completed docs from {checkpoint_path}"
        )

    # Fetch pending documents
    logger.info("Fetching pending judgments...")
    docs = fetch_pending_judgments(
        supabase,
        jurisdiction=args.jurisdiction,
        failed_only=args.failed_only,
        limit=args.limit,
    )
    total_found = len(docs)
    logger.info(f"Found {total_found} judgments to process")

    # Filter out docs already completed in checkpoint
    if already_done_ids:
        docs = [d for d in docs if d["id"] not in already_done_ids]
        skipped = total_found - len(docs)
        logger.info(
            f"Skipping {skipped} already-completed docs (from checkpoint). {len(docs)} remaining."
        )
    else:
        skipped = 0

    if args.dry_run:
        by_jurisdiction: dict[str, int] = {}
        for d in docs:
            j = d.get("jurisdiction", "?")
            by_jurisdiction[j] = by_jurisdiction.get(j, 0) + 1
        logger.info(f"Breakdown (to process): {by_jurisdiction}")
        logger.info(f"Skipped (already in checkpoint): {skipped}")
        logger.info("Dry run complete. Use without --dry-run to process.")
        return

    total = len(docs)
    if total == 0:
        logger.info("No documents to process. Exiting.")
        return

    logger.info(f"Checkpoint file: {checkpoint_path}")

    # Process in batches
    semaphore = asyncio.Semaphore(args.concurrency)
    completed = 0
    failed = 0
    start_time = time.time()

    for batch_start in range(0, total, args.batch_size):
        batch = docs[batch_start : batch_start + args.batch_size]
        batch_num = batch_start // args.batch_size + 1
        total_batches = (total + args.batch_size - 1) // args.batch_size

        logger.info(f"--- Batch {batch_num}/{total_batches} ({len(batch)} docs) ---")

        tasks = [
            extract_single_document(
                model=model,
                schema=schemas,
                supabase_client=supabase,
                doc=doc,
                model_name=args.model,
                semaphore=semaphore,
                checkpoint_path=checkpoint_path,
            )
            for doc in batch
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                failed += 1
                logger.error(f"Unexpected error: {result}")
            else:
                doc_id, success, message = result
                if success:
                    completed += 1
                else:
                    failed += 1
                    logger.warning(f"Failed {doc_id}: {message}")

        elapsed = time.time() - start_time
        processed = completed + failed
        rate = processed / elapsed if elapsed > 0 else 0
        remaining = (total - processed) / rate if rate > 0 else 0

        logger.info(
            f"Progress: {processed}/{total} "
            f"({completed} ok, {failed} failed, {skipped} skipped) | "
            f"{rate:.1f} docs/s | "
            f"ETA: {remaining / 60:.1f} min"
        )

    elapsed_total = time.time() - start_time
    logger.info(
        f"\nDone! Processed {completed + failed}/{total} in {elapsed_total / 60:.1f} min. "
        f"Completed: {completed}, Failed: {failed}, Skipped: {skipped}"
    )

    # Generate completion report
    report_path = Path(args.report) if args.report else _default_report_path()
    report = generate_report(
        checkpoint_path=checkpoint_path,
        report_path=report_path,
        args=args,
        elapsed_seconds=elapsed_total,
        total_found=total_found,
        skipped=skipped,
    )
    logger.info(f"Summary: {json.dumps(report, indent=2)}")


def main():
    parser = argparse.ArgumentParser(
        description="Run base schema extraction on remaining judgments"
    )
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-6",
        help="Anthropic model to use (default: claude-sonnet-4-6)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Number of concurrent extraction calls (default: 5)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Number of documents per batch (default: 50)",
    )
    parser.add_argument(
        "--jurisdiction",
        choices=["UK", "PL"],
        default=None,
        help="Process only specific jurisdiction",
    )
    parser.add_argument(
        "--failed-only",
        action="store_true",
        help="Only retry previously failed extractions",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count documents without processing",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit total documents to process",
    )
    parser.add_argument(
        "--checkpoint",
        default=None,
        help="Path to existing checkpoint JSONL file for resume (default: new file in data/)",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Path to write completion report JSON (default: data/extraction_report_<timestamp>.json)",
    )
    args = parser.parse_args()

    asyncio.run(run_extraction(args))


if __name__ == "__main__":
    main()
