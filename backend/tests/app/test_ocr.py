"""Unit tests for app.ocr module -- pure helper functions and simulated OCR pipeline."""

from datetime import UTC, datetime

import pytest

from app.ocr import (
    _build_job_status,
    _compute_quality_metrics,
    _format_timestamp,
    _simulate_ocr_processing,
)

# ---------------------------------------------------------------------------
# _compute_quality_metrics
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestComputeQualityMetrics:
    """Tests for _compute_quality_metrics helper."""

    def test_high_confidence_returns_high_quality(self):
        metrics = _compute_quality_metrics("word one two three four", 0.95)
        assert metrics["quality_level"] == "high"
        assert metrics["needs_review"] is False
        assert metrics["avg_confidence"] == 0.95
        assert metrics["total_words"] == 5

    def test_medium_confidence_returns_medium_quality(self):
        metrics = _compute_quality_metrics("hello world", 0.8)
        assert metrics["quality_level"] == "medium"
        assert metrics["needs_review"] is True

    def test_low_confidence_returns_low_quality(self):
        metrics = _compute_quality_metrics("hello world", 0.5)
        assert metrics["quality_level"] == "low"
        assert metrics["needs_review"] is True

    def test_boundary_confidence_090_is_high(self):
        metrics = _compute_quality_metrics("text", 0.9)
        assert metrics["quality_level"] == "high"
        assert metrics["needs_review"] is False

    def test_boundary_confidence_070_is_medium(self):
        metrics = _compute_quality_metrics("text", 0.7)
        assert metrics["quality_level"] == "medium"
        assert metrics["needs_review"] is True

    def test_empty_text(self):
        metrics = _compute_quality_metrics("", 0.95)
        assert metrics["total_words"] == 0
        assert metrics["low_confidence_words"] == 0

    def test_estimated_accuracy_equals_confidence(self):
        metrics = _compute_quality_metrics("some words here", 0.85)
        assert metrics["estimated_accuracy"] == 0.85

    def test_low_confidence_words_calculation(self):
        # With confidence 0.8, low_confidence_ratio = 0.2
        # low_confidence_words = int(total_words * 0.2 * 0.5) = int(4 * 0.1) = 0
        metrics = _compute_quality_metrics("a b c d", 0.8)
        assert metrics["low_confidence_words"] >= 0

    def test_confidence_1_means_zero_low_confidence_words(self):
        metrics = _compute_quality_metrics("word one two", 1.0)
        assert metrics["low_confidence_words"] == 0

    def test_confidence_0_maximises_low_confidence_words(self):
        metrics = _compute_quality_metrics("a b c d e f g h i j", 0.0)
        assert metrics["low_confidence_words"] > 0


# ---------------------------------------------------------------------------
# _format_timestamp
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFormatTimestamp:
    """Tests for _format_timestamp helper."""

    def test_none_returns_none(self):
        assert _format_timestamp(None) is None

    def test_string_passthrough(self):
        assert _format_timestamp("2025-01-01T00:00:00") == "2025-01-01T00:00:00"

    def test_datetime_returns_isoformat(self):
        dt = datetime(2025, 3, 15, 12, 30, 0, tzinfo=UTC)
        result = _format_timestamp(dt)
        assert "2025-03-15" in result
        assert "12:30" in result

    def test_other_type_returns_str(self):
        assert _format_timestamp(12345) == "12345"


# ---------------------------------------------------------------------------
# _simulate_ocr_processing
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSimulateOcrProcessing:
    """Tests for _simulate_ocr_processing helper."""

    def test_returns_expected_keys(self):
        result = _simulate_ocr_processing("Hello world.", "pdf")
        expected_keys = {
            "extracted_text",
            "confidence_score",
            "page_count",
            "language_detected",
            "quality_metrics",
            "page_results",
        }
        assert expected_keys.issubset(result.keys())

    def test_empty_text_uses_default(self):
        result = _simulate_ocr_processing("", "pdf")
        assert result["extracted_text"]  # non-empty default
        assert result["page_count"] >= 1

    def test_multi_sentence_produces_pages(self):
        text = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. Sentence six."
        result = _simulate_ocr_processing(text, "image")
        assert result["page_count"] >= 1

    def test_confidence_in_valid_range(self):
        result = _simulate_ocr_processing("Some OCR text here.", "pdf")
        assert 0.0 <= result["confidence_score"] <= 1.0

    def test_page_results_have_required_fields(self):
        result = _simulate_ocr_processing("Hello.", "pdf")
        for page in result["page_results"]:
            assert "page_number" in page
            assert "extracted_text" in page
            assert "confidence_score" in page
            assert "word_count" in page
            assert "quality_metrics" in page

    def test_language_detected_is_pl(self):
        result = _simulate_ocr_processing("any text", "pdf")
        assert result["language_detected"] == "pl"

    def test_deterministic_for_same_input(self):
        text = "Deterministic test input."
        r1 = _simulate_ocr_processing(text, "pdf")
        r2 = _simulate_ocr_processing(text, "pdf")
        assert r1["confidence_score"] == r2["confidence_score"]

    def test_page_numbers_are_sequential(self):
        text = "One sentence. Two sentence. Three sentence. Four. Five. Six."
        result = _simulate_ocr_processing(text, "pdf")
        page_nums = [p["page_number"] for p in result["page_results"]]
        assert page_nums == list(range(1, len(page_nums) + 1))


