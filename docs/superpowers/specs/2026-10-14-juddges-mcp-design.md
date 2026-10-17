# juddges-mcp — MCP server over the Juddges corpus — design spec

> **Status:** proposed · **Date:** 2026-10-14 · **Owner:** mcp-access

> **Amendment, 2026-10-18.** The `get_current_user_or_mcp_key` dependency
> described below was built and then removed: no endpoint ever used it. An
> MCP key now authenticates in exactly one place, the ASGI middleware in
> front of the mounted `/mcp` app, so a leaked key reaches the MCP tools
> and nothing else. Acceptance criterion 3 and the phase-0 unit test that
> covered the dependency are void; criterion 5 is now structural, asserted
> app-wide in `backend/tests/app/test_mcp_keys_router.py`.

Covers **phase 0 (long-lived MCP keys)** and **phase 1 (server + three
read-only tools)**. Phases 2 (`compare_across_jurisdictions`) and 3
(collections + export writes) are named here for context and get their own
spec/plan cycles once phase 1 runs in production.

## User story

**As a** researcher or lawyer already working inside an AI client (Claude
Code, Claude.ai, Cursor) **I want to** search the Juddges corpus and pull
judgments and their extracted fields without leaving that client, **so
that** case-law retrieval happens where I draft, and every result arrives
with a verifiable citation instead of a hallucinated one.

## Context

### Why now, and what the competition looks like

`.context/research/2026-09-21-legal-mcp-landscape.md` surveys the field.
Seven free Brazilian case-law MCP servers exist, and Poland already has at
least five (`matematicsolutions/mcp-saos`, `pawelojdowski/saos-mcp`,
`matematicsolutions/mcp-nsa`, `matematicsolutions/kio-orzeczenia-mcp`,
`PawelHaracz/polish-caselaw-mcp`). Every one of them is a thin wrapper over
an official search endpoint: keyword search, no embeddings, no reranking,
no cross-document analysis. A sixth SAOS wrapper would add nothing.

What Juddges has and they do not: BGE-M3 pgvector hybrid search with
reranking over an ingested corpus, structured base-schema extractions, and
a single index holding both PL and UK judgments. The differentiation is the
corpus and the retrieval quality — not the protocol. This spec therefore
keeps the MCP layer as thin as possible and spends its effort on the
credential model that lets a real user reach their own data.

### What already exists in this repo

Reconnaissance changed the shape of phase 0 substantially:

- **Per-user identity is already implemented.** `app/core/auth_jwt.py:181`
  `get_current_user` validates a Supabase JWT and returns
  `AuthenticatedUser`; `app/collections.py` depends on it and filters by
  `user.id`. Phase 0 adds a second credential type feeding that same class
  — it does **not** introduce a second user model.
- **No endpoint depends on the user's JWT for database access.**
  `AuthenticatedUser.raw_token` is consumed only by
  `get_user_supabase_client` at `app/core/auth_jwt.py:349`, which nothing
  under `app/` calls. Endpoints use the service-role client and filter by
  `user.id` explicitly. A principal minted from an MCP key therefore needs
  no JWT and breaks no RLS assumption.
- **`app/auth.py` is a separate, shared-secret mechanism.** It verifies a
  single `BACKEND_API_KEY` for the frontend-to-backend hop and carries no
  user identity. It stays exactly as it is; MCP keys are orthogonal.
- **The hashed-credential pattern is established.**
  `supabase/migrations/20260902000001_create_invite_codes.sql` denies a
  credential table to `anon` and `authenticated` via RLS-with-zero-policies
  plus an explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, and
  documents why the `PUBLIC` grantee must be revoked separately. MCP keys
  follow it.
- **Document reads already surface extracted fields.**
  `GET /documents/{id}/metadata` calls `_merge_base_extraction_fields`
  (`judgments_pkg/__init__.py:380`), and `_extract_base_fields` /
  `_extract_extraction_fields` project the base-schema columns stored by
  `supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql`.
  `get_extracted_fields` reuses these; no new accessor is needed.
