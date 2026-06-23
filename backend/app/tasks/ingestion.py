"""Celery task for ingesting judgments from HuggingFace into Supabase.

This module moves the previously-blocking ``scripts/ingest_judgments.py``
pipeline into the Celery worker infrastructure (Refs #104). The ingestion
logic is preserved; it is wrapped so it can be triggered from an admin API
endpoint or a CLI that submits the task, monitored via Celery task state, and
resumed from an on-disk checkpoint.

The heavy ``datasets`` (HuggingFace) dependency is imported lazily inside the
methods that need it so that importing this module — and therefore the whole
Celery app for type/lint tooling and unrelated tasks — never requires it.
"""

from __future__ import annotations

import json
import os
import random
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import requests
from loguru import logger
from supabase import Client, create_client
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.workers import celery_app

if TYPE_CHECKING:
    from celery import Task

# Checkpoint file path. Kept on the worker's filesystem so an interrupted task
# can be resumed. Override with INGEST_CHECKPOINT_FILE for containerised
# deployments that mount a persistent volume.
CHECKPOINT_FILE = Path(
    os.environ.get(
        "INGEST_CHECKPOINT_FILE",
        str(Path(__file__).resolve().parent / ".ingest_checkpoint.json"),
    )
)


# A progress callback receives a dict of progress metadata. The Celery task
# passes one that forwards to ``self.update_state``; the CLI passes one that
# prints. ``None`` disables progress reporting.
ProgressCallback = Callable[[dict[str, Any]], None]

# Sentinel so callers can explicitly pass ``transformers_url=None`` to disable
# embeddings, while omitting the argument falls back to the env var.
_UNSET = object()


