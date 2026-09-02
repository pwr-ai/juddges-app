# Pilot Safety Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it safe to open self-service sign-up on `juddges.augustyniak.ai` to ~15 pilot users by putting a hard ceiling on every OpenAI-billing endpoint, gating registration behind an invite code, and switching on the error/cost observability that is already wired but disabled.

**Architecture:** Three independent safety layers, each verifiable on its own. (1) A FastAPI dependency enforces a tight per-client budget on the three LangServe LLM routes that `@limiter.limit` structurally cannot decorate, backed by the same `limits` storage the rest of the app already uses. (2) `SlowAPIMiddleware` is added as a global backstop so that any future route added by any mechanism inherits `DEFAULT_RATE_LIMITS` instead of silently escaping them. (3) Registration moves from client-side `supabase.auth.signUp` to a service-role backend endpoint that atomically redeems an invite code before creating the user, with public sign-up disabled in the Supabase project so the anon key cannot bypass the gate.

**Tech Stack:** FastAPI, slowapi 0.1.9 + `limits`, Supabase (Postgres + Auth admin API), Next.js 15 App Router BFF routes, pytest, Jest.

**Spec:** This plan implements the verified findings in the "Audit findings" section below. There is no separate spec document; the findings were produced by direct code verification on 2026-09-01/02 and each carries a `file:line` citation.

## Global Constraints

- Branch from `origin/main`. Branch name `fix/<issue>-<slug>`; the issue number is mandatory — create the GitHub issue first if one does not exist.
- All work happens in a git worktree under `.worktrees/`, never in the main checkout.
- Conventional Commits, `<type>(<scope>): <subject>`, imperative, lowercase, no trailing period, subject ≤72 chars, `Refs #<issue>` in the footer. No Claude/co-author footers.
- Backend tests must be marked `@pytest.mark.unit` or `@pytest.mark.integration`. Only `-m unit` runs in the required `Backend Unit Tests` check.
- Backend lint/format is Ruff. Run `poetry run poe check-all` before every commit.
- Frontend is TypeScript strict mode. Run `npm run validate` before every frontend commit.
- A fresh worktree has no `node_modules` and no virtualenv. Run `npm ci` in `frontend/` and `poetry install` in `backend/` before the first code commit, or the pre-commit typecheck hook fails on missing dependencies rather than on your code.
- Editable installs resolve to the main checkout. When running backend tests inside a worktree, set `PYTHONPATH` to the worktree's `backend` directory or you will verify the wrong code.
- Merge with `gh pr merge <n> --merge --delete-branch`. Squash and rebase merges are disabled repo-side.

---

## Audit findings this plan implements

Every claim below was verified directly, not taken from a summary.

| ID | Finding | Evidence |
|---|---|---|
| G2a | `/qa`, `/chat`, `/enhance_query` are registered via LangServe `add_routes` and carry no rate limit. `@limiter.limit` cannot decorate them because no route function is exposed. | `backend/app/server.py:639-648` |
| G2b | `SlowAPIMiddleware` is absent from the entire backend, so `DEFAULT_RATE_LIMITS` never apply to any undecorated route. `server.py` adds only `CORSMiddleware` and `GZipMiddleware`. | `grep -rn "SlowAPIMiddleware" backend/` → no hits; `backend/app/server.py:487,502` |
| G2c | Sign-up is fully open. `supabase.auth.signUp` is called client-side with no allowlist, invite code, or domain check; CAPTCHA is commented out. | `frontend/components/sign-up-form.tsx`, `supabase/config.toml` |
| G2d | No per-user cost budget, credit, or usage ceiling exists for authenticated users anywhere in the codebase. | repo-wide grep for `quota|budget|credits|usage_limit` |
| G8a | Sentry is fully wired in both backend and frontend, including `CeleryIntegration` and a PII scrubber, but is a silent no-op when the DSN env var is unset. The repo's `.env` has no `SENTRY_DSN` key at all. | `backend/app/sentry.py:53-56`, `frontend/sentry.client.config.ts:14` |
| G8b | Langfuse is fully configured (keys and host set) but disabled by `ENABLE_LANGFUSE=false`. `infra/grafana/README.md` names "No Langfuse→Prometheus/SQL export" as the blocking dependency for the `llm-cost` dashboard. | local `.env`, `infra/grafana/README.md` |
| G8c | `LLM_NAME` is unset, so extraction and chat run on the floating alias `"gpt-5"` (`GPT_5` default). `OPENAI_MODEL` in `.env` is read by no code at all. | `backend/packages/juddges_search/juddges_search/llms.py:37`; `grep -rn "OPENAI_MODEL" backend/ frontend/` → no hits |

