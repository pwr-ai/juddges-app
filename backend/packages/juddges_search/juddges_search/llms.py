"""Central LLM factory for juddges_search chains.

Every chain (chat, query enhancement, schema generation, …) should get its
ChatOpenAI instance through this module so that timeouts, retries, and
reasoning-mode defaults are applied uniformly.

Defaults (override via kwargs):
- request_timeout = 30s — longer than median reasoning-mode latency (~3s)
  with headroom for p99; prevents a hung OpenAI call from pinning a worker
  for the full 120s gunicorn budget.
- max_retries = 2 — retry transient 429/5xx with SDK's built-in backoff.
- reasoning_effort = "minimal" — GPT-5 is a reasoning model by default;
  without this, hidden reasoning tokens consume the entire
  max_completion_tokens budget and structured output fails with
  "length limit reached". "minimal" is correct for classification,
  routing, rewrites; chains that need deep thinking can override.
- max_completion_tokens = 4000 — enough headroom for reasoning + real
  output. Deprecated `max_tokens` is NOT forwarded (GPT-5 rejects it).
"""

from __future__ import annotations

import os
from typing import Any

from langchain_openai import ChatOpenAI

# Backward-compat aliases (imports in other files). All point at GPT-5 now;
# names kept to avoid churning every import site in one go.
GPT_3 = "gpt-5-nano"
GPT_4 = "gpt-5"
GPT_4o = "gpt-5"
GPT_4o_mini = "gpt-5-mini"
GPT_5_nano = "gpt-5-nano"
GPT_5_mini = "gpt-5-mini"
GPT_5 = "gpt-5"

LLM_NAME = os.getenv("LLM_NAME") or GPT_5
LLM_MINI_NAME = os.getenv("LLM_MINI_NAME") or GPT_5_mini
LLM_BASE_URL = os.getenv("LLM_BASE_URL", default=None)

# Operational defaults. Override via env vars for one-off tuning without
# editing code. Keep them conservative — a slow LLM shouldn't take down
# workers for 2 minutes.
DEFAULT_REQUEST_TIMEOUT = float(os.getenv("LLM_REQUEST_TIMEOUT_SECONDS", "30"))
DEFAULT_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))
DEFAULT_MAX_COMPLETION_TOKENS = int(os.getenv("LLM_MAX_COMPLETION_TOKENS", "4000"))
DEFAULT_REASONING_EFFORT = os.getenv("LLM_REASONING_EFFORT", "minimal")


def _apply_defaults(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Merge hardened defaults into caller kwargs (caller wins on conflict)."""
    kwargs.setdefault("request_timeout", DEFAULT_REQUEST_TIMEOUT)
    kwargs.setdefault("max_retries", DEFAULT_MAX_RETRIES)
    kwargs.setdefault("max_completion_tokens", DEFAULT_MAX_COMPLETION_TOKENS)
    kwargs.setdefault("reasoning_effort", DEFAULT_REASONING_EFFORT)
    # GPT-5 rejects `temperature` and deprecated `max_tokens`; drop silently
    # so legacy call sites keep working without a rewrite.
    kwargs.pop("temperature", None)
    kwargs.pop("max_tokens", None)
    return kwargs


def get_default_llm(use_mini_model: bool, **kwargs: Any) -> ChatOpenAI:
    llm_name = LLM_MINI_NAME if use_mini_model else LLM_NAME
    return ChatOpenAI(
        model=llm_name,
        base_url=LLM_BASE_URL,
        **_apply_defaults(kwargs),
    )


def get_llm(name: str | None = None, **kwargs: Any) -> ChatOpenAI:
    if name is None:
        name = LLM_NAME
    return ChatOpenAI(model=name, **_apply_defaults(kwargs))
