"""Unit tests for juddges_search.retrieval.fetch (#223).

NOTE: fetch.py is deprecated — pgvector retrieval superseded it, and both public
functions now raise NotImplementedError. The issue's proposed retry/give-up spec
no longer applies, so these are characterization tests that lock the current
deprecated contract (warn on import, raise on call) rather than the obsolete
behavior described in the ticket.
"""

import importlib

import pytest

from juddges_search.retrieval import fetch

pytestmark = pytest.mark.unit


def test_import_emits_deprecation_warning():
    with pytest.warns(DeprecationWarning, match="deprecated"):
        importlib.reload(fetch)


class TestRemovedFunctions:
    async def test_get_documents_by_id_raises_not_implemented(self):
        with pytest.raises(NotImplementedError):
            await fetch.get_documents_by_id(["2024-SC-1"])

    async def test_get_documents_by_uuid_raises_not_implemented(self):
        with pytest.raises(NotImplementedError):
            await fetch.get_documents_by_uuid(["uuid-1"])