**Out of scope for this plan** (they belong to Plan B — extraction path, and Plan C — publishable dataset): `/extract` and `/extractions` missing from the sidebar; job restart reprocessing already-completed documents; extraction provenance columns; export datasheet and JSONL; human validation of extracted values; the falsely-green `schema-extraction-flow.spec.ts`.

---

## Hard prerequisites outside this repository

These cannot be done by editing code and must be completed by the repository owner. Task 4 does not function without step 1.

1. **Disable public sign-up in the Supabase dashboard** (Authentication → Sign In / Providers → disable "Allow new users to sign up"). Until this is off, anyone holding the public anon key can call `auth.signUp` directly and bypass the invite gate entirely, no matter what the frontend does.
2. **Confirm PITR / backups are enabled** on the Supabase project. The repo's own readiness checklist has `- [ ] PITR enabled for backups` unchecked (`docs/reference/supabase-complete-reference.md:1184`), and there is no `pg_dump` automation anywhere in the repo. This is the single unrecoverable-data-loss risk for the pilot.
3. **Create a Sentry project** and obtain a DSN, needed by Task 5.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/app/llm_rate_limit.py` (create) | The one place that decides how many LLM calls a client may make. Pure function of `Request` → allow/deny. No FastAPI wiring beyond raising `HTTPException`. |
| `backend/tests/app/test_llm_rate_limit.py` (create) | Behavioural proof that the budget allows, blocks, and isolates clients. |
| `backend/app/server.py` (modify) | Wires the dependency into the three `add_routes` calls; adds `SlowAPIMiddleware`; registers the invites router. |
| `backend/tests/app/test_rate_limit_middleware.py` (create) | Proves the global backstop actually throttles an undecorated route, and that the real app has it installed. |
| `supabase/migrations/20260902000001_create_invite_codes.sql` (create) | `invite_codes` table plus the atomic `redeem_invite_code` RPC. Deny-all to `anon`/`authenticated`. |
| `backend/app/api/invites.py` (create) | The invite redemption endpoint. Owns the redeem-then-create-user sequence and nothing else. |
| `backend/tests/app/test_invites.py` (create) | Covers accepted code, rejected code, exhausted code, expired code, and rate limit presence. |
| `frontend/app/api/auth/redeem-invite/route.ts` (create) | BFF proxy: browser → backend, adding `X-API-Key`. Never exposes the service role key to the client. |
| `frontend/components/sign-up-form.tsx` (modify) | Adds the invite-code field and posts to the BFF route instead of calling `supabase.auth.signUp`. |
| `frontend/__tests__/app/api/auth/redeem-invite.route.test.ts` (create) | Covers validation, backend error propagation, and that the service role key is never returned. |
| `.env.example` (modify) | Documents `LLM_RATE_LIMIT`, `INVITE_REDEEM_RATE_LIMIT`, and the now-required `SENTRY_DSN` / `LLM_NAME`. |
| `docs/how-to/pilot-launch-checklist.md` (create) | The manual pre-release checklist — one of the three test layers requested. |

---

### Task 1: Hard budget on the LangServe LLM routes

**Files:**
- Create: `backend/app/llm_rate_limit.py`
- Create: `backend/tests/app/test_llm_rate_limit.py`
- Modify: `backend/app/server.py:639-648`

**Interfaces:**
- Consumes: `get_client_ip(request)` and `RATE_LIMIT_STORAGE_URI` from `backend/app/rate_limiter.py` (both already exist and are exported at module level).
- Produces: `enforce_llm_rate_limit(request: Request) -> None` — a FastAPI dependency. Raises `HTTPException(429)` when the caller is over budget, returns `None` otherwise. Task 5 reads the `LLM_RATE_LIMIT` env var name from here.

**Why a dependency and not a decorator:** `add_routes` builds the route handlers inside LangServe. There is no function in this repo to attach `@limiter.limit` to. `add_routes` does accept a `dependencies=[...]` list, which is already used for `verify_api_key` — so a dependency is the only injection point that exists.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app/test_llm_rate_limit.py`:

```python
"""Unit tests for the LangServe LLM route budget.

These routes (/qa, /chat, /enhance_query) are the only endpoints that bill
OpenAI on every call and the only ones @limiter.limit cannot decorate.
Each test uses a distinct client IP so the shared in-process storage does
not leak budget between tests.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.llm_rate_limit import enforce_llm_rate_limit


def _request(client_host: str) -> MagicMock:
    """Build a minimal Starlette-like Request with no proxy headers."""
    request = MagicMock()
    request.client = MagicMock()
    request.client.host = client_host
    request.headers = {}
    return request


@pytest.mark.unit
def test_allows_calls_up_to_the_configured_limit(monkeypatch):
    monkeypatch.setenv("LLM_RATE_LIMIT", "3/hour")
    request = _request("203.0.113.10")

    for _ in range(3):
        enforce_llm_rate_limit(request)


@pytest.mark.unit
def test_blocks_the_call_that_exceeds_the_limit(monkeypatch):
    monkeypatch.setenv("LLM_RATE_LIMIT", "2/hour")
    request = _request("203.0.113.11")

    enforce_llm_rate_limit(request)
    enforce_llm_rate_limit(request)

    with pytest.raises(HTTPException) as exc_info:
        enforce_llm_rate_limit(request)

    assert exc_info.value.status_code == 429


@pytest.mark.unit
def test_two_clients_have_independent_budgets(monkeypatch):
    monkeypatch.setenv("LLM_RATE_LIMIT", "1/hour")

    enforce_llm_rate_limit(_request("203.0.113.12"))
    enforce_llm_rate_limit(_request("203.0.113.13"))


@pytest.mark.unit
def test_authenticated_bff_identity_gets_its_own_budget(monkeypatch):
    """A signed-in user must not inherit the shared BFF socket budget."""
    monkeypatch.setenv("LLM_RATE_LIMIT", "1/hour")
    monkeypatch.setenv("BACKEND_API_KEY", "test-backend-key")

    first = _request("203.0.113.14")
    first.headers = {
        "X-API-Key": "test-backend-key",
        "X-RateLimit-Identity": "a" * 64,
    }
    second = _request("203.0.113.14")
    second.headers = {
        "X-API-Key": "test-backend-key",
        "X-RateLimit-Identity": "b" * 64,
    }

    enforce_llm_rate_limit(first)
    enforce_llm_rate_limit(second)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_llm_rate_limit.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.llm_rate_limit'`.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/app/llm_rate_limit.py`:

```python
"""Per-client budget for the LangServe LLM routes.

LangServe registers /qa, /chat and /enhance_query through ``add_routes``,
which exposes no route function for ``@limiter.limit`` to decorate. These
three endpoints are the only ones in the backend that call ChatOpenAI on
every request, so they get an explicit dependency instead.

The budget deliberately uses the same ``limits`` storage URI as the rest of
the app, so a Redis-backed deployment shares one counter across processes.
"""

from __future__ import annotations

import os

from fastapi import HTTPException, Request, status
from limits import RateLimitItem, parse
from limits.storage import storage_from_string
from limits.strategies import MovingWindowRateLimiter

from app.rate_limiter import RATE_LIMIT_STORAGE_URI, get_client_ip

DEFAULT_LLM_RATE_LIMIT = "20/hour"

_limiter = MovingWindowRateLimiter(storage_from_string(RATE_LIMIT_STORAGE_URI))


def _current_limit() -> RateLimitItem:
    """Parse the configured budget on every call so env overrides apply."""
    return parse(os.getenv("LLM_RATE_LIMIT", DEFAULT_LLM_RATE_LIMIT))


def enforce_llm_rate_limit(request: Request) -> None:
    """Charge one LLM call against the caller's budget, or reject with 429."""
    if not _limiter.hit(_current_limit(), "llm", get_client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "LLM_RATE_LIMIT_EXCEEDED",
                "message": (
                    "Too many AI requests. This limit protects the shared "
                    "research budget — please try again later."
                ),
            },
        )
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && poetry run pytest tests/app/test_llm_rate_limit.py -v
```

Expected: PASS, 4 passed.

- [ ] **Step 5: Wire the dependency into the three LangServe routes**

In `backend/app/server.py`, add the import next to the existing rate-limiter import:

```python
from app.llm_rate_limit import enforce_llm_rate_limit
```

Replace lines 639-648:

```python
# Add routes with API key protection and an explicit LLM budget.
# add_routes builds its own handlers, so @limiter.limit cannot reach them —
# the budget is enforced as a dependency instead. See app/llm_rate_limit.py.
add_routes(
    app,
    chain,
    path="/qa",
    dependencies=[Depends(verify_api_key), Depends(enforce_llm_rate_limit)],
)
add_routes(
    app,
    chat_chain,
    path="/chat",
    dependencies=[Depends(verify_api_key), Depends(enforce_llm_rate_limit)],
)

