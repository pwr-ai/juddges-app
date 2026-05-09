"""Regression tests for warning-related import paths."""


def test_playground_uses_supported_judgment_fetcher():
    """Playground should use the maintained judgment fetcher utility."""
    from app import playground

    assert playground.get_documents_by_id.__module__ == "app.utils.judgment_fetcher"
