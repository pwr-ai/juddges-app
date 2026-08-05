# Schema Detail HTTP Status Design

- **Date:** 2026-08-05
- **Updated:** 2026-08-06
- **Status:** Approved design for issue #409
- **Branch:** `fix/409-schemas-real-404`
- **Affected surface:** `/schemas/[id]` and `/api/schemas/[id]`

## 1. Problem and goals

The schema detail page used to fetch its resource only after a successful HTTP
200 page response. Missing, hidden, and failed reads therefore showed a client
error card under the wrong status. The detail BFF also did not keep all auth,
upstream, and not-found outcomes distinct.

Issue #409 must:

- return a real 404 for invalid, missing, and RLS-hidden schemas;
- preserve real 401, 403, 500, 502, 503, and 504 failures;
- render failures inside the application design system, with retry and back
  actions, instead of returning hand-written HTML;
- keep invalid, missing, and hidden API 404 responses exactly identical and
  free of identifiers and upstream diagnostics;
- perform one primary RLS-scoped schema lookup per successful page request;
- enrich the creator email with at most one controlled, best-effort lookup;
- hydrate the client from verified server data without another detail fetch;
- preserve all existing owner and shared actions.

## 2. Non-goals

- No FastAPI endpoint, Supabase migration, or RLS-policy change.
- No service-role lookup to distinguish missing from RLS-hidden rows.
- No change to list, create, update, delete, versions, or statistics APIs.
- No general loader framework for unrelated resources.
- No redesign of the schema detail interface.

## 3. Implemented architecture

| Unit | Path | Responsibility |
|---|---|---|
| Transport contract | `frontend/lib/schemas/detail-transport.ts` | Canonical UUID validation, payload validation, internal header names, and HMAC signing/verification bound to user, route, and payload. |
| RLS-scoped reader | `frontend/lib/server/schema-detail.ts` | Read one visible schema with the user's bearer token, classify upstream outcomes, validate the payload, and optionally enrich the creator email. |
| Session middleware | `frontend/lib/supabase/middleware.ts` | Verify/refresh the Supabase session, strip all caller-supplied internal schema headers, allow exact single-segment schema API reads to reach their handler, and keep nested/lookalike routes protected. |
| Root middleware | `frontend/middleware.ts` | Preflight exact schema page reads, preserve real statuses, inject a signed success snapshot, or inject a sanitized failure status. |
| Server page | `frontend/app/schemas/[id]/page.tsx` | Reject noncanonical IDs, verify the middleware proof, decode the snapshot, and choose the success or styled failure component. |
| Client view | `frontend/app/schemas/[id]/client.tsx` | Render the supplied schema and preserve interactive actions without an initial fetch. |
| Failure view | `frontend/components/schemas/SchemaDetailFailure.tsx` | Render the application `ErrorCard` with retry and back actions. |
| BFF route | `frontend/app/api/schemas/[id]/route.ts` | Validate first, authenticate independently, invoke the RLS reader, and map results to stable JSON/status responses. |

### 3.1 Page request flow

```text
GET or HEAD /schemas/[id]
  -> session middleware verifies/refreshes the user and strips internal headers
  -> root middleware validates the exact route and preflights the schema
     -> invalid, missing, or RLS-hidden: rewrite to unmatched app route, status 404
     -> 401/403/500/502/503/504: continue with the same status and a trusted
        internal failure-status header
     -> success: sign {user, path, encoded schema} and continue
  -> server page
     -> failure header: render SchemaDetailFailure inside the app shell
     -> valid HMAC snapshot: render SchemaDetailClient(initialSchema)
     -> missing/forged proof: throw; never trust caller headers
```

The 404 rewrite targets `/__schema-not-found`, which deliberately has no route.
Next.js therefore renders the application's existing `not-found.tsx` while the
middleware preserves HTTP 404. Other known failures use `NextResponse.next`
with the original status so the page can render the styled retry surface at the
requested URL. The middleware strips the failure and snapshot headers before
setting its own values.

The HMAC uses `BACKEND_API_KEY` and covers the user ID, pathname, and encoded
schema. A snapshot cannot be moved to another user or route or modified without
invalidating its signature.

### 3.2 Data lookup and creator enrichment

`fetchSchemaDetail` uses `NEXT_PUBLIC_SUPABASE_URL`, the anon key, and the
verified user's bearer token. It never uses the service-role key.

The primary request is one `extraction_schemas` query with the canonical ID and
`limit=1`:

| Upstream outcome | Public status |
|---|---:|
| One valid, matching row | 200 |
| Empty result, including RLS-hidden row | 404 |
| Upstream 401 | 401 |
| Upstream 403 | 403 |
| Upstream 5xx | Preserved 5xx |
| Other failed upstream response | 502 |
| Transport failure | 503 |
| Timeout | 504 |
| Invalid or malformed success payload | 502 |

