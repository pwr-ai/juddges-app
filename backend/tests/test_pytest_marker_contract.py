"""Collection contracts for deterministic pytest tiers."""

import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

import tests.conftest as pytest_conftest
from tests.conftest import pytest_collection_modifyitems

pytestmark = pytest.mark.unit

BACKEND_DIR = Path(__file__).resolve().parent.parent

SUPPORTED_MARKERS = {
    "ai",
    "api",
    "auth",
    "collections",
    "e2e",
    "integration",
    "legacy",
    "performance",
    "schemas",
    "search",
    "security",
    "slow",
    "timing",
    "unit",
}


class _FakeItem:
    nodeid = "tests/test_tier_probe.py::test_probe"
    name = "test_probe"

    def __init__(self, *markers: str):
        self._markers = [SimpleNamespace(name=marker) for marker in markers]

    def iter_markers(self):
        return iter(self._markers)

    def add_marker(self, marker):
        self._markers.append(marker)


def _collect(marker: str, path: str, env: dict[str, str] | None = None):
    return subprocess.run(  # noqa: S603 - arguments are fixed test paths and markers
        [
            sys.executable,
            "-m",
            "pytest",
            "--collect-only",
            "-q",
            "-m",
            marker,
            path,
        ],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_search_in_name_does_not_override_explicit_unit_tier(request):
    tier_markers = {
        marker.name
        for marker in request.node.iter_markers()
        if marker.name in {"unit", "integration"}
    }

    assert tier_markers == {"unit"}


def test_local_profile_collects_explicit_unit_file_with_integration_suffix():
    env = os.environ.copy()
    env["JUDDGES_PYTEST_PROFILE"] = "local"
    env.pop("RUN_INTEGRATION_TESTS", None)

    result = _collect(
        "unit",
        "tests/app/test_search_documents_integration.py",
        env=env,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "tests/app/test_search_documents_integration.py: 5" in result.stdout


def test_local_profile_has_no_pre_collection_path_filter():
    assert not hasattr(pytest_conftest, "pytest_ignore_collect")


def test_e2e_tier_collects_live_e2e_suite():
    result = _collect("e2e", "tests/e2e_live/test_e2e_live.py")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "tests/e2e_live/test_e2e_live.py: 3" in result.stdout


@pytest.mark.parametrize("other_tier", ["integration", "unit"])
def test_e2e_and_other_tier_are_conflicting(monkeypatch, other_tier):
    monkeypatch.delenv("JUDDGES_PYTEST_PROFILE", raising=False)

    expected = ", ".join(sorted(("e2e", other_tier)))
    with pytest.raises(pytest.UsageError, match=expected):
        pytest_collection_modifyitems(SimpleNamespace(), [_FakeItem("e2e", other_tier)])


def test_supported_markers_are_registered_centrally(pytestconfig):
    registered = {
        definition.split(":", maxsplit=1)[0].strip()
        for definition in pytestconfig.getini("markers")
    }

    assert registered >= SUPPORTED_MARKERS


def test_strict_marker_validation_is_enabled(pytestconfig):
    assert "--strict-markers" in pytestconfig.getini("addopts")
