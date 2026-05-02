"""Test doubles for the search package."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

try:
    from langchain_core.runnables import Runnable
except ImportError:
    # Fallback if LangChain not available
    class Runnable:
        pass


class FakeMessage(str):
    """A string-like message that also has a content attribute for compatibility."""

    def __new__(cls, content: str):
        return str.__new__(cls, content)

    def __init__(self, content: str):
        self.content = content


@dataclass
class FakeChatModel(Runnable[Any, FakeMessage]):
    """Deterministic, in-memory chat model for tests.

    Pass a list of response strings; each invoke() pops one in order.
    Records every prompt seen on `self.calls` for assertions.
    """

    responses: list[str]
    calls: list[Any] = field(default_factory=list)
    _cursor: int = 0

    def invoke(self, input: Any, config: Any = None, **kwargs: Any) -> FakeMessage:
        self.calls.append(input)
        if self._cursor >= len(self.responses):
            raise IndexError(
                f"FakeChatModel exhausted: {len(self.responses)} responses "
                f"queued, asked for response #{self._cursor + 1}"
            )
        response = self.responses[self._cursor]
        self._cursor += 1
        return FakeMessage(content=response)

    async def ainvoke(self, input: Any, config: Any = None, **kwargs: Any) -> FakeMessage:
        return self.invoke(input, config, **kwargs)

    def with_config(self, **kwargs: Any) -> "FakeChatModel":
        """Return self for LangChain compatibility. Config is ignored in tests."""
        return self