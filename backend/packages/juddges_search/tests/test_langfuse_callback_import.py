import pytest


@pytest.mark.unit
def test_langfuse_langchain_callback_handler_importable():
    """langfuse.langchain needs the `langchain` package; without it tracing is silently off."""
    from langfuse.langchain import CallbackHandler

    assert CallbackHandler is not None
