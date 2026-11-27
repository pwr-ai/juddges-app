"""LLM injection seam.

Production code uses get_llm_provider() to obtain a chat model. Tests override
this via a fixture or by passing a FakeChatModel directly to chain factories.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Protocol, runtime_checkable

from juddges_search.llms import LLM_NAME


@runtime_checkable
class LLMProvider(Protocol):
    """Minimal subset of langchain BaseChatModel needed by chains."""

    def invoke(self, messages: Any, **kwargs: Any) -> Any: ...

    async def ainvoke(self, messages: Any, **kwargs: Any) -> Any: ...


@lru_cache(maxsize=8)
def _build_chat_openai(model: str, base_url: str | None, temperature: float):
    """Construct (and memoise) a ChatOpenAI client per resolved config.

    Each ChatOpenAI owns an httpx connection pool; rebuilding one per request
    re-pays the TLS handshake / pool warmup. Keyed on the fully-resolved
    arguments so distinct configs still get distinct clients, while repeated
    identical calls reuse a single warm client.
    """
    from langchain_openai import ChatOpenAI

    # Reasoning models (GPT-5+, o-series) only accept the default temperature.
    # langchain-openai strips it for "gpt-5*" names but not for newer ones.
    if model.startswith(("gpt-5", "gpt-6", "o1", "o3", "o4")):
        return ChatOpenAI(model=model, base_url=base_url)
    return ChatOpenAI(model=model, base_url=base_url, temperature=temperature)


def get_llm_provider(
    *,
    model: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.0,
) -> LLMProvider:
    """Default factory — returns a cached ChatOpenAI configured from env.

    The underlying client is memoised per resolved config (see
    ``_build_chat_openai``) so repeated calls reuse one warm connection pool.
    Override in tests by patching this symbol or by passing a fake into
    chain factories directly.
    """
    return _build_chat_openai(
        model or os.environ.get("LLM_NAME") or LLM_NAME,
        base_url or os.environ.get("LLM_BASE_URL"),
        temperature,
    )
