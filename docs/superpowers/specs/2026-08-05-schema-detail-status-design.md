# Schema Detail HTTP Status Design

- **Date:** 2026-08-05
- **Status:** Approved design for issue #409
- **Branch:** `fix/409-schemas-real-404`
- **Affected surface:** `/schemas/[id]` and `GET /api/schemas/[id]`

## 1. Problem

`frontend/app/schemas/[id]/page.tsx` is currently a client component. It first
returns a successful page response, then fetches `/api/schemas/[id]` in an
effect. Missing schemas and load failures therefore render an error card under
HTTP 200 instead of producing a server-side status.

The BFF also collapses every failed `extraction_schemas` query into 404. A row
hidden by Row Level Security and a genuinely missing row should be
indistinguishable, but an explicit permission rejection and an unexpected
database or authentication failure must remain distinct. The current route
cannot make that distinction.

## 2. Goals

- Return a real HTTP 404 for an invalid, missing, or RLS-hidden schema detail
  request.
- Preserve successful schema detail rendering and all existing client actions.
- Give the BFF an exact, tested 200/401/403/404/500 contract.
- Keep unexpected authentication and primary schema-query failures separate
  from not-found.
- Load the schema before rendering the page so the initial document has the
  correct status and successful data is not fetched again after hydration.
- Put ID validation, authentication, schema lookup, error classification, and
  optional profile enrichment behind one typed server-only boundary shared by
  the page and BFF.
- Keep all detail responses private and non-cacheable.

## 3. Non-goals

- No backend schema endpoint or FastAPI change.
- No Supabase migration, RLS-policy change, or schema-table change.
- No middleware prefetch, request-header snapshot, signed payload, or change to
  `frontend/middleware.ts` or `frontend/lib/supabase/middleware.ts`.
- No redesign of schema cards, schema studio, deletion, duplication, export,
  or extraction configuration.
- No change to `GET /api/schemas`, schema create/update/delete endpoints, schema
  versions, or schema statistics.
- No generic detail-loader framework shared with chats, collections,
  documents, or extractions.
- No retry policy or background polling in this issue.

## 4. Architecture

### 4.1 Files and responsibilities

| Unit | Path | Responsibility |
|---|---|---|
| Server detail loader | `frontend/lib/server/schema-detail.ts` | Validate the ID, verify the Supabase user, read the visible schema, classify all outcomes, and optionally enrich the successful schema with the creator email. This is the only module allowed to interpret Supabase detail-read errors. |
| Server page | `frontend/app/schemas/[id]/page.tsx` | Await the loader, call `notFound()` only for `not_found`, throw non-not-found failures, and render the client component for `ok`. |
| Client detail view | `frontend/app/schemas/[id]/SchemaDetailClient.tsx` | Receive the successful schema as a prop and preserve the current interactive detail UI and actions. It does not perform the initial detail fetch. |
| BFF route | `frontend/app/api/schemas/[id]/route.ts` | Call the same loader and translate its typed result into the exact JSON/status contract. It contains no independent Supabase classification logic. |
| Loader tests | `frontend/__tests__/lib/server/schema-detail.test.ts` | Pin ID, auth, Supabase, enrichment, and result-union semantics. |
| BFF tests | `frontend/__tests__/app/api/schemas/[id]/route.test.ts` | Pin exact status, body, cache header, and no-query behavior. |
| Page tests | `frontend/__tests__/app/schemas/[id]/page.test.tsx` | Pin server branching and successful client handoff. |
| Production HTTP contract | `frontend/tests/integration/schemas/detail-production.test.ts` | Build and start Next in production mode against controlled Supabase test doubles and assert actual HTTP statuses. |

The existing `ExtractionSchema` type in
`frontend/types/extraction_schemas.ts` remains the successful data contract.
No parallel schema-detail DTO is introduced.

### 4.2 Typed loader result

The loader returns a discriminated union rather than throwing expected
outcomes:

```ts
export type SchemaDetailResult =
  | { kind: 'ok'; schema: ExtractionSchema }
  | {
      kind: 'not_found';
      reason: 'invalid_id' | 'missing_or_hidden';
    }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | {
      kind: 'failure';
      status: 500;
      reason: 'authentication' | 'database';
    };
```

The public loader signature is:

```ts
export async function loadSchemaDetail(
  schemaId: string,
): Promise<SchemaDetailResult>;
```

The module is server-only and uses `createClient()` from
`frontend/lib/supabase/server.ts`. Callers never inspect PostgREST error codes
themselves.

### 4.3 Request flow

```text
GET /schemas/[id]
        |
        v
async server page
        |
        v
loadSchemaDetail(id) ---- invalid/missing/RLS-hidden ---> notFound() ---> 404
        |
        +-------------- unauthenticated/forbidden/failure ---> throw ---> error response
        |
        `-------------- ok(schema) ---> SchemaDetailClient(schema) ---> 200

GET /api/schemas/[id]
        |
        v
loadSchemaDetail(id)
        |
        `-------------- typed result ---> exact JSON + 200/401/403/404/500
```

The page and BFF may be requested independently, but each request performs at
most one primary schema lookup. A successful page render passes the loaded
schema into the client component, so hydration does not trigger a second BFF
request.

## 5. Classification contract

### 5.1 ID

Schema detail IDs are canonical UUIDs. Validation happens before creating the
Supabase client.

- A canonical UUID continues to authentication and lookup.
- An empty, malformed, encoded-slash, overlong, or non-canonical ID returns
  `not_found` with reason `invalid_id`.
- Invalid IDs do not call Supabase Auth or PostgREST.
- Both page and BFF expose invalid IDs as 404. The response does not echo the
  rejected value.

This keeps dynamic page lookup non-enumerable and avoids a separate 400
contract not requested by #409.

### 5.2 Authentication

- A verified Supabase user continues to the schema query.
- Missing user data, an absent session, an expired credential, or a recognized
  invalid-session error returns `unauthenticated`.
- A thrown auth lookup, retryable auth transport error, or auth-service 5xx
  returns `failure` with reason `authentication`; it must not be reported as an
  anonymous caller.
- The BFF maps `unauthenticated` to 401 and authentication failure to 500.
- Page requests without a valid session continue to be redirected by the
  existing middleware to `/auth/login?next=/schemas/<id>`. This design does not
  alter that redirect boundary. If middleware cannot verify a user, it may
  redirect before the server page or BFF runs; the exact 401 and auth-failure
  500 contracts in this design apply to the BFF handler once invoked and are
  pinned by direct handler tests.

### 5.3 Primary schema query

The query reads one visible row from `extraction_schemas` by ID using
`maybeSingle()` semantics.

| Supabase outcome | Loader result | BFF status | Page behavior |
|---|---|---:|---|
| Row returned | `ok` | 200 | Render client detail |
| `data: null`, no error | `not_found: missing_or_hidden` | 404 | `notFound()` |
| No-row error such as `PGRST116` | `not_found: missing_or_hidden` | 404 | `notFound()` |
| Explicit insufficient-privilege result such as PostgreSQL `42501` or an authenticated query status 403 | `forbidden` | 403 | Throw as a non-not-found failure |
| Any other PostgREST/database error | `failure: database` | 500 | Throw as a non-not-found failure |

Missing rows and rows hidden by RLS deliberately share one result and response.
The loader must not use a service-role client to distinguish them.

The current `BACKEND_API_KEY` check is removed from this detail path because
the detail read does not call FastAPI. Missing backend configuration must not
turn a valid Supabase detail request into 500.

### 5.4 Optional creator profile enrichment

After the primary schema is available, the loader may read the matching
`user_profiles.email` and add `user: { email }` to the returned schema.

- A found email is included.
- Missing profile data, an RLS-hidden profile, or a profile-query failure is
  logged without raw credentials and returns `ok` without `user.email`.
- Optional enrichment never changes a confirmed schema from 200 to 404 or 500.