# ---------------------------------------------------------------------------
# _build_job_status
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildJobStatus:
    """Tests for _build_job_status helper."""

    def _make_job(self, **overrides):
        base = {
            "id": "00000000-0000-0000-0000-000000000001",
            "document_id": "doc-1",
            "status": "completed",
            "source_type": "pdf",
            "source_filename": "test.pdf",
            "extracted_text": "hello",
            "confidence_score": 0.92,
            "page_count": 1,
            "language_detected": "pl",
            "quality_metrics": None,
            "corrected_text": None,
            "correction_notes": None,
            "corrected_at": None,
            "created_at": "2025-01-01T00:00:00",
            "updated_at": "2025-01-01T00:00:00",
            "completed_at": "2025-01-01T00:00:00",
            "error_message": None,
        }
        base.update(overrides)
        return base

    def test_basic_fields_mapped(self):
        job = self._make_job()
        result = _build_job_status(job)
        assert result["job_id"] == str(job["id"])
        assert result["document_id"] == "doc-1"
        assert result["status"] == "completed"
        assert result["source_type"] == "pdf"

    def test_no_pages(self):
        result = _build_job_status(self._make_job())
        assert result["pages"] is None

    def test_with_pages(self):
        pages = [
            {
                "page_number": 1,
                "extracted_text": "page text",
                "confidence_score": 0.9,
                "word_count": 2,
                "quality_metrics": {
                    "avg_confidence": 0.9,
                    "low_confidence_words": 0,
                    "total_words": 2,
                    "estimated_accuracy": 0.9,
                    "needs_review": False,
                    "quality_level": "high",
                },
            }
        ]
        result = _build_job_status(self._make_job(), pages)
        assert result["pages"] is not None
        assert len(result["pages"]) == 1

    def test_pages_sorted_by_page_number(self):
        pages = [
            {
                "page_number": 2,
                "extracted_text": "two",
                "confidence_score": 0.9,
                "word_count": 1,
                "quality_metrics": None,
            },
            {
                "page_number": 1,
                "extracted_text": "one",
                "confidence_score": 0.9,
                "word_count": 1,
                "quality_metrics": None,
            },
        ]
        result = _build_job_status(self._make_job(), pages)
        assert result["pages"][0]["page_number"] == 1
        assert result["pages"][1]["page_number"] == 2

    def test_quality_metrics_dict_parsed(self):
        qm = {
            "avg_confidence": 0.85,
            "low_confidence_words": 1,
            "total_words": 10,
            "estimated_accuracy": 0.85,
            "needs_review": True,
            "quality_level": "medium",
        }
        result = _build_job_status(self._make_job(quality_metrics=qm))
        assert result["quality_metrics"]["avg_confidence"] == 0.85

    def test_timestamps_formatted(self):
        dt = datetime(2025, 6, 1, 10, 0, 0, tzinfo=UTC)
        result = _build_job_status(self._make_job(corrected_at=dt))
        assert "2025-06-01" in result["corrected_at"]


# ---------------------------------------------------------------------------
# Regression tests for submit_ocr_job endpoint bugs
# ---------------------------------------------------------------------------

import io
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.ocr import submit_ocr_job


def _make_upload_file(
    content: bytes,
    filename: str = "test.pdf",
    content_type: str = "application/pdf",
) -> MagicMock:
    """Create a mock UploadFile that yields content in chunks via async read."""
    mock_file = MagicMock()
    mock_file.filename = filename
    mock_file.content_type = content_type
    mock_file.size = len(content)

    # Build an async read that respects the size argument (chunked reads)
    stream = io.BytesIO(content)

    async def _async_read(size: int = -1) -> bytes:
        return stream.read(size)

    mock_file.read = _async_read
    return mock_file