class JudgmentIngestionPipeline:
    """Ingest judgments from HuggingFace into Supabase with checkpoint/resume.

    Ported from ``scripts/ingest_judgments.py`` with two changes for running
    inside Celery:

    * No process-level signal handlers (the worker manages its own lifecycle);
      cooperative cancellation is exposed via :meth:`request_shutdown`.
    * Progress is reported through an injectable ``progress_callback`` instead
      of a Rich progress bar, so the Celery task can mirror it into task state.
    """

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        transformers_url: str | None | Any = _UNSET,
        batch_size: int = 50,
        progress_callback: ProgressCallback | None = None,
    ) -> None:
        self.supabase: Client = create_client(supabase_url, supabase_key)
        # ``_UNSET`` → fall back to env; an explicit None disables embeddings.
        if transformers_url is _UNSET:
            self.transformers_url = os.getenv(
                "TRANSFORMERS_INFERENCE_URL", "http://localhost:8080"
            )
        else:
            self.transformers_url = transformers_url
        self.batch_size = batch_size
        self._progress_callback = progress_callback

        self.stats: dict[str, Any] = {
            "processed": 0,
            "duplicates_skipped": 0,
            "errors": 0,
            "start_time": datetime.now(UTC),
        }

        self._shutdown = False

    # ── lifecycle ──────────────────────────────────────────────────────────

    def request_shutdown(self) -> None:
        """Cooperatively stop ingestion after the current batch."""
        self._shutdown = True

    def _report(self, **fields: Any) -> None:
        if self._progress_callback is None:
            return
        try:
            self._progress_callback(
                {
                    "processed": self.stats["processed"],
                    "duplicates_skipped": self.stats["duplicates_skipped"],
                    "errors": self.stats["errors"],
                    **fields,
                }
            )
        except Exception as exc:  # never let progress reporting break ingestion
            logger.warning(f"Progress callback failed: {exc}")

    # ── checkpointing ──────────────────────────────────────────────────────

    def save_checkpoint(self, dataset: str, index: int, total_processed: int) -> None:
        """Persist checkpoint to disk."""
        stats_serializable = {
            "processed": self.stats["processed"],
            "duplicates_skipped": self.stats["duplicates_skipped"],
            "errors": self.stats["errors"],
            "start_time": self.stats["start_time"].isoformat(),
        }
        checkpoint = {
            "dataset": dataset,
            "last_processed_index": index,
            "total_processed": total_processed,
            "started_at": self.stats["start_time"].isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
            "batch_size": self.batch_size,
            "stats": stats_serializable,
        }
        try:
            with open(CHECKPOINT_FILE, "w") as f:
                json.dump(checkpoint, f, indent=2)
            logger.debug(f"Saved checkpoint: {dataset} at index {index}")
        except Exception as exc:
            logger.error(f"Failed to save checkpoint: {exc}")

    def load_checkpoint(self) -> dict[str, Any] | None:
        """Load checkpoint from disk, if present."""
        try:
            if CHECKPOINT_FILE.exists():
                with open(CHECKPOINT_FILE) as f:
                    checkpoint = json.load(f)
                if "stats" in checkpoint and "start_time" in checkpoint["stats"]:
                    checkpoint["stats"]["start_time"] = datetime.fromisoformat(
                        checkpoint["stats"]["start_time"]
                    )
                logger.info(
                    f"Loaded checkpoint for {checkpoint['dataset']} "
                    f"at index {checkpoint['last_processed_index']}"
                )
                return checkpoint
            return None
        except Exception as exc:
            logger.error(f"Failed to load checkpoint: {exc}")
            return None

    def clear_checkpoint(self) -> None:
        """Remove the checkpoint file."""
        try:
            if CHECKPOINT_FILE.exists():
                CHECKPOINT_FILE.unlink()
                logger.info("Cleared checkpoint file")
        except Exception as exc:
            logger.error(f"Failed to clear checkpoint: {exc}")

    # ── idempotency / persistence ──────────────────────────────────────────

    def check_document_exists(self, case_number: str) -> bool:
        """Return True if a judgment with this case_number already exists."""
        try:
            response = (
                self.supabase.table("judgments")
                .select("case_number")
                .eq("case_number", case_number)
                .limit(1)
                .execute()
            )
            return len(response.data) > 0
        except Exception as exc:
            logger.warning(
                f"Failed to check document existence for {case_number}: {exc}"
            )
            return False

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((requests.RequestException, Exception)),
    )
    def generate_embedding(self, text: str) -> list[float] | None:
        """Generate a sentence-transformers embedding with retry logic."""
        if not self.transformers_url:
            return None
        try:
            truncated_text = text[:32000]
            url = f"{self.transformers_url}/vectors"
            response = requests.post(url, json={"text": truncated_text}, timeout=30)
            response.raise_for_status()
            vector = response.json().get("vector")
            if not vector:
                logger.warning(f"No vector in response from {url}")
                return None
            return vector
        except Exception as exc:
            logger.warning(f"Failed to generate embedding (will retry): {exc}")
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((Exception,)),
    )
    def _insert_judgment(self, judgment_data: dict[str, Any]) -> bool:
        """Upsert a judgment into Supabase (idempotent on case_number)."""
        try:
            response = (
                self.supabase.table("judgments")
                .upsert(judgment_data, on_conflict="case_number")
                .execute()
            )
            if response.data:
                logger.debug(f"Upserted judgment: {judgment_data.get('case_number')}")
                return True
            logger.warning(
                f"No data returned for judgment: {judgment_data.get('case_number')}"
            )
            return False
        except Exception as exc:
            logger.warning(
                f"Failed to insert judgment "
                f"{judgment_data.get('case_number')} (will retry): {exc}"
            )
            raise

    # ── Polish ingestion ───────────────────────────────────────────────────

    def ingest_polish_judgments(
        self, sample_size: int = 100, resume: bool = False
    ) -> int:
        """Ingest Polish criminal appellate judgments from JuDDGES/pl-court-raw."""
        from datasets import load_dataset  # lazy: heavy optional dependency

        random.seed(42)
        dataset_name = "polish"
        start_index = 0

        if resume:
            checkpoint = self.load_checkpoint()
            if checkpoint and checkpoint.get("dataset") == dataset_name:
                start_index = checkpoint["last_processed_index"] + 1
                self.stats = checkpoint.get("stats", self.stats)
                logger.info(f"Resuming Polish ingestion from index {start_index}")

        logger.info(
            f"Loading Polish criminal appellate judgments "
            f"(target {sample_size}, from index {start_index})"
        )

        try:
            dataset = load_dataset(
                "JuDDGES/pl-court-raw", split="train", streaming=True
            )

            matched_cases: list[dict[str, Any]] = []
            scanned = 0
            for item in dataset:
                if self._shutdown:
                    logger.info("Shutdown requested during scanning")
                    return self.stats["processed"]
                scanned += 1
                if scanned % 100000 == 0:
                    logger.info(
                        f"Scanned {scanned:,}... matched {len(matched_cases):,}"
                    )

                court = item.get("court_name", "") or ""
                dept = item.get("department_name", "") or ""
                if "Apelacyjn" not in court or "karn" not in dept.lower():
                    continue

                date = item.get("judgment_date")
                year_str = str(date)[:4] if date else ""
                try:
                    year = int(year_str)
                except ValueError:
                    continue
                if year < 2003 or year > 2024:
                    continue
                matched_cases.append(item)

            logger.info(
                f"Found {len(matched_cases):,} criminal appellate cases (2003-2024)"
            )

            if len(matched_cases) > sample_size:
                matched_cases = random.sample(matched_cases, sample_size)

            if start_index > 0:
                matched_cases = matched_cases[start_index:]

            total_cases = len(matched_cases)
            ingested = 0
            batch: list[tuple[int, dict[str, Any]]] = []
            for i, case in enumerate(matched_cases):
                if self._shutdown:
                    logger.info("Shutdown requested, saving checkpoint")
                    self.save_checkpoint(
                        dataset_name, start_index + i - 1, self.stats["processed"]
                    )
                    break
                batch.append((start_index + i, case))
                if len(batch) >= self.batch_size or i == total_cases - 1:
                    ingested += self._process_polish_batch(batch, dataset_name)
                    self._report(
                        dataset="polish",
                        total=total_cases,
                        completed=i + 1,
                    )
                    batch = []

            if not self._shutdown:
                self.clear_checkpoint()
            logger.info(f"Ingested {ingested} Polish criminal appellate judgments")
            return ingested
        except Exception as exc:
            logger.error(f"Error ingesting Polish judgments: {exc}")
            return self.stats["processed"]

    def _process_polish_batch(
        self, batch: list[tuple[int, dict[str, Any]]], dataset_name: str
    ) -> int:
        processed = 0
        for index, case in batch:
            try:
                judgment_data = self._transform_polish_judgment(case)
                if judgment_data:
                    case_number = judgment_data.get("case_number", "")
                    if self.check_document_exists(case_number):
                        self.stats["duplicates_skipped"] += 1
                        continue
                    if self._insert_judgment(judgment_data):
                        processed += 1
                        self.stats["processed"] += 1
                    else:
                        self.stats["errors"] += 1
                else:
                    self.stats["errors"] += 1
            except Exception as exc:
                logger.error(f"Error processing Polish judgment {index}: {exc}")
                self.stats["errors"] += 1

            if index % 10 == 0:
                self.save_checkpoint(dataset_name, index, self.stats["processed"])
        return processed

    # ── UK ingestion ───────────────────────────────────────────────────────

    def ingest_uk_judgments(self, sample_size: int = 100, resume: bool = False) -> int:
        """Ingest UK judgments from JuDDGES/en-court-raw with appealcourt fallback."""
        from datasets import load_dataset  # lazy: heavy optional dependency

        dataset_name = "uk"
        start_index = 0
        if resume:
            checkpoint = self.load_checkpoint()
            if checkpoint and checkpoint.get("dataset") == dataset_name:
                start_index = checkpoint["last_processed_index"] + 1
                self.stats = checkpoint.get("stats", self.stats)
                logger.info(f"Resuming UK ingestion from index {start_index}")

        total_ingested = 0
        logger.info(
            f"Loading UK judgments from JuDDGES/en-court-raw "
            f"(sample {sample_size}, from index {start_index})"
        )

        try:
            dataset = load_dataset("JuDDGES/en-court-raw", split="train")
            available = len(dataset)
            take = min(sample_size, available)
            logger.info(f"Dataset has {available} judgments, taking {take}")
            if start_index < take:
                sample_data = dataset.select(range(start_index, take))
                total_ingested += self._process_uk_batch(
                    sample_data, dataset_name, "JuDDGES/en-court-raw", start_index
                )
            logger.info(f"Ingested {total_ingested} from en-court-raw")
        except Exception as exc:
            logger.error(f"Error with en-court-raw: {exc}")

        remaining = sample_size - total_ingested
        if remaining > 0 and not self._shutdown:
            logger.info(f"Loading {remaining} more from JuDDGES/en-appealcourt")
            try:
                dataset2 = load_dataset("JuDDGES/en-appealcourt", split="test")
                take2 = min(remaining, len(dataset2))
                sample_data2 = dataset2.select(range(take2))
                count_before = total_ingested
                total_ingested += self._process_uk_batch(
                    sample_data2, dataset_name, "JuDDGES/en-appealcourt", 0
                )
                logger.info(
                    f"Ingested {total_ingested - count_before} from en-appealcourt"
                )
            except Exception as exc:
                logger.error(f"Error with en-appealcourt: {exc}")

        if not self._shutdown:
            self.clear_checkpoint()
        logger.info(f"Total UK judgments ingested: {total_ingested}")
        return total_ingested

    def _process_uk_batch(
        self, dataset, dataset_name: str, source: str, start_index: int
    ) -> int:
        processed = 0
        total = len(dataset)
        batch: list[tuple[int, dict[str, Any]]] = []
        for i, case in enumerate(dataset):
            if self._shutdown:
                logger.info("Shutdown requested, saving checkpoint")
                self.save_checkpoint(
                    dataset_name, start_index + i - 1, self.stats["processed"]
                )
                break
            batch.append((start_index + i, case))
            if len(batch) >= self.batch_size or i == total - 1:
                for index, judgment_case in batch:
                    try:
                        judgment_data = self._transform_uk_judgment(
                            judgment_case, source=source
                        )
                        if judgment_data:
                            case_number = judgment_data.get("case_number", "")
                            if self.check_document_exists(case_number):
                                self.stats["duplicates_skipped"] += 1
                                continue
                            if self._insert_judgment(judgment_data):
                                processed += 1
                                self.stats["processed"] += 1
                            else:
                                self.stats["errors"] += 1
                        else:
                            self.stats["errors"] += 1
                    except Exception as exc:
                        logger.error(f"Error processing UK judgment {index}: {exc}")
                        self.stats["errors"] += 1
                    if index % 10 == 0:
                        self.save_checkpoint(
                            dataset_name, index, self.stats["processed"]
                        )
                self._report(dataset=source, total=total, completed=i + 1)
                batch = []
        return processed

    # ── transforms ─────────────────────────────────────────────────────────

    def _transform_polish_judgment(
        self, raw_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Transform a JuDDGES/pl-court-raw row to the judgments schema."""
        try:
            full_text = raw_data.get("full_text", "")
            if not full_text:
                return None

            court_name = raw_data.get("court_name", "") or ""
            dept = raw_data.get("department_name", "") or ""

            judges_raw = raw_data.get("judges", []) or []
            if isinstance(judges_raw, str):
                judges = [j.strip() for j in judges_raw.split(",")]
            elif isinstance(judges_raw, list):
                judges = judges_raw
            else:
                judges = []

            presiding = raw_data.get("presiding_judge", "") or ""
            if presiding and presiding not in judges:
                judges.insert(0, presiding)

            keywords = raw_data.get("keywords", []) or []
            legal_bases = raw_data.get("legal_bases", []) or []

            docket = raw_data.get("docket_number", "") or ""
            case_number = (
                docket
                if docket
                else f"PL-APPEAL-{raw_data.get('judgment_id', 'unknown')[:12]}"
            )

            excerpt = raw_data.get("excerpt", "") or ""
            title = excerpt[:500] if excerpt else full_text[:200]
            summary = excerpt[:2000] if excerpt else ""

            return {
                "case_number": case_number,
                "jurisdiction": "PL",
                "court_name": court_name,
                "court_level": "Court of Appeal",
                "decision_date": self._parse_date(raw_data.get("judgment_date")),
                "title": title,
                "summary": summary,
                "full_text": full_text,
                "judges": judges,
                "case_type": "Criminal",
                "decision_type": raw_data.get("judgment_type", ""),
                "outcome": None,
                "keywords": keywords[:20],
                "legal_topics": [
                    lb if isinstance(lb, str) else str(lb) for lb in legal_bases[:20]
                ],
                "embedding": self.generate_embedding(full_text),
                "metadata": {
                    "language": "pl",
                    "department": dept,
                    "court_type": "appellate",
                    "source_judgment_id": raw_data.get("judgment_id", ""),
                    "num_pages": raw_data.get("num_pages"),
                    "country": "PL",
                },
                "source_dataset": "JuDDGES/pl-court-raw",
                "source_id": raw_data.get("judgment_id", "")[:40],
                "source_url": raw_data.get("source", ""),
            }
        except Exception as exc:
            logger.warning(f"Failed to transform Polish judgment: {exc}")
            return None

    def _transform_uk_judgment(
        self, raw_data: dict[str, Any], source: str = "JuDDGES/en-appealcourt"
    ) -> dict[str, Any] | None:
        """Transform a JuDDGES UK dataset row to the judgments schema."""
        try:
            if source == "JuDDGES/en-appealcourt":
                full_text = raw_data.get("context", "")
                if not full_text:
                    return None
                return {
                    "case_number": f"UK-APPEAL-{hash(full_text[:100]) % 1000000}",
                    "jurisdiction": "UK",
                    "court_name": "Court of Appeal",
                    "court_level": "Appeal Court",
                    "decision_date": None,
                    "title": full_text[:200] if full_text else "Appeal Court Judgment",
                    "summary": full_text[:500] if len(full_text) > 500 else "",
                    "full_text": full_text,
                    "judges": [],
                    "case_type": "Criminal",
                    "decision_type": "Judgment",
                    "outcome": None,
                    "keywords": [],
                    "legal_topics": [],
                    "embedding": self.generate_embedding(full_text),
                    "metadata": {
                        "language": "en",
                        "division": "Criminal",
                        "has_structured_output": "output" in raw_data,
                    },
                    "source_dataset": source,
                    "source_id": str(hash(full_text[:100]))[:10],
                    "source_url": None,
                }

            full_text = raw_data.get("full_text", "")
            if not full_text:
                return None

            judge_field = raw_data.get("judges", [])
            if isinstance(judge_field, list):
                judges = judge_field
            elif isinstance(judge_field, str):
                judges = [j.strip() for j in judge_field.split(",")]
            else:
                judges = []

            court_type = raw_data.get("court_type", "unknown")
            court_name = court_type.replace("_", " ").title()

            return {
                "case_number": raw_data.get(
                    "citation",
                    raw_data.get(
                        "docket_number",
                        f"UK-{raw_data.get('judgment_id', 'unknown')[:10]}",
                    ),
                ),
                "jurisdiction": "UK",
                "court_name": court_name,
                "court_level": "High Court"
                if "high" in court_type.lower()
                else "Crown Court"
                if "crown" in court_type.lower()
                else "Court",
                "decision_date": self._parse_date(raw_data.get("publication_date")),
                "title": raw_data.get("excerpt", full_text[:200])[:500],
                "summary": raw_data.get("excerpt", ""),
                "full_text": full_text,
                "judges": judges,
                "case_type": "Criminal" if "crim" in court_type.lower() else "Civil",
                "decision_type": "Judgment",
                "outcome": None,
                "keywords": [],
                "legal_topics": [],
                "embedding": self.generate_embedding(full_text),
                "metadata": {
                    "language": "en",
                    "court_type": court_type,
                    "country": raw_data.get("country", "UK"),
                    "file_name": raw_data.get("file_name", ""),
                },
                "source_dataset": source,
                "source_id": raw_data.get("judgment_id", "")[:20],
                "source_url": raw_data.get("uri"),
            }
        except Exception as exc:
            logger.warning(f"Failed to transform UK judgment from {source}: {exc}")
            return None

    def _parse_date(self, date_str: str | None) -> str | None:
        """Parse a date string into ISO format, or None."""
        if not date_str:
            return None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y", "%d.%m.%Y"):
            try:
                return datetime.strptime(str(date_str), fmt).date().isoformat()
            except ValueError:
                continue
        return None


def run_ingestion_pipeline(
    polish: int = 0,
    uk: int = 0,
    *,
    skip_polish: bool = False,
    skip_uk: bool = False,
    no_embeddings: bool = False,
    resume: bool = False,
    batch_size: int = 50,
    progress_callback: ProgressCallback | None = None,
    shutdown_check: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    """Run the ingestion pipeline synchronously and return a summary.

    Shared by the Celery task and the CLI ``--inline`` mode. Raises
    ``RuntimeError`` if Supabase credentials are missing.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for ingestion"
        )

    transformers_url = (
        None
        if no_embeddings
        else os.getenv("TRANSFORMERS_INFERENCE_URL", "http://localhost:8080")
    )

    pipeline = JudgmentIngestionPipeline(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        transformers_url=transformers_url,
        batch_size=batch_size,
        progress_callback=progress_callback,
    )

    started_at = datetime.now(UTC)
    total_ingested = 0

    if not skip_polish and polish > 0:
        if shutdown_check and shutdown_check():
            pipeline.request_shutdown()
        total_ingested += pipeline.ingest_polish_judgments(
            sample_size=polish, resume=resume
        )

    if not skip_uk and uk > 0:
        if shutdown_check and shutdown_check():
            pipeline.request_shutdown()
        total_ingested += pipeline.ingest_uk_judgments(sample_size=uk, resume=resume)

    elapsed = (datetime.now(UTC) - started_at).total_seconds()
    return {
        "status": "completed",
        "total_ingested": total_ingested,
        "processed": pipeline.stats["processed"],
        "duplicates_skipped": pipeline.stats["duplicates_skipped"],
        "errors": pipeline.stats["errors"],
        "elapsed_seconds": round(elapsed, 2),
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now(UTC).isoformat(),
    }