add_routes(
    app,
    enhance_query_chain,
    path="/enhance_query",
    dependencies=[Depends(verify_api_key), Depends(enforce_llm_rate_limit)],
)
```

- [ ] **Step 6: Add a test proving the dependency is attached to all three routes**

Append to `backend/tests/app/test_llm_rate_limit.py`:

```python
@pytest.mark.unit
def test_all_llm_routes_carry_the_budget_dependency():
    """Regression guard: a new LangServe route must not escape the budget."""
    from app.llm_rate_limit import enforce_llm_rate_limit as dependency
    from app.server import app

    llm_prefixes = ("/qa", "/chat", "/enhance_query")
    guarded = {
        route.path
        for route in app.routes
        if getattr(route, "dependant", None)
        and any(
            d.call is dependency
            for d in route.dependant.dependencies
        )
    }

    for prefix in llm_prefixes:
        assert any(path.startswith(prefix) for path in guarded), (
            f"No route under {prefix} enforces the LLM budget"
        )
```

- [ ] **Step 7: Run the full backend unit suite**

```bash
cd backend && poetry run pytest -m unit -q
```

Expected: PASS. If any existing test now returns 429, it is sharing a client IP with another test — give it a distinct IP rather than raising the limit.

- [ ] **Step 8: Lint and commit**

```bash
cd backend && poetry run poe check-all
git add backend/app/llm_rate_limit.py backend/tests/app/test_llm_rate_limit.py backend/app/server.py
git commit -m "fix(api): enforce a per-client budget on langserve llm routes

Refs #<issue>"
```

---

### Task 2: Global rate-limit backstop

**Files:**
- Modify: `backend/app/server.py` (near the existing `add_middleware` calls at :487 and :502)
- Create: `backend/tests/app/test_rate_limit_middleware.py`

**Interfaces:**
- Consumes: `limiter` from `backend/app/rate_limiter.py`, already assigned to `app.state.limiter` at `server.py:438`.
- Produces: nothing importable. The deliverable is that `DEFAULT_RATE_LIMITS` now apply to every undecorated route.

**Why this is separate from Task 1:** Task 1 closes the three routes we know about. This closes the mechanism that let them escape — `default_limits` are only consulted when slowapi runs in middleware mode. Without it, the next route added by any means inherits no limit at all and nobody notices.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app/test_rate_limit_middleware.py`:

```python
"""The global rate-limit backstop.

slowapi only applies ``default_limits`` when SlowAPIMiddleware is installed;
the @limiter.limit decorator path never consults them. Without the
middleware an undecorated route has no limit whatsoever.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware


@pytest.mark.unit
def test_middleware_applies_default_limits_to_an_undecorated_route():
    """Proves the mechanism: no decorator, still throttled."""
    limiter = Limiter(
        key_func=lambda request: "fixed-test-key",
        default_limits=["2 per minute"],
        storage_uri="memory://",
    )
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    @app.get("/undecorated")
    async def undecorated():
        return {"ok": True}

    client = TestClient(app)

    assert client.get("/undecorated").status_code == 200
    assert client.get("/undecorated").status_code == 200
    assert client.get("/undecorated").status_code == 429


@pytest.mark.unit
def test_production_app_installs_the_backstop():
    """Regression guard against the middleware being dropped again."""
    from app.server import app

    assert any(
        middleware.cls is SlowAPIMiddleware
        for middleware in app.user_middleware
    ), "SlowAPIMiddleware is missing — default_limits apply to nothing"
```

- [ ] **Step 2: Run the test to verify the second case fails**

```bash
cd backend && poetry run pytest tests/app/test_rate_limit_middleware.py -v
```

Expected: `test_middleware_applies_default_limits_to_an_undecorated_route` PASSES (it builds its own app), `test_production_app_installs_the_backstop` FAILS with "SlowAPIMiddleware is missing".

This split is deliberate: the first test proves the mechanism works, the second proves we actually use it. A config assertion alone would not tell you whether the middleware does anything.

- [ ] **Step 3: Install the middleware**

In `backend/app/server.py`, add the import beside the other slowapi imports:

```python
from slowapi.middleware import SlowAPIMiddleware
```

Immediately after the `GZipMiddleware` line at :502:

```python
# Global backstop: without this, slowapi's default_limits are consulted for
# no route at all and any endpoint lacking an explicit @limiter.limit runs
# unthrottled. Per-route decorators still take precedence.
app.add_middleware(SlowAPIMiddleware)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && poetry run pytest tests/app/test_rate_limit_middleware.py -v
```

Expected: PASS, 2 passed.

- [ ] **Step 5: Run the full backend unit suite and watch for new 429s**

```bash
cd backend && poetry run pytest -m unit -q
```

Expected: PASS. The default budget is 100/minute and 1000/hour, so a unit test only trips it by making more than 100 requests with the same key. If one does, give that test its own key via the `X-Forwarded-For` header rather than loosening the default.

