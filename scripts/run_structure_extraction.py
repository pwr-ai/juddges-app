"""Batch structural segmentation for judgments using Anthropic models.

Splits each judgment into standardised structural sections (case_identification,
facts, court_analysis, etc.) using LLM structured output.

Usage:
    # Set ANTHROPIC_API_KEY first (or it will be loaded from .env)
    export ANTHROPIC_API_KEY=sk-ant-...

    # Run with defaults (claude-sonnet-4-6, batch of 50, 5 concurrent)
    python scripts/run_structure_extraction.py

    # Use Opus for higher quality
    python scripts/run_structure_extraction.py --model claude-opus-4-6

    # Adjust concurrency and batch size
    python scripts/run_structure_extraction.py --concurrency 10 --batch-size 100

    # Process only UK or PL
    python scripts/run_structure_extraction.py --jurisdiction UK

    # Retry failed only
    python scripts/run_structure_extraction.py --failed-only

    # Dry run (count without processing)
    python scripts/run_structure_extraction.py --dry-run

    # Limit total documents processed
    python scripts/run_structure_extraction.py --limit 100
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

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATA_DIR = PROJECT_ROOT / "data"
SCHEMA_DIR = (
    PROJECT_ROOT / "backend" / "packages" / "juddges_search" / "config" / "schema"
)
PROMPTS_DIR = (
    PROJECT_ROOT / "backend" / "packages" / "juddges_search" / "config" / "prompts"
)

STRUCTURE_SCHEMA_EN = SCHEMA_DIR / "judgment_structure_schema_en.json"
STRUCTURE_SCHEMA_PL = SCHEMA_DIR / "judgment_structure_schema_pl.json"

STATUS_COLUMN = "structure_extraction_status"
RAW_COLUMN = "structure_raw_extraction"
MODEL_COLUMN = "structure_extraction_model"
ERROR_COLUMN = "structure_extraction_error"
TIMESTAMP_COLUMN = "structure_extracted_at"


def _default_checkpoint_path() -> Path:
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    return DATA_DIR / f"structure_checkpoint_{ts}.jsonl"


def _default_report_path() -> Path:
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    return DATA_DIR / f"structure_report_{ts}.json"


def load_checkpoint(path: Path) -> dict[str, str]:
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
    checkpoint = load_checkpoint(checkpoint_path)
    completed = sum(1 for s in checkpoint.values() if s == "completed")
    failed = sum(1 for s in checkpoint.values() if s == "failed")

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
        "pass": "structural_segmentation",
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

    if "title" in result:
        result["title"] = re.sub(r"[^a-zA-Z0-9_-]", "_", result["title"]).strip("_")[
            :64
        ]

    return result


def load_instructions(language: str) -> str:
    import yaml

    instruction_file = PROMPTS_DIR / f"structural_segmentation_instructions_{language}.yaml"
    if not instruction_file.exists():
        return ""
    with open(instruction_file) as f:
        data = yaml.safe_load(f)
    return data.get("content", "")


def build_extraction_prompt(full_text: str, language: str) -> str:
    instructions = load_instructions(language)

    context = (
        "Segment this court judgment into standardised structural sections using the provided schema. "
        "Extract verbatim text for each section and provide brief summaries. "
        "Set sections to null if they are not present in the document."
    )

    labels = {
        "en": {"judgment": "Judgment text for structural segmentation:"},
        "pl": {"judgment": "Tekst orzeczenia do segmentacji strukturalnej:"},
    }
    label = labels.get(language, labels["en"])

    parts = [context, ""]
    if instructions:
        parts.append(instructions)
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
    query = supabase.table("judgments").select("id, jurisdiction, court_name")

    if failed_only:
        query = query.eq(STATUS_COLUMN, "failed")
    else:
        query = query.in_(STATUS_COLUMN, ["pending", "failed"])

    if jurisdiction:
        query = query.eq("jurisdiction", jurisdiction)

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


def extract_queryable_fields(extracted_data: dict) -> dict:
    """Extract key fields from JSONB for typed columns."""
    fields = {
        "structure_section_count": extracted_data.get("section_count"),
        "structure_confidence": extracted_data.get("structure_confidence"),
    }

    # Extract summaries from section objects
    for section_key, col_suffix in [
        ("case_identification", "case_identification_summary"),
        ("facts_of_the_case", "facts_summary"),
        ("operative_part", "operative_part_summary"),
        ("conclusion", "conclusion_summary"),
    ]:
        section = extracted_data.get(section_key)
        if isinstance(section, dict):
            fields[f"structure_{col_suffix}"] = section.get("summary")
        else:
            fields[f"structure_{col_suffix}"] = None

    # Build court analysis summary from array
    court_analysis = extracted_data.get("court_analysis")
    if isinstance(court_analysis, list) and court_analysis:
        summaries = []
        for item in court_analysis[:5]:
            label = item.get("issue_label", "")
            outcome = item.get("outcome", "")
            if label:
                summaries.append(f"{label}: {outcome}" if outcome else label)
        fields["structure_court_analysis_summary"] = "; ".join(summaries) if summaries else None
    else:
        fields["structure_court_analysis_summary"] = None

    return fields


def save_extraction_result(
    supabase,
    doc_id: str,
    extracted_data: dict,
    model_name: str,
):
    queryable = extract_queryable_fields(extracted_data)
    update_data = {
        RAW_COLUMN: extracted_data,
        STATUS_COLUMN: "completed",
        MODEL_COLUMN: model_name,
        ERROR_COLUMN: None,
        TIMESTAMP_COLUMN: datetime.now(UTC).isoformat(),
        **queryable,
    }
    supabase.table("judgments").update(update_data).eq("id", doc_id).execute()


def save_extraction_failure(supabase, doc_id: str, error_msg: str, model_name: str):
    supabase.table("judgments").update(
        {
            STATUS_COLUMN: "failed",
            MODEL_COLUMN: model_name,
            ERROR_COLUMN: error_msg[:1000],
            TIMESTAMP_COLUMN: datetime.now(UTC).isoformat(),
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
    doc_id = doc["id"]
    jurisdiction = doc.get("jurisdiction", "UK")
    language = "pl" if jurisdiction == "PL" else "en"

    async with semaphore:
        try:
            full_text = fetch_document_text(supabase_client, doc_id)
            if not full_text:
                save_extraction_failure(
                    supabase_client, doc_id, "Document has no text content", model_name
                )
                if checkpoint_path:
                    append_checkpoint(
                        checkpoint_path, doc_id, "failed", jurisdiction, "No text content"
                    )
                return doc_id, False, "No text content"

            prompt = build_extraction_prompt(full_text, language)
            schema_to_use = schema[language]
            structured_model = model.with_structured_output(schema_to_use)
            result = await structured_model.ainvoke(prompt)

            if hasattr(result, "model_dump"):
                extracted_data = result.model_dump()
            elif isinstance(result, dict):
                extracted_data = result
            else:
                extracted_data = dict(result)

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
    from langchain_anthropic import ChatAnthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set. Export it or add to .env file.")
        sys.exit(1)

    model = ChatAnthropic(
        model=args.model,
        temperature=0,
        max_tokens=8192,
        anthropic_api_key=api_key,
    )
    logger.info(f"Using model: {args.model}")

    en_schema = clean_schema_for_anthropic(load_schema(STRUCTURE_SCHEMA_EN))
    pl_schema = clean_schema_for_anthropic(load_schema(STRUCTURE_SCHEMA_PL))
    schemas = {"en": en_schema, "pl": pl_schema}
    logger.info(
        f"Loaded EN schema ({len(en_schema.get('properties', {}))} fields) "
        f"and PL schema ({len(pl_schema.get('properties', {}))} fields)"
    )

    supabase = get_supabase_client()

    checkpoint_path = (
        Path(args.checkpoint) if args.checkpoint else _default_checkpoint_path()
    )
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    existing_checkpoint = (
        load_checkpoint(checkpoint_path) if checkpoint_path.exists() else {}
    )
    already_done_ids = {
        doc_id for doc_id, status in existing_checkpoint.items() if status == "completed"
    }
    if already_done_ids:
        logger.info(
            f"Loaded checkpoint with {len(already_done_ids)} already-completed docs"
        )

    logger.info("Fetching pending judgments for structural segmentation...")
    docs = fetch_pending_judgments(
        supabase,
        jurisdiction=args.jurisdiction,
        failed_only=args.failed_only,
        limit=args.limit,
    )
    total_found = len(docs)
    logger.info(f"Found {total_found} judgments to process")

    if already_done_ids:
        docs = [d for d in docs if d["id"] not in already_done_ids]
        skipped = total_found - len(docs)
        logger.info(f"Skipping {skipped} already-completed. {len(docs)} remaining.")
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
        description="Run structural segmentation on judgments"
    )
    parser.add_argument(
        "--model", default="claude-sonnet-4-6",
        help="Anthropic model to use (default: claude-sonnet-4-6)",
    )
    parser.add_argument(
        "--concurrency", type=int, default=5,
        help="Number of concurrent extraction calls (default: 5)",
    )
    parser.add_argument(
        "--batch-size", type=int, default=50,
        help="Number of documents per batch (default: 50)",
    )
    parser.add_argument(
        "--jurisdiction", choices=["UK", "PL"], default=None,
        help="Process only specific jurisdiction",
    )
    parser.add_argument(
        "--failed-only", action="store_true",
        help="Only retry previously failed extractions",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Count documents without processing",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Limit total documents to process",
    )
    parser.add_argument(
        "--checkpoint", default=None,
        help="Path to existing checkpoint JSONL file for resume",
    )
    parser.add_argument(
        "--report", default=None,
        help="Path to write completion report JSON",
    )
    args = parser.parse_args()
    asyncio.run(run_extraction(args))


if __name__ == "__main__":
    main()
