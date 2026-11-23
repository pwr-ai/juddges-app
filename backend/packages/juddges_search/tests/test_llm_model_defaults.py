"""Default model selection and per-model request parameters."""

import os
from unittest.mock import patch

import pytest


@pytest.mark.unit
@pytest.mark.parametrize(
    ("model", "effort"),
    [
        ("gpt-5", "minimal"),
        ("gpt-5-mini", "minimal"),
        ("gpt-5-mini-2025-08-07", "minimal"),
        ("gpt-5-nano", "minimal"),
        # GPT-6.x rejects "minimal" (400 unsupported_value).
        ("gpt-6.2-sol", "low"),
        ("gpt-5.5", "low"),
    ],
)
def test_default_reasoning_effort_per_model(model, effort):
    from juddges_search import llms

    with patch.object(llms, "DEFAULT_REASONING_EFFORT", None):
        assert llms.default_reasoning_effort(model) == effort


@pytest.mark.unit
def test_reasoning_effort_env_override_wins():
    from juddges_search import llms

    with patch.object(llms, "DEFAULT_REASONING_EFFORT", "high"):
        assert llms.default_reasoning_effort("gpt-6.2-sol") == "high"


@pytest.mark.unit
@patch.dict(os.environ, {"OPENAI_API_KEY": "fake-key"})
def test_get_llm_uses_low_effort_for_gpt6():
    from juddges_search import llms

    with patch.object(llms, "DEFAULT_REASONING_EFFORT", None):
        llm = llms.get_llm("gpt-6.2-sol")
    assert llm.model_name == "gpt-6.2-sol"
    assert llm.reasoning_effort == "low"


@pytest.mark.unit
@patch.dict(os.environ, {"OPENAI_API_KEY": "fake-key"})
def test_provider_omits_temperature_for_reasoning_models():
    from juddges_search.llm_provider import _build_chat_openai

    # GPT-6.x only accepts the default temperature (400 on 0.0).
    assert _build_chat_openai("gpt-6.2-sol", None, 0.0).temperature is None
    assert _build_chat_openai("gpt-4.1", None, 0.0).temperature == 0.0


@pytest.mark.unit
def test_main_model_default_is_gpt_6_2_sol():
    from juddges_search import llms

    assert llms.GPT_6_2_SOL == "gpt-6.2-sol"
    if not os.getenv("LLM_NAME"):
        assert llms.LLM_NAME == "gpt-6.2-sol"
