# juddges-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Juddges corpus to AI clients as an MCP server, authenticated by long-lived per-user API keys, with three read-only tools (`search_judgments`, `get_judgment`, `get_extracted_fields`).

**Architecture:** A new Supabase table holds hashed, revocable per-user keys; a second credential path in the backend resolves such a key to the existing `AuthenticatedUser` class, so nothing downstream learns a new identity model. The search pipeline is extracted out of its route handler into `run_document_search()` so HTTP and MCP share one code path. Tool functions live in a transport-agnostic package and read their principal from a context variable; an HTTP entrypoint is mounted at `/mcp` on the existing FastAPI app and a stdio entrypoint serves local development.

**Tech Stack:** Python 3.12, FastAPI, the `mcp` Python SDK (FastMCP), Supabase (PostgreSQL), `limits` for rate limiting, pytest, Next.js 15 + Jest + Playwright on the frontend.

**Spec:** `docs/superpowers/specs/2026-10-14-juddges-mcp-design.md`

## Global Constraints

- Backend is Python 3.12+; format and lint with Ruff (`poetry run poe check`).
- `pytest` config sets `asyncio_mode = "auto"` — do **not** add `@pytest.mark.asyncio`.
- Mark every test that needs no live service `@pytest.mark.unit`; CI runs `pytest -m unit`.
- The `mcp` dependency is pinned to an **exact** version (`mcp = "1.x.y"`, never `^`). Edit `backend/pyproject.toml`, run `poetry lock`, commit both files — CI fails on `poetry check --lock`.
- Key prefix is the literal string `jdg_mcp_`.
- Default scopes for a new key: `{search:read}`.
- `search_judgments`: `limit` default 10, hard maximum 25.
- `last_used_at` write throttle window: 300 seconds.
- `search_judgments` returns snippets only, never full judgment text.
- Adding or removing an endpoint or an auth dependency trips the OpenAPI Type Drift check: run `bash scripts/regen_openapi_types.sh` and commit the snapshot in the same task.
- Frontend work needs Node 22+ (`nvm use 22.23.2`) before any build, Jest run, or verify script.
- Conventional commits. **Never** add Claude or co-author footers.
- Branch: `feat/juddges-mcp`, already checked out in the worktree `.worktrees/juddges-mcp`.

## Review Focus

Input classes the spec implies but which no task's happy path exercises. Each has its test assigned to the task that owns the code.

1. **Missing or malformed `Authorization` header on `/mcp`** — `Bearer` with no value, or no header at all, must produce a 401, never a 500 from indexing an empty string. (Task 11)
2. **A key whose owning user was deleted** — the `ON DELETE CASCADE` removes the row, so the lookup must miss and return 401, never a principal with a dangling `user_id`. (Task 2)
3. **`date_from` later than `date_to`, or an unparseable date** — `search_judgments` must return a tool error naming the offending field, not pass garbage into the pgvector RPC. (Task 9)
4. **`limit` of 0, negative, or above the cap** — must be rejected or clamped explicitly; an unbounded query must be impossible to request. (Task 9)
5. **`get_judgment` with a `section` the document does not have** — must be an explicit error listing the available sections, not an empty string that reads as "this section is empty". (Task 10)

---

### Task 1: Key generation, hashing, and the `mcp_api_keys` table

