"""
OCR Processing API endpoints for scanned PDF documents and images.

This module provides:
- OCR job submission for scanned PDFs and images
- Job status tracking with quality assessment
- Manual text correction interface
- Per-page OCR results with confidence scores
"""

import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from loguru import logger

from app.core.supabase import get_supabase_client
from app.models import (
    OCRCorrectionRequest,
    OCRCorrectionResponse,
    OCRJobListResponse,
    OCRJobRequest,
    OCRJobResponse,
    OCRJobStatus,
    OCRPageResult,
    OCRQualityMetrics,
    validate_id_format,
)

router = APIRouter(prefix="/ocr", tags=["ocr"])

# Column projections for OCR tables.
_OCR_JOB_COLS = (
    "id, document_id, status, source_type, source_filename, extracted_text, "
    "confidence_score, page_count, language_detected, corrected_text, "
    "correction_notes, corrected_at, created_at, updated_at, completed_at, error_message"
)
_OCR_PAGE_COLS = (
    "page_number, extracted_text, confidence_score, word_count, quality_metrics"
)


def _compute_quality_metrics(text: str, confidence: float) -> dict:
    """Compute quality metrics for extracted OCR text."""
    words = text.split() if text else []
    total_words = len(words)

    # Estimate low-confidence words based on overall confidence
    low_confidence_ratio = max(0.0, 1.0 - confidence)
    low_confidence_words = int(total_words * low_confidence_ratio * 0.5)

    estimated_accuracy = confidence

    # Determine quality level
    if confidence >= 0.9:
        quality_level = "high"
        needs_review = False
    elif confidence >= 0.7:
        quality_level = "medium"
        needs_review = True
    else:
        quality_level = "low"
        needs_review = True

    return {
        "avg_confidence": round(confidence, 4),
        "low_confidence_words": low_confidence_words,
        "total_words": total_words,
        "estimated_accuracy": round(estimated_accuracy, 4),
        "needs_review": needs_review,
        "quality_level": quality_level,
    }


def _simulate_ocr_processing(text_content: str, source_type: str) -> dict:
    """
    Simulate OCR processing for demonstration purposes.

    In production, this would use Tesseract, Google Vision API, or Azure Document Intelligence.
    For now, we simulate the OCR pipeline:
    1. Accept the file content
    2. Generate realistic OCR output with confidence scores
    3. Return per-page results with quality assessment
    """
    # For demo: use the provided text as if it were extracted via OCR
    # Add some simulated OCR artifacts to demonstrate quality assessment
    if not text_content:
        text_content = (
            "This is a sample OCR output from a scanned legal document. "
            "The document contains legal provisions regarding tax obligations "
            "and compliance requirements for fiscal year 2025. "
            "Court ruling reference: II FSK 1234/21. "
            "The presiding judge ruled in favor of the petitioner."
        )

    # Simulate multi-page splitting
    sentences = re.split(r"(?<=[.!?])\s+", text_content)
    pages = []
    page_size = max(1, len(sentences) // 3)  # Roughly 3 pages

    for i in range(0, len(sentences), page_size):
        page_text = " ".join(sentences[i : i + page_size])
        if page_text.strip():
            pages.append(page_text)

    if not pages:
        pages = [text_content]

    # Generate confidence scores (slightly varying per page)
    import random

    random.seed(hash(text_content) % (2**32))
    base_confidence = random.uniform(0.75, 0.98)

    page_results = []
    all_words = 0
    for idx, page_text in enumerate(pages):
        page_confidence = min(
            1.0, max(0.5, base_confidence + random.uniform(-0.08, 0.08))
        )
        word_count = len(page_text.split())
        all_words += word_count
        page_results.append(
            {
                "page_number": idx + 1,
                "extracted_text": page_text,
                "confidence_score": round(page_confidence, 4),
                "word_count": word_count,
                "quality_metrics": _compute_quality_metrics(page_text, page_confidence),
            }
        )

    full_text = "\n\n".join(p["extracted_text"] for p in page_results)
    avg_confidence = (
        sum(p["confidence_score"] for p in page_results) / len(page_results)
        if page_results
        else 0.0
    )

    return {
        "extracted_text": full_text,
        "confidence_score": round(avg_confidence, 4),
        "page_count": len(page_results),
        "language_detected": "pl",
        "quality_metrics": _compute_quality_metrics(full_text, avg_confidence),
        "page_results": page_results,
    }


def _format_timestamp(ts) -> str | None:
    """Format a timestamp to ISO 8601 string."""
    if ts is None:
        return None
    if isinstance(ts, str):
        return ts
    if isinstance(ts, datetime):
        return ts.isoformat()
    return str(ts)


def _build_job_status(job: dict, pages: list[dict] | None = None) -> dict:
    """Build OCR job status from database record."""
    quality_metrics = job.get("quality_metrics")
    if quality_metrics and isinstance(quality_metrics, dict):
        quality_metrics = OCRQualityMetrics(**quality_metrics).model_dump()

    page_results = None
    if pages:
        page_results = []
        for p in sorted(pages, key=lambda x: x.get("page_number", 0)):
            pq = p.get("quality_metrics")
            if pq and isinstance(pq, dict):
                pq = OCRQualityMetrics(**pq).model_dump()
            page_results.append(
                OCRPageResult(
                    page_number=p["page_number"],
                    extracted_text=p.get("extracted_text", ""),
                    confidence_score=p.get("confidence_score", 0.0),
                    word_count=p.get("word_count", 0),
                    quality_metrics=OCRQualityMetrics(**pq) if pq else None,
                ).model_dump()
            )

    return {
        "job_id": str(job["id"]),
        "document_id": job["document_id"],
        "status": job["status"],
        "source_type": job["source_type"],
        "source_filename": job.get("source_filename"),
        "extracted_text": job.get("extracted_text"),
        "confidence_score": job.get("confidence_score"),
        "page_count": job.get("page_count"),
        "language_detected": job.get("language_detected"),
        "quality_metrics": quality_metrics,
        "pages": page_results,
        "corrected_text": job.get("corrected_text"),
        "correction_notes": job.get("correction_notes"),
        "corrected_at": _format_timestamp(job.get("corrected_at")),
        "created_at": _format_timestamp(job.get("created_at", "")),
        "updated_at": _format_timestamp(job.get("updated_at", "")),
        "completed_at": _format_timestamp(job.get("completed_at")),
        "error_message": job.get("error_message"),
    }


# ===== Endpoints =====


@router.post(
    "/jobs",
    response_model=OCRJobResponse,
    summary="Submit a document for OCR processing",
    description="Upload a scanned PDF or image for optical character recognition.",
)
async def submit_ocr_job(
    file: UploadFile = File(..., description="Scanned PDF or image file"),
    document_id: str = Form(..., description="Document ID to associate results with"),
    source_type: str = Form(..., description="Source type: 'pdf' or 'image'"),
    language_hint: str | None = Form(None, description="Language hint for OCR"),
) -> OCRJobResponse:
    """Submit a document for OCR processing."""
    # Validate inputs
    try:
        validate_id_format(document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if source_type not in ("pdf", "image"):
        raise HTTPException(
            status_code=400, detail="source_type must be 'pdf' or 'image'"
        )

    # Validate file type
    allowed_types = {
        "pdf": ["application/pdf"],
        "image": ["image/png", "image/jpeg", "image/tiff", "image/bmp", "image/webp"],
    }
    content_type = file.content_type or ""
    if content_type not in allowed_types.get(source_type, []):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{content_type}' for source_type '{source_type}'. "
            f"Allowed: {allowed_types[source_type]}",
        )

    # Initialize job_id before try block so except handler can safely reference it
    job_id: str | None = None

    try:
        if language_hint:
            logger.info(f"OCR language hint provided: {language_hint}")

        # Read file content in chunks to avoid loading oversized files into memory
        max_size = 50 * 1024 * 1024  # 50MB limit
        chunk_size = 1024 * 1024  # 1MB chunks
        chunks: list[bytes] = []
        bytes_read = 0

        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            bytes_read += len(chunk)
            if bytes_read > max_size:
                raise HTTPException(
                    status_code=400, detail="File size exceeds 50MB limit"
                )
            chunks.append(chunk)

        file_content = b"".join(chunks)

        # Create job in database
        supabase = get_supabase_client()
        job_id = str(uuid.uuid4())

        job_data = {
            "id": job_id,
            "document_id": document_id,
            "status": "processing",
            "source_type": source_type,
            "source_filename": file.filename,
        }

        result = supabase.table("ocr_jobs").insert(job_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create OCR job")

        # Simulate OCR processing (in production, this would be async via Celery)
        text_preview = (
            file_content.decode("utf-8", errors="ignore")[:5000] if file_content else ""
        )
        ocr_result = _simulate_ocr_processing(text_preview, source_type)

        # Update job with results
        update_data = {
            "status": "completed",
            "extracted_text": ocr_result["extracted_text"],
            "confidence_score": ocr_result["confidence_score"],
            "page_count": ocr_result["page_count"],
            "language_detected": ocr_result["language_detected"],
            "quality_metrics": ocr_result["quality_metrics"],
            "completed_at": datetime.now(UTC).isoformat(),
        }

        supabase.table("ocr_jobs").update(update_data).eq("id", job_id).execute()

        # Insert page results
        for page in ocr_result["page_results"]:
            page_data = {
                "job_id": job_id,
                "page_number": page["page_number"],
                "extracted_text": page["extracted_text"],
                "confidence_score": page["confidence_score"],
                "word_count": page["word_count"],
                "quality_metrics": page["quality_metrics"],
            }
            supabase.table("ocr_page_results").insert(page_data).execute()

        logger.info(
            f"OCR job {job_id} completed: {ocr_result['page_count']} pages, "
            f"confidence={ocr_result['confidence_score']:.2f}"
        )

        return OCRJobResponse(
            job_id=job_id,
            document_id=document_id,
            status="completed",
            message=f"OCR processing completed. {ocr_result['page_count']} pages processed with "
            f"{ocr_result['confidence_score']:.0%} average confidence.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR processing error: {e!s}", exc_info=True)
        # If job was created, mark it as failed
        if job_id is not None:
            try:
                supabase = get_supabase_client()
                supabase.table("ocr_jobs").update(
                    {
                        "status": "failed",
                        "error_message": str(e),
                    }
                ).eq("id", job_id).execute()
            except Exception:
                logger.exception(
                    f"Failed to mark OCR job as failed for job_id={job_id}"
                )
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {e!s}")


@router.post(
    "/jobs/text",
    response_model=OCRJobResponse,
    summary="Submit text content for OCR simulation",
    description="Submit text content to simulate OCR processing (for testing and demo).",
)
async def submit_ocr_job_text(
    request: OCRJobRequest,
) -> OCRJobResponse:
    """Submit text content for OCR processing simulation."""
    try:
        supabase = get_supabase_client()
        job_id = str(uuid.uuid4())

        job_data = {
            "id": job_id,
            "document_id": request.document_id,
            "status": "processing",
            "source_type": request.source_type,
            "source_filename": request.source_filename,
        }

        result = supabase.table("ocr_jobs").insert(job_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create OCR job")

        # Simulate OCR on demo content
        demo_text = (
            "Wyrok Naczelnego Sądu Administracyjnego z dnia 15 marca 2025 r. "
            "Sygn. akt II FSK 1234/24. Sentencja: Naczelny Sąd Administracyjny "
            "po rozpoznaniu w dniu 15 marca 2025 r. na rozprawie w Izbie Finansowej "
            "skargi kasacyjnej Dyrektora Krajowej Informacji Skarbowej od wyroku "
            "Wojewódzkiego Sądu Administracyjnego w Warszawie z dnia 10 stycznia 2025 r. "
            "sygn. akt III SA/Wa 567/24 w sprawie ze skargi spółki XYZ sp. z o.o. "
            "na interpretację indywidualną Dyrektora Krajowej Informacji Skarbowej "
            "z dnia 5 września 2024 r. w przedmiocie podatku od towarów i usług. "
            "Uzasadnienie: Zaskarżoną interpretacją indywidualną organ podatkowy uznał "
            "stanowisko wnioskodawcy za nieprawidłowe w zakresie stawki podatku VAT "
            "stosowanej do świadczenia usług doradztwa prawnego."
        )

        ocr_result = _simulate_ocr_processing(demo_text, request.source_type)

        update_data = {
            "status": "completed",
            "extracted_text": ocr_result["extracted_text"],
            "confidence_score": ocr_result["confidence_score"],
            "page_count": ocr_result["page_count"],
            "language_detected": ocr_result["language_detected"],
            "quality_metrics": ocr_result["quality_metrics"],
            "completed_at": datetime.now(UTC).isoformat(),
        }

        supabase.table("ocr_jobs").update(update_data).eq("id", job_id).execute()

        for page in ocr_result["page_results"]:
            page_data = {
                "job_id": job_id,
                "page_number": page["page_number"],
                "extracted_text": page["extracted_text"],
                "confidence_score": page["confidence_score"],
                "word_count": page["word_count"],
                "quality_metrics": page["quality_metrics"],
            }
            supabase.table("ocr_page_results").insert(page_data).execute()

        logger.info(
            f"OCR text job {job_id} completed: {ocr_result['page_count']} pages"
        )

        return OCRJobResponse(
            job_id=job_id,
            document_id=request.document_id,
            status="completed",
            message=f"OCR processing completed. {ocr_result['page_count']} pages processed with "
            f"{ocr_result['confidence_score']:.0%} average confidence.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR text processing error: {e!s}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {e!s}")


@router.get(
    "/jobs/{job_id}",
    response_model=OCRJobStatus,
    summary="Get OCR job status and results",
)
async def get_ocr_job(job_id: str) -> OCRJobStatus:
    """Get the status and results of an OCR job."""
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job_id format")

    try:
        supabase = get_supabase_client()

        # Fetch job
        result = (
            supabase.table("ocr_jobs").select(_OCR_JOB_COLS).eq("id", job_id).execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail=f"OCR job {job_id} not found")

        job = result.data[0]

        # Fetch page results
        pages_result = (
            supabase.table("ocr_page_results")
            .select(_OCR_PAGE_COLS)
            .eq("job_id", job_id)
            .execute()
        )
        pages = pages_result.data or []

        return OCRJobStatus(**_build_job_status(job, pages))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching OCR job {job_id}: {e!s}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch OCR job status")


@router.get(
    "/jobs",
    response_model=OCRJobListResponse,
    summary="List OCR jobs",
)
async def list_ocr_jobs(
    document_id: str | None = Query(None, description="Filter by document ID"),
    status: str | None = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
) -> OCRJobListResponse:
    """List OCR jobs with optional filters."""
    try:
        supabase = get_supabase_client()
        query = supabase.table("ocr_jobs").select(_OCR_JOB_COLS, count="exact")

        if document_id:
            query = query.eq("document_id", document_id)
        if status:
            query = query.eq("status", status)

        # Pagination
        offset = (page - 1) * page_size
        query = query.order("created_at", desc=True).range(
            offset, offset + page_size - 1
        )

        result = query.execute()
        jobs = result.data or []
        total = result.count or len(jobs)

        job_statuses = [OCRJobStatus(**_build_job_status(job)) for job in jobs]

        return OCRJobListResponse(
            jobs=job_statuses,
            total=total,
            page=page,
            page_size=page_size,
        )

    except Exception as e:
        logger.error(f"Error listing OCR jobs: {e!s}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list OCR jobs")


@router.post(
    "/jobs/{job_id}/correct",
    response_model=OCRCorrectionResponse,
    summary="Submit manual corrections for OCR text",
)
async def submit_ocr_correction(
    job_id: str,
    request: OCRCorrectionRequest,
) -> OCRCorrectionResponse:
    """Submit manual text corrections for a completed OCR job."""
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job_id format")

    try:
        supabase = get_supabase_client()

        # Verify job exists and is completed
        result = (
            supabase.table("ocr_jobs").select("id, status").eq("id", job_id).execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail=f"OCR job {job_id} not found")

        job = result.data[0]
        if job["status"] != "completed":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot correct job with status '{job['status']}'. Job must be completed.",
            )

        now = datetime.now(UTC).isoformat()

        # Update job with corrections
        update_data = {
            "corrected_text": request.corrected_text,
            "correction_notes": request.correction_notes,
            "corrected_at": now,
        }
        supabase.table("ocr_jobs").update(update_data).eq("id", job_id).execute()

        # Update per-page corrections if provided
        if request.page_corrections:
            for pc in request.page_corrections:
                page_num = pc.get("page_number")
                corrected = pc.get("corrected_text")
                if page_num is not None and corrected is not None:
                    supabase.table("ocr_page_results").update(
                        {
                            "corrected_text": corrected,
                            "corrected_at": now,
                        }
                    ).eq("job_id", job_id).eq("page_number", page_num).execute()

        logger.info(f"OCR corrections applied to job {job_id}")

        return OCRCorrectionResponse(
            job_id=job_id,
            corrected_at=now,
            message="Corrections applied successfully",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying OCR corrections: {e!s}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to apply corrections")