- [ ] **Step 6: Lint and commit**

```bash
cd backend && poetry run poe check-all
git add backend/app/server.py backend/tests/app/test_rate_limit_middleware.py
git commit -m "fix(api): install slowapi middleware so default limits apply

Refs #<issue>"
```

---

### Task 3: Invite codes — schema and redemption endpoint

**Files:**
- Create: `supabase/migrations/20260902000001_create_invite_codes.sql`
- Create: `backend/app/api/invites.py`
- Create: `backend/tests/app/test_invites.py`
- Modify: `backend/app/server.py` (router registration block)

**Interfaces:**
- Consumes: `get_supabase_client()` from `backend/app/core/supabase.py` (returns a service-role `Client` or `None`), and `limiter` from `backend/app/rate_limiter.py`.
- Produces: `POST /auth/invites/redeem` accepting `{"code": str, "email": str, "password": str}` and returning `201 {"status": "created"}`. Task 4's BFF route calls exactly this shape.

**Design note on ordering:** the code is redeemed before the user is created. If user creation then fails, the code is consumed and the invitee must be issued a new one — recoverable by the admin raising `max_uses`. The reverse order would leave a created account with no invite consumed, which is the failure this whole task exists to prevent. The safe direction is the one taken here.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260902000001_create_invite_codes.sql`:

```sql
-- Invite codes gating pilot self-registration (#<issue>).
--
-- Redemption is a single UPDATE guarded by its own WHERE clause so two
-- concurrent redemptions of a one-use code cannot both succeed.

CREATE TABLE IF NOT EXISTS public.invite_codes (
    code        TEXT PRIMARY KEY,
    note        TEXT,
    max_uses    INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    used_count  INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.invite_codes IS
    'Pilot registration gate. Service-role only: never exposed to anon or '
    'authenticated roles, because holding the anon key must not reveal or '
    'consume a code.';

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- RLS with zero policies denies anon and authenticated. The explicit REVOKE
-- is belt-and-braces: a later blanket GRANT in another migration would
-- otherwise silently widen access.
REVOKE ALL ON public.invite_codes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.invite_codes
       SET used_count = used_count + 1
     WHERE code = p_code
       AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > now());

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite_code(TEXT) FROM anon, authenticated;
```

- [ ] **Step 2: Write the failing endpoint test**

Create `backend/tests/app/test_invites.py`:

```python
"""Invite redemption endpoint.

The Supabase client is replaced by a double so these stay unit tests: the
behaviour under test is the redeem-then-create ordering and the mapping of
a refused code onto 403, not Supabase itself.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


def _client_with_rpc_result(redeemed: bool) -> MagicMock:
    """Build a Supabase double whose redeem_invite_code returns `redeemed`."""
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = MagicMock(data=redeemed)
    return supabase


@pytest.fixture()
def api(monkeypatch):
    from fastapi import FastAPI

    from app.api import invites
    from app.rate_limiter import limiter

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(invites.router)
    return app, invites


@pytest.mark.unit
def test_valid_code_creates_the_user(api, monkeypatch):
    app, invites = api
    supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)

    response = TestClient(app).post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "jurist@example.org",
            "password": "correct horse battery",
        },
    )

    assert response.status_code == 201
    supabase.auth.admin.create_user.assert_called_once()
    created = supabase.auth.admin.create_user.call_args[0][0]
    assert created["email"] == "jurist@example.org"
    assert created["email_confirm"] is True


@pytest.mark.unit
def test_unknown_or_exhausted_code_is_refused_and_creates_nobody(api, monkeypatch):
    app, invites = api
    supabase = _client_with_rpc_result(False)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)

    response = TestClient(app).post(
        "/auth/invites/redeem",
        json={
            "code": "NOPE",
            "email": "stranger@example.org",
            "password": "correct horse battery",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "INVALID_INVITE_CODE"
    supabase.auth.admin.create_user.assert_not_called()


@pytest.mark.unit
def test_short_password_is_rejected_before_the_code_is_spent(api, monkeypatch):
    app, invites = api
    supabase = _client_with_rpc_result(True)
    monkeypatch.setattr(invites, "get_supabase_client", lambda: supabase)

    response = TestClient(app).post(
        "/auth/invites/redeem",
        json={
            "code": "PILOT-2026",
            "email": "jurist@example.org",
            "password": "short",
        },
    )

    assert response.status_code == 422
    supabase.rpc.assert_not_called()
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd backend && poetry run pytest tests/app/test_invites.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.invites'`.

- [ ] **Step 4: Write the endpoint**

Create `backend/app/api/invites.py`:

```python
"""Invite-gated registration for the pilot.

Registration deliberately does not go through the browser's Supabase client:
the anon key is public, so any client-side gate can be skipped. Account
creation happens here with the service-role key, and only after an invite
code has been atomically consumed.
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field

from app.core.supabase import get_supabase_client
from app.rate_limiter import limiter

logger = logging.getLogger(__name__)

INVITE_REDEEM_RATE_LIMIT = os.getenv("INVITE_REDEEM_RATE_LIMIT", "5/hour")

router = APIRouter(prefix="/auth/invites", tags=["auth"])


class InviteRedemptionRequest(BaseModel):
    code: str = Field(min_length=1, max_length=128)
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)


