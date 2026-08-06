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
- perform one explicitly projected, user-scoped full read in middleware before
  selecting the page response status;
- enrich the creator email with at most one controlled, best-effort lookup;
- keep the server render free of auth and schema reads after middleware has
  selected the response status;
- load the interactive detail through the existing authenticated BFF after
  hydration, with explicit loading and error states;
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
| RLS-scoped reader | `frontend/lib/server/schema-detail.ts` | Read only the explicit fields required by the UI with the user's bearer token, classify upstream outcomes, validate/project the payload, and optionally enrich the creator email. |
| Session middleware | `frontend/lib/supabase/middleware.ts` | Verify/refresh the Supabase session, strip all caller-supplied internal schema headers, allow exact single-segment schema API reads to reach their handler, and keep nested/lookalike routes protected. |
| Root middleware | `frontend/middleware.ts` | Perform the single full schema read for exact page requests, preserve real statuses, inject only a bounded signed ID proof, or inject a sanitized failure status. |
| Server page | `frontend/app/schemas/[id]/page.tsx` | Reject noncanonical IDs, verify the middleware proof, and choose the client loader or styled failure component without another auth or schema read. |
| Client loader | `frontend/app/schemas/[id]/loader.tsx` | Load the detail through the existing authenticated BFF after hydration and expose explicit loading and error states. |
| Client view | `frontend/app/schemas/[id]/client.tsx` | Render the loaded schema and preserve all interactive actions. |
| Failure view | `frontend/components/schemas/SchemaDetailFailure.tsx` | Render the application `ErrorCard` with retry and back actions. |
| BFF route | `frontend/app/api/schemas/[id]/route.ts` | Validate first, authenticate independently, invoke the RLS reader, and map results to stable JSON/status responses. |

### 3.1 Page request flow

```text
GET or HEAD /schemas/[id]
  -> session middleware verifies/refreshes the user and strips internal headers
  -> root middleware validates the exact route and reads the full schema once
     through the explicit RLS-scoped projection
     -> invalid, missing, or RLS-hidden: rewrite to unmatched app route, status 404
     -> 401/403/500/502/503/504: continue with the same status and a trusted
        internal failure-status header
     -> success: sign {user, path, bounded schema-ID proof} and continue
  -> server page
     -> failure header: render SchemaDetailFailure inside the app shell
     -> valid HMAC proof: render SchemaDetailLoader(schemaId) without calling
        getUser, getSession, or the schema reader
     -> missing/forged proof: throw; never trust caller headers
  -> hydrated client loader
     -> call the existing authenticated schema BFF
     -> render SchemaDetailClient(initialSchema), an explicit loading state, or
        an application failure surface
```

The 404 rewrite targets `/__schema-not-found`, which deliberately has no route.
Next.js therefore renders the application's existing `not-found.tsx` while the
middleware preserves HTTP 404. Other known failures use `NextResponse.next`
with the original status so the page can render the styled retry surface at the
requested URL. The middleware strips the failure and snapshot headers before
setting its own values.

The HMAC uses `BACKEND_API_KEY` and covers the user ID, pathname, and a bounded
proof containing only the canonical schema ID. A proof cannot be moved to
another user or route or modified without invalidating its signature. The full
schema definition is deliberately never copied into a request header.

### 3.2 Data lookup and creator enrichment

`fetchSchemaDetail` uses `NEXT_PUBLIC_SUPABASE_URL`, the anon key, and the
verified user's bearer token. It never uses the service-role key. Middleware
invokes it exactly once before choosing the page status, with an explicit
projection of the fields used by the UI:
`id,name,description,type,category,text,dates,status,is_verified,created_at,updated_at,user_id`.
The read remains subject to RLS. The server page does not repeat auth or schema
lookups after middleware has selected HTTP 200, so a later render-time failure
cannot mask an upstream 503 behind a successful page status.

Real legal schema JSON is known to reach about 147 KB, which is valid
application data but far beyond a safe HTTP request header budget. Middleware
therefore discards the full value after status classification and signs only
the canonical ID. The proof remains at most 512 bytes and never carries schema
text, names, descriptions, creator data, or future database columns. A
process-local cache is deliberately not used because middleware and rendering
may execute in different runtimes or instances.

After hydration, the client loader obtains the display payload through the
existing BFF. That request authenticates and applies RLS independently. Its
loading or failure UI is an application state after a legitimately successful
initial preflight; it does not participate in selecting the initial page HTTP
status.
Future database columns are excluded by both the PostgREST projection and an
explicit object projection before the schema crosses the server boundary.

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

`SchemaDetailLoader` receives the verified canonical schema ID, fetches the
existing BFF after hydration, and renders an explicit loading or application
failure state until a valid `ExtractionSchema` is available.

`SchemaDetailClient` then receives `initialSchema: ExtractionSchema` and
preserves:

- owner-only Edit and Delete;
- shared Duplicate, Export, and Configure Extraction actions;
- table and preview views, plus the existing JSON export action;
- raw JSON and YAML tabs remain hidden/disabled and are not promised by this
  contract;
- delete confirmation and existing delete request;
- creator and timestamp metadata.

## 5. Tests

| Contract | Test path | Evidence |
|---|---|---|
| RLS reader and enrichment | `frontend/__tests__/lib/server/schema-detail.test.ts` | ID validation, exact UI projection, large valid payloads, future-column exclusion, upstream status mapping, zero/one creator lookup, and optional enrichment failures. |
| API mapping | `frontend/__tests__/app/api/schemas/[id]/route.test.ts` | Exact 200/401/403/404/5xx, identical 404 bodies, HEAD, cache headers, and 405 methods. |
| Session routing | `frontend/tests/unit/lib/supabase/middleware.test.ts` | Anonymous canonical/invalid/dotted single segments reach the handler; nested paths redirect; caller proof headers are stripped. |
| Page preflight | `frontend/__tests__/middleware/schema-detail.test.ts` | One full explicitly projected preflight, bounded signed proof replacement, large valid payload handling, real statuses, cookies, 405, and encoded aliases. |
| Server page | `frontend/__tests__/app/schemas/[id]/page.test.tsx` | Signed ID proof, zero auth/schema reads after preflight, trusted failure statuses, invalid IDs, and missing/forged proof rejection. |
| Client loader | `frontend/__tests__/app/schemas/[id]/loader.test.tsx` | Existing BFF success, explicit loading and failure UI, and no trust in unvalidated response data. |
| Failure surface | `frontend/__tests__/app/schemas/[id]/failure-surface.test.tsx` | Application `ErrorCard`, Retry, and Back to Schemas. |
| Client behavior | `frontend/__tests__/app/schemas/[id]/client.test.tsx` | Owner/non-owner controls, shared actions, and creator rendering. |
| Production contract | `frontend/tests/unit/app/schemas/http-status-contract.test.ts` | Real Next production build and standalone server: page/API statuses, application surfaces, auth redirects, exact 404 equality, HEAD/405, spoof resistance, cookie refresh, and exactly one full page preflight before HTTP 200. |

## 6. Verification commands

```bash
cd frontend
npm test -- --runInBand --runTestsByPath \
  '__tests__/lib/server/schema-detail.test.ts' \
  '__tests__/app/api/schemas/[id]/route.test.ts' \
  '__tests__/middleware/schema-detail.test.ts' \
  '__tests__/app/schemas/[id]/page.test.tsx' \
  '__tests__/app/schemas/[id]/loader.test.tsx' \
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
