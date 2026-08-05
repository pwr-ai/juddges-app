"""Collection contracts for deterministic pytest tiers."""

import pytest

pytestmark = pytest.mark.unit

SUPPORTED_MARKERS = {
    "ai",
    "api",
    "auth",
    "collections",
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


def test_search_in_name_does_not_override_explicit_unit_tier(request):
    tier_markers = {
        marker.name
        for marker in request.node.iter_markers()
        if marker.name in {"unit", "integration"}
    }

    assert tier_markers == {"unit"}


def test_supported_markers_are_registered_centrally(pytestconfig):
    registered = {
        definition.split(":", maxsplit=1)[0].strip()
        for definition in pytestconfig.getini("markers")
    }

    assert registered >= SUPPORTED_MARKERS


def test_strict_marker_validation_is_enabled(pytestconfig):
    assert "--strict-markers" in pytestconfig.getini("addopts")
