"""Test doubles for the search package."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FakeMessage:
    content: str

    def __str__(self) -> str:
        return self.content


@dataclass
class FakeChatModel:
    """Deterministic, in-memory chat model for tests.

    Pass a list of response strings; each invoke() pops one in order.
    Records every prompt seen on `self.calls` for assertions.
    """

    responses: list[str]
    calls: list[Any] = field(default_factory=list)
    _cursor: int = 0

    def invoke(self, messages: Any, **_: Any) -> FakeMessage:
        self.calls.append(messages)
        if self._cursor >= len(self.responses):
            raise IndexError(
                f"FakeChatModel exhausted: {len(self.responses)} responses "
                f"queued, asked for response #{self._cursor + 1}"
            )
        response = self.responses[self._cursor]
        self._cursor += 1
        return FakeMessage(content=response)

    async def ainvoke(self, messages: Any, **kwargs: Any) -> FakeMessage:
        return self.invoke(messages, **kwargs)