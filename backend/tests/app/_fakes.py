"""Test doubles shared by backend unit tests (Foundation)."""

from __future__ import annotations

from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

RpcHandler = list[dict[str, Any]] | Callable[[dict[str, Any]], list[dict[str, Any]]]


class FakeRpcClient:
    """Answers `client.rpc(name, params).execute().data` from canned rows.

    `handlers[name]` is either a list of rows or a callable (params) -> rows.
    Unknown RPC names raise, so a typo in production code cannot pass a test.
    """

    def __init__(self, handlers: dict[str, RpcHandler]):
        self.handlers = handlers
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]):
        if name not in self.handlers:
            raise AssertionError(
                f"unexpected rpc({name!r}); known: {sorted(self.handlers)}"
            )
        self.calls.append((name, params))
        handler = self.handlers[name]
        rows = handler(params) if callable(handler) else handler
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=list(rows)))