@celery_app.task(
    bind=True,
    name="ingestion.ingest_judgments",
    track_started=True,
    max_retries=0,
)
def ingest_judgments_task(
    self: Task,
    polish: int = 0,
    uk: int = 0,
    skip_polish: bool = False,
    skip_uk: bool = False,
    no_embeddings: bool = False,
    resume: bool = False,
    batch_size: int = 50,
) -> dict[str, Any]:
    """Celery task: ingest judgments from HuggingFace into Supabase (Refs #104).

    Progress is reported through ``self.update_state(state="PROGRESS", ...)``
    so an admin endpoint or CLI can poll for processed/total/errors and ETA.
    Idempotency is guaranteed by upsert-on-conflict(case_number); checkpoint
    files let an interrupted run resume.
    """
    job_start = datetime.now(UTC)

    def _on_progress(meta: dict[str, Any]) -> None:
        completed = meta.get("completed", 0) or 0
        total = meta.get("total", 0) or 0
        elapsed = (datetime.now(UTC) - job_start).total_seconds()
        avg = elapsed / completed if completed else 0
        eta = avg * (total - completed) if total else 0
        self.update_state(
            state="PROGRESS",
            meta={
                **meta,
                "elapsed_seconds": int(elapsed),
                "estimated_time_remaining_seconds": int(eta),
            },
        )

    logger.info(
        f"Starting ingestion task {self.request.id}: "
        f"polish={polish}, uk={uk}, resume={resume}, batch_size={batch_size}"
    )

    summary = run_ingestion_pipeline(
        polish=polish,
        uk=uk,
        skip_polish=skip_polish,
        skip_uk=skip_uk,
        no_embeddings=no_embeddings,
        resume=resume,
        batch_size=batch_size,
        progress_callback=_on_progress,
    )

    logger.info(f"Ingestion task {self.request.id} finished: {summary}")
    return summary


