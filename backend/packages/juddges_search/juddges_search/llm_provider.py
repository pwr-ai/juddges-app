"""LLM injection seam.

Production code uses get_llm_provider() to obtain a chat model. Tests override
this via a fixture or by passing a FakeChatModel directly to chain factories.
"""

from __future__ import annotations

import os
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class LLMProvider(Protocol):
    """Minimal subset of langchain BaseChatModel needed by chains."""

    def invoke(self, messages: Any, **kwargs: Any) -> Any: ...

    async def ainvoke(self, messages: Any, **kwargs: Any) -> Any: ...


def get_llm_provider(
    *,
    model: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.0,
) -> LLMProvider:
    """Default factory — returns a real ChatOpenAI configured from env.

    Override in tests by patching this symbol or by passing a fake into
    chain factories directly.
    """
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=model or os.environ.get("LLM_NAME", "gpt-5"),
        base_url=base_url or os.environ.get("LLM_BASE_URL"),
        temperature=temperature,
    )
