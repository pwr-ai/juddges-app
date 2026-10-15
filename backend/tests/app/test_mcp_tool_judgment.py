"""Unit tests for the get_judgment and get_extracted_fields MCP tools.

The tools read raw `judgments` rows, so every fixture row is built from the
production select-list: a fixture that invents a column would pass against a
key production never emits.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from juddges_mcp.principal import (
    MissingPrincipalError,
    reset_principal,
    set_principal,
)
from juddges_mcp.tools import judgment
from juddges_mcp.tools.judgment import (
    JudgmentNotFoundError,
    get_extracted_fields,
    get_judgment,
)
from juddges_mcp.tools.search import ToolInputError
from juddges_search.db.documents_db import _JUDGMENT_COLS

# The production select-list is the source of truth for what a judgments row
# carries. Reaching for a private name is deliberate: a fixture can invent any
# key, this cannot.
REAL_COLUMNS = {c.strip() for c in _JUDGMENT_COLS.split(",")}

DB_TARGET = "juddges_mcp.tools.judgment.get_vector_db"
AUDIT_TARGET = "juddges_mcp.tools.judgment.AuditService"


@pytest.mark.unit
def test_every_column_the_tool_reads_exists_on_the_judgments_row():
    read = {"id", *judgment._CITATION_KEYS, *judgment.SECTIONS.values()}
    missing = read - REAL_COLUMNS
    assert not missing, f"tool reads columns judgments does not have: {missing}"


def _row(**overrides) -> dict:
    """A judgments row; refuses keys the table does not have."""
    invented = set(overrides) - REAL_COLUMNS
    assert not invented, f"fixture invents columns: {invented}"
    row = {
        "id": "doc-1",
        "court_name": "Sąd Najwyższy",
        "case_number": "II CSK 1/20",
        "decision_date": "2020-03-01",
        "jurisdiction": "PL",
        "source_url": "https://example.test/doc-1",
        "full_text": "Uzasadnienie…",
        "summary": "Streszczenie…",
        "structure_facts_summary": "Stan faktyczny…",
        "structure_court_analysis_summary": "Sąd uznał…",
    }
    row.update(overrides)
    return row


def _db_returning(doc):
    db = MagicMock()
    db.get_document_by_id = AsyncMock(return_value=doc)
    return db


@pytest.fixture
def principal():
    token = set_principal(MagicMock(id="user-123"))
    try:
        yield
    finally:
        reset_principal(token)


@pytest.fixture
def audit():
    with patch(AUDIT_TARGET) as service:
        service.log_document_access = AsyncMock(return_value="audit-1")
        yield service.log_document_access


@pytest.mark.unit
class TestGetJudgment:
    async def test_returns_citation_and_full_text(self, principal, audit):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            result = await get_judgment(id="doc-1")
        assert result["id"] == "doc-1"
        assert result["case_number"] == "II CSK 1/20"
        assert result["decision_date"] == "2020-03-01"
        assert result["source_url"] == "https://example.test/doc-1"
        assert result["section"] == "full_text"
        assert "Uzasadnienie" in result["text"]
        assert result["generated"] is False

    async def test_returns_one_named_section(self, principal, audit):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            result = await get_judgment(id="doc-1", section="facts")
        assert result["section"] == "facts"
        assert result["text"] == "Stan faktyczny…"
        assert result["generated"] is True

    async def test_unknown_section_lists_the_available_ones(self, principal, audit):
        with (
            patch(DB_TARGET, return_value=_db_returning(_row())),
            pytest.raises(ToolInputError) as exc,
        ):
            await get_judgment(id="doc-1", section="dissent")
        message = str(exc.value)
        assert "dissent" in message
        assert "facts" in message
        assert "court_analysis" in message
        audit.assert_not_awaited()

    async def test_section_present_but_empty_is_not_an_error(self, principal, audit):
        doc = _row(structure_conclusion_summary="")
        with patch(DB_TARGET, return_value=_db_returning(doc)):
            result = await get_judgment(id="doc-1", section="conclusion")
        assert result["text"] == ""
        assert result["empty"] is True

    async def test_unknown_id_raises_not_found(self, principal, audit):
        with (
            patch(DB_TARGET, return_value=_db_returning(None)),
            pytest.raises(JudgmentNotFoundError),
        ):
            await get_judgment(id="nope")

    @pytest.mark.parametrize("bad_id", ["  ", "", "doc/../etc", "a" * 256])
    async def test_malformed_id_is_rejected_before_the_database(
        self, principal, audit, bad_id
    ):
        db = _db_returning(_row())
        with patch(DB_TARGET, return_value=db), pytest.raises(ToolInputError):
            await get_judgment(id=bad_id)
        db.get_document_by_id.assert_not_awaited()

    async def test_audits_the_view_once(self, principal, audit):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            await get_judgment(id="doc-1")
        audit.assert_awaited_once()
        kwargs = audit.await_args.kwargs
        assert kwargs["user_id"] == "user-123"
        assert kwargs["document_id"] == "doc-1"
        assert kwargs["action"] == "view"

    async def test_no_audit_entry_when_the_judgment_is_missing(self, principal, audit):
        with (
            patch(DB_TARGET, return_value=_db_returning(None)),
            pytest.raises(JudgmentNotFoundError),
        ):
            await get_judgment(id="nope")
        audit.assert_not_awaited()

    async def test_missing_principal_fails_the_call(self):
        with pytest.raises(MissingPrincipalError):
            await get_judgment(id="doc-1")


@pytest.mark.unit
class TestGetExtractedFields:
    async def test_returns_the_stored_base_schema_fields(self, principal, audit):
        doc = _row(base_appeal_outcome="dismissed")
        with patch(DB_TARGET, return_value=_db_returning(doc)):
            result = await get_extracted_fields(id="doc-1")
        assert result["id"] == "doc-1"
        assert result["court_name"] == "Sąd Najwyższy"
        assert result["base_fields"] == {"base_appeal_outcome": "dismissed"}

    async def test_extraction_fields_come_from_structure_columns(
        self, principal, audit
    ):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            result = await get_extracted_fields(id="doc-1")
        assert result["extraction_fields"]["structure_facts_summary"] == (
            "Stan faktyczny…"
        )

    async def test_row_without_extracted_values_yields_nulls(self, principal, audit):
        bare = _row(
            summary=None,
            structure_facts_summary=None,
            structure_court_analysis_summary=None,
        )
        with patch(DB_TARGET, return_value=_db_returning(bare)):
            result = await get_extracted_fields(id="doc-1")
        assert result["base_fields"] is None
        assert result["extraction_fields"] is None

    async def test_never_runs_the_extraction_agent(self, principal, audit):
        """Reads stored values only; an agent run would cost money per call."""
        db = _db_returning(_row())
        with patch(DB_TARGET, return_value=db):
            await get_extracted_fields(id="doc-1")
        db.get_document_by_id.assert_awaited_once_with("doc-1")

    async def test_unknown_id_raises_not_found(self, principal, audit):
        with (
            patch(DB_TARGET, return_value=_db_returning(None)),
            pytest.raises(JudgmentNotFoundError),
        ):
            await get_extracted_fields(id="nope")

    @pytest.mark.parametrize("bad_id", ["doc/../etc", "a" * 256])
    async def test_malformed_id_is_rejected_before_the_database(
        self, principal, audit, bad_id
    ):
        db = _db_returning(_row())
        with patch(DB_TARGET, return_value=db), pytest.raises(ToolInputError):
            await get_extracted_fields(id=bad_id)
        db.get_document_by_id.assert_not_awaited()

    async def test_audits_the_view_once(self, principal, audit):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            await get_extracted_fields(id="doc-1")
        audit.assert_awaited_once()
        kwargs = audit.await_args.kwargs
        assert kwargs["user_id"] == "user-123"
        assert kwargs["document_id"] == "doc-1"
        assert kwargs["action"] == "view"

    async def test_no_audit_entry_when_the_judgment_is_missing(self, principal, audit):
        with (
            patch(DB_TARGET, return_value=_db_returning(None)),
            pytest.raises(JudgmentNotFoundError),
        ):
            await get_extracted_fields(id="nope")
        audit.assert_not_awaited()

    async def test_missing_principal_fails_the_call(self):
        with pytest.raises(MissingPrincipalError):
            await get_extracted_fields(id="doc-1")
