"""resolve_filter_ids asks list_extracted_filter_matches once and groups by jurisdiction."""

from __future__ import annotations

import pytest

from app.config import settings
from app.extraction_domain.filter_ids import (
    FILTER_IDS_RPC,
    SAVE_FROM_FILTER_MAX_DOCUMENTS,
    FilterIdsResult,
    FilterTooLargeError,
    check_cap,
    resolve_filter_ids,
)
from app.models import JURISDICTIONS
from tests.app._fakes import FakeRpcClient
from tests.app.test_db_contract_static import _declared_functions, _migration_sql

pytestmark = pytest.mark.unit


def test_save_from_filter_max_documents_is_read_from_settings():
    """The cap now lives in `app.config.settings`; `filter_ids` re-exports the
    same value under its historical name so existing importers keep working.
    """
    assert SAVE_FROM_FILTER_MAX_DOCUMENTS == settings.SAVE_FROM_FILTER_MAX_DOCUMENTS
    assert SAVE_FROM_FILTER_MAX_DOCUMENTS == 5000


def _rows(pl: int, uk: int) -> list[dict]:
    return [{"id": f"pl-{i}", "jurisdiction": "PL"} for i in range(pl)] + [
        {"id": f"uk-{i}", "jurisdiction": "UK"} for i in range(uk)
    ]


def test_jurisdictions_constant_matches_the_check_constraint():
    assert JURISDICTIONS == ("PL", "UK")


def test_resolve_calls_the_rpc_once_and_groups_ids():
    client = FakeRpcClient({FILTER_IDS_RPC: _rows(3, 2)})
    result = resolve_filter_ids(client, {"jurisdiction": ["PL", "UK"]}, "knife")
    assert isinstance(result, FilterIdsResult)
    assert client.calls == [
        (
            FILTER_IDS_RPC,
            {"p_filters": {"jurisdiction": ["PL", "UK"]}, "p_text_query": "knife"},
        )
    ]
    assert result.ids == ["pl-0", "pl-1", "pl-2", "uk-0", "uk-1"]
    assert result.by_jurisdiction == {
        "PL": ["pl-0", "pl-1", "pl-2"],
        "UK": ["uk-0", "uk-1"],
    }
    assert result.total == 5


def test_resolve_with_no_matches_keeps_both_jurisdiction_keys():
    client = FakeRpcClient({FILTER_IDS_RPC: []})
    result = resolve_filter_ids(client, {}, None)
    assert result.ids == [] and result.total == 0
    assert result.by_jurisdiction == {"PL": [], "UK": []}


def test_resolve_ignores_rows_with_unknown_jurisdiction_but_keeps_their_ids():
    client = FakeRpcClient(
        {FILTER_IDS_RPC: [{"id": "x", "jurisdiction": "DE"}, *_rows(1, 0)]}
    )
    result = resolve_filter_ids(client, {}, None)
    assert result.ids == ["x", "pl-0"]
    assert result.by_jurisdiction == {"PL": ["pl-0"], "UK": []}


def test_check_cap_total():
    result = resolve_filter_ids(FakeRpcClient({FILTER_IDS_RPC: _rows(3, 3)}), {}, None)
    check_cap(result, cap=6)
    with pytest.raises(FilterTooLargeError) as exc:
        check_cap(result, cap=5)
    assert (exc.value.total, exc.value.cap, exc.value.jurisdiction) == (6, 5, None)


def test_check_cap_per_jurisdiction_names_the_offending_side():
    result = resolve_filter_ids(FakeRpcClient({FILTER_IDS_RPC: _rows(6, 1)}), {}, None)
    check_cap(result, cap=6, per_jurisdiction=True)
    with pytest.raises(FilterTooLargeError) as exc:
        check_cap(result, cap=5, per_jurisdiction=True)
    assert (exc.value.total, exc.value.cap, exc.value.jurisdiction) == (6, 5, "PL")


def test_filter_ids_rpc_name_matches_a_declared_migration_function():
    """`client.rpc(FILTER_IDS_RPC, ...)` passes the RPC name as a module
    constant, not an inline string literal, so the AST-based guard in
    test_db_contract_static.py (`_string_arg` only recognises `ast.Constant`
    as the first positional arg) never collects this call site — renaming the
    migration function without updating this constant (or vice versa) would
    pass that guard silently. This test closes that gap directly.
    """
    assert FILTER_IDS_RPC in _declared_functions(_migration_sql())
