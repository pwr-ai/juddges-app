"""Unit tests for the get_judgment and get_extracted_fields MCP tools.

The tools read raw `judgments` rows, so every fixture row is built from the
production select-list: a fixture that invents a column would pass against a
key production never emits.
"""

import ast
import inspect
from datetime import date, datetime
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

from app.services.audit_service import AuditService

# The production select-list is the source of truth for what a judgments row
# carries. Reaching for a private name is deliberate: a fixture can invent any
# key, this cannot.
REAL_COLUMNS = {c.strip() for c in _JUDGMENT_COLS.split(",")}

DB_TARGET = "juddges_mcp.tools.judgment.get_vector_db"


@pytest.mark.unit
def test_every_column_the_tool_reads_exists_on_the_judgments_row():
    read = {
        "id",
        *judgment._CITATION_COLUMNS.values(),
        *judgment.SECTIONS.values(),
        *judgment._STATUS_COLUMNS.values(),
    }
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
        # Distinct values, so swapping two statuses in the result is visible.
        "base_extraction_status": "completed",
        "structure_extraction_status": "failed",
        "deep_analysis_status": "pending",
    }
    row.update(overrides)
    return row


def _unextracted_row() -> dict:
    """A row as production holds it before any extraction pass has run.

    Every nullable column is NULL, but the three status columns are
    `NOT NULL DEFAULT 'pending'`, so they are never absent.
    """
    row = dict.fromkeys(REAL_COLUMNS)
    row.update(
        id="doc-1",
        base_extraction_status="pending",
        structure_extraction_status="pending",
        deep_analysis_status="pending",
    )
    return row


# Written out literally, not read from `judgment.SECTIONS`: a test that derives
# its expectation from the table under test passes whatever the table says.
EXPECTED_SECTION_COLUMNS = {
    "full_text": "full_text",
    "summary": "summary",
    "case_identification": "structure_case_identification_summary",
    "facts": "structure_facts_summary",
    "court_analysis": "structure_court_analysis_summary",
    "operative_part": "structure_operative_part_summary",
    "conclusion": "structure_conclusion_summary",
}
EXPECTED_GENERATED = {
    "case_identification",
    "facts",
    "court_analysis",
    "operative_part",
    "conclusion",
}

EXPECTED_CITATION = {
    "id": "doc-1",
    "court": "Sąd Najwyższy",
    "case_number": "II CSK 1/20",
    "judgment_date": "2020-03-01",
    "jurisdiction": "PL",
    "url": "https://example.test/doc-1",
}


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
    # autospec: the mock enforces the real signature, so a keyword the
    # service does not accept fails here instead of in the compliance trail.
    with patch.object(
        AuditService,
        "log_document_access",
        autospec=True,
        return_value="audit-1",
    ) as log:
        yield log