- **Search orchestration is not reusable yet.** The hybrid pipeline lives
  inside the route handler `search_documents`
  (`judgments_pkg/__init__.py:544`), with helpers in
  `judgments_pkg/search.py` (`_run_hybrid_search`, `_rerank_if_enabled`,
  `_build_search_result_payload`, …). There is no function an MCP tool can
  call. Extracting one is part of this spec's scope.

### Decisions already taken

| Decision | Choice | Why |
|---|---|---|
| Audience | Public, hosted, per-user token | Reach beyond the local machine; a user's own collections must be addressable |
| Credential | Own long-lived API keys, Bearer | OAuth 2.1 (what the MCP spec asks for remote HTTP) is a project of its own; keys ship now behind a seam that OAuth can replace |
| Placement | One package, two entrypoints | Production mounts the tools into the existing FastAPI app; a stdio entrypoint serves local development. Extraction to a separate service later is an entrypoint change, not a rewrite |

The rejected alternative was a separate container talking to the backend
over HTTP. It buys blast-radius isolation but costs a new required service
in `scripts/deploy_prod.sh` health checks, a second network hop, and
duplicated models — while the backend still needs the per-user principal
either way. Isolation can be revisited when agent traffic is measurable.

## Scope

### Phase 0 — long-lived MCP keys

**Migration** `supabase/migrations/<ts>_create_mcp_api_keys.sql`:

```
mcp_api_keys
  id            uuid        primary key default gen_random_uuid()
  user_id       uuid        not null references auth.users(id) on delete cascade
  token_hash    text        not null unique      -- sha256 of the full key
  prefix        text        not null             -- first 8 chars, display only
  name          text
  scopes        text[]      not null default '{search:read}'
  created_at    timestamptz not null default now()
  last_used_at  timestamptz
  expires_at    timestamptz
  revoked_at    timestamptz
```

- Index on `token_hash` (the unique constraint provides it) and on
  `user_id` for the list endpoint.
- RLS enabled with zero policies, plus
  `REVOKE ALL ON public.mcp_api_keys FROM PUBLIC, anon, authenticated`.
  Holding the anon key must never reveal or consume a credential; the
  frontend reads keys only through the backend, never through PostgREST.
- A table comment stating that rule, following the invite-codes precedent.

**Key format:** `jdg_mcp_` + 32 random bytes, base64url, from
`secrets.token_urlsafe`. Only `sha256(key)` is stored. The plaintext is
returned exactly once, at creation, and is not recoverable afterwards.

**`backend/app/core/auth_mcp.py`:**

- `hash_mcp_key(token) -> str` — sha256 hex.
- `resolve_mcp_principal(token) -> AuthenticatedUser | None` — rejects a
  token without the `jdg_mcp_` prefix without touching the database; looks
  up by hash via the admin client; rejects `revoked_at IS NOT NULL` and
  `expires_at <= now()`; returns an `AuthenticatedUser` carrying `user_id`,
  an empty `raw_token`, and the key's `scopes`.
- `get_current_user_or_mcp_key` — FastAPI dependency. A Bearer value with
  the `jdg_mcp_` prefix takes the key path; anything else falls through to
  the existing JWT path. One branch point, two credentials, one output
  class.
- `last_used_at` is updated through `BackgroundTasks`, throttled to at most
  one write per key per five minutes. Without the throttle every tool call
  becomes a database write.

**`backend/app/mcp_keys.py`** — router at `/mcp/keys`:

- `POST /mcp/keys` — body `{name, expires_at?, scopes?}`; returns the
  plaintext key once alongside its metadata.
- `GET /mcp/keys` — returns `id`, `name`, `prefix`, `scopes`,
  `created_at`, `last_used_at`, `expires_at`, `revoked_at`. Never a hash,
  never a plaintext.
- `DELETE /mcp/keys/{id}` — sets `revoked_at`. Rows are never deleted, so
  the audit trail survives.

All three depend on `get_current_user` — **JWT only**. An MCP key cannot
mint or revoke another MCP key; that closes the privilege-escalation path a
leaked key would otherwise open. Every mutation is recorded through
`log_audit_background` (`app/services/audit_service.py`).

