# Explicit Public Route Policy

- **Date:** 2026-08-05
- **Status:** Approved design — awaiting implementation plan
- **Issue:** #390
- **Branch:** `fix/390-public-route-policy`

## 1. Problem

Anonymous access is currently decided by a long negative condition inside
`frontend/lib/supabase/middleware.ts`. The condition mixes pages, APIs, and
compatibility exceptions, uses broad `startsWith` checks, and does not consider
the HTTP method. This creates three concrete risks:

- lookalikes such as `/about-private` can inherit public access accidentally;
- making `/api/publications` or `/api/blog` public by prefix can expose writes
  and admin endpoints along with reads;
- the Playwright matrix can pass when a supposed public API returns 404, so it
  does not prove that the real route reached its handler successfully.

The final Wave 2 activation gate must publish the completed legal and marketing
surfaces while keeping authenticated product routes, admin trees, and mutations
protected.

## 2. Goals and non-goals

### Goals

- Define one pure, central policy that classifies anonymous requests by exact
  path, segment-aware subtree, and HTTP method.
- Publish the legal, contact, team, blog, publications, and use-case pages that
  are now ready for anonymous use.
- Preserve the existing public auth, metadata, health, dashboard, onboarding,
  status, and offline paths without retaining prefix-lookalike bugs.
- Permit only GET and HEAD for public read BFFs.
- Permit exact `POST /api/contact` as the sole public write-like ingress. It is
  an intentionally anonymous, validated, honeypot-protected, rate-limited form
  submission endpoint, not an administrative mutation.
- Keep `/blog/admin` and `/publications/admin` protected at every depth.
- Keep the existing `next=` redirect contract, including the original query.
- Make the route matrices assert exact successful or protected outcomes; 404
  is never accepted as proof that a public route works.
- Establish the policy boundary before #404, #407, and #408 reconcile their
  independent middleware changes.

### Non-goals

- Changing Supabase session refresh, cookie propagation, auth-error handling,
  role resolution, or the login page.
- Changing authorization inside BFF handlers or admin layouts. Middleware
  decides whether an anonymous request may reach a route; handlers and guards
  still decide whether an authenticated user is allowed to perform an action.
- Changing blog, publication, dashboard, contact, or legal page behavior and
  data contracts.
- Adding a new public publication detail page.
- Solving dynamic page 404 contracts from #404, #407, #408, #409, or #410.
- Adding the deterministic PR-gated Chromium route-contract job. That remains
  #411 after its dependencies land.
- Widening CORS or making OPTIONS, POST, PUT, PATCH, or DELETE public by prefix.
- Updating the sitemap or doing unrelated SEO work.

## 3. Policy boundary

### 3.1 Pure policy module

Add a focused module at
`frontend/lib/supabase/public-route-policy.ts`. It exports a pure predicate
with no Supabase, NextResponse, logging, network, or environment dependencies:

```ts
interface RoutePolicyInput {
  pathname: string;
  method: string;
}

function isPublicRequest(input: RoutePolicyInput): boolean;
```

The predicate is case-sensitive. It ignores the URL query when classifying a
request. For exact **page** classification only, one terminal slash is
equivalent to the canonical path (`/contact/` equals `/contact`); repeated
trailing slashes and encoded separators do not gain public access. Exact API
and compatibility exceptions are literal: `/api/contact/`,
`/api/dashboard/stats/`, and `/api/graphql/` do not match their unsuffixed
forms. Segment-aware subtree matching uses this rule:

```text
pathname == root OR pathname starts with root + "/"
```

It must never use bare `startsWith(root)`. Therefore `/blog/article` matches
the `/blog` tree, while `/blogger` and `/blog-private` do not.

The policy contains named page, API-read, public-ingress, protected-override,
and compatibility groups. The groups are data plus small matching helpers, not
another compound negative condition.

### 3.2 Middleware consumption

`frontend/lib/supabase/middleware.ts` continues to create the Supabase client
and call `auth.getUser()` for every matched request so session refresh and
cookie behavior remain unchanged. After that lookup, the anonymous redirect
condition becomes conceptually:

```ts
if (!user && !isPublicRequest({
  pathname: request.nextUrl.pathname,
  method: request.method,
})) {
  return loginRedirect(request);
}
```

Authenticated requests continue downstream regardless of the public policy.
The policy does not grant admin rights. Existing handler dependencies and
`AdminGuard` layouts retain responsibility for authenticated authorization.

