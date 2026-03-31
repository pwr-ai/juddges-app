"""
Unit tests for app.argumentation module.

Tests helper functions, request validation, and the analyze endpoint
with mocked LLM and database.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.argumentation import (
    _fetch_document_content,
    _format_document_for_analysis,
)

# ===== _format_document_for_analysis tests =====


@pytest.mark.unit
class TestFormatDocumentForAnalysis:
    def test_basic_formatting(self):
        doc = {
            "document_id": "doc-1",
            "title": "Tax Decision",
            "document_type": "judgment",
            "date_issued": "2024-01-15",
            "full_text": "The court decided...",
        }
        result = _format_document_for_analysis(doc)
        assert "doc-1" in result
        assert "Tax Decision" in result
        assert "judgment" in result
        assert "2024-01-15" in result
        assert "The court decided..." in result

    def test_truncates_long_content(self):
        doc = {
            "document_id": "doc-2",
            "full_text": "x" * 20000,
        }
        result = _format_document_for_analysis(doc)
        assert "[... document truncated for length ...]" in result
        # Should cap at ~15000 chars + truncation message
        assert len(result) < 16000

    def test_uses_summary_when_no_full_text(self):
        doc = {
            "document_id": "doc-3",
            "summary": "Short summary of the case",
            "thesis": "Legal thesis statement",
        }
        result = _format_document_for_analysis(doc)
        assert "Short summary of the case" in result
        assert "Legal thesis statement" in result

    def test_handles_court_name(self):
        doc = {
            "document_id": "doc-4",
            "court_name": "Supreme Administrative Court",
        }
        result = _format_document_for_analysis(doc)
        assert "Supreme Administrative Court" in result

    def test_handles_issuing_body_dict(self):
        doc = {
            "document_id": "doc-5",
            "issuing_body": {"name": "Tax Authority"},
        }
        result = _format_document_for_analysis(doc)
        assert "Tax Authority" in result

    def test_handles_issuing_body_string(self):
        doc = {
            "document_id": "doc-6",
            "issuing_body": "Ministry of Finance",
        }
        result = _format_document_for_analysis(doc)
        assert "Ministry of Finance" in result

    def test_handles_legal_bases_list(self):
        doc = {
            "document_id": "doc-7",
            "legal_bases": ["Art. 15", "Art. 22"],
        }
        result = _format_document_for_analysis(doc)
        assert "Art. 15" in result
        assert "Art. 22" in result

    def test_handles_minimal_document(self):
        doc = {"document_id": "doc-8"}
        result = _format_document_for_analysis(doc)
        assert "doc-8" in result

    def test_handles_missing_document_id(self):
        doc = {}
        result = _format_document_for_analysis(doc)
        assert "unknown" in result


# ===== _fetch_document_content tests =====


@pytest.mark.unit
class TestFetchDocumentContent:
    @patch("app.argumentation.get_vector_db")
    async def test_fetches_documents(self, mock_db):
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(
            side_effect=lambda doc_id: {
                "document_id": doc_id,
                "title": f"Title {doc_id}",
            }
        )
        mock_db.return_value = mock_instance

        result = await _fetch_document_content(["d1", "d2"])
        assert len(result) == 2

    @patch("app.argumentation.get_vector_db")
    async def test_skips_missing_documents(self, mock_db):
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(
            side_effect=lambda doc_id: (
                {"document_id": doc_id} if doc_id == "d1" else None
            )
        )
        mock_db.return_value = mock_instance

        result = await _fetch_document_content(["d1", "d2"])
        assert len(result) == 1

    @patch("app.argumentation.get_vector_db")
    async def test_handles_db_errors_gracefully(self, mock_db):
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(side_effect=Exception("DB down"))
        mock_db.return_value = mock_instance

        result = await _fetch_document_content(["d1"])
        assert len(result) == 0


# ===== Endpoint tests =====


@pytest.mark.unit
class TestAnalyzeArgumentsEndpoint:
    @patch("app.argumentation.get_default_llm")
    @patch("app.argumentation.get_vector_db")
    async def test_returns_404_when_no_documents_found(self, mock_db, mock_llm):
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(return_value=None)
        mock_db.return_value = mock_instance

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/argumentation/analyze",
                json={"document_ids": ["nonexistent-doc-id-12345"]},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 404

    @patch("app.argumentation.JsonOutputParser")
    @patch("app.argumentation.ChatPromptTemplate")
    @patch("app.argumentation.get_default_llm")
    @patch("app.argumentation.get_vector_db")
    async def test_returns_503_on_llm_error(
        self, mock_db, mock_llm, mock_prompt, mock_parser
    ):
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(
            return_value={"document_id": "d1", "full_text": "Some legal text"}
        )
        mock_db.return_value = mock_instance

        # Make the chain invocation fail
        mock_chain = AsyncMock()
        mock_chain.ainvoke.side_effect = Exception("LLM timeout")
        mock_prompt.from_messages.return_value.__or__ = MagicMock(
            return_value=MagicMock(__or__=MagicMock(return_value=mock_chain))
        )

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/argumentation/analyze",
                json={"document_ids": ["valid-doc-id-12345678"]},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 503

    @patch("app.argumentation.JsonOutputParser")
    @patch("app.argumentation.ChatPromptTemplate")
    @patch("app.argumentation.get_default_llm")
    @patch("app.argumentation.get_vector_db")
    async def test_returns_500_when_no_arguments_found(
        self, mock_db, mock_llm, mock_prompt, mock_parser
    ):
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(
            return_value={"document_id": "d1", "full_text": "Some text"}
        )
        mock_db.return_value = mock_instance

        # LLM returns empty arguments
        mock_chain = AsyncMock()
        mock_chain.ainvoke.return_value = {"arguments": [], "overall_analysis": {}}
        mock_prompt.from_messages.return_value.__or__ = MagicMock(
            return_value=MagicMock(__or__=MagicMock(return_value=mock_chain))
        )

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/argumentation/analyze",
                json={"document_ids": ["valid-doc-id-12345678"]},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 500

    @patch("app.argumentation.JsonOutputParser")
    @patch("app.argumentation.ChatPromptTemplate")
    @patch("app.argumentation.get_default_llm")
    @patch("app.argumentation.get_vector_db")
    async def test_successful_analysis(
        self, mock_db, mock_llm, mock_prompt, mock_parser
    ):
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(
            return_value={"document_id": "d1", "full_text": "Legal text about taxation"}
        )
        mock_db.return_value = mock_instance

        # LLM returns valid arguments
        mock_chain = AsyncMock()
        mock_chain.ainvoke.return_value = {
            "arguments": [
                {
                    "title": "Tax deduction claim",
                    "party": "taxpayer",
                    "factual_premises": ["Company incurred expenses"],
                    "legal_premises": ["Art. 15 of Income Tax Act"],
                    "conclusion": "Deduction is valid",
                    "reasoning_pattern": "deductive",
                    "strength": "strong",
                    "strength_explanation": "Clear legal basis",
                    "counter_arguments": [],
                    "legal_references": ["Art. 15"],
                    "source_section": "Section 2",
                }
            ],
            "overall_analysis": {
                "dominant_reasoning_pattern": "deductive",
                "argument_flow": "Linear",
                "key_disputes": [],
                "strongest_argument_index": 0,
            },
        }
        mock_prompt.from_messages.return_value.__or__ = MagicMock(
            return_value=MagicMock(__or__=MagicMock(return_value=mock_chain))
        )

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/argumentation/analyze",
                json={"document_ids": ["valid-doc-id-12345678"]},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["argument_count"] == 1
        assert data["arguments"][0]["title"] == "Tax deduction claim"

    @patch("app.argumentation.JsonOutputParser")
    @patch("app.argumentation.ChatPromptTemplate")
    @patch("app.argumentation.get_default_llm")
    @patch("app.argumentation.get_vector_db")
    async def test_normalizes_invalid_reasoning_pattern(
        self, mock_db, mock_llm, mock_prompt, mock_parser
    ):
        """Invalid reasoning patterns should default to 'deductive'."""
        mock_instance = MagicMock()
        mock_instance.get_document_by_id = AsyncMock(
            return_value={"document_id": "d1", "full_text": "Text"}
        )
        mock_db.return_value = mock_instance

        mock_chain = AsyncMock()
        mock_chain.ainvoke.return_value = {
            "arguments": [
                {
                    "title": "Arg",
                    "party": "court",
                    "conclusion": "Something",
                    "reasoning_pattern": "INVALID_PATTERN",
                    "strength": "INVALID_STRENGTH",
                }
            ],
            "overall_analysis": {},
        }
        mock_prompt.from_messages.return_value.__or__ = MagicMock(
            return_value=MagicMock(__or__=MagicMock(return_value=mock_chain))
        )

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/argumentation/analyze",
                json={"document_ids": ["valid-doc-id-12345678"]},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["arguments"][0]["reasoning_pattern"] == "deductive"
        assert data["arguments"][0]["strength"] == "moderate"


# ===== Request validation tests =====


@pytest.mark.unit
class TestArgumentationRequestValidation:
    async def test_empty_document_ids_rejected(self):
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/argumentation/analyze",
                json={"document_ids": []},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 422

    async def test_too_many_document_ids_rejected(self):
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/argumentation/analyze",
                json={"document_ids": [f"doc-{i}" for i in range(6)]},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 422