**Files:**
- Create: `supabase/migrations/20261020000001_create_mcp_api_keys.sql`
- Create: `backend/app/core/auth_mcp.py`
- Test: `backend/tests/app/test_auth_mcp.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `MCP_KEY_PREFIX: str`, `generate_mcp_key() -> str`, `hash_mcp_key(token: str) -> str`, `key_prefix(token: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for app.core.auth_mcp key material helpers."""

import pytest

from app.core.auth_mcp import (
    MCP_KEY_PREFIX,
    generate_mcp_key,
    hash_mcp_key,
    key_prefix,
)


@pytest.mark.unit
class TestKeyMaterial:
    def test_generated_key_carries_the_prefix(self):
        assert generate_mcp_key().startswith(MCP_KEY_PREFIX)

    def test_generated_keys_are_unique(self):
        assert len({generate_mcp_key() for _ in range(100)}) == 100

    def test_generated_key_has_enough_entropy(self):
        # 32 random bytes base64url-encoded is 43 chars, no padding.
        assert len(generate_mcp_key()) >= len(MCP_KEY_PREFIX) + 43

    def test_hash_is_stable_and_hex(self):
        token = "jdg_mcp_abc"  # noqa: S105
        first = hash_mcp_key(token)
        assert first == hash_mcp_key(token)
        assert len(first) == 64
        assert int(first, 16) >= 0

    def test_hash_differs_between_keys(self):
        assert hash_mcp_key("jdg_mcp_a") != hash_mcp_key("jdg_mcp_b")

    def test_hash_never_contains_the_plaintext(self):
        token = generate_mcp_key()
        assert token[len(MCP_KEY_PREFIX) :] not in hash_mcp_key(token)

    def test_key_prefix_is_the_first_eight_characters(self):
        token = "jdg_mcp_ABCDEFGHIJ"  # noqa: S105
        assert key_prefix(token) == "jdg_mcp_"[:8]
        assert len(key_prefix(token)) == 8
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_auth_mcp.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.auth_mcp'`

- [ ] **Step 3: Write the minimal implementation**

```python
"""Long-lived MCP API keys: key material, lookup, and the auth dependency.

A key is a bearer credential with no expiry by default, so only its sha256
hash is ever stored (see
supabase/migrations/20261020000001_create_mcp_api_keys.sql). The plaintext
is returned once, at creation, and is not recoverable afterwards.

This module is deliberately separate from app/auth.py, which verifies the
single shared BACKEND_API_KEY for the frontend-to-backend hop and carries no
user identity.
"""

import hashlib
import secrets

MCP_KEY_PREFIX = "jdg_mcp_"
_KEY_BYTES = 32
_DISPLAY_PREFIX_LENGTH = 8


def generate_mcp_key() -> str:
    """Return a new plaintext key. Never store the return value."""
    return f"{MCP_KEY_PREFIX}{secrets.token_urlsafe(_KEY_BYTES)}"


def hash_mcp_key(token: str) -> str:
    """Return the sha256 hex digest stored in `mcp_api_keys.token_hash`."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def key_prefix(token: str) -> str:
    """Return the display-only prefix stored in `mcp_api_keys.prefix`."""
    return token[:_DISPLAY_PREFIX_LENGTH]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_auth_mcp.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the migration**

```sql
-- Long-lived per-user MCP API keys (juddges-mcp phase 0).
--
-- Only the sha256 hash of a key is stored; the plaintext is shown once at
-- creation. Revocation sets revoked_at rather than deleting the row, so a
-- leaked-key investigation still has the audit trail.

CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL UNIQUE,
    prefix        TEXT NOT NULL,
    name          TEXT,
    scopes        TEXT[] NOT NULL DEFAULT '{search:read}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcp_api_keys_user_id_idx
    ON public.mcp_api_keys (user_id);

COMMENT ON TABLE public.mcp_api_keys IS
    'Long-lived MCP bearer keys. Service-role only: never exposed to anon or '
    'authenticated roles, because holding the anon key must not reveal or '
    'consume a credential. The frontend reads these only through the '
    'backend /mcp/keys endpoints.';

COMMENT ON COLUMN public.mcp_api_keys.token_hash IS
    'sha256 hex of the full plaintext key. The plaintext is never stored.';

ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS with zero policies denies anon and authenticated. The explicit REVOKE
-- is belt-and-braces: a later blanket GRANT in another migration would
-- otherwise silently widen access. See
-- 20260902000001_create_invite_codes.sql for the same reasoning, including
-- why PUBLIC must be revoked separately from anon/authenticated.
REVOKE ALL ON public.mcp_api_keys FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.mcp_api_keys TO service_role;
```

- [ ] **Step 6: Verify the migration applies**

Run: `supabase db reset --local` (or the project's usual local-apply command)
Expected: no error; `\d public.mcp_api_keys` shows the table, and
`SET ROLE anon; SELECT * FROM public.mcp_api_keys;` is denied.

If a local Supabase is unavailable in this environment, say so explicitly in
the task report rather than marking this step done.

- [ ] **Step 7: Run lint and format**

Run: `cd backend && poetry run poe check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/auth_mcp.py backend/tests/app/test_auth_mcp.py \
        supabase/migrations/20261020000001_create_mcp_api_keys.sql
git commit -m "feat(mcp): add mcp_api_keys table and key material helpers"
```

---

### Task 2: Resolve a key to a principal

**Files:**
- Modify: `backend/app/core/auth_mcp.py`
- Test: `backend/tests/app/test_auth_mcp.py`

**Interfaces:**
- Consumes: `MCP_KEY_PREFIX`, `hash_mcp_key` (Task 1); `AuthenticatedUser`, `get_admin_supabase_client` from `app.core.auth_jwt`.
- Produces: `resolve_mcp_principal(token: str) -> AuthenticatedUser | None`. The returned object carries `id` (the owner's `user_id`), `raw_token=""`, and `mcp_scopes: list[str]` plus `mcp_key_id: str` set as attributes.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/app/test_auth_mcp.py`:

```python
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from app.core.auth_mcp import resolve_mcp_principal


def _row(**overrides):
    base = {
        "id": "key-1",
        "user_id": "user-123",
        "scopes": ["search:read"],
        "expires_at": None,
        "revoked_at": None,
    }
    base.update(overrides)
    return base


def _admin_returning(rows):
    """A Supabase admin client stub whose select().eq().execute() yields rows."""
    client = MagicMock()
    execute = MagicMock()
    execute.data = rows
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        execute
    )
    return client


@pytest.mark.unit
class TestResolveMcpPrincipal:
    def test_valid_key_resolves_to_its_owner(self):
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row()]),
        ):
            user = resolve_mcp_principal("jdg_mcp_valid")
        assert user is not None
        assert user.id == "user-123"
        assert user.raw_token == ""  # noqa: S105
        assert user.mcp_scopes == ["search:read"]
        assert user.mcp_key_id == "key-1"

    def test_wrong_prefix_never_touches_the_database(self):
        admin = _admin_returning([_row()])
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=admin):
            assert resolve_mcp_principal("eyJhbGciOi.some.jwt") is None
        admin.table.assert_not_called()

    def test_empty_token_returns_none(self):
        assert resolve_mcp_principal("") is None

    def test_unknown_hash_returns_none(self):
        # Review Focus 2: ON DELETE CASCADE removed the row with the user,
        # so the lookup misses and no dangling principal is minted.
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([]),
        ):
            assert resolve_mcp_principal("jdg_mcp_deleted_owner") is None

    def test_revoked_key_returns_none(self):
        revoked = _row(revoked_at="2026-01-01T00:00:00+00:00")
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([revoked]),
        ):
            assert resolve_mcp_principal("jdg_mcp_revoked") is None

    def test_expired_key_returns_none(self):
        past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row(expires_at=past)]),
        ):
            assert resolve_mcp_principal("jdg_mcp_expired") is None

    def test_future_expiry_still_resolves(self):
        future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        with patch(
            "app.core.auth_mcp.get_admin_supabase_client",
            return_value=_admin_returning([_row(expires_at=future)]),
        ):
            assert resolve_mcp_principal("jdg_mcp_fresh") is not None

    def test_database_failure_returns_none_and_does_not_raise(self):
        broken = MagicMock()
        broken.table.side_effect = RuntimeError("supabase down")
        with patch("app.core.auth_mcp.get_admin_supabase_client", return_value=broken):
            assert resolve_mcp_principal("jdg_mcp_whatever") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_auth_mcp.py -k ResolveMcp -v`
Expected: FAIL — `ImportError: cannot import name 'resolve_mcp_principal'`

- [ ] **Step 3: Write the minimal implementation**

Append to `backend/app/core/auth_mcp.py`:

```python
from datetime import UTC, datetime

from loguru import logger

from app.core.auth_jwt import AuthenticatedUser, get_admin_supabase_client

_TABLE = "mcp_api_keys"


def _is_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        return datetime.fromisoformat(expires_at) <= datetime.now(UTC)
    except ValueError:
        # An unparseable timestamp is treated as expired: fail closed.
        logger.warning("MCP key has an unparseable expires_at; rejecting")
        return True


def resolve_mcp_principal(token: str) -> AuthenticatedUser | None:
    """Resolve a plaintext MCP key to its owner, or None if it is not usable.

    Returns None — never raises — for every rejection path, so callers can
    turn the absence of a principal into a single 401.
    """
    if not token or not token.startswith(MCP_KEY_PREFIX):
        return None

    try:
        response = (
            get_admin_supabase_client()
            .table(_TABLE)
            .select("id, user_id, scopes, expires_at, revoked_at")
            .eq("token_hash", hash_mcp_key(token))
            .execute()
        )
    except Exception as e:
        logger.warning(f"MCP key lookup failed: {e}")
        return None

    rows = response.data or []
    if not rows:
        return None

    row = rows[0]
    if row.get("revoked_at") or _is_expired(row.get("expires_at")):
        return None

    user = AuthenticatedUser(
        {
            "id": row["user_id"],
            "sub": row["user_id"],
            "role": "authenticated",
            "aud": "authenticated",
        },
        "",
    )
    user.mcp_scopes = list(row.get("scopes") or [])
    user.mcp_key_id = row["id"]
    return user
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_auth_mcp.py -v`
Expected: PASS (15 tests)

- [ ] **Step 5: Run lint and format**

Run: `cd backend && poetry run poe check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/auth_mcp.py backend/tests/app/test_auth_mcp.py
git commit -m "feat(mcp): resolve an MCP key to its owning principal"
```

---

### Task 3: The dual-credential dependency and the `last_used_at` throttle

**Files:**
- Modify: `backend/app/core/auth_mcp.py`
- Test: `backend/tests/app/test_auth_mcp.py`

**Interfaces:**
- Consumes: `resolve_mcp_principal` (Task 2); `get_current_user` from `app.core.auth_jwt`.
- Produces: `THROTTLE_SECONDS: int`, `should_record_use(last_used_at: str | None, now: datetime | None = None) -> bool`, `touch_key(key_id: str) -> None`, and the FastAPI dependency `get_current_user_or_mcp_key(request, background_tasks) -> AuthenticatedUser`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/app/test_auth_mcp.py`:

```python
from fastapi import BackgroundTasks, HTTPException

from app.core.auth_mcp import (
    THROTTLE_SECONDS,
    get_current_user_or_mcp_key,
    should_record_use,
)


def _request_with(authorization: str | None):
    request = MagicMock()
    request.headers = {} if authorization is None else {"Authorization": authorization}
    return request


@pytest.mark.unit
class TestLastUsedThrottle:
    def test_never_used_key_is_recorded(self):
        assert should_record_use(None) is True

    def test_recently_used_key_is_not_recorded(self):
        recent = (datetime.now(UTC) - timedelta(seconds=10)).isoformat()
        assert should_record_use(recent) is False

    def test_key_used_outside_the_window_is_recorded(self):
        old = (datetime.now(UTC) - timedelta(seconds=THROTTLE_SECONDS + 1)).isoformat()
        assert should_record_use(old) is True

    def test_unparseable_last_used_is_recorded(self):
        assert should_record_use("not-a-timestamp") is True


@pytest.mark.unit
class TestDualCredentialDependency:
    async def test_mcp_key_takes_the_key_path(self):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        tasks = BackgroundTasks()
        with patch(
            "app.core.auth_mcp.resolve_mcp_principal", return_value=principal
        ) as resolve:
            user = await get_current_user_or_mcp_key(
                _request_with("Bearer jdg_mcp_abc"), tasks
            )
        resolve.assert_called_once_with("jdg_mcp_abc")
        assert user is principal
        assert len(tasks.tasks) == 1  # the throttled touch_key

    async def test_invalid_mcp_key_is_rejected_with_401(self):
        with patch("app.core.auth_mcp.resolve_mcp_principal", return_value=None):
            with pytest.raises(HTTPException) as exc:
                await get_current_user_or_mcp_key(
                    _request_with("Bearer jdg_mcp_revoked"), BackgroundTasks()
                )
        assert exc.value.status_code == 401

    async def test_jwt_falls_through_to_the_existing_path(self):
        jwt_user = MagicMock(id="user-456")
        with patch(
            "app.core.auth_mcp.get_current_user", return_value=jwt_user
        ) as jwt_path:
            user = await get_current_user_or_mcp_key(
                _request_with("Bearer eyJhbGciOi.header.sig"), BackgroundTasks()
            )
        jwt_path.assert_awaited_once()
        assert user is jwt_user

    async def test_missing_header_is_rejected_with_401(self):
        with pytest.raises(HTTPException) as exc:
            await get_current_user_or_mcp_key(_request_with(None), BackgroundTasks())
        assert exc.value.status_code == 401

    async def test_bearer_with_no_value_is_rejected_with_401(self):
        # Review Focus 1: must not IndexError on an empty credential.
        with pytest.raises(HTTPException) as exc:
            await get_current_user_or_mcp_key(_request_with("Bearer"), BackgroundTasks())
        assert exc.value.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_auth_mcp.py -k "Throttle or DualCredential" -v`
Expected: FAIL — `ImportError: cannot import name 'THROTTLE_SECONDS'`

- [ ] **Step 3: Write the minimal implementation**

Append to `backend/app/core/auth_mcp.py`:

```python
from datetime import timedelta

from fastapi import BackgroundTasks, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from app.core.auth_jwt import get_current_user

THROTTLE_SECONDS = 300

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or missing credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer_value(request: Request) -> str | None:
    """Return the Bearer credential, or None when absent or empty."""
    header = request.headers.get("Authorization") or ""
    scheme, _, credential = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    credential = credential.strip()
    return credential or None


def should_record_use(
    last_used_at: str | None, now: datetime | None = None
) -> bool:
    """True when `last_used_at` is old enough to be worth another write."""
    if not last_used_at:
        return True
    try:
        previous = datetime.fromisoformat(last_used_at)
    except ValueError:
        return True
    reference = now or datetime.now(UTC)
    return reference - previous >= timedelta(seconds=THROTTLE_SECONDS)


def touch_key(key_id: str) -> None:
    """Record a use of `key_id`, at most once per THROTTLE_SECONDS.

    Runs in a background task: a tool call must not wait on this write, and a
    failure here must never fail the call.
    """
    try:
        client = get_admin_supabase_client()
        current = (
            client.table(_TABLE)
            .select("last_used_at")
            .eq("id", key_id)
            .execute()
        )
        rows = current.data or []
        if rows and not should_record_use(rows[0].get("last_used_at")):
            return
        client.table(_TABLE).update(
            {"last_used_at": datetime.now(UTC).isoformat()}
        ).eq("id", key_id).execute()
    except Exception as e:
        logger.warning(f"Could not record MCP key use for {key_id}: {e}")


async def get_current_user_or_mcp_key(
    request: Request,
    background_tasks: BackgroundTasks,
) -> AuthenticatedUser:
    """Authenticate either a Supabase JWT or a long-lived MCP key.

    A Bearer value carrying the MCP prefix takes the key path; anything else
    falls through to the existing JWT dependency. Both yield the same
    AuthenticatedUser class, so no endpoint learns a second identity model.
    """
    credential = _bearer_value(request)
    if credential is None:
        raise _UNAUTHORIZED

    if credential.startswith(MCP_KEY_PREFIX):
        principal = resolve_mcp_principal(credential)
        if principal is None:
            raise _UNAUTHORIZED
        background_tasks.add_task(touch_key, principal.mcp_key_id)
        return principal

    return await get_current_user(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=credential)
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_auth_mcp.py -v`
Expected: PASS (24 tests)

- [ ] **Step 5: Run lint and format**

Run: `cd backend && poetry run poe check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/auth_mcp.py backend/tests/app/test_auth_mcp.py
git commit -m "feat(mcp): accept MCP keys alongside Supabase JWTs"
```

---

### Task 4: The `/mcp/keys` management router

**Files:**
- Create: `backend/app/mcp_keys.py`
- Modify: `backend/app/server.py` (the `API_KEY_PROTECTED_ROUTERS` list and its import block)
- Test: `backend/tests/app/test_mcp_keys_router.py`

**Interfaces:**
- Consumes: `generate_mcp_key`, `hash_mcp_key`, `key_prefix` (Task 1); `get_current_user` from `app.core.auth_jwt`; `log_audit_background` from `app.services.audit_service`.
- Produces: `router` (prefix `/mcp/keys`) with `POST ""`, `GET ""`, `DELETE "/{key_id}"`, and the response models `McpKeyCreated` and `McpKeySummary`.

**Why `get_current_user` and not `get_current_user_or_mcp_key`:** an MCP key must not be able to mint or revoke another MCP key. That closes the privilege-escalation path a leaked key would otherwise open, and it is asserted by a test below.

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for the /mcp/keys management router."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.auth_jwt import get_current_user
from app.mcp_keys import router


class _FakeUser:
    id = "user-123"
    email = "user@example.com"
    role = "authenticated"


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    return TestClient(app)


def _admin_stub(select_rows=None, inserted=None):
    """Supabase admin stub covering insert/select/update chains."""
    admin = MagicMock()
    table = admin.table.return_value

    insert_exec = MagicMock()
    insert_exec.data = [inserted or {"id": "key-1"}]
    table.insert.return_value.execute.return_value = insert_exec

    select_exec = MagicMock()
    select_exec.data = select_rows or []
    table.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        select_exec
    )

    update_exec = MagicMock()
    update_exec.data = [{"id": "key-1"}]
    table.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
        update_exec
    )
    return admin


@pytest.mark.unit
class TestCreateKey:
    def test_returns_the_plaintext_key_exactly_once(self, client):
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()):
            response = client.post("/mcp/keys", json={"name": "laptop"})
        assert response.status_code == 201
        body = response.json()
        assert body["key"].startswith("jdg_mcp_")
        assert body["prefix"] == "jdg_mcp_"
        assert "token_hash" not in body

    def test_stores_only_the_hash(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.post("/mcp/keys", json={"name": "laptop"})
        plaintext = response.json()["key"]
        stored = admin.table.return_value.insert.call_args[0][0]
        assert stored["token_hash"] != plaintext
        assert plaintext not in str(stored)
        assert stored["user_id"] == "user-123"
        assert stored["scopes"] == ["search:read"]

    def test_writes_an_audit_record(self, client):
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()):
            with patch("app.mcp_keys.log_audit_background") as audit:
                client.post("/mcp/keys", json={"name": "laptop"})
        assert audit.call_args.kwargs["action_type"] == "mcp_key_created"


@pytest.mark.unit
class TestListKeys:
    def test_never_returns_hashes_or_plaintext(self, client):
        rows = [
            {
                "id": "key-1",
                "name": "laptop",
                "prefix": "jdg_mcp_",
                "scopes": ["search:read"],
                "created_at": "2026-10-14T10:00:00+00:00",
                "last_used_at": None,
                "expires_at": None,
                "revoked_at": None,
            }
        ]
        with patch(
            "app.mcp_keys.get_admin_supabase_client",
            return_value=_admin_stub(select_rows=rows),
        ):
            response = client.get("/mcp/keys")
        assert response.status_code == 200
        [key] = response.json()
        assert key["prefix"] == "jdg_mcp_"
        assert "token_hash" not in key
        assert "key" not in key


@pytest.mark.unit
class TestRevokeKey:
    def test_sets_revoked_at_scoped_to_the_caller(self, client):
        admin = _admin_stub()
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.delete("/mcp/keys/key-1")
        assert response.status_code == 204
        payload = admin.table.return_value.update.call_args[0][0]
        assert payload["revoked_at"] is not None
        # Scoped by both id and user_id so one user cannot revoke another's key.
        assert admin.table.return_value.update.return_value.eq.call_count >= 1

    def test_unknown_key_is_404(self, client):
        admin = _admin_stub()
        empty = MagicMock()
        empty.data = []
        admin.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            empty
        )
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=admin):
            response = client.delete("/mcp/keys/nope")
        assert response.status_code == 404

    def test_writes_an_audit_record(self, client):
        with patch("app.mcp_keys.get_admin_supabase_client", return_value=_admin_stub()):
            with patch("app.mcp_keys.log_audit_background") as audit:
                client.delete("/mcp/keys/key-1")
        assert audit.call_args.kwargs["action_type"] == "mcp_key_revoked"


@pytest.mark.unit
class TestKeyCannotManageKeys:
    def test_router_depends_on_jwt_only(self):
        """An MCP key must not mint or revoke keys.

        Asserted structurally: every route on this router depends on
        get_current_user, never get_current_user_or_mcp_key.
        """
        from app.core.auth_mcp import get_current_user_or_mcp_key

        dependants = [
            dependency.call
            for route in router.routes
            for dependency in route.dependant.dependencies
        ]
        for route in router.routes:
            flat = [d.call for d in route.dependant.flat_dependant.dependencies]
            dependants.extend(flat)
        assert get_current_user_or_mcp_key not in dependants
        assert get_current_user in dependants
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_mcp_keys_router.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.mcp_keys'`

- [ ] **Step 3: Write the minimal implementation**

```python
"""Management endpoints for long-lived MCP API keys.

Every route here depends on `get_current_user` — a Supabase JWT — and never
on `get_current_user_or_mcp_key`. An MCP key cannot mint or revoke another
MCP key; that is the single mitigation that bounds a leaked key.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, status
from loguru import logger
from pydantic import BaseModel, Field

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    get_current_user,
)
from app.core.auth_mcp import generate_mcp_key, hash_mcp_key, key_prefix
from app.services.audit_service import log_audit_background

router = APIRouter(prefix="/mcp/keys", tags=["mcp"])

_TABLE = "mcp_api_keys"
_DEFAULT_SCOPES = ["search:read"]


class CreateKeyRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    expires_at: datetime | None = None


class McpKeySummary(BaseModel):
    id: str
    name: str | None
    prefix: str
    scopes: list[str]
    created_at: str
    last_used_at: str | None
    expires_at: str | None
    revoked_at: str | None


class McpKeyCreated(McpKeySummary):
    key: str = Field(
        description="The plaintext key. Shown once; not recoverable afterwards."
    )


@router.post("", response_model=McpKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_key(
    request: CreateKeyRequest,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user),
) -> McpKeyCreated:
    """Mint a key for the caller and return its plaintext exactly once."""
    token = generate_mcp_key()
    now = datetime.now(UTC).isoformat()
    record = {
        "user_id": user.id,
        "token_hash": hash_mcp_key(token),
        "prefix": key_prefix(token),
        "name": request.name,
        "scopes": _DEFAULT_SCOPES,
        "created_at": now,
        "expires_at": request.expires_at.isoformat() if request.expires_at else None,
    }

    try:
        response = (
            get_admin_supabase_client().table(_TABLE).insert(record).execute()
        )
    except Exception as e:
        logger.error(f"Failed to create MCP key for {user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not create key")

    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Could not create key")

    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="mcp_key_created",
        input_data={"key_id": rows[0]["id"], "prefix": record["prefix"]},
    )

    return McpKeyCreated(
        id=rows[0]["id"],
        name=record["name"],
        prefix=record["prefix"],
        scopes=record["scopes"],
        created_at=now,
        last_used_at=None,
        expires_at=record["expires_at"],
        revoked_at=None,
        key=token,
    )


@router.get("", response_model=list[McpKeySummary])
async def list_keys(
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[McpKeySummary]:
    """List the caller's keys. Never returns a hash or a plaintext."""
    try:
        response = (
            get_admin_supabase_client()
            .table(_TABLE)
            .select(
                "id, name, prefix, scopes, created_at, last_used_at, "
                "expires_at, revoked_at"
            )
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to list MCP keys for {user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not list keys")

    return [McpKeySummary(**row) for row in (response.data or [])]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_key(
    background_tasks: BackgroundTasks,
    key_id: str = Path(..., description="Key id to revoke"),
    user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    """Revoke one of the caller's keys. The row is kept for the audit trail."""
    try:
        response = (
            get_admin_supabase_client()
            .table(_TABLE)
            .update({"revoked_at": datetime.now(UTC).isoformat()})
            .eq("id", key_id)
            .eq("user_id", user.id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to revoke MCP key {key_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not revoke key")

    if not (response.data or []):
        raise HTTPException(status_code=404, detail="Key not found")

    log_audit_background(
        background_tasks,
        user_id=user.id,
        action_type="mcp_key_revoked",
        input_data={"key_id": key_id},
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_mcp_keys_router.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Register the router**

In `backend/app/server.py`, add to the import block that pulls the other
routers:

```python
from app.mcp_keys import router as mcp_keys_router
```

and add `mcp_keys_router` to `API_KEY_PROTECTED_ROUTERS`, next to
`collections_router`. The shared `BACKEND_API_KEY` guard belongs here
because these endpoints are reached only through the Next.js proxy, which
injects it server-side; per-user authorization is the `get_current_user`
dependency on each route.

- [ ] **Step 6: Verify the app still boots and the routes are registered**

Run:
```bash
cd backend && poetry run python -c "
from app.server import app
print(sorted(r.path for r in app.routes if '/mcp' in r.path))"
```
Expected: `['/mcp/keys', '/mcp/keys', '/mcp/keys/{key_id}']`

- [ ] **Step 7: Regenerate the OpenAPI snapshot**

Run: `bash scripts/regen_openapi_types.sh`
Expected: the snapshot and generated types gain the three `/mcp/keys`
operations and nothing else. Inspect `git diff` before committing — an
unrelated change in that diff means something else drifted and must be
investigated, not committed.

- [ ] **Step 8: Run the full unit suite and lint**

Run: `cd backend && poetry run poe check-all`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/app/mcp_keys.py backend/tests/app/test_mcp_keys_router.py \
        backend/app/server.py frontend/types/ docs/
git commit -m "feat(mcp): add /mcp/keys create, list and revoke endpoints"
```

(Adjust the OpenAPI snapshot paths to whatever `regen_openapi_types.sh`
actually wrote, as reported by `git status`.)

---

### Task 5: Frontend proxy routes for key management

**Files:**
- Create: `frontend/app/api/mcp-keys/route.ts`
- Create: `frontend/app/api/mcp-keys/[id]/route.ts`
- Test: `frontend/__tests__/api/mcp-keys-route.test.ts`

**Interfaces:**
- Consumes: the backend endpoints from Task 4.
- Produces: `GET`/`POST` at `/api/mcp-keys`, `DELETE` at `/api/mcp-keys/[id]`. All forward the caller's Supabase access token as `Authorization: Bearer` and the server-only `BACKEND_API_KEY` as `X-API-Key`, exactly as `frontend/app/api/collections/route.ts` does.

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * @jest-environment node
 */

jest.mock('@/app/api/utils/backend-url', () => ({
  getBackendUrl: () => 'http://backend.test',
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn() },
}));

import { GET, POST } from '@/app/api/mcp-keys/route';
import { createClient } from '@/lib/supabase/server';

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function signedIn(accessToken = 'user-jwt') {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: accessToken } } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function signedOut() {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error('no session') }),
      getSession: async () => ({ data: { session: null } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe('/api/mcp-keys', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('GET rejects a signed-out caller without calling the backend', async () => {
    signedOut();
    global.fetch = jest.fn() as typeof global.fetch;

    const response = await GET();

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET forwards both the user JWT and the backend key', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof global.fetch;

    const response = await GET();

    expect(response.status).toBe(200);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/mcp/keys');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer user-jwt');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-api-key');
  });

  it('POST passes the created key straight through', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ id: 'key-1', key: 'jdg_mcp_secret', prefix: 'jdg_mcp_' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof global.fetch;

    const response = await POST(
      new Request('http://localhost/api/mcp-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'laptop' }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ key: 'jdg_mcp_secret' });
  });

  it('POST surfaces the backend status on failure', async () => {
    signedIn();
    global.fetch = jest.fn(
      async () => new Response('{"detail":"nope"}', { status: 500 }),
    ) as typeof global.fetch;

    const response = await POST(
      new Request('http://localhost/api/mcp-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'laptop' }),
      }),
    );

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 22.23.2 && npx jest __tests__/api/mcp-keys-route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/mcp-keys/route`

- [ ] **Step 3: Write the minimal implementation**

`frontend/app/api/mcp-keys/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

async function accessToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData?.user) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

function headers(token: string): HeadersInit {
  return {
    'X-API-Key': API_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function GET() {
  try {
    const token = await accessToken();
    if (!token) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const response = await fetch(`${API_BASE_URL}/mcp/keys`, { headers: headers(token) });
    if (!response.ok) {
      logger.error(`Backend returned ${response.status} listing MCP keys`);
      return NextResponse.json({ error: "Failed to list MCP keys" }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    logger.error("Error in GET mcp-keys: ", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = await accessToken();
    if (!token) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.text();
    const response = await fetch(`${API_BASE_URL}/mcp/keys`, {
      method: 'POST',
      headers: headers(token),
      body,
    });
    if (!response.ok) {
      logger.error(`Backend returned ${response.status} creating an MCP key`);
      return NextResponse.json({ error: "Failed to create MCP key" }, { status: response.status });
    }
    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    logger.error("Error in POST mcp-keys: ", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

`frontend/app/api/mcp-keys/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { logger } from "@/lib/logger";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const response = await fetch(`${API_BASE_URL}/mcp/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': API_KEY,
        'Authorization': `Bearer ${token}`,
      } as HeadersInit,
    });

    if (!response.ok) {
      logger.error(`Backend returned ${response.status} revoking MCP key`);
      return NextResponse.json({ error: "Failed to revoke MCP key" }, { status: response.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error("Error in DELETE mcp-keys: ", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx jest __tests__/api/mcp-keys-route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint and type-check**

Run: `cd frontend && npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/mcp-keys frontend/__tests__/api/mcp-keys-route.test.ts
git commit -m "feat(mcp): proxy MCP key management through the Next.js BFF"
```

---

### Task 6: The `/settings` MCP access section

**Files:**
- Create: `frontend/app/settings/_components/mcp-keys-section.tsx`
- Modify: `frontend/app/settings/page.tsx` (import and render the section)
- Create: `frontend/tests/route-contract-e2e/mcp-keys.spec.ts`
- Modify: `frontend/tests/route-contract-e2e/stub-services.mjs` (stub the three `/api/mcp-keys` responses)

**Interfaces:**
- Consumes: `/api/mcp-keys` and `/api/mcp-keys/[id]` (Task 5).
- Produces: `McpKeysSection` — a client component following the shape of `EmbeddingModelsSection` (local `useState`, `fetch`, no React Query), rendered inside the existing settings `Card` layout.

The page already imports from `@/components/ui/*`; follow that, do not
introduce a parallel styling approach. The design-system rule that matters
here is the prohibition in `CLAUDE.md`: no new glassmorphism cards, no
purple gradients, no `bg-{indigo,purple,violet}-100` icon pills.

- [ ] **Step 1: Write the failing route-contract spec**

```typescript
import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
} from './synthetic-session';

/**
 * `/settings` MCP access section. The plaintext key is shown exactly once,
 * at creation — the list endpoint only ever returns a prefix — so this spec
 * asserts both halves: the reveal dialog carries the full key, and a reload
 * shows only the prefix.
 */

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

test.describe('MCP keys settings contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
    await setSyntheticSession(context);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('lists existing keys by prefix only', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'MCP access' });
    await expect(section.getByText('jdg_mcp_')).toBeVisible();
    await expect(section.getByText(/jdg_mcp_[A-Za-z0-9_-]{20,}/)).toHaveCount(0);
  });

  test('reveals a newly created key once', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'MCP access' });
    await section.getByRole('button', { name: 'Generate key' }).click();

    const dialog = page.getByRole('dialog', { name: 'Your new MCP key' });
    await expect(dialog.getByText(/jdg_mcp_[A-Za-z0-9_-]{20,}/)).toBeVisible();
    await expect(dialog.getByText('shown only once', { exact: false })).toBeVisible();

    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(section.getByText(/jdg_mcp_[A-Za-z0-9_-]{20,}/)).toHaveCount(0);
  });

  test('revokes a key', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'MCP access' });
    await section.getByRole('button', { name: 'Revoke laptop' }).click();
    await page.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(section.getByText('Revoked')).toBeVisible();
  });
});
```

- [ ] **Step 2: Add the stub responses**

In `frontend/tests/route-contract-e2e/stub-services.mjs`, add handlers for:
- `GET /api/mcp-keys` → one key: `{ id: 'key-1', name: 'laptop', prefix: 'jdg_mcp_', scopes: ['search:read'], created_at: '2026-10-14T10:00:00+00:00', last_used_at: null, expires_at: null, revoked_at: null }`, switching `revoked_at` to a timestamp after a `DELETE`.
- `POST /api/mcp-keys` → `201` with `{ id: 'key-2', name: null, prefix: 'jdg_mcp_', scopes: ['search:read'], created_at: '2026-10-14T11:00:00+00:00', last_used_at: null, expires_at: null, revoked_at: null, key: 'jdg_mcp_ThisIsAFakeRevealedKeyValue01' }`.
- `DELETE /api/mcp-keys/key-1` → `204`, and record it in the module-level state the `reset` handler clears.

Follow the existing handler and reset conventions in that file exactly.

- [ ] **Step 3: Run the spec to verify it fails**

Run: `cd frontend && npm run test:e2e:route-contract -- mcp-keys.spec.ts`
Expected: FAIL — no `MCP access` region on `/settings`

- [ ] **Step 4: Write the component**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface McpKey {
  id: string;
  name: string | null;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

interface CreatedMcpKey extends McpKey {
  key: string;
}

export function McpKeysSection() {
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<CreatedMcpKey | null>(null);
  const [confirming, setConfirming] = useState<McpKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/mcp-keys");
      if (!response.ok) throw new Error("Failed to load MCP keys");
      setKeys(await response.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MCP keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const createKey = async () => {
    try {
      setCreating(true);
      const response = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: null }),
      });
      if (!response.ok) throw new Error("Failed to create MCP key");
      setRevealed(await response.json());
      await fetchKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create MCP key");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (key: McpKey) => {
    try {
      setRevoking(key.id);
      const response = await fetch(`/api/mcp-keys/${key.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to revoke MCP key");
      await fetchKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke MCP key");
    } finally {
      setRevoking(null);
      setConfirming(null);
    }
  };

  return (
    <section aria-label="MCP access" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4" aria-hidden />
            MCP access
          </h3>
          <p className="text-sm text-muted-foreground">
            Keys let an AI client search your Juddges corpus. A key is shown
            only once — store it in your client&apos;s configuration.
          </p>
        </div>
        <Button onClick={createKey} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Generate key
        </Button>
      </div>

      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" aria-hidden />
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading keys…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys yet.</p>
      ) : (
        <ul className="divide-y">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{key.prefix}…</p>
                <p className="text-xs text-muted-foreground">
                  {key.name ?? "Unnamed"} ·{" "}
                  {key.last_used_at ? `last used ${key.last_used_at}` : "never used"}
                </p>
              </div>
              {key.revoked_at ? (
                <Badge variant="secondary">Revoked</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke ${key.name ?? key.prefix}`}
                  disabled={revoking === key.id}
                  onClick={() => setConfirming(key)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={revealed !== null} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new MCP key</DialogTitle>
            <DialogDescription>
              This is shown only once. Copy it into your client now — it cannot
              be retrieved later.
            </DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded bg-muted p-3 font-mono text-sm">
            {revealed?.key}
          </code>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => revealed && navigator.clipboard?.writeText(revealed.key)}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Copy
            </Button>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this key?</DialogTitle>
            <DialogDescription>
              Any client using it stops working immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirming && revokeKey(confirming)}
            >
              Confirm revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

- [ ] **Step 5: Render it on the settings page**

In `frontend/app/settings/page.tsx`, import
`import { McpKeysSection } from "./_components/mcp-keys-section";` next to
the existing `EmbeddingModelsSection` import, and render `<McpKeysSection />`
inside a `Card`/`CardContent` in the same tab that holds the other
account-level sections.

- [ ] **Step 6: Run the spec to verify it passes**

Run: `cd frontend && npm run test:e2e:route-contract -- mcp-keys.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Run lint, type-check and the Jest suite**

Run: `cd frontend && npm run validate && npx jest`
Expected: PASS

- [ ] **Step 8: Seal the frontend verification evidence**

Use the **frontend-verify** skill, or run
`bash scripts/verify-frontend-evidence.sh --record`. The `Stop` hook refuses
to finish a turn while `frontend/` differs from `origin/main` without a
fresh marker. If the suite cannot run in this environment, say so explicitly
in the task report — do not record a marker for an unverified diff.

- [ ] **Step 9: Commit**

```bash
git add frontend/app/settings frontend/tests/route-contract-e2e
git commit -m "feat(mcp): add the MCP access section to /settings"
```

---

### Task 7: Extract `run_document_search` from its route handler

**Files:**
- Modify: `backend/app/judgments_pkg/search.py` (add the function at the end)
- Modify: `backend/app/judgments_pkg/__init__.py:539-851` (the route becomes a delegate)
- Test: `backend/tests/app/test_documents_search.py` (**run unchanged — do not edit**)

**Interfaces:**
- Consumes: the private helpers already in `judgments_pkg/search.py` (`_validate_search_query`, `_build_effective_filters`, `_prepare_search_queries`, `_run_hybrid_search`, `_rerank_if_enabled`, `_build_search_result_payload`, `_build_search_pagination`, …) and `MeiliSearchService` for the facets-only path.
- Produces: `run_document_search(request: SearchChunksRequest) -> SearchChunksResponse`.

**This is a pure refactor.** The body moves; no behavior changes. The guard
is `backend/tests/app/test_documents_search.py`: it must pass with **zero
edits**. If an assertion there starts failing, the move changed behavior —
fix the move, never the test.

- [ ] **Step 1: Capture the current behavior as a baseline**

Run: `cd backend && poetry run pytest tests/app/test_documents_search.py -v`
Expected: PASS. Record the test count; it must be identical after the move.

- [ ] **Step 2: Write the test that pins the new seam**

Add to `backend/tests/app/test_documents_search.py` — this is the one
addition allowed in this file:

```python
@pytest.mark.unit
async def test_route_delegates_to_run_document_search(monkeypatch):
    """The HTTP route is a thin delegate, so MCP and HTTP cannot drift."""
    from app.judgments_pkg import search_documents
    from app.models import SearchChunksRequest

    sentinel = object()
    seen = {}

    async def fake_run(request):
        seen["request"] = request
        return sentinel

    monkeypatch.setattr("app.judgments_pkg.run_document_search", fake_run)

    request = SearchChunksRequest(query="zachowek")
    result = await search_documents(request)

    assert result is sentinel
    assert seen["request"] is request
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_documents_search.py::test_route_delegates_to_run_document_search -v`
Expected: FAIL — `AttributeError: module 'app.judgments_pkg' has no attribute 'run_document_search'`

- [ ] **Step 4: Move the body**

In `backend/app/judgments_pkg/search.py`, append:

```python
async def run_document_search(request: SearchChunksRequest) -> SearchChunksResponse:
    """Run the hybrid document search pipeline.

    Extracted from the `POST /documents/search` route handler so the MCP
    tools call the same code path as HTTP. The route is now a thin delegate;
    keep it that way — logic added here is available to both transports,
    logic added in the route is not.
    """
    # ← the entire former body of `search_documents`, unchanged, including
    #   the facets-only fast path.
```

Then in `backend/app/judgments_pkg/__init__.py`, import it alongside the
other names pulled from `.search`, and reduce the route to:

```python
@router.post(
    "/search",
    response_model=SearchChunksResponse,
    summary="Search documents using vector similarity",
)
async def search_documents(request: SearchChunksRequest):
    """Search documents using hybrid search (vector + full-text + filters).

    The pipeline lives in `run_document_search` so the MCP tools share it;
    this route only adapts HTTP to that call. See
    `app/judgments_pkg/search.py` for the behavior, including the
    facets-only fast path.
    """
    return await run_document_search(request)
```

Move any imports the body needs (`MeiliSearchService`, `SearchServiceError`,
and anything else currently imported inside the handler) into
`search.py` with it. Do not leave a now-unused import behind in
`__init__.py` — Ruff will flag it.

- [ ] **Step 5: Run the guard suite unchanged**

Run: `cd backend && poetry run pytest tests/app/test_documents_search.py -v`
Expected: PASS, with exactly one more test than the Step 1 baseline (the new
delegation test) and no edited assertions.

- [ ] **Step 6: Run the whole unit suite**

Run: `cd backend && poetry run poe check-all`
Expected: PASS. Any other search-adjacent test that fails here is the
refactor's doing — investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add backend/app/judgments_pkg/search.py backend/app/judgments_pkg/__init__.py \
        backend/tests/app/test_documents_search.py
git commit -m "refactor(search): extract run_document_search from the route handler"
```

---

### Task 8: The `juddges_mcp` package skeleton and its principal context

**Files:**
- Create: `backend/packages/juddges_mcp/pyproject.toml`
- Create: `backend/packages/juddges_mcp/README.md`
- Create: `backend/packages/juddges_mcp/juddges_mcp/__init__.py`
- Create: `backend/packages/juddges_mcp/juddges_mcp/principal.py`
- Modify: `backend/pyproject.toml` (add the editable dependency)
- Create: `backend/tests/app/test_mcp_principal.py`

**Interfaces:**
- Consumes: `AuthenticatedUser` from `app.core.auth_jwt`.
- Produces: `set_principal(user) -> Token`, `reset_principal(token) -> None`, `get_principal() -> AuthenticatedUser` (raises `MissingPrincipalError` when unset), `MissingPrincipalError`.

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for the juddges_mcp principal context."""

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_mcp_principal.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'juddges_mcp'`

- [ ] **Step 3: Create the package**

`backend/packages/juddges_mcp/pyproject.toml`:

```toml
[tool.poetry]
name = "juddges_mcp"
version = "0.1.0"
description = "MCP server exposing the Juddges judgment corpus"
authors = ["Lukasz Augustyniak <aisolutions@lukaszaugustyniak.com>"]
readme = "README.md"
packages = [
    { include = "juddges_mcp" }
]

[tool.poetry.dependencies]
python = ">=3.12,<3.14"
loguru = "^0.7.3"
pydantic = "^2.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

`backend/packages/juddges_mcp/README.md`: a short paragraph stating that
this package holds the MCP tool surface, that tools must stay
transport-agnostic, and pointing at
`docs/superpowers/specs/2026-10-14-juddges-mcp-design.md`.

`backend/packages/juddges_mcp/juddges_mcp/__init__.py`: empty.

`backend/packages/juddges_mcp/juddges_mcp/principal.py`:

```python
"""The authenticated principal for the current MCP tool call.

Tools must not take a credential as an argument — an LLM would then be able
to pass one. The transport authenticates, sets the principal here, and the
tools read it. A tool that cannot see a principal fails rather than falling
back to an anonymous read.
"""

from contextvars import ContextVar, Token
from typing import Any

_principal: ContextVar[Any] = ContextVar("juddges_mcp_principal")


class MissingPrincipalError(RuntimeError):
    """Raised when a tool runs without an authenticated principal."""


def set_principal(user: Any) -> Token:
    """Bind `user` for the current context; pass the token to reset_principal."""
    return _principal.set(user)


def reset_principal(token: Token) -> None:
    """Unbind the principal bound by the matching set_principal call."""
    _principal.reset(token)


def get_principal() -> Any:
    """Return the current principal, or raise MissingPrincipalError."""
    try:
        return _principal.get()
    except LookupError as e:
        raise MissingPrincipalError(
            "No authenticated principal for this MCP call"
        ) from e
```

- [ ] **Step 4: Wire the dependencies**

In `backend/pyproject.toml`, next to the other editable packages, add:

```toml
juddges_mcp = { path = "packages/juddges_mcp", develop = true }
```

and in the main dependency list add the SDK at an exact pin — resolve the
current release first:

```bash
cd backend && poetry add --lock "mcp==$(poetry run pip index versions mcp 2>/dev/null | head -1 | sed 's/.*(\(.*\))/\1/')"
```

If that version probe does not work in this environment, look up the latest
`mcp` release and write the exact version literally, e.g. `mcp = "1.9.4"`.
**A caret range is not acceptable** — see Global Constraints.

Then:

```bash
cd backend && poetry lock && poetry install
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_mcp_principal.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Verify the lockfile is consistent**

Run: `cd backend && poetry check --lock`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/packages/juddges_mcp backend/pyproject.toml backend/poetry.lock \
        backend/tests/app/test_mcp_principal.py
git commit -m "feat(mcp): add the juddges_mcp package and principal context"
```

---

### Task 9: The `search_judgments` tool

**Files:**
- Create: `backend/packages/juddges_mcp/juddges_mcp/tools/__init__.py`
- Create: `backend/packages/juddges_mcp/juddges_mcp/tools/search.py`
- Test: `backend/tests/app/test_mcp_tool_search.py`

**Interfaces:**
- Consumes: `get_principal` (Task 8); `run_document_search` from `app.judgments_pkg.search` (Task 7); `SearchChunksRequest` from `app.models`.
- Produces: `MAX_LIMIT: int = 25`, `DEFAULT_LIMIT: int = 10`, `JudgmentHit` (pydantic), `ToolInputError`, and `async search_judgments(query, jurisdiction=None, court=None, date_from=None, date_to=None, limit=DEFAULT_LIMIT) -> list[JudgmentHit]`.

**How acceptance criterion 7 is pinned.** "Same ordering, same hits as
`POST /documents/search`" is guaranteed structurally, not by a comparison
test: Task 7's delegation test proves the route calls
`run_document_search`, and `test_passes_filters_through` below proves this
tool calls the same symbol. Neither transport may rank or filter on its own
— a reviewer should reject any sorting, filtering or truncation added in
this module beyond the `limit` the request already carries.

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for the search_judgments MCP tool."""

from unittest.mock import MagicMock, patch

import pytest

from juddges_mcp.principal import reset_principal, set_principal
from juddges_mcp.tools.search import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    ToolInputError,
    search_judgments,
)


@pytest.fixture
def principal():
    token = set_principal(MagicMock(id="user-123"))
    yield
    reset_principal(token)


def _response(hits):
    response = MagicMock()
    response.documents = hits
    return response


def _hit(**overrides):
    base = {
        "id": "doc-1",
        "court_name": "Sąd Najwyższy",
        "case_number": "II CSK 1/20",
        "judgment_date": "2020-03-01",
        "jurisdiction": "pl",
        "url": "https://example.test/doc-1",
        "excerpt": "Zachowek należy się zstępnym…",
        "full_text": "A" * 50_000,
        "score": 0.91,
    }
    base.update(overrides)
    hit = MagicMock()
    for key, value in base.items():
        setattr(hit, key, value)
    return hit


@pytest.mark.unit
class TestSearchJudgments:
    async def test_maps_hits_to_citations(self, principal):
        with patch(
            "juddges_mcp.tools.search.run_document_search",
            return_value=_response([_hit()]),
        ):
            [hit] = await search_judgments(query="zachowek")
        assert hit.id == "doc-1"
        assert hit.court == "Sąd Najwyższy"
        assert hit.case_number == "II CSK 1/20"
        assert hit.judgment_date == "2020-03-01"
        assert hit.url == "https://example.test/doc-1"
        assert hit.score == pytest.approx(0.91)

    async def test_never_returns_full_text(self, principal):
        with patch(
            "juddges_mcp.tools.search.run_document_search",
            return_value=_response([_hit()]),
        ):
            [hit] = await search_judgments(query="zachowek")
        dumped = hit.model_dump()
        assert "full_text" not in dumped
        assert len(hit.snippet) <= 600

    async def test_passes_filters_through(self, principal):
        with patch(
            "juddges_mcp.tools.search.run_document_search",
            return_value=_response([]),
        ) as run:
            await search_judgments(
                query="fraud",
                jurisdiction="uk",
                court="Court of Appeal",
                date_from="2015-01-01",
                date_to="2024-12-31",
                limit=5,
            )
        sent = run.call_args[0][0]
        assert sent.query == "fraud"
        assert sent.limit_docs == 5

    async def test_default_limit_is_applied(self, principal):
        with patch(
            "juddges_mcp.tools.search.run_document_search",
            return_value=_response([]),
        ) as run:
            await search_judgments(query="zachowek")
        assert run.call_args[0][0].limit_docs == DEFAULT_LIMIT

    # Review Focus 4
    @pytest.mark.parametrize("bad_limit", [0, -1, MAX_LIMIT + 1, 10_000])
    async def test_out_of_range_limit_is_rejected(self, principal, bad_limit):
        with pytest.raises(ToolInputError) as exc:
            await search_judgments(query="zachowek", limit=bad_limit)
        assert "limit" in str(exc.value)

    # Review Focus 3
    async def test_reversed_date_range_is_rejected(self, principal):
        with pytest.raises(ToolInputError) as exc:
            await search_judgments(
                query="zachowek", date_from="2024-01-01", date_to="2015-01-01"
            )
        assert "date_from" in str(exc.value)

    @pytest.mark.parametrize("bad_date", ["yesterday", "2024-13-01", "01/02/2024"])
    async def test_unparseable_date_is_rejected(self, principal, bad_date):
        with pytest.raises(ToolInputError) as exc:
            await search_judgments(query="zachowek", date_from=bad_date)
        assert "date_from" in str(exc.value)

    async def test_blank_query_is_rejected(self, principal):
        with pytest.raises(ToolInputError):
            await search_judgments(query="   ")

    async def test_missing_principal_fails_the_call(self):
        from juddges_mcp.principal import MissingPrincipalError

        with pytest.raises(MissingPrincipalError):
            await search_judgments(query="zachowek")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_mcp_tool_search.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'juddges_mcp.tools'`

- [ ] **Step 3: Write the minimal implementation**

`backend/packages/juddges_mcp/juddges_mcp/tools/__init__.py`: empty.

`backend/packages/juddges_mcp/juddges_mcp/tools/search.py`:

```python
"""The search_judgments MCP tool.

Returns citations and snippets only. A tool that returns whole judgments
fills the client's context window and is useless in practice; full text is
reachable through get_judgment on an id the caller chose.
"""

from datetime import date

from loguru import logger
from pydantic import BaseModel, Field

from app.judgments_pkg.search import run_document_search
from app.models import SearchChunksRequest
from juddges_mcp.principal import get_principal

DEFAULT_LIMIT = 10
MAX_LIMIT = 25
SNIPPET_CHARS = 600


class ToolInputError(ValueError):
    """Invalid tool arguments. Surfaces to the client as a tool error."""


class JudgmentHit(BaseModel):
    """One search hit, carrying enough to verify it against the public record."""

    id: str
    court: str | None = None
    case_number: str | None = None
    judgment_date: str | None = None
    jurisdiction: str | None = None
    url: str | None = None
    snippet: str = Field(default="", max_length=SNIPPET_CHARS)
    score: float | None = None


def _parse_date(value: str | None, field: str) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        raise ToolInputError(
            f"{field} must be an ISO date (YYYY-MM-DD); got {value!r}"
        ) from e


def _validate_limit(limit: int) -> int:
    if not isinstance(limit, int) or isinstance(limit, bool):
        raise ToolInputError("limit must be an integer")
    if limit < 1 or limit > MAX_LIMIT:
        raise ToolInputError(f"limit must be between 1 and {MAX_LIMIT}; got {limit}")
    return limit


def _snippet(hit: object) -> str:
    text = getattr(hit, "excerpt", None) or getattr(hit, "snippet", None) or ""
    return str(text)[:SNIPPET_CHARS]


async def search_judgments(
    query: str,
    jurisdiction: str | None = None,
    court: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> list[JudgmentHit]:
    """Search Polish and UK judgments by meaning and keyword.

    Args:
        query: What to look for, in Polish or English.
        jurisdiction: Restrict to one jurisdiction, e.g. "pl" or "uk".
        court: Restrict to one court name.
        date_from: Earliest judgment date, ISO `YYYY-MM-DD`.
        date_to: Latest judgment date, ISO `YYYY-MM-DD`.
        limit: How many judgments to return (1-25).

    Returns:
        Hits with a citation and a snippet. Call `get_judgment` for full text.
    """
    principal = get_principal()

    if not query or not query.strip():
        raise ToolInputError("query must not be empty")

    limit = _validate_limit(limit)
    parsed_from = _parse_date(date_from, "date_from")
    parsed_to = _parse_date(date_to, "date_to")
    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise ToolInputError("date_from must not be later than date_to")

    request = SearchChunksRequest(
        query=query.strip(),
        limit_docs=limit,
        jurisdictions=[jurisdiction] if jurisdiction else None,
        court_names=[court] if court else None,
        date_from=date_from,
        date_to=date_to,
    )

    logger.info(f"MCP search_judgments for {principal.id}: {query[:80]!r}")
    response = await run_document_search(request)

    return [
        JudgmentHit(
            id=str(getattr(hit, "id", "")),
            court=getattr(hit, "court_name", None),
            case_number=getattr(hit, "case_number", None),
            judgment_date=getattr(hit, "judgment_date", None),
            jurisdiction=getattr(hit, "jurisdiction", None),
            url=getattr(hit, "url", None),
            snippet=_snippet(hit),
            score=getattr(hit, "score", None),
        )
        for hit in (getattr(response, "documents", None) or [])
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_mcp_tool_search.py -v`
Expected: PASS (15 tests)

If `SearchChunksRequest` rejects any field name used above, read
`backend/app/models.py` and use its real field names — do **not** invent a
parallel request model.

- [ ] **Step 5: Run lint and format**

Run: `cd backend && poetry run poe check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/packages/juddges_mcp/juddges_mcp/tools \
        backend/tests/app/test_mcp_tool_search.py
git commit -m "feat(mcp): add the search_judgments tool"
```

---

### Task 10: The `get_judgment` and `get_extracted_fields` tools

**Files:**
- Create: `backend/packages/juddges_mcp/juddges_mcp/tools/judgment.py`
- Test: `backend/tests/app/test_mcp_tool_judgment.py`

**Interfaces:**
- Consumes: `get_principal` (Task 8); `ToolInputError` (Task 9); `get_vector_db` and `_extract_base_fields` / `_extract_extraction_fields` from the judgments package, as used by `GET /documents/{id}/metadata`.
- Produces: `JudgmentNotFoundError`, `async get_judgment(id, section=None) -> dict`, `async get_extracted_fields(id) -> dict`.

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for the get_judgment and get_extracted_fields MCP tools."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from juddges_mcp.principal import reset_principal, set_principal
from juddges_mcp.tools.judgment import (
    JudgmentNotFoundError,
    get_extracted_fields,
    get_judgment,
)
from juddges_mcp.tools.search import ToolInputError


@pytest.fixture
def principal():
    token = set_principal(MagicMock(id="user-123"))
    yield
    reset_principal(token)


DOC = {
    "id": "doc-1",
    "court_name": "Sąd Najwyższy",
    "case_number": "II CSK 1/20",
    "judgment_date": "2020-03-01",
    "jurisdiction": "pl",
    "full_text": "Uzasadnienie…",
    "reasoning": "Sąd uznał…",
    "base_appeal_outcome": "dismissed",
}


def _db_returning(doc):
    db = MagicMock()
    db.get_document_by_id = AsyncMock(return_value=doc)
    return db


@pytest.mark.unit
class TestGetJudgment:
    async def test_returns_metadata_and_full_text(self, principal):
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=_db_returning(DOC)):
            result = await get_judgment(id="doc-1")
        assert result["id"] == "doc-1"
        assert result["case_number"] == "II CSK 1/20"
        assert "Uzasadnienie" in result["text"]

    async def test_returns_one_named_section(self, principal):
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=_db_returning(DOC)):
            result = await get_judgment(id="doc-1", section="reasoning")
        assert result["section"] == "reasoning"
        assert result["text"] == "Sąd uznał…"

    # Review Focus 5
    async def test_unknown_section_lists_the_available_ones(self, principal):
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=_db_returning(DOC)):
            with pytest.raises(ToolInputError) as exc:
                await get_judgment(id="doc-1", section="dissent")
        message = str(exc.value)
        assert "dissent" in message
        assert "reasoning" in message  # names what IS available

    async def test_section_present_but_empty_is_not_an_error(self, principal):
        doc = {**DOC, "reasoning": ""}
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=_db_returning(doc)):
            result = await get_judgment(id="doc-1", section="reasoning")
        assert result["text"] == ""
        assert result["empty"] is True

    async def test_unknown_id_raises_not_found(self, principal):
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=_db_returning(None)):
            with pytest.raises(JudgmentNotFoundError):
                await get_judgment(id="nope")

    async def test_blank_id_is_rejected(self, principal):
        with pytest.raises(ToolInputError):
            await get_judgment(id="  ")

    async def test_missing_principal_fails_the_call(self):
        from juddges_mcp.principal import MissingPrincipalError

        with pytest.raises(MissingPrincipalError):
            await get_judgment(id="doc-1")


@pytest.mark.unit
class TestGetExtractedFields:
    async def test_returns_the_stored_base_schema_fields(self, principal):
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=_db_returning(DOC)):
            with patch(
                "juddges_mcp.tools.judgment._extract_base_fields",
                return_value={"appeal_outcome": "dismissed"},
            ):
                with patch(
                    "juddges_mcp.tools.judgment._extract_extraction_fields",
                    return_value={},
                ):
                    result = await get_extracted_fields(id="doc-1")
        assert result["id"] == "doc-1"
        assert result["base_fields"] == {"appeal_outcome": "dismissed"}

    async def test_never_runs_the_extraction_agent(self, principal):
        """Reads stored values only — an agent run would cost money per call."""
        db = _db_returning(DOC)
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=db):
            with patch("juddges_mcp.tools.judgment._extract_base_fields", return_value={}):
                with patch(
                    "juddges_mcp.tools.judgment._extract_extraction_fields",
                    return_value={},
                ):
                    await get_extracted_fields(id="doc-1")
        db.get_document_by_id.assert_awaited_once_with("doc-1")

    async def test_unknown_id_raises_not_found(self, principal):
        with patch("juddges_mcp.tools.judgment.get_vector_db", return_value=_db_returning(None)):
            with pytest.raises(JudgmentNotFoundError):
                await get_extracted_fields(id="nope")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_mcp_tool_judgment.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'juddges_mcp.tools.judgment'`

- [ ] **Step 3: Write the minimal implementation**

```python
"""The get_judgment and get_extracted_fields MCP tools.

Both read the shared corpus through the same accessors as
`GET /documents/{id}` and `GET /documents/{id}/metadata`, so a judgment
reads identically through MCP and through the UI.
"""

from typing import Any

from loguru import logger

from app.judgments_pkg import _extract_base_fields, _extract_extraction_fields
from app.vector_db import get_vector_db
from juddges_mcp.principal import get_principal
from juddges_mcp.tools.search import ToolInputError

# Sections a caller may ask for, mapped to the stored column holding them.
SECTIONS: dict[str, str] = {
    "full_text": "full_text",
    "reasoning": "reasoning",
}

_CITATION_KEYS = (
    "court_name",
    "case_number",
    "judgment_date",
    "jurisdiction",
    "url",
)


class JudgmentNotFoundError(LookupError):
    """No judgment with that id. Surfaces to the client as a tool error."""


def _require_id(value: str) -> str:
    if not value or not value.strip():
        raise ToolInputError("id must not be empty")
    return value.strip()


async def _load(document_id: str) -> dict[str, Any]:
    document = await get_vector_db().get_document_by_id(document_id)
    if not document:
        raise JudgmentNotFoundError(f"No judgment with id {document_id!r}")
    return document


def _citation(document: dict[str, Any]) -> dict[str, Any]:
    citation = {"id": document.get("id")}
    citation.update({key: document.get(key) for key in _CITATION_KEYS})
    return citation


async def get_judgment(id: str, section: str | None = None) -> dict[str, Any]:
    """Fetch one judgment's text, or a single named section of it.

    Args:
        id: The judgment id, as returned by `search_judgments`.
        section: One of the section names; omit for the full text.

    Returns:
        The citation fields plus `text`, and `empty` when the section exists
        but holds nothing.
    """
    principal = get_principal()
    document_id = _require_id(id)

    if section is not None and section not in SECTIONS:
        available = ", ".join(sorted(SECTIONS))
        raise ToolInputError(
            f"Unknown section {section!r}. Available sections: {available}"
        )

    document = await _load(document_id)
    column = SECTIONS[section] if section else SECTIONS["full_text"]
    text = document.get(column) or ""

    logger.info(f"MCP get_judgment for {principal.id}: {document_id} ({section or 'full'})")
    result = _citation(document)
    result["section"] = section
    result["text"] = text
    result["empty"] = text == ""
    return result


async def get_extracted_fields(id: str) -> dict[str, Any]:
    """Fetch the structured fields already extracted for one judgment.

    Reads stored values only — it never runs the extraction agent, so it
    costs nothing per call.
    """
    principal = get_principal()
    document_id = _require_id(id)
    document = await _load(document_id)

    logger.info(f"MCP get_extracted_fields for {principal.id}: {document_id}")
    result = _citation(document)
    result["base_fields"] = _extract_base_fields(document)
    result["extraction_fields"] = _extract_extraction_fields(document)
    return result
```

Before running, confirm the real import paths for `get_vector_db`,
`_extract_base_fields` and `_extract_extraction_fields`:

```bash
cd backend && grep -rn "def get_vector_db\|def _extract_base_fields\|def _extract_extraction_fields" app/
```

Use what that prints; the imports above are the expected locations, not a
guess to leave unverified. Likewise, extend `SECTIONS` to every section
column the `judgments` table actually carries — read the table definition in
`supabase/migrations/20260209000001_create_judgments_table.sql` and list
them, rather than shipping only the two above.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_mcp_tool_judgment.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Run lint and format**

Run: `cd backend && poetry run poe check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/packages/juddges_mcp/juddges_mcp/tools/judgment.py \
        backend/tests/app/test_mcp_tool_judgment.py
git commit -m "feat(mcp): add the get_judgment and get_extracted_fields tools"
```

---

### Task 11: Build the MCP server and mount it at `/mcp`

**Files:**
- Create: `backend/packages/juddges_mcp/juddges_mcp/server.py`
- Create: `backend/packages/juddges_mcp/juddges_mcp/http.py`
- Modify: `backend/app/server.py` (mount the sub-app)
- Test: `backend/tests/app/test_mcp_http_transport.py`

**Interfaces:**
- Consumes: the three tools (Tasks 9, 10); `set_principal` / `reset_principal` (Task 8); `resolve_mcp_principal` (Task 2).
- Produces: `build_server() -> FastMCP`, `build_http_app() -> ASGI app`, and the ASGI middleware `McpAuthMiddleware`.

**The `/mcp` mount must not require `X-API-Key`.** External clients do not
have the shared backend key; their credential is the MCP key in the
`Authorization` header. Mount this as a sub-app, **not** through
`API_KEY_PROTECTED_ROUTERS`.

- [ ] **Step 1: Write the failing test**

```python
"""Transport-level tests for the /mcp mount."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from juddges_mcp.http import McpAuthMiddleware, build_http_app


@pytest.fixture
def client():
    app = FastAPI()
    app.mount("/mcp", build_http_app())
    return TestClient(app)


@pytest.mark.unit
class TestTransportAuth:
    # Review Focus 1
    def test_missing_authorization_header_is_401(self, client):
        response = client.post("/mcp", json={"jsonrpc": "2.0", "method": "ping", "id": 1})
        assert response.status_code == 401

    def test_bearer_with_no_value_is_401_not_500(self, client):
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "ping", "id": 1},
            headers={"Authorization": "Bearer"},
        )
        assert response.status_code == 401

    def test_non_bearer_scheme_is_401(self, client):
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "ping", "id": 1},
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert response.status_code == 401

    def test_unresolvable_key_is_401(self, client):
        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=None):
            response = client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "method": "ping", "id": 1},
                headers={"Authorization": "Bearer jdg_mcp_revoked"},
            )
        assert response.status_code == 401

    def test_valid_key_binds_the_principal_for_the_call(self, client):
        principal = MagicMock(id="user-123", mcp_key_id="key-1")
        seen = {}

        def record(user):
            seen["bound"] = user
            return MagicMock()

        with patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal):
            with patch("juddges_mcp.http.set_principal", side_effect=record):
                client.post(
                    "/mcp",
                    json={"jsonrpc": "2.0", "method": "ping", "id": 1},
                    headers={"Authorization": "Bearer jdg_mcp_good"},
                )
        assert seen["bound"] is principal


@pytest.mark.unit
class TestToolRegistration:
    def test_all_three_tools_are_registered(self):
        from juddges_mcp.server import build_server

        names = {tool.name for tool in build_server()._tool_manager.list_tools()}
        assert names == {"search_judgments", "get_judgment", "get_extracted_fields"}


@pytest.mark.unit
class TestOpenApiIsolation:
    def test_mounting_mcp_does_not_change_the_schema(self):
        """Criterion 11: a mounted sub-app must stay out of /openapi.json."""
        app = FastAPI()
        before = app.openapi()
        app.mount("/mcp", build_http_app())
        app.openapi_schema = None
        after = app.openapi()
        assert before["paths"] == after["paths"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_mcp_http_transport.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'juddges_mcp.http'`

- [ ] **Step 3: Write the server builder**

`backend/packages/juddges_mcp/juddges_mcp/server.py`:

```python
"""Assemble the MCP server from the transport-agnostic tools."""

from mcp.server.fastmcp import FastMCP

from juddges_mcp.tools.judgment import get_extracted_fields, get_judgment
from juddges_mcp.tools.search import search_judgments

INSTRUCTIONS = (
    "Search Polish and UK court judgments in the Juddges corpus. "
    "Use search_judgments to find candidates — it returns citations and "
    "snippets. Call get_judgment for the full text of one judgment, and "
    "get_extracted_fields for its structured base-schema values. Always "
    "quote the court, case number and date when citing a judgment."
)


def build_server() -> FastMCP:
    """Return a FastMCP server with the three read-only tools registered."""
    server = FastMCP(name="juddges", instructions=INSTRUCTIONS)
    server.tool()(search_judgments)
    server.tool()(get_judgment)
    server.tool()(get_extracted_fields)
    return server
```

If the installed SDK registers tools differently (`@server.tool` vs
`server.add_tool`), read the installed version's API and follow it:

```bash
cd backend && poetry run python -c "from mcp.server.fastmcp import FastMCP; help(FastMCP.tool)"
```

- [ ] **Step 4: Write the HTTP transport**

`backend/packages/juddges_mcp/juddges_mcp/http.py`:

```python
"""The HTTP entrypoint mounted at /mcp.

Authentication happens here, once, before any tool runs: the Authorization
header is resolved to a principal and bound to the call's context. Tools
never see a credential, so a model cannot pass one.
"""

from loguru import logger
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.auth_mcp import MCP_KEY_PREFIX, resolve_mcp_principal
from juddges_mcp.principal import reset_principal, set_principal
from juddges_mcp.server import build_server

_UNAUTHORIZED = JSONResponse(
    {"error": "Invalid or missing MCP key"},
    status_code=401,
    headers={"WWW-Authenticate": "Bearer"},
)


def _credential(scope: Scope) -> str | None:
    """Return the Bearer credential from an ASGI scope, or None."""
    for name, value in scope.get("headers") or []:
        if name.lower() != b"authorization":
            continue
        scheme, _, credential = value.decode("latin-1").partition(" ")
        if scheme.lower() != "bearer":
            return None
        credential = credential.strip()
        return credential or None
    return None


class McpAuthMiddleware:
    """Resolve the MCP key and bind the principal for the wrapped app."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        credential = _credential(scope)
        if not credential or not credential.startswith(MCP_KEY_PREFIX):
            await _UNAUTHORIZED(scope, receive, send)
            return

        principal = resolve_mcp_principal(credential)
        if principal is None:
            logger.warning("Rejected an unresolvable MCP key")
            await _UNAUTHORIZED(scope, receive, send)
            return

        token = set_principal(principal)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_principal(token)


def build_http_app() -> ASGIApp:
    """Return the authenticated streamable-HTTP ASGI app for /mcp."""
    return McpAuthMiddleware(build_server().streamable_http_app())
```

If the installed SDK names its ASGI factory differently
(`sse_app`, `streamable_http_app`, …), use the name the installed version
exposes; prefer streamable HTTP over SSE.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_mcp_http_transport.py -v`
Expected: PASS (8 tests)

- [ ] **Step 6: Mount it on the real app**

At the end of the router registrations in `backend/app/server.py`, after the
GraphQL mount:

```python
# MCP server (juddges-mcp). Mounted as a sub-app, deliberately NOT in
# API_KEY_PROTECTED_ROUTERS: external AI clients do not hold the shared
# BACKEND_API_KEY, and their credential is the per-user MCP key that
# McpAuthMiddleware resolves. A mounted sub-app also stays out of
# /openapi.json, which keeps tool changes from tripping the OpenAPI Type
# Drift check.
from juddges_mcp.http import build_http_app  # noqa: E402

app.mount("/mcp", build_http_app())
```

Place this **after** `mcp_keys_router` is included so `/mcp/keys` keeps its
own routes; verify in the next step that both still resolve.

- [ ] **Step 7: Verify both `/mcp` surfaces coexist and OpenAPI is unchanged**

Run:
```bash
cd backend && poetry run python -c "
from app.server import app
print([r.path for r in app.routes if '/mcp' in getattr(r, 'path', '')])
paths = app.openapi()['paths']
print('mcp paths in openapi:', [p for p in paths if p.startswith('/mcp/')])
print('bare /mcp in openapi:', '/mcp' in paths)"
```
Expected: the `/mcp/keys` routes plus the `/mcp` mount are listed;
`mcp paths in openapi` shows only the three `/mcp/keys` operations, and
`bare /mcp in openapi` is `False`.

- [ ] **Step 8: Confirm the committed OpenAPI snapshot is untouched**

Run: `bash scripts/regen_openapi_types.sh && git diff --stat`
Expected: empty diff. A non-empty diff here means the mount leaked into the
schema — fix the mount, do not commit the snapshot change.

- [ ] **Step 9: Run the whole unit suite and lint**

Run: `cd backend && poetry run poe check-all`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/packages/juddges_mcp/juddges_mcp/server.py \
        backend/packages/juddges_mcp/juddges_mcp/http.py \
        backend/app/server.py backend/tests/app/test_mcp_http_transport.py
git commit -m "feat(mcp): mount the authenticated MCP server at /mcp"
```

---

### Task 12: The stdio entrypoint

**Files:**
- Create: `backend/packages/juddges_mcp/juddges_mcp/stdio.py`
- Modify: `backend/pyproject.toml` (add a `poe` task)
- Test: `backend/tests/app/test_mcp_stdio.py`

**Interfaces:**
- Consumes: `build_server` (Task 11); `resolve_mcp_principal` (Task 2); `set_principal` (Task 8).
- Produces: `main() -> None`, reading the key from `JUDDGES_MCP_KEY`.

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for the stdio entrypoint."""

from unittest.mock import MagicMock, patch

import pytest

from juddges_mcp.stdio import main


@pytest.mark.unit
class TestStdioEntrypoint:
    def test_missing_key_exits_with_a_message(self, monkeypatch, capsys):
        monkeypatch.delenv("JUDDGES_MCP_KEY", raising=False)
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 2
        assert "JUDDGES_MCP_KEY" in capsys.readouterr().err

    def test_unresolvable_key_exits_with_a_message(self, monkeypatch, capsys):
        monkeypatch.setenv("JUDDGES_MCP_KEY", "jdg_mcp_revoked")
        with patch("juddges_mcp.stdio.resolve_mcp_principal", return_value=None):
            with pytest.raises(SystemExit) as exc:
                main()
        assert exc.value.code == 2
        assert "could not be resolved" in capsys.readouterr().err

    def test_valid_key_binds_the_principal_and_runs(self, monkeypatch):
        monkeypatch.setenv("JUDDGES_MCP_KEY", "jdg_mcp_good")
        principal = MagicMock(id="user-123")
        server = MagicMock()
        with patch("juddges_mcp.stdio.resolve_mcp_principal", return_value=principal):
            with patch("juddges_mcp.stdio.build_server", return_value=server):
                with patch("juddges_mcp.stdio.set_principal") as bind:
                    main()
        bind.assert_called_once_with(principal)
        server.run.assert_called_once()

    def test_serves_the_same_three_tools_as_http(self):
        """Criterion 12."""
        from juddges_mcp.server import build_server

        names = {tool.name for tool in build_server()._tool_manager.list_tools()}
        assert names == {"search_judgments", "get_judgment", "get_extracted_fields"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_mcp_stdio.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'juddges_mcp.stdio'`

- [ ] **Step 3: Write the minimal implementation**

```python
"""Local stdio entrypoint for development.

Production serves MCP over HTTP at /mcp. This entrypoint exists so a
developer can drive the same tools from a local client without deploying;
it takes the key from JUDDGES_MCP_KEY and binds that principal for the
whole process.
"""

import os
import sys

from app.core.auth_mcp import resolve_mcp_principal
from juddges_mcp.principal import set_principal
from juddges_mcp.server import build_server


def main() -> None:
    """Run the MCP server over stdio as the owner of JUDDGES_MCP_KEY."""
    key = os.getenv("JUDDGES_MCP_KEY")
    if not key:
        print(
            "JUDDGES_MCP_KEY is not set. Generate a key in /settings "
            "(MCP access) and export it before starting the server.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    principal = resolve_mcp_principal(key)
    if principal is None:
        print(
            "The key in JUDDGES_MCP_KEY could not be resolved — it may be "
            "revoked, expired, or from another environment.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    set_principal(principal)
    build_server().run(transport="stdio")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_mcp_stdio.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the poe task**

In `backend/pyproject.toml` under `[tool.poe.tasks]`:

```toml
mcp-stdio = "python -m juddges_mcp.stdio"
```

- [ ] **Step 6: Run lint and format**

Run: `cd backend && poetry run poe check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/packages/juddges_mcp/juddges_mcp/stdio.py \
        backend/pyproject.toml backend/tests/app/test_mcp_stdio.py
git commit -m "feat(mcp): add the stdio entrypoint for local development"
```

---

### Task 13: Per-key rate limiting

**Files:**
- Create: `backend/app/mcp_rate_limit.py`
- Modify: `backend/packages/juddges_mcp/juddges_mcp/http.py` (charge the budget)
- Test: `backend/tests/app/test_mcp_rate_limit.py`

**Interfaces:**
- Consumes: `hit_with_fallback`, `RATE_LIMIT_STORAGE_URI` from `app.rate_limiter`.
- Produces: `DEFAULT_MCP_RATE_LIMIT: str = "120/hour"`, `enforce_mcp_rate_limit(key_id: str) -> None` raising `McpRateLimitExceeded`.

Follows `backend/app/llm_rate_limit.py` exactly: a module-level
`MovingWindowRateLimiter`, the limit parsed on every call so an env override
applies without a restart, and a distinct bucket name so the UI's budget is
untouched.

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for the per-key MCP rate limit."""

from unittest.mock import patch

import pytest

from app.mcp_rate_limit import (
    DEFAULT_MCP_RATE_LIMIT,
    McpRateLimitExceeded,
    enforce_mcp_rate_limit,
)


@pytest.mark.unit
class TestMcpRateLimit:
    def test_allows_a_call_within_budget(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=True):
            enforce_mcp_rate_limit("key-1")  # does not raise

    def test_rejects_a_call_over_budget_naming_the_limit(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=False):
            with pytest.raises(McpRateLimitExceeded) as exc:
                enforce_mcp_rate_limit("key-1")
        assert DEFAULT_MCP_RATE_LIMIT in str(exc.value)

    def test_charges_a_bucket_separate_from_the_ui(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=True) as hit:
            enforce_mcp_rate_limit("key-1")
        identifiers = hit.call_args[0][2:]
        assert identifiers == ("mcp", "key-1")

    def test_env_override_is_read_per_call(self, monkeypatch):
        monkeypatch.setenv("MCP_RATE_LIMIT", "1/minute")
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=False):
            with pytest.raises(McpRateLimitExceeded) as exc:
                enforce_mcp_rate_limit("key-1")
        assert "1/minute" in str(exc.value)

    def test_each_key_has_its_own_budget(self):
        with patch("app.mcp_rate_limit.hit_with_fallback", return_value=True) as hit:
            enforce_mcp_rate_limit("key-1")
            enforce_mcp_rate_limit("key-2")
        assert hit.call_args_list[0][0][3] == "key-1"
        assert hit.call_args_list[1][0][3] == "key-2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && poetry run pytest tests/app/test_mcp_rate_limit.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.mcp_rate_limit'`

- [ ] **Step 3: Write the minimal implementation**

```python
"""Per-key rate limiting for MCP traffic.

Agent traffic has a different shape from interactive traffic: one prompt can
fan out into many tool calls. This keeps a separate bucket per key so an
agent cannot exhaust the budget an interactive user shares.
"""

import os

from limits import RateLimitItem, parse
from limits.storage import storage_from_string
from limits.strategies import MovingWindowRateLimiter

from app.rate_limiter import RATE_LIMIT_STORAGE_URI, hit_with_fallback

DEFAULT_MCP_RATE_LIMIT = "120/hour"

_limiter = MovingWindowRateLimiter(storage_from_string(RATE_LIMIT_STORAGE_URI))


class McpRateLimitExceeded(RuntimeError):
    """The caller's key is over budget."""


def _configured_limit() -> str:
    return os.getenv("MCP_RATE_LIMIT", DEFAULT_MCP_RATE_LIMIT)


def _current_limit() -> RateLimitItem:
    """Parse the configured budget on every call so env overrides apply."""
    return parse(_configured_limit())


def enforce_mcp_rate_limit(key_id: str) -> None:
    """Charge one MCP call against `key_id`'s budget, or raise."""
    if not hit_with_fallback(_limiter, _current_limit(), "mcp", key_id):
        raise McpRateLimitExceeded(
            f"MCP rate limit exceeded for this key (limit: {_configured_limit()}). "
            "Wait for the window to roll over, or generate a second key."
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && poetry run pytest tests/app/test_mcp_rate_limit.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Charge the budget in the transport**

In `juddges_mcp/http.py`, inside `McpAuthMiddleware.__call__`, after the
principal resolves and before binding it:

```python
        try:
            enforce_mcp_rate_limit(principal.mcp_key_id)
        except McpRateLimitExceeded as e:
            await JSONResponse({"error": str(e)}, status_code=429)(scope, receive, send)
            return
```

with the import at the top:

```python
from app.mcp_rate_limit import McpRateLimitExceeded, enforce_mcp_rate_limit
```

- [ ] **Step 6: Add the transport test**

Append to `backend/tests/app/test_mcp_http_transport.py`:

```python
@pytest.mark.unit
def test_over_budget_key_is_429(client):
    from app.mcp_rate_limit import McpRateLimitExceeded

    principal = MagicMock(id="user-123", mcp_key_id="key-1")
    with patch("juddges_mcp.http.resolve_mcp_principal", return_value=principal):
        with patch(
            "juddges_mcp.http.enforce_mcp_rate_limit",
            side_effect=McpRateLimitExceeded("limit: 120/hour"),
        ):
            response = client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "method": "ping", "id": 1},
                headers={"Authorization": "Bearer jdg_mcp_good"},
            )
    assert response.status_code == 429
    assert "120/hour" in response.text
```

- [ ] **Step 7: Run both suites and lint**

Run: `cd backend && poetry run pytest tests/app/test_mcp_rate_limit.py tests/app/test_mcp_http_transport.py -v && poetry run poe check`
Expected: PASS

- [ ] **Step 8: Document the new env var**

Add `MCP_RATE_LIMIT` to `.env.example` with the default `120/hour` and a
one-line comment, next to the other rate-limit variables.

- [ ] **Step 9: Commit**

```bash
git add backend/app/mcp_rate_limit.py backend/tests/app/test_mcp_rate_limit.py \
        backend/tests/app/test_mcp_http_transport.py \
        backend/packages/juddges_mcp/juddges_mcp/http.py .env.example
git commit -m "feat(mcp): rate-limit MCP traffic per key"
```

---

### Task 14: Documentation and the live read-only check

**Files:**
- Create: `docs/how-to/mcp-server.md`
- Create: `docs/reference/mcp-tools.md`
- Modify: `docs/index.md` (link both, in the existing Diátaxis sections)
- Modify: `CLAUDE.md` (one short subsection under Architecture Notes)
- Modify: `backend/tests/e2e_live/cases.py`

**Interfaces:**
- Consumes: everything above.
- Produces: no code API; one new live check named `mcp_search_judgments`.

- [ ] **Step 1: Write the live check**

Read `backend/tests/e2e_live/cases.py` and the five existing search checks,
then add one in the same shape that:
1. reads an MCP key from `JUDDGES_MCP_KEY` and **skips** with a clear reason
   when it is absent,
2. calls `search_judgments` over the real stack with the query
   `"zachowek"`,
3. asserts at least one hit, that every hit carries a non-empty `id` and
   `case_number`, and that no hit's `snippet` exceeds 600 characters.

It must stay read-only, like every other check in that file.

- [ ] **Step 2: Run the live suite**

Run: `cd backend && poetry run poe e2e-live`
Expected: 23 checks, all passing or explicitly skipped. If the environment
has no live backend, say so in the task report rather than marking this done.

- [ ] **Step 3: Write `docs/how-to/mcp-server.md`**

A task-oriented page covering, in order:
1. Generating a key at `/settings` → MCP access, and that it is shown once.
2. The hosted HTTP configuration — the `/mcp` URL and the
   `Authorization: Bearer jdg_mcp_…` header — with a concrete client config
   snippet.
3. The local stdio alternative: `export JUDDGES_MCP_KEY=…` then
   `poetry run poe mcp-stdio`.
4. The three tools, one sentence each, with a worked example prompt.
5. Revoking a key, and what the client sees afterwards (401).
6. The rate limit, naming `MCP_RATE_LIMIT` and its `120/hour` default.

- [ ] **Step 4: Write `docs/reference/mcp-tools.md`**

The tool contracts as reference material: for each tool, its arguments with
types and defaults, its return shape, and its error cases — the `limit`
range, the ISO date requirement, the reversed-range rejection, the unknown
`section` error and the sections that do exist, and the not-found error.
Copy the real limits from the code; do not restate the plan's prose.

- [ ] **Step 5: Link the new pages**

Add `docs/how-to/mcp-server.md` to the how-to list and
`docs/reference/mcp-tools.md` to the reference list in `docs/index.md`,
matching the surrounding entry style.

- [ ] **Step 6: Note the subsystem in `CLAUDE.md`**

Under Architecture Notes, after the backend sub-packages list, add
`juddges_mcp` to that list with one sentence, plus a short subsection
stating: the tools are transport-agnostic and must stay that way; `/mcp` is
a mounted sub-app deliberately outside `API_KEY_PROTECTED_ROUTERS`; keys
live in `mcp_api_keys` and an MCP key can never manage keys.

- [ ] **Step 7: Verify the docs build and links resolve**

Run: `cd frontend && npx jest __tests__/docs`
Expected: PASS — that suite checks documentation links; fix any it reports.

- [ ] **Step 8: Commit**

```bash
git add docs/ CLAUDE.md backend/tests/e2e_live/cases.py
git commit -m "docs(mcp): document the MCP server, its tools, and a live check"
```

---

## Wrap-up

- [ ] **Run everything**

```bash
cd backend && poetry run poe check-all && poetry check --lock
cd ../frontend && npm run validate && npx jest && npm run test:e2e:route-contract
```
Expected: PASS across the board.

- [ ] **Confirm the OpenAPI snapshot is in sync**

Run: `bash scripts/regen_openapi_types.sh && git diff --stat`
Expected: empty diff. A diff here means a task committed a stale snapshot.

- [ ] **Request a whole-branch review**

Use the **superpowers:requesting-code-review** skill against
`origin/main...feat/juddges-mcp`. Point the reviewer at the five Review
Focus items and at Task 7 specifically: the refactor is the change most
likely to have altered behavior silently.

- [ ] **Open the PR**

```bash
gh pr create --base main --title "feat(mcp): MCP server over the Juddges corpus (phases 0-1)" \
  --body "Implements docs/superpowers/specs/2026-10-14-juddges-mcp-design.md phases 0 and 1."
```

Branch protection requires all seven checks green and the branch up to date
with `main`; expect to `git merge origin/main` and wait for a second run.