@router.post("/redeem", status_code=status.HTTP_201_CREATED)
@limiter.limit(INVITE_REDEEM_RATE_LIMIT)
async def redeem_invite(request: Request, payload: InviteRedemptionRequest) -> dict:
    """Consume an invite code and create the corresponding account."""
    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SUPABASE_UNAVAILABLE", "message": "Try again shortly."},
        )

    redeemed = supabase.rpc("redeem_invite_code", {"p_code": payload.code}).execute()
    if not redeemed.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INVALID_INVITE_CODE",
                "message": "This invite code is not valid, has expired, or is used up.",
            },
        )

    try:
        supabase.auth.admin.create_user(
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
            }
        )
    except Exception:
        # The code is already spent. Say so plainly rather than inventing a
        # rollback: an admin raising max_uses is a two-second fix, whereas a
        # half-created account is not.
        logger.exception("Invite %s consumed but account creation failed", payload.code)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ACCOUNT_CREATION_FAILED",
                "message": (
                    "Your invite code was accepted but the account could not be "
                    "created — this address may already be registered. Contact "
                    "the study administrator."
                ),
            },
        ) from None

    return {"status": "created"}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && poetry run pytest tests/app/test_invites.py -v
```

Expected: PASS, 3 passed.

- [ ] **Step 6: Register the router**

In `backend/app/server.py`, add the import beside the other router imports:

```python
from app.api.invites import router as invites_router
```

Register it with no API-key dependency — the browser reaches it through the BFF, which supplies the key itself, and the endpoint's own rate limit plus the invite code are its protection:

```python
app.include_router(invites_router)
```

- [ ] **Step 7: Apply the migration locally and verify the deny-all**

```bash
cd supabase && npx supabase db reset
```

Then confirm the table is unreachable with the anon key and the RPC refuses a bogus code. Expected: the anon-key select returns a permission error, and `redeem_invite_code('NOPE')` returns `false`.

- [ ] **Step 8: Run the suite, lint, commit**

```bash
cd backend && poetry run pytest -m unit -q && poetry run poe check-all
git add supabase/migrations/20260902000001_create_invite_codes.sql \
        backend/app/api/invites.py backend/tests/app/test_invites.py \
        backend/app/server.py
git commit -m "feat(auth): gate registration behind invite codes

Refs #<issue>"
```

---

### Task 4: Sign-up form redemption flow

**Files:**
- Create: `frontend/app/api/auth/redeem-invite/route.ts`
- Create: `frontend/__tests__/app/api/auth/redeem-invite.route.test.ts`
- Modify: `frontend/components/sign-up-form.tsx`

**Interfaces:**
- Consumes: `POST /auth/invites/redeem` from Task 3, `{code, email, password}` → `201 {"status": "created"}` or `403 {"detail": {"code": "INVALID_INVITE_CODE", ...}}`.
- Produces: `POST /api/auth/redeem-invite` with the same body, for the sign-up form.

**Reminder:** this task is inert until public sign-up is disabled in the Supabase dashboard (prerequisite 1). With it still enabled, a user can call `auth.signUp` from the browser console and skip the form entirely.

- [ ] **Step 1: Write the failing BFF route test**

Create `frontend/__tests__/app/api/auth/redeem-invite.route.test.ts`:

```typescript
/**
 * BFF route for invite redemption.
 *
 * The browser must never hold the backend API key, and a refused invite
 * must reach the user as a refusal rather than a generic 500.
 */
import { POST } from '@/app/api/auth/redeem-invite/route';