No change is required in top-level `frontend/middleware.ts`; it still delegates
session handling to `updateSession`, preserves locale behavior, and returns
redirects unchanged.

## 4. Public page policy

Page routes are public for normal browser reads (GET and HEAD). The route trees
below use segment-aware matching only where descendants are intentionally
public.

### Exact public pages

| Path | Reason |
|---|---|
| `/` | Public landing page. |
| `/about` | Public project information. |
| `/ecosystem` | Public project information. |
| `/onboarding` | Preserve current anonymous onboarding behavior. |
| `/status` | Public system-status page. |
| `/offline` | Public offline fallback. |
| `/accessibility` | Public legal/information document. |
| `/contact` | Public contact page. |
| `/cookies` | Public cookie policy. |
| `/privacy` | Public privacy policy. |
| `/team` | Public team page. |
| `/terms` | Public terms page. |
| `/opengraph-image` | Public generated metadata image. |
| `/twitter-image` | Public generated metadata image. |

These are exact paths, with the single-terminal-slash equivalence described
above. `/about/team`, `/contact-us`, `/status-private`, and similar paths remain
protected unless separately listed.

### Public page subtrees

| Root | Public descendants |
|---|---|
| `/auth` | Login, sign-up, password, callback, confirmation, and auth error routes. |
| `/legal` | Legal documents such as `/legal/disclaimer` and `/legal/terms`. |
| `/blog` | Blog index and published slug pages, except the admin override below. |
| `/publications` | Publications catalog and any future explicitly routed public descendants, except the admin override below. |
| `/use-cases` | Use-case index and descendants such as `/use-cases/uk-judgments`. |

### Protected page overrides

Protected overrides are evaluated before public subtree matches:

- `/blog/admin` and every segment descendant;
- `/publications/admin` and every segment descendant.

An anonymous request to either tree receives the normal login redirect. A
signed-in non-admin user can reach the route boundary, but the existing shared
admin layout must render access denied and must not mount child data effects.

## 5. Public API policy

### 5.1 Public read methods

Only uppercase GET and HEAD are public read methods. HEAD follows the same path
classification as GET and must not create a separate, broader route list.
OPTIONS and every mutation method remain protected unless they match the exact
contact exception in section 5.3 or the exact retired no-handler compatibility
exception in section 5.4.

### 5.2 Public read BFF allowlist

| Route shape | Match kind | Allowed methods | Notes |
|---|---|---|---|
| `/api/health` | segment-aware subtree | GET, HEAD | Preserves public health reads. POST `/api/health/invalidate` remains protected. |
| `/api/dashboard/stats` | exact | GET, HEAD | Public dashboard data used by the landing and UK use-case surfaces. |
| `/api/contact` | exact | GET, HEAD | Existing contact endpoint health response. |
| `/api/blog/categories` | exact | GET, HEAD | Public category catalog. |
| `/api/blog/posts` | exact plus segment descendants | GET, HEAD | Public post index and slug lookup. `/api/blog/admin` is not in this shape. |
| `/api/publications` | exact plus segment descendants | GET, HEAD | Public catalog and record reads. Method gating protects create, update, delete, and resource-link mutations on the same tree. |

There is no prefix-wide public `/api/blog` rule and no method-agnostic public
`/api/publications` rule.

### 5.3 Exact public contact ingress

`POST /api/contact` is public as a single exact path-and-method exception. It
exists so both the public `/contact` page and the landing-page contact section
can submit the form anonymously. The handler's existing schema validation,
honeypot, IP rate limit, persistence, and provider error handling remain the
security boundary.

The exception does not include:

- `/api/contact/*`;
- PUT, PATCH, DELETE, or OPTIONS on `/api/contact`;
- any other public page or BFF mutation.

The Playwright check must submit an invalid, side-effect-free payload and expect
the handler's exact 400 validation response. A 307 would mean middleware blocked
the intended ingress; a 2xx would mean the test accidentally sent a valid
submission and could trigger persistence or email.

### 5.4 Retired GraphQL compatibility exception

Exact `/api/graphql` remains able to reach the Next.js router for every HTTP
method so the retired bridge returns its real 404 contract. This is a
compatibility exception, not a public write surface: there is no handler and no
mutation. `/api/graphql/`, `/api/graphql/nested`, and all lookalikes remain
protected. This preserves the existing regression test without weakening a
prefix.

## 6. Redirect contract

Every anonymous protected request uses the existing 307 redirect to
`/auth/login`. The redirect builder must:

1. clone the request URL;
2. set the pathname to `/auth/login`;
3. clear the cloned search parameters;
4. set `next` to the original pathname plus the original query string;
5. omit `next` only for `/` (which is public and therefore does not redirect).

Examples:

| Request | Required raw middleware result |
|---|---|
| `GET /search?q=vat` | `307 Location: /auth/login?next=%2Fsearch%3Fq%3Dvat` |
| `GET /publications-private?tab=all` | `307 Location: /auth/login?next=%2Fpublications-private%3Ftab%3Dall` |
| `POST /api/publications` | `307 Location: /auth/login?next=%2Fapi%2Fpublications` |
| `GET /blog/admin/draft-1` | `307 Location: /auth/login?next=%2Fblog%2Fadmin%2Fdraft-1` |

The policy predicate does not construct responses. Redirect construction stays
in the middleware so classification remains pure and independently testable.

## 7. Route contract matrices

### 7.1 Unit policy matrix

A table-driven Jest suite covers the predicate directly. Every row specifies
`method`, `pathname`, and the expected public boolean.

Required positive rows include:

- every exact public page;
- representative descendants of every public page subtree;
- GET and HEAD for every public API read shape;
- exact `POST /api/contact`;
- exact `/api/graphql` compatibility fallthrough.

Required negative rows include:

- protected product pages such as `/search`, `/chat`, `/collections`, and
  `/documents`;
- `/blog/admin`, `/blog/admin/new`, `/publications/admin`, and
  `/publications/admin/record-1`;
- POST, PUT, PATCH, DELETE, and OPTIONS on public read APIs;
- POST `/api/health/invalidate`;
- PUT and DELETE `/api/publications/record-1`;
- every lookalike listed in section 7.3.

### 7.2 Middleware integration matrix

Focused Jest tests mock an anonymous Supabase result and assert:

- public rows return the downstream `NextResponse.next()` boundary;
- protected rows return exact 307 redirects;
- the original path and query are encoded once in `next=`;
- authenticated requests are not blocked by the anonymous public policy;
- the existing exact GraphQL fallthrough remains intact.

These tests do not duplicate every predicate row. They prove that middleware
consumes the predicate correctly and preserves response behavior.

### 7.3 Required lookalikes

At minimum, the negative matrices cover:

- `/about-private` and `/about/team`;
- `/authentic`;
- `/blogger` and `/blog-private`;
- `/publications-private`;
- `/use-cases-private`;
- `/api/healthcheck`;
- `/api/dashboard/stats-preview`;
- `/api/blogger`;
- `/api/publications-private`;
- `/api/contact-form`;
- `/api/graphql/nested`.

Each remains protected for an anonymous request. Segment-aware matching may
allow an unknown descendant inside an intentionally public subtree to reach the
router's real 404; it must never allow a sibling prefix lookalike.

### 7.4 Playwright route matrix

Update `frontend/tests/e2e/auth/middleware-route-matrix.spec.ts` so the matrix
describes policy categories instead of duplicating an undocumented condition.
The browser/API assertions are exact:

| Category | Required result |
|---|---|
| Public page GET | Navigation response is 2xx; final pathname is the requested exact path or intended subtree descendant; never `/auth/login`. |
| Public API GET | Raw response is 2xx from the real BFF through a healthy or deterministic mocked upstream; no redirect. 404 is a failure. |
| Public API HEAD | Raw response is 2xx and has no auth redirect. |
| Exact contact POST exception | Invalid payload returns exactly 400 from the handler; no redirect and no side effect. |
| Anonymous protected page/API | Raw response is exactly 307 and `Location` is `/auth/login?next=...`. |
| Public-prefix lookalike | Same exact 307 contract as any protected route. |
| Authenticated protected route | Remains on the requested route and is not redirected to login; route-specific 403/404/5xx behavior is outside #390. |

The public page matrix includes the newly activated static/legal surfaces,
`/blog`, `/publications`, `/use-cases`, and `/use-cases/uk-judgments`. Dynamic
`/blog/[slug]` can be asserted only with a known deterministic published slug;
the matrix must not invent a slug and accept 404.

The public API matrix includes healthy GETs for dashboard stats, blog posts or
categories, publications, health, and contact. Server-side BFF fetches cannot
be proven by intercepting the browser request itself because that would bypass
middleware and the handler. Tests must point the running frontend at a healthy
backend or a deterministic upstream stub.

#411 will make the deterministic Chromium-only route-contract subset a required
pull-request job. #390 updates the contract now but does not widen the existing
smoke job or enable the full multi-browser suite.

## 8. Error handling and security invariants

- Policy evaluation is pure and cannot throw for a normal NextRequest pathname
  and method.
- Unexpected Supabase auth lookup failures retain their existing logging and
  signed-out behavior; #390 does not reinterpret them.
- Session refresh cookies remain attached to downstream and redirect responses
  exactly as before.
- Public BFF handlers preserve their own upstream status and body contracts.
  The policy never converts 404, 422, 429, 500, 503, or timeout responses.
- A public route returning 404 is a route or fixture failure, not a successful
  policy assertion.
- Admin page exclusions are middleware defense in depth. Existing admin guards
  and handler authorization remain mandatory.
- There is no prefix-wide public write access. The only public non-read handler
  is exact `POST /api/contact`; exact `/api/graphql` is a retired no-handler
  compatibility fallthrough.
- Unknown methods do not become public merely because their pathname is public
  for GET/HEAD.

## 9. Dependency and merge order

The content prerequisites for #390 are complete: the real publication catalog,
blog index and slug pages, and UK judgment dashboard have landed.

The shared middleware is also being changed independently by dynamic-route work:

- #404 adds chat detail access and 404 handling;
- #407 adds collection detail preflight and ownership handling;
- #408 changes document metadata and middleware request handling.

#390 must land first because it establishes the central policy boundary. After
that, each open dynamic-route branch must merge `origin/main` into its branch,
resolve the middleware conflict deliberately, and call the shared public-route
predicate rather than recreating or extending a local allowlist. Those branches
must preserve their route-specific preflight logic without changing the #390
policy data.

The dynamic branches should be integrated serially because they overlap the same
middleware file. A conflict resolution that restores a raw `startsWith`
allowlist or copies the public paths into a second helper is incorrect.

#411 remains blocked until #390 and the dynamic 404 issues (#404, #407, #408,
#409, and #410) are complete. It owns the deterministic Chromium-only PR job and
the consolidated exact-status route-contract gate, not the access policy itself.

## 10. TDD sequence

1. **RED — pure policy.** Add the table-driven predicate tests before creating
   the policy module. Confirm public marketing/legal rows and negative
   method/lookalike/admin rows fail for the expected missing behavior.
2. **GREEN — pure policy.** Implement only the exact paths, segment-aware
   helpers, protected overrides, method-aware API reads, contact exception, and
   GraphQL compatibility exception required by the table.
3. **RED — middleware integration.** Add focused anonymous/authenticated and
   `next=` tests that fail while middleware still uses the inline condition.
4. **GREEN — middleware consumption.** Replace the inline allowlist with the
   predicate call without altering Supabase client, cookies, error logging, or
   locale middleware.
5. **RED/GREEN — Playwright matrix.** Add newly public pages/APIs, exact 2xx and
   307 assertions, contact validation, protected writes, admin exclusions, and
   lookalikes. Demonstrate that the old acceptance of 404 fails before the
   assertion is tightened.
6. **Refactor.** Remove stale comments that tell maintainers to mirror the
   middleware condition manually. Keep route tables named by policy category.

## 11. Verification

Run from `frontend/` in the issue worktree:

```bash
npm run deps:check
npm test -- --runInBand \
  tests/unit/lib/supabase/public-route-policy.test.ts \
  tests/unit/lib/supabase/middleware.test.ts
npm run lint
npm run typecheck
```

Run the route matrix against a frontend configured with a healthy backend or
deterministic upstream stub:

```bash
npx playwright test tests/e2e/auth/middleware-route-matrix.spec.ts \
  --project=chromium
```

Also run `git diff --check`. Record any real-auth or service prerequisites rather
than weakening exact assertions or accepting 404/5xx. #390 is complete only when
the focused policy tests, middleware tests, and route matrix pass and the
frontend lint/typecheck gates remain green.

## 12. Acceptance summary

- One central predicate is the source of truth for anonymous route access.
- Exact routes and segment-aware subtrees cannot expose prefix lookalikes.
- `/blog/admin/**` and `/publications/admin/**` remain protected.
- Public API reads are GET/HEAD only.
- Exact `POST /api/contact` is the only public non-read handler; exact retired
  `/api/graphql` remains a no-handler 404 compatibility fallthrough.
- Anonymous mutations on blog, publication, health, and other BFFs redirect to
  login and retain `next=`.
- Public pages and public BFF reads prove 2xx; 404 is a failure.
- #404, #407, and #408 integrate the shared policy after #390 rather than
  maintaining competing allowlists.
- #411 remains the later deterministic PR-gating issue.