This preserves the current best-effort display behavior while making the
primary resource contract strict.

## 6. Server page and client boundary

`frontend/app/schemas/[id]/page.tsx` becomes an async server component with
`dynamic = 'force-dynamic'` and `revalidate = 0`.

Its branching is exhaustive:

- `ok`: render `SchemaDetailClient` with the loaded schema.
- `not_found`: call `notFound()`.
- `unauthenticated`, `forbidden`, or `failure`: throw a typed server error.
  These outcomes must never call `notFound()` or render the old missing-schema
  error card.

The production status guarantee for this issue is 404 only for the
`not_found` branch. Unexpected auth/database failures remain real server
failures rather than false 404s. Exact 401 and 403 are BFF contracts; normal
page authentication continues to be enforced by the existing redirecting
middleware.

`SchemaDetailClient` receives:

```ts
interface SchemaDetailClientProps {
  initialSchema: ExtractionSchema;
}
```

It initializes its schema state from `initialSchema` and keeps the existing:

- owner-only edit and delete controls;
- duplicate action;
- export action;
- configure-extraction navigation;
- raw, YAML, table, and preview views;
- delete confirmation and deletion error handling;
- creator and timestamp metadata.

The initial loading state, initial `useEffect`, `useParams()`, and initial
`fetch('/api/schemas/<id>')` are removed. No successful page load performs a
hydration refetch. Delete remains routed through the existing
`DELETE /api/schemas?id=<id>` contract.

## 7. BFF response contract

All BFF responses set `Cache-Control: private, no-store`.

| Case | Status | Stable body requirements |
|---|---:|---|
| Success | 200 | Enriched `ExtractionSchema` |
| Missing/expired session | 401 | `code: "UNAUTHORIZED"`; no schema ID disclosure |
| Explicit permission rejection | 403 | `code: "FORBIDDEN"`; generic access-denied message |
| Invalid, missing, or RLS-hidden schema | 404 | `code: "SCHEMA_NOT_FOUND"`; same body for all three |
| Unexpected auth or primary database failure | 500 | `code: "INTERNAL_ERROR"`; generic message with no upstream diagnostics |

Logs may include request ID, outcome kind, and safe Supabase error code. They
must not include cookies, access tokens, service keys, query payloads, or raw
database messages.

## 8. Test matrices

### 8.1 Loader unit matrix

`frontend/__tests__/lib/server/schema-detail.test.ts` covers:

| Input/fixture | Expected result | Required side-effect assertion |
|---|---|---|
| Invalid ID | `not_found: invalid_id` | No auth or table query |
| Valid ID, verified user, visible row | `ok` | One primary lookup |
| Valid ID, no user | `unauthenticated` | No table query |
| Expired/invalid stored credential | `unauthenticated` | No table query |
| Auth transport throw or auth 5xx | `failure: authentication` | No table query |
| `data: null`, no query error | `not_found: missing_or_hidden` | Profile query not called |
| `PGRST116` no-row result | `not_found: missing_or_hidden` | Profile query not called |
| `42501`/authenticated 403 | `forbidden` | Profile query not called |
| Unexpected PostgREST error | `failure: database` | Profile query not called |
| Profile email found | `ok` with `user.email` | Exactly one profile lookup |
| Profile absent or fails | `ok` without `user.email` | Primary schema preserved |

### 8.2 BFF direct matrix

`frontend/__tests__/app/api/schemas/[id]/route.test.ts` imports the route and
mocks the shared loader. It asserts exact status and body for:

- 200 success;
- 401 unauthenticated;
- 403 forbidden;
- 404 invalid ID;
- 404 missing schema;
- 404 RLS-hidden schema using the same response body as missing;
- 500 authentication failure;
- 500 database failure.

Every case asserts `Cache-Control: private, no-store`. Error cases assert that
raw schema IDs, Supabase messages, and credentials are absent from the body.

### 8.3 Server page unit matrix

`frontend/__tests__/app/schemas/[id]/page.test.tsx` mocks the loader and
`next/navigation` control-flow functions:

- `ok` passes the exact schema object to `SchemaDetailClient`.
- Both `not_found` reasons call `notFound()`.
- `unauthenticated`, `forbidden`, authentication failure, and database failure
  do not call `notFound()` and reject as server failures.

The client component test confirms that the initial schema renders without an
initial `/api/schemas/<id>` fetch and that existing edit, duplicate, export,
configure, and delete actions remain wired.

### 8.4 Production Next HTTP matrix

`frontend/tests/integration/schemas/detail-production.test.ts` builds a
dedicated production output directory, starts the standalone Next server, and
uses local Supabase Auth/PostgREST test servers. It asserts actual response
statuses rather than visible text:

| Request | Expected HTTP status |
|---|---:|
| Authenticated, visible schema | 200 |
| Authenticated, invalid ID | 404 |
| Authenticated, missing schema | 404 |
| Authenticated, RLS-hidden schema | 404 |
| Authenticated, primary database failure | 500 |
| Anonymous valid schema request | 307 to `/auth/login?next=/schemas/<id>` |

The test also asserts that the hidden schema body never appears in either 404
response, invalid IDs cause no PostgREST read, successful schema data is read
once, and no case returns the old HTTP-200 error-card behavior.

## 9. TDD sequence

1. Add loader tests for ID and authentication outcomes and confirm they fail
   because `loadSchemaDetail` does not exist.
2. Add primary-query and enrichment tests, then implement the minimal typed
   loader until the complete loader matrix passes.
3. Add the BFF matrix against the loader result contract, then replace the
   route's direct Supabase logic with the result-to-response mapping.
4. Add page branching tests and a client handoff test, then split the existing
   component without changing its actions or presentation.
5. Add the production Next HTTP contract last and confirm it fails under the
   old client-only page before accepting the server-rendered implementation.
6. Run focused tests after every layer, then run full frontend validation and
   inspect the final diff before review.

## 10. Verification

Focused commands:

```bash
cd frontend && npm test -- --runInBand \
  __tests__/lib/server/schema-detail.test.ts \
  __tests__/app/api/schemas/[id]/route.test.ts \
  __tests__/app/schemas/[id]/page.test.tsx

cd frontend && npm test -- --runInBand \
  tests/integration/schemas/detail-production.test.ts
```

Required repository checks:

```bash
cd frontend && npm run validate
cd frontend && npm test -- --runInBand
git -C /home/laugustyniak/github/legal-ai/juddges-app/.worktrees/fix-409-schema-real-404 diff --check
```

Before claiming completion, record the focused status matrix results, full
validation result, full Jest result, and `git diff --check` result. A test that
only finds “not found” text in an HTTP-200 page is not acceptable evidence.

## 11. Collision boundary

Active detail-route work for #404, #407, and #408 changes middleware and
related server-page contracts. #409 must remain isolated to the schema-specific
files listed in section 4.1. In particular, it must not modify:

- `frontend/middleware.ts`;
- `frontend/lib/supabase/middleware.ts`;
- chat, collection, or document detail loaders;
- shared BFF proxy infrastructure.

This boundary avoids conflicts while those worktrees are in flight. If one of
those branches lands first, #409 may adopt naming conventions after merging
main into its branch, but it must not broaden into a shared refactor.

## 12. #410 follow-on pattern

Issue #410 should reuse the architecture, not the schema implementation:

- create an extraction-specific typed server loader;
- enforce `job_id` plus authenticated `user_id` ownership before requesting
  upstream job data;
- map only missing or inaccessible jobs to `not_found`;
- preserve upstream 422, 500, and 503;
- distinguish timeout as 504, transport failure as 503, and malformed success
  payload as 502;
- make `/extractions/[id]` a server page that calls `notFound()` only for the
  extraction loader's `not_found` result;
- pass successful job data to a client component without an initial hydration
  fetch.

#410 must receive its own tests and worktree. It must not be bundled into the
#409 implementation or generalized through a premature cross-domain loader.