@pytest.mark.unit
class TestGetJudgment:
    async def test_returns_citation_and_full_text(self, principal, audit):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            result = await get_judgment(id="doc-1")
        citation = {k: v for k, v in result.items() if k in EXPECTED_CITATION}
        assert citation == EXPECTED_CITATION
        assert result["section"] == "full_text"
        assert result["text"] == "Uzasadnienie…"
        assert result["chars"] == len("Uzasadnienie…")
        assert result["generated"] is False

    @pytest.mark.parametrize("name", list(EXPECTED_SECTION_COLUMNS))
    async def test_each_section_reads_its_own_column(self, principal, audit, name):
        # The column name is the sentinel, so a section that reads the wrong
        # column returns a different column's name and fails.
        column = EXPECTED_SECTION_COLUMNS[name]
        doc = _row(**{col: col for col in EXPECTED_SECTION_COLUMNS.values()})
        with patch(DB_TARGET, return_value=_db_returning(doc)):
            result = await get_judgment(id="doc-1", section=name)
        assert result["section"] == name
        assert result["text"] == column
        assert result["chars"] == len(column)
        assert result["empty"] is False
        # Only the extraction pass's sections are machine-generated: `summary`
        # is publisher-supplied and `full_text` is the court's own wording.
        assert result["generated"] is (name in EXPECTED_GENERATED)

    def test_section_table_matches_the_pinned_one(self):
        assert judgment.SECTIONS == EXPECTED_SECTION_COLUMNS

    async def test_omitted_section_defaults_to_full_text(self, principal, audit):
        doc = _row(**{col: col for col in EXPECTED_SECTION_COLUMNS.values()})
        with patch(DB_TARGET, return_value=_db_returning(doc)):
            result = await get_judgment(id="doc-1")
        assert result["section"] == "full_text"
        assert result["text"] == "full_text"

    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("2020-03-01", "2020-03-01"),
            (date(2020, 3, 1), "2020-03-01"),
            (datetime(2020, 3, 1, 13, 5), "2020-03-01"),
            (None, None),
        ],
    )
    async def test_judgment_date_is_an_iso_string(
        self, principal, audit, raw, expected
    ):
        doc = _row(decision_date=raw)
        with patch(DB_TARGET, return_value=_db_returning(doc)):
            result = await get_judgment(id="doc-1")
        assert result["judgment_date"] == expected

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

    @pytest.mark.parametrize("empty_value", [None, ""])
    async def test_section_present_but_empty_is_not_an_error(
        self, principal, audit, empty_value
    ):
        # None is what production holds for an unextracted column; "" alone
        # would not exercise the NULL coercion.
        doc = _row(structure_conclusion_summary=empty_value)
        with patch(DB_TARGET, return_value=_db_returning(doc)):
            result = await get_judgment(id="doc-1", section="conclusion")
        assert result["text"] == ""
        assert result["chars"] == 0
        assert result["empty"] is True

    @pytest.mark.parametrize("bad_id", [123, None, ["doc-1"]])
    async def test_non_string_id_is_a_tool_error(self, principal, audit, bad_id):
        db = _db_returning(_row())
        with patch(DB_TARGET, return_value=db), pytest.raises(ToolInputError):
            await get_judgment(id=bad_id)
        db.get_document_by_id.assert_not_awaited()

    @pytest.mark.parametrize("bad_section", [["facts"], 5, {"a": 1}])
    async def test_non_string_section_is_a_tool_error(
        self, principal, audit, bad_section
    ):
        db = _db_returning(_row())
        with patch(DB_TARGET, return_value=db), pytest.raises(ToolInputError):
            await get_judgment(id="doc-1", section=bad_section)
        db.get_document_by_id.assert_not_awaited()
        audit.assert_not_awaited()

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
        assert kwargs["metadata"] == {"transport": "mcp", "tool": "get_judgment"}

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
    async def test_returns_the_whole_citation(self, principal, audit):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            result = await get_extracted_fields(id="doc-1")
        citation = {k: v for k, v in result.items() if k in EXPECTED_CITATION}
        assert citation == EXPECTED_CITATION

    async def test_returns_the_stored_base_schema_fields(self, principal, audit):
        doc = _row(base_appeal_outcome="dismissed")
        with patch(DB_TARGET, return_value=_db_returning(doc)):
            result = await get_extracted_fields(id="doc-1")
        assert result["base_fields"] == {
            "base_appeal_outcome": "dismissed",
            "base_extraction_status": "completed",
        }

    async def test_extraction_fields_come_from_structure_columns(
        self, principal, audit
    ):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            result = await get_extracted_fields(id="doc-1")
        assert result["extraction_fields"] == {
            "structure_facts_summary": "Stan faktyczny…",
            "structure_court_analysis_summary": "Sąd uznał…",
            "structure_extraction_status": "failed",
            "deep_analysis_status": "pending",
        }

    async def test_surfaces_each_extraction_status(self, principal, audit):
        with patch(DB_TARGET, return_value=_db_returning(_row())):
            result = await get_extracted_fields(id="doc-1")
        assert result["extraction_status"] == {
            "base": "completed",
            "structure": "failed",
            "deep_analysis": "pending",
        }

    async def test_unextracted_row_reports_pending_not_nulls(self, principal, audit):
        # Production rows always carry the 'pending' status columns, so the
        # field dicts are never null; the status block is what tells an agent
        # nothing has been extracted yet.
        with patch(DB_TARGET, return_value=_db_returning(_unextracted_row())):
            result = await get_extracted_fields(id="doc-1")
        assert result["extraction_status"] == {
            "base": "pending",
            "structure": "pending",
            "deep_analysis": "pending",
        }
        assert result["base_fields"] == {"base_extraction_status": "pending"}
        assert result["extraction_fields"] == {
            "structure_extraction_status": "pending",
            "deep_analysis_status": "pending",
        }

    async def test_reads_the_row_exactly_once(self, principal, audit):
        db = _db_returning(_row())
        with patch(DB_TARGET, return_value=db):
            await get_extracted_fields(id="doc-1")
        db.get_document_by_id.assert_awaited_once_with("doc-1")

    @pytest.mark.parametrize("bad_id", [123, None])
    async def test_non_string_id_is_a_tool_error(self, principal, audit, bad_id):
        db = _db_returning(_row())
        with patch(DB_TARGET, return_value=db), pytest.raises(ToolInputError):
            await get_extracted_fields(id=bad_id)
        db.get_document_by_id.assert_not_awaited()

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
        assert kwargs["metadata"] == {
            "transport": "mcp",
            "tool": "get_extracted_fields",
        }

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


# Cost guard: these tools must only read stored values. Derived from the
# module's own imports, so it holds without a fixture that could drift.
_FORBIDDEN_ROOTS = {
    "schema_generator_agent",
    "openai",
    "anthropic",
    "langchain",
    "langchain_core",
    "langchain_openai",
    "langchain_anthropic",
    "langgraph",
}


def _imported_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            names.add(module)
            names.update(f"{module}.{alias.name}" for alias in node.names)
    return names


@pytest.mark.unit
def test_judgment_module_imports_no_extraction_agent_or_llm_client():
    tree = ast.parse(inspect.getsource(judgment))
    imported = _imported_names(tree)
    assert imported, "AST walk found no imports; the guard would pass vacuously"
    offenders = {
        name
        for name in imported
        for parts in [name.split(".")]
        if parts[0] in _FORBIDDEN_ROOTS
        or any(p in {"chains", "chain"} or "agent" in p for p in parts)
    }
    assert not offenders, f"judgment.py pulls in extraction/LLM code: {offenders}"