After a confirmed schema, the reader may perform one `user_profiles` request
for `select=email&id=eq.<creator>&limit=1`, using the same user-scoped bearer
token. A missing, hidden, malformed, failed, or timed-out profile lookup is
best-effort: it is logged without credentials and the confirmed schema remains
successful without `user.email`. A schema without `user_id` skips enrichment.

### 3.3 API request flow

Exact GET/HEAD requests matching `/api/schemas/<single-segment>` bypass the
generic login redirect and reach the route handler. This applies to canonical
and invalid segments so validation runs before authentication:

- invalid single segment: 404 without any auth or schema query;
- canonical anonymous request: 401 from the route handler;
- nested or lookalike path: remains behind the normal authentication redirect.

The handler verifies the user and bearer token independently, then invokes
`fetchSchemaDetail`. All responses are `private, no-store`. `HEAD` returns the
same status and headers as `GET`, with no body. Unsupported methods return 405
with `Allow: GET, HEAD`.

The 404 body is one constant for invalid, missing, and RLS-hidden IDs:

```json
{
  "error": "SCHEMA_NOT_FOUND",
  "message": "Schema not found",
  "code": "SCHEMA_NOT_FOUND"
}
```

It contains no rejected ID, resource ID, RLS detail, or upstream message.

## 4. Client behavior contract

`SchemaDetailClient` receives `initialSchema: ExtractionSchema` and performs no
detail fetch during hydration. It preserves:

- owner-only Edit and Delete;
- shared Duplicate, Export, and Configure Extraction actions;
- raw, YAML, table, and preview views;
- delete confirmation and existing delete request;
- creator and timestamp metadata.

## 5. Tests

| Contract | Test path | Evidence |
|---|---|---|
| RLS reader and enrichment | `frontend/__tests__/lib/server/schema-detail.test.ts` | ID validation, one primary read, upstream status mapping, payload validation, zero/one creator lookup, optional enrichment failures. |
| API mapping | `frontend/__tests__/app/api/schemas/[id]/route.test.ts` | Exact 200/401/403/404/5xx, identical 404 bodies, HEAD, cache headers, and 405 methods. |
| Session routing | `frontend/tests/unit/lib/supabase/middleware.test.ts` | Anonymous canonical/invalid/dotted single segments reach the handler; nested paths redirect; caller proof headers are stripped. |
| Page preflight | `frontend/__tests__/middleware/schema-detail.test.ts` | One primary preflight, one controlled profile lookup, signed proof replacement, real statuses, cookies, 405, and encoded aliases. |
| Server page | `frontend/__tests__/app/schemas/[id]/page.test.tsx` | Signed success snapshot, trusted failure statuses, invalid IDs, and missing/forged proof rejection. |
| Failure surface | `frontend/__tests__/app/schemas/[id]/failure-surface.test.tsx` | Application `ErrorCard`, Retry, and Back to Schemas. |
| Client behavior | `frontend/__tests__/app/schemas/[id]/client.test.tsx` | Owner/non-owner controls, shared actions, creator rendering, and no hydration fetch. |
| Production contract | `frontend/tests/unit/app/schemas/http-status-contract.test.ts` | Real Next production build and standalone server: page/API statuses, application surfaces, auth redirects, exact 404 equality, HEAD/405, spoof resistance, cookie refresh, profile enrichment, and one primary successful lookup. |

## 6. Verification commands

```bash
cd frontend
npm test -- --runInBand --runTestsByPath \
  '__tests__/lib/server/schema-detail.test.ts' \
  '__tests__/app/api/schemas/[id]/route.test.ts' \
  '__tests__/middleware/schema-detail.test.ts' \
  '__tests__/app/schemas/[id]/page.test.tsx' \
  '__tests__/app/schemas/[id]/failure-surface.test.tsx' \
  '__tests__/app/schemas/[id]/client.test.tsx' \
  'tests/unit/lib/supabase/middleware.test.ts'

npm test -- --runInBand --runTestsByPath \
  'tests/unit/app/schemas/http-status-contract.test.ts'

npm run validate
npm test -- --runInBand

git -C /home/laugustyniak/github/legal-ai/juddges-app/.worktrees/fix-409-schemas-real-404 diff --check
```

Passing only component tests or finding error text inside an HTTP-200 document
is not sufficient. Completion requires the standalone production matrix plus
the full frontend validation and Jest suites.

## 7. Scope and follow-on

This issue is schema-specific even though it necessarily touches the root and
session middleware to establish the real page status before App Router render.
It does not change chat, collection, document, or extraction loaders.

Issue #410 should reuse the verified principles, not the schema code: its own
typed reader, ownership checks, exact upstream status mapping, server-provided
initial data, and independent tests/worktree. It must not be bundled into #409.