describe('POST /api/auth/redeem-invite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.BACKEND_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'test-backend-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  const request = (body: unknown) =>
    new Request('http://localhost/api/auth/redeem-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('forwards a valid redemption and returns 201', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'created' }), { status: 201 })
    );

    const response = await POST(
      request({ code: 'PILOT-2026', email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(response.status).toBe(201);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://backend.test/auth/invites/redeem');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-backend-key');
  });

  it('propagates a refused invite code as 403', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { code: 'INVALID_INVITE_CODE', message: 'nope' } }),
        { status: 403 }
      )
    );

    const response = await POST(
      request({ code: 'NOPE', email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: 'INVALID_INVITE_CODE' },
    });
  });

  it('rejects a body with no invite code without calling the backend', async () => {
    global.fetch = jest.fn();

    const response = await POST(
      request({ email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never echoes the backend api key to the client', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'created' }), { status: 201 })
    );

    const response = await POST(
      request({ code: 'PILOT-2026', email: 'a@example.org', password: 'correct horse battery' })
    );

    expect(await response.text()).not.toContain('test-backend-key');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx jest __tests__/app/api/auth/redeem-invite.route.test.ts
```

Expected: FAIL — cannot resolve `@/app/api/auth/redeem-invite/route`.

- [ ] **Step 3: Write the BFF route**

Create `frontend/app/api/auth/redeem-invite/route.ts`:

```typescript
import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:8004';
const API_KEY = process.env.BACKEND_API_KEY ?? '';

interface RedeemInviteBody {
  code?: unknown;
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RedeemInviteBody;

  if (
    typeof body.code !== 'string' ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json(
      { detail: { code: 'INVALID_REQUEST', message: 'Invite code, email and password are required.' } },
      { status: 400 }
    );
  }

  const response = await fetch(`${API_BASE_URL}/auth/invites/redeem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    } as HeadersInit,
    body: JSON.stringify({
      code: body.code,
      email: body.email,
      password: body.password,
    }),
  });

  // Pass the backend's own status and body through: a refused invite must
  // read as a refusal, not as a generic failure.
  return NextResponse.json(await response.json(), { status: response.status });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx jest __tests__/app/api/auth/redeem-invite.route.test.ts
```

Expected: PASS, 4 passed.

- [ ] **Step 5: Point the sign-up form at the new route**

In `frontend/components/sign-up-form.tsx`, add an invite-code field to the form state and replace the `supabase.auth.signUp({...})` call with:

```typescript
const response = await fetch('/api/auth/redeem-invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: inviteCode, email, password }),
});

if (!response.ok) {
  const body = await response.json();
  setError(body?.detail?.message ?? 'Registration failed. Check your invite code.');
  return;
}

// The account exists and is confirmed; sign in immediately.
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) {
  router.push('/auth/login');
  return;
}
router.push('/');
```

Add the field itself alongside the existing email and password inputs, following the surrounding markup:

```tsx
<div className="grid gap-2">
  <Label htmlFor="invite-code">Invite code</Label>
  <Input
    id="invite-code"
    type="text"
    required
    value={inviteCode}
    onChange={(event) => setInviteCode(event.target.value)}
  />
</div>
```

- [ ] **Step 6: Update the sign-up success copy**

`frontend/app/auth/sign-up-success/page.tsx` currently tells the user to check their email to confirm the account. Accounts created through this flow are created with `email_confirm: true`, so that instruction is now wrong. Either route successful sign-ups straight to `/` (as in Step 5) or change the copy to say the account is ready. Do not leave the contradiction in place.

- [ ] **Step 7: Validate and commit**

```bash
cd frontend && npm run validate && npx jest __tests__/app/api/auth
git add frontend/app/api/auth/redeem-invite/route.ts \
        frontend/__tests__/app/api/auth/redeem-invite.route.test.ts \
        frontend/components/sign-up-form.tsx \
        frontend/app/auth/sign-up-success/page.tsx
git commit -m "feat(auth): redeem invite codes from the sign-up form

Refs #<issue>"
```

---

### Task 5: Switch on the observability that already exists

**Files:**
- Modify: `.env.example`
- Create: `docs/how-to/pilot-launch-checklist.md`

**Interfaces:**
- Consumes: `LLM_RATE_LIMIT` (Task 1), `INVITE_REDEEM_RATE_LIMIT` (Task 3).
- Produces: the manual pre-release checklist, which is the second of the three test layers.

**Nothing here is new code.** Sentry is fully wired in `backend/app/sentry.py` and `frontend/sentry.*.config.ts` and no-ops on a missing DSN. Langfuse is configured and switched off. The work is setting four values and writing down how to confirm they took effect.

- [ ] **Step 1: Document the new and now-required variables in `.env.example`**

```bash
# --- Pilot safety (see docs/superpowers/plans/2026-09-02-pilot-safety-gate.md)
# Budget for the LangServe LLM routes (/qa, /chat, /enhance_query). These are
# the only endpoints billed per call; they are NOT covered by @limiter.limit.
LLM_RATE_LIMIT=20/hour
# Registration attempts per client per hour.
INVITE_REDEEM_RATE_LIMIT=5/hour
# Pin the extraction/chat model to a dated snapshot. Unset means the floating
# alias "gpt-5", which makes an extracted dataset unreproducible.
# NOTE: OPENAI_MODEL is read by no code — LLM_NAME is the live variable.
LLM_NAME=
```

- [ ] **Step 2: Set the values on the production host**

In the production `.env` on the host:

```bash
SENTRY_DSN=<dsn from the Sentry project>
NEXT_PUBLIC_SENTRY_DSN=<same dsn>
ENABLE_LANGFUSE=true
LLM_RATE_LIMIT=20/hour
INVITE_REDEEM_RATE_LIMIT=5/hour
```

`NEXT_PUBLIC_SENTRY_DSN` is baked in at build time, so the frontend image must be rebuilt — setting it on a running container does nothing.

- [ ] **Step 3: Prove each switch actually took effect**

Do not mark this step done on the basis that the variable is set.

```bash
# Sentry backend: should appear in the backend logs at startup, and the
# test event should land in the Sentry project within a minute.
./scripts/test_sentry.sh

# Langfuse: run one chat query, then confirm a trace with a cost appears
# in the Langfuse project. No trace means ENABLE_LANGFUSE did not take.

# LLM budget: 21 requests should end in a 429.
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X POST https://juddges.augustyniak.ai/api/enhance_query \
    -H 'Content-Type: application/json' -d '{"query":"test"}'
done; echo
# Expected: twenty 200s (or 4xx from validation) followed by 429.
```

- [ ] **Step 4: Write the manual pre-release checklist**

Create `docs/how-to/pilot-launch-checklist.md`:

```markdown
# Pilot pre-release checklist

Run this before every production deploy while the pilot is live. It takes
about ten minutes and covers what no automated test covers today.

## Before deploying

- [ ] `git log --first-parent main` — confirm what is actually shipping.
- [ ] No extraction job is running. On the host:
      `docker compose exec backend-worker celery -A app.workers inspect active`
      A deploy restarts the workers, and an interrupted job restarts from
      document zero and bills OpenAI a second time.
- [ ] `.deploy-history` has at least two lines, otherwise `--rollback` has
      nothing to roll back to.

## After deploying

- [ ] `curl -s -o /dev/null -w '%{http_code}' https://juddges.augustyniak.ai/`
      returns 200.
- [ ] `/extract` redirects to `/auth/login` when signed out.
- [ ] Sign in as a test user, run one search, open one judgment.
- [ ] Launch a five-document extraction and confirm it reaches COMPLETED.
- [ ] Export the result as CSV and open the file.
- [ ] Sign-up with a bogus invite code is refused.
- [ ] Sentry shows no new unresolved issues from the deploy window.
- [ ] Langfuse shows today's spend below the monthly ceiling.

Note: `post_deploy_validation()` in `scripts/deploy_prod.sh` only warns on
failure — it never aborts and never rolls back. A green deploy message is
not evidence the deploy worked. This checklist is the evidence.
```

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/how-to/pilot-launch-checklist.md
git commit -m "docs(ops): document pilot safety env vars and launch checklist

Refs #<issue>"
```

---

## Definition of done for Plan A

- [ ] The 21-request loop against `/api/enhance_query` ends in a 429, with the output quoted in the PR.
- [ ] `poetry run pytest -m unit -q` passes, output quoted.
- [ ] `npm run validate && npm test` passes, output quoted.
- [ ] Registration with an unknown invite code is refused on production.
- [ ] Public sign-up is disabled in the Supabase dashboard (prerequisite 1) — confirmed by the owner, not inferred.
- [ ] A test Sentry event is visible in the Sentry project.
- [ ] A Langfuse trace with a cost figure is visible for a real chat query.
- [ ] Supabase PITR status has been checked and reported either way.

## What Plan A deliberately does not fix

Named so nobody mistakes this plan for the whole job:

- `/extract` and `/extractions` are still missing from the sidebar — Plan B.
- A restarted job still reprocesses completed documents — Plan B.
- The extraction path still has no end-to-end test, and `schema-extraction-flow.spec.ts` still passes while asserting nothing — Plan B.
- Extraction results still record no model, schema version, or prompt version — Plan C.
- Exports still carry no datasheet, licence, or field descriptions, and there is still no JSONL — Plan C.
- There is still no way for a human to mark an extracted value right or wrong — Plan C.
- There is still no Grafana, no metrics endpoint, and no log aggregation. The `celery` and `llm-cost` dashboards stay placeholders until something emits metrics.