def _build_cli_parser() -> Any:
    import argparse

    parser = argparse.ArgumentParser(
        prog="python -m app.tasks.ingestion",
        description="Submit or run the judgment-ingestion pipeline (#104).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def _add_common(p: Any) -> None:
        p.add_argument("--polish", type=int, default=0)
        p.add_argument("--uk", type=int, default=0)
        p.add_argument("--skip-polish", action="store_true")
        p.add_argument("--skip-uk", action="store_true")
        p.add_argument("--no-embeddings", action="store_true")
        p.add_argument("--resume", action="store_true")
        p.add_argument("--batch-size", type=int, default=50)

    submit_p = sub.add_parser(
        "submit", help="Submit the ingestion job to Celery (non-blocking)."
    )
    _add_common(submit_p)

    inline_p = sub.add_parser(
        "inline", help="Run the ingestion pipeline in the foreground."
    )
    _add_common(inline_p)

    return parser


def _cli() -> None:
    parser = _build_cli_parser()
    args = parser.parse_args()

    kwargs = {
        "polish": args.polish,
        "uk": args.uk,
        "skip_polish": args.skip_polish,
        "skip_uk": args.skip_uk,
        "no_embeddings": args.no_embeddings,
        "resume": args.resume,
        "batch_size": args.batch_size,
    }

    if args.command == "submit":
        task = ingest_judgments_task.delay(**kwargs)
        logger.info(f"Submitted ingestion job to Celery: task_id={task.id}")
        print(f"task_id={task.id}")
    else:  # inline
        summary = run_ingestion_pipeline(
            progress_callback=lambda meta: logger.info(f"progress: {meta}"),
            **kwargs,
        )
        logger.info(f"Ingestion finished: {summary}")
        print(summary)


if __name__ == "__main__":
    _cli()