**Frontend** — an "MCP access" section in `frontend/app/settings/page.tsx`:
the key list, a create flow whose dialog shows the plaintext once with a
copy button and a warning that it will not be shown again, and a revoke
action with confirmation. Built from `@/components/editorial` primitives per
`docs/reference/DESIGN.md`. This change arms the `Stop` hook
(`scripts/verify-frontend-evidence.sh`), so the plan must run the
**frontend-verify** skill and add a route-contract spec under
`frontend/tests/route-contract-e2e/`.

### Phase 1 — the server and three tools

**Dependency:** `mcp` (the Python SDK, FastMCP) added to
`backend/pyproject.toml` at an **exact** pinned version — the SDK's API has
moved between minor releases. `poetry lock` runs and both files are
committed, or CI fails on `poetry check --lock`.

**Refactor, no behavior change:** extract the body of `search_documents`
(`judgments_pkg/__init__.py:544`) into
`run_document_search(request: SearchChunksRequest) -> SearchChunksResponse`
in `judgments_pkg/search.py`. The route becomes a thin wrapper over it; the
facets-only fast path moves with the rest. Existing search tests are the
guard — they must pass unchanged, with no edits to assertions. The MCP tool
then calls `run_document_search`, so HTTP and MCP share one pipeline and
cannot drift.

**Package** `backend/packages/juddges_mcp`, installed editable through
Poetry like `juddges_search` and `schema_generator_agent`:

```
juddges_mcp/
  principal.py    # ContextVar[AuthenticatedUser]; get_principal() raises if unset
  tools/search.py # search_judgments
  tools/judgment.py # get_judgment, get_extracted_fields
  server.py       # build_server() -> FastMCP, registers the tools
  http.py         # ASGI app, mounted at /mcp in app/server.py
  stdio.py        # local development entrypoint
```

The tool functions know nothing about transport: they read the principal
from the context variable and call `run_document_search` /
`get_vector_db().get_document_by_id`. `http.py` reads the `Authorization`
header, calls `resolve_mcp_principal`, sets the context variable, and
returns 401 when no principal resolves. `stdio.py` takes the key from an
environment variable for local use.

**Tool contracts:**

| Tool | Input | Output |
|---|---|---|
| `search_judgments` | `query`; optional `jurisdiction`, `court`, `date_from`, `date_to`; `limit` (default 10, max 25) | per hit: `id`, `court`, `case_number`, `judgment_date`, `jurisdiction`, `url`, `snippet`, `score` |
| `get_judgment` | `id`, optional `section` | metadata plus full text, or the named section alone |
| `get_extracted_fields` | `id` | the stored base-schema fields, projected by `_extract_base_fields` / `_extract_extraction_fields` |

Response size is a design constraint, not a detail. `search_judgments`
returns snippets and citations only — never full texts; a tool that returns
ten complete judgments fills the client's context window and is useless in
practice. Full text is reachable only through `get_judgment` on an id the
caller chose. Each hit carries a citation sufficient to verify it against
the public record, which is the property the competing servers advertise and
which our stored metadata already supports.

**Rate limiting:** a per-key bucket through
`rate_limiter.hit_with_fallback`, separate from the UI's buckets, so agent
traffic cannot exhaust an interactive user's budget. Limits are read from
settings, not hard-coded.

**Documentation:** `docs/how-to/mcp-server.md` (generate a key, wire the
server into a client) and `docs/reference/mcp-tools.md` (the tool
contracts).

## Acceptance criteria

Phase 0:

1. A signed-in user can create, list and revoke MCP keys from `/settings`;
   the plaintext appears exactly once and is not retrievable afterwards.
2. `SELECT` on `mcp_api_keys` with the anon key fails, and the
   `redeem`-style RPC surface does not exist for this table.
3. A request bearing a valid MCP key reaches an endpoint depending on
   `get_current_user_or_mcp_key` and resolves to the key's owner.
4. A revoked or expired key is rejected with 401.
5. A request bearing an MCP key to any `/mcp/keys` endpoint is rejected.
6. Creating and revoking a key each write an audit record.

Phase 1:

7. `search_judgments` through the MCP transport returns the same ordering
   and the same hits as `POST /documents/search` for the same query and
   filters.
8. `search_judgments` never returns a full judgment text, and honours the
   `limit` cap of 25.
9. `get_judgment` and `get_extracted_fields` return 404-equivalent tool
   errors for an unknown id, and never leak another user's data (both read
   the shared corpus; the assertion is that no user-scoped table is
   touched).
