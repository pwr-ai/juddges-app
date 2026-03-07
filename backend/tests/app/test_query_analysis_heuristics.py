"""Unit tests for deterministic query-analysis fallback heuristics."""

from app.query_analysis import _heuristic_query_analysis


def test_heuristic_does_not_infer_criminal_from_party_role_terms():
    """Terms like prosecution/defense should not force Criminal case-type filters."""
    result = _heuristic_query_analysis("dismissed appeal prosecution")

    assert result.case_types is None


def test_heuristic_keeps_case_type_inference_high_precision():
    """Heuristic case type should only be inferred from explicit case-type language."""
    civil_like = _heuristic_query_analysis("contract breach damages")
    criminal_explicit = _heuristic_query_analysis("criminal sentencing fraud")

    assert civil_like.case_types is None
    assert criminal_explicit.case_types == ["Criminal"]
