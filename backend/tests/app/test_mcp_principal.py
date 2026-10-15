"""Unit tests for the juddges_mcp principal context."""

import asyncio
from unittest.mock import MagicMock

import pytest
from juddges_mcp.principal import (
    MissingPrincipalError,
    get_principal,
    reset_principal,
    set_principal,
)


@pytest.mark.unit
class TestPrincipalContext:
    def test_get_without_set_raises(self):
        with pytest.raises(MissingPrincipalError):
            get_principal()

    def test_set_then_get_returns_the_principal(self):
        user = MagicMock(id="user-123")
        token = set_principal(user)
        try:
            assert get_principal() is user
        finally:
            reset_principal(token)

    def test_reset_restores_the_previous_state(self):
        user = MagicMock(id="user-123")
        token = set_principal(user)
        reset_principal(token)
        with pytest.raises(MissingPrincipalError):
            get_principal()

    def test_nested_principals_unwind_in_order(self):
        outer, inner = MagicMock(id="outer"), MagicMock(id="inner")
        outer_token = set_principal(outer)
        inner_token = set_principal(inner)
        assert get_principal() is inner
        reset_principal(inner_token)
        assert get_principal() is outer
        reset_principal(outer_token)

    def test_concurrent_tasks_do_not_see_each_others_principal(self):
        """Two interleaved asyncio tasks each read back their own principal."""

        async def request(user, started, proceed):
            token = set_principal(user)
            try:
                started.set()
                # Yield until the other task has bound its own principal.
                await proceed.wait()
                return get_principal()
            finally:
                reset_principal(token)

        async def main():
            alice, bob = MagicMock(id="alice"), MagicMock(id="bob")
            a_started, b_started = asyncio.Event(), asyncio.Event()
            proceed = asyncio.Event()
            task_a = asyncio.create_task(request(alice, a_started, proceed))
            task_b = asyncio.create_task(request(bob, b_started, proceed))
            await a_started.wait()
            await b_started.wait()
            proceed.set()
            return alice, bob, await task_a, await task_b

        alice, bob, seen_a, seen_b = asyncio.run(main())
        assert seen_a is alice
        assert seen_b is bob
        with pytest.raises(MissingPrincipalError):
            get_principal()
