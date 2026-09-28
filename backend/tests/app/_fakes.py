"""Test doubles shared by backend unit tests (Foundation)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
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


TableHandler = list[dict[str, Any]] | Callable[["TableQuery"], list[dict[str, Any]]]


@dataclass
class TableQuery:
    """What one `client.table(name)...execute()` chain asked for.

    `filters` holds `(op, column, value)` in call order, with PostgREST's
    operator names (`eq`, `in`, `is`, `not.is`, ...), so a test can assert the
    exact scoping a query applies without a database.
    """

    table: str
    select: str | None = None
    filters: list[tuple[str, str, Any]] = field(default_factory=list)
    order: list[tuple[str, bool, bool | None]] = field(default_factory=list)
    limit: int | None = None

    def filter_values(self, op: str, column: str) -> list[Any]:
        return [v for o, c, v in self.filters if o == op and c == column]


class _NotProxy:
    def __init__(self, builder: _FakeTableBuilder):
        self._builder = builder

    def __getattr__(self, name: str):
        op = name.rstrip("_")

        def _apply(column: str, value: Any):
            self._builder.query.filters.append((f"not.{op}", column, value))
            return self._builder

        return _apply


class _FakeTableBuilder:
    def __init__(self, query: TableQuery, handler: TableHandler):
        self.query = query
        self._handler = handler

    def select(self, columns: str = "*", **_: Any):
        self.query.select = columns
        return self

    def _filter(self, op: str, column: str, value: Any):
        self.query.filters.append((op, column, value))
        return self

    def eq(self, column: str, value: Any):
        return self._filter("eq", column, value)

    def neq(self, column: str, value: Any):
        return self._filter("neq", column, value)

    def in_(self, column: str, values: list[Any]):
        return self._filter("in", column, list(values))

    def is_(self, column: str, value: Any):
        return self._filter("is", column, value)

    @property
    def not_(self) -> _NotProxy:
        return _NotProxy(self)

    def order(
        self,
        column: str,
        *,
        desc: bool = False,
        nullsfirst: bool | None = None,
        **_: Any,
    ):
        self.query.order.append((column, desc, nullsfirst))
        return self

    def limit(self, size: int, **_: Any):
        self.query.limit = size
        return self

    def execute(self):
        handler = self._handler
        rows = handler(self.query) if callable(handler) else handler
        return SimpleNamespace(data=list(rows))


class FakeSupabaseClient(FakeRpcClient):
    """`FakeRpcClient` plus canned `client.table(name)` reads.

    `table_handlers[name]` is a list of rows or a callable (TableQuery) -> rows;
    every chain is recorded in `table_calls`. Unknown table names raise, like
    unknown RPC names.
    """

    def __init__(
        self,
        rpc_handlers: dict[str, RpcHandler] | None = None,
        table_handlers: dict[str, TableHandler] | None = None,
    ):
        super().__init__(rpc_handlers or {})
        self.table_handlers = table_handlers or {}
        self.table_calls: list[TableQuery] = []

    def table(self, name: str) -> _FakeTableBuilder:
        if name not in self.table_handlers:
            raise AssertionError(
                f"unexpected table({name!r}); known: {sorted(self.table_handlers)}"
            )
        query = TableQuery(table=name)
        self.table_calls.append(query)
        return _FakeTableBuilder(query, self.table_handlers[name])
