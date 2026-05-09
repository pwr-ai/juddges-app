"""Test doubles for the search package."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from langchain_core.runnables import Runnable


class FakeMessage(str):
    """A message with content for compatibility."""

    def __new__(cls, content: str):
        instance = str.__new__(cls, content)
        instance.content = content
        return instance

    def __init__(self, content: str):
        # str.__init__ is a no-op but this maintains the interface
        pass


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
        return self