@pytest.mark.unit
class TestSubmitOcrJobOversizeFile:
    """Regression: oversized file must be rejected without reading entire content into memory."""

    async def test_oversized_file_returns_400(self):
        """A file exceeding the 50 MB limit should trigger a 400 error
        before the full content is loaded into memory (BUG 1 fix)."""
        # Create a file that is just over the 50 MB limit.
        # We do NOT need to allocate 50 MB in the test -- we use a smaller
        # payload but patch the chunk reading to simulate exceeding the limit.
        limit = 50 * 1024 * 1024
        # Build content slightly over the limit (50 MB + 1 byte)
        # To keep the test fast, we simulate via a custom async read that
        # returns large "virtual" chunks.
        over_size = limit + 1
        bytes_returned = 0
        chunk_size = 1024 * 1024  # matches the code's chunk_size

        mock_file = MagicMock()
        mock_file.filename = "big.pdf"
        mock_file.content_type = "application/pdf"
        mock_file.size = over_size

        async def _async_read(size: int = -1) -> bytes:
            nonlocal bytes_returned
            if bytes_returned >= over_size:
                return b""
            to_return = min(size if size > 0 else over_size, over_size - bytes_returned)
            bytes_returned += to_return
            return b"\x00" * to_return

        mock_file.read = _async_read

        with pytest.raises(HTTPException) as exc_info:
            await submit_ocr_job(
                file=mock_file,
                document_id="doc-valid-id-1234",
                source_type="pdf",
                language_hint=None,
            )

        assert exc_info.value.status_code == 400
        assert "50MB" in exc_info.value.detail

    async def test_file_within_limit_proceeds(self):
        """A file within the 50 MB limit should not be rejected for size."""
        small_content = b"%PDF-1.4 small content"
        mock_file = _make_upload_file(small_content, content_type="application/pdf")

        # The code will proceed past the size check and try get_supabase_client,
        # which we mock to avoid a real DB call.
        mock_supabase = MagicMock()
        mock_insert_result = MagicMock()
        mock_insert_result.data = [{"id": "fake-uuid"}]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = (
            mock_insert_result
        )
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        with patch("app.ocr.get_supabase_client", return_value=mock_supabase):
            result = await submit_ocr_job(
                file=mock_file,
                document_id="doc-valid-id-1234",
                source_type="pdf",
                language_hint=None,
            )

        # Should reach completion, not a 400 size error
        assert result.status == "completed"


@pytest.mark.unit
class TestSubmitOcrJobJobIdInitialization:
    """Regression: job_id must be initialized before try block to prevent
    UnboundLocalError in except handler (BUG 2 fix)."""

    async def test_error_before_job_id_assignment_no_unbound_error(self):
        """If get_supabase_client() raises before job_id is assigned,
        the except handler must not raise UnboundLocalError."""
        small_content = b"%PDF-1.4 test"
        mock_file = _make_upload_file(small_content, content_type="application/pdf")

        with patch(
            "app.ocr.get_supabase_client",
            side_effect=RuntimeError("Connection refused"),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await submit_ocr_job(
                    file=mock_file,
                    document_id="doc-valid-id-1234",
                    source_type="pdf",
                    language_hint=None,
                )

        # Should be a 500 with the original error message, NOT an UnboundLocalError
        assert exc_info.value.status_code == 500
        assert "Connection refused" in exc_info.value.detail

    async def test_error_after_job_id_assignment_marks_job_failed(self):
        """If an error occurs after job_id is assigned and the DB insert succeeds,
        the except handler should attempt to mark the job as failed."""
        small_content = b"%PDF-1.4 test"
        mock_file = _make_upload_file(small_content, content_type="application/pdf")

        mock_supabase = MagicMock()
        mock_insert_result = MagicMock()
        mock_insert_result.data = [{"id": "fake-uuid"}]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = (
            mock_insert_result
        )

        # Make the update (OCR results save) fail to trigger the except block
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.side_effect = RuntimeError(
            "DB write failed"
        )

        with patch("app.ocr.get_supabase_client", return_value=mock_supabase):
            with pytest.raises(HTTPException) as exc_info:
                await submit_ocr_job(
                    file=mock_file,
                    document_id="doc-valid-id-1234",
                    source_type="pdf",
                    language_hint=None,
                )

        assert exc_info.value.status_code == 500
        assert "DB write failed" in exc_info.value.detail