10. Exceeding the per-key rate limit returns a tool error naming the limit,
    and does not consume the UI's bucket.
11. `/openapi.json` is unchanged by mounting `/mcp`, verified against the
    committed snapshot.
12. The stdio entrypoint serves the same three tools as the HTTP mount.

## Test plan

- **Unit, phase 0:** `hash_mcp_key` stability; `resolve_mcp_principal` for
  valid, wrong-prefix, unknown-hash, revoked, and expired keys;
  `get_current_user_or_mcp_key` routing for a JWT value and a key value;
  the `last_used_at` throttle (two calls inside the window produce one
  write).
- **Unit, phase 1:** each tool against a faked `run_document_search` and a
  faked document accessor — argument mapping, the `limit` cap, snippet-only
  output, error shape for a missing id, missing-principal failure.
- **Contract:** `/mcp/keys` rejects MCP-key auth (criterion 5); the
  committed OpenAPI snapshot is unchanged (criterion 11) — regenerate with
  `scripts/regen_openapi_types.sh` only if the diff is explained.
- **Regression guard for the refactor:**
  `backend/tests/app/test_documents_search.py` runs unchanged against the
  rewired route. An edited assertion in that suite means the refactor
  changed behavior and must be reworked, not the test.
- **Database Contract** check picks up the new table.
- **Frontend:** a route-contract spec under
  `frontend/tests/route-contract-e2e/` covering the key list, the
  create-and-reveal-once flow, and revoke; the **frontend-verify** skill
  seals the evidence marker.
- **Live, read-only:** one check added to `backend/tests/e2e_live/cases.py`
  exercising `search_judgments` over the real stack, in the style of the
  five existing search checks (`poe e2e-live`).

## Out of scope

- **OAuth 2.1 / dynamic client registration.** The seam is
  `resolve_mcp_principal`; replacing it with an OAuth token introspection
  is a later, separate project.
- **`compare_across_jurisdictions`** — phase 2. It carries real retrieval
  logic and will need quality iteration; see
  `docs/superpowers/specs/2026-09-20-pl-uk-compare-design.md` for prior
  work on PL↔UK comparison to build on.
- **Collections and export tools** — phase 3, the first writing tools.
  They need scope enforcement in the key and audit coverage, and should
  reuse `POST /collections/from-filter`
  (`app/collections_from_filter.py`).
- **A public, unauthenticated tier.** Every tool here requires a key.
- **A separate container for the MCP server.** Revisit when agent traffic
  is measurable.
- **Listing on Glama / PulseMCP.** A distribution decision, not an
  engineering one, and premature before OAuth.

## Risks

1. **`/mcp` is a mounted ASGI sub-app, not a router.** If it leaks into
   `/openapi.json`, every tool signature change trips the OpenAPI Type
   Drift check. Criterion 11 pins this; verify it in the first task that
   mounts the app, not at the end.
2. **MCP Python SDK churn.** Pin exactly; a caret range will break the
   build on an upstream minor release.
3. **Response token budget.** The real product constraint on tool design.
   Treat the snippet-only rule and the `limit` cap as requirements, not
   tuning.
4. **Agent traffic shares the backend's worker pool.** Per-key rate
   limiting is the mitigation in phase 1; container separation is the
   escalation if it proves insufficient.
5. **A leaked key is a long-lived bearer credential.** Mitigations in
   scope: hash-at-rest, revocation, optional expiry, `last_used_at` for
   detection, and the rule that a key cannot mint another key.

## Dependencies and links

- Landscape research: `.context/research/2026-09-21-legal-mcp-landscape.md`
- Hashed-credential precedent:
  `supabase/migrations/20260902000001_create_invite_codes.sql`
- Base-schema extractions:
  `supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql`,
  `docs/reference/base-schema-filter-api.md`
- Existing auth: `backend/app/core/auth_jwt.py`, `backend/app/auth.py`
- Search pipeline: `backend/app/judgments_pkg/__init__.py`,
  `backend/app/judgments_pkg/search.py`
- Prior PL↔UK work:
  `docs/superpowers/specs/2026-09-20-pl-uk-compare-design.md`
- Design system: `docs/reference/DESIGN.md`
