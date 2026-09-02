# Guest access

What a signed-out visitor can do, and the limits that apply.

Introduced by issue #510. Before it, `/search`, `/chat`, `/documents/*` and
`/history` all returned `307 → /auth/login`, so a visitor could not see a single
judgment without creating an account and confirming an email.

## What is open

The corpus is public court rulings, so reading it requires no identity.

| Surface | Anonymous | Notes |
|---|---|---|
| `/` landing, `/about`, `/blog`, … | yes | unchanged |
| `/search` | yes | text and hybrid modes; metered, see below |
| `/documents/<id>` | yes | full judgment detail page |
| `GET /api/search/documents` | yes | the metered endpoint |
| `GET /api/search/suggest`, `/autocomplete` | yes | typeahead |
| `GET /api/documents/<id>/{metadata,similar,html}` | yes | what the detail page fetches |
| `POST /api/events` | yes | so guest activity is attributable |

## What stays behind auth

Anything that carries identity or spends real money per call:

- Collections, saved searches, `/history`, extraction, schemas, `/chat`
- `/search/extractions` — note `/search` is allowlisted **exactly**, so this
  deeper path is unaffected
- Semantic chunk search (`POST /api/documents/search`, `/api/documents/batch`)
- `GET /api/search/analytics/history`, `GET /api/search/topics/my-clicks`

The single source of truth is `isPublicRequest()` in
`frontend/lib/supabase/public-route-policy.ts`. Adding a route to that
allowlist is the whole act of making it public — every gate downstream reads
from it.

## The anonymous search limit

Two independent limits sit on `GET /api/search/documents`. They answer
different questions and neither replaces the other:

| Limit | Keyed on | Purpose | Returns |
|---|---|---|---|
| Guest allowance | `guest_session_id` cookie | product nudge toward sign-up | `429` with a JSON `detail` carrying `upgrade_url` |
| Per-IP limiter | client address (`app/rate_limiter.py`) | backstop against scripted abuse | `429` with slowapi's plain `Rate limit exceeded` |

### The guest allowance

**5 free searches per guest session, over 24 hours.** A nudge appears with 2
left; the 6th search returns `429`.

| Constant | Value | Defined in |
|---|---|---|
| `GUEST_SEARCH_LIMIT` | 5 | `backend/app/guest_sessions.py` |
| `SESSION_EXPIRY_HOURS` | 24 | `backend/app/guest_sessions.py` |
| `UPGRADE_WARNING_THRESHOLD` | 2 | `backend/app/guest_sessions.py` |

### How it is counted

The counter is authoritative on the backend, in Redis (`db=1`), keyed by an
HttpOnly `guest_session_id` cookie:

1. `GET /api/search/documents` reaches the Next.js BFF, which forwards the
   visitor's `guest_session_id` cookie to the backend.
2. The backend resolves or mints a session, and refuses with `429` if the
   allowance is spent — **before** touching Meilisearch.
3. On a successful search it charges one, then returns
   `X-Guest-Session-Id`, `X-Guest-Search-Limit` and
   `X-Guest-Searches-Remaining`.
4. The BFF re-issues the session as an HttpOnly cookie on the app's own origin
   (the backend's own `Set-Cookie` is for a different host and would be
   dropped) and passes the counts through for the sign-up prompt.

A search is charged only after one returns, so a Meilisearch failure never
costs the visitor part of their allowance.

### What it is not

This is friction, not an access-control boundary. It is keyed on a cookie the
visitor can clear, and clearing it grants a fresh allowance. That is accepted:
the data behind it is public either way. It is the per-IP limiter below, not
this counter, that stands between the corpus and a script.

### The per-IP limiter

`GET /api/search/documents` carries `@limiter.limit(SEARCH_DOCUMENTS_RATE_LIMIT)`
— **60 requests per minute** by default, overridable with the
`SEARCH_DOCUMENTS_RATE_LIMIT` env var. It applies to every caller, signed in or
not, and it is checked before the guest allowance.

This was **not** true before issue #565. `DEFAULT_RATE_LIMITS`
(`100/minute, 1000/hour`) in `backend/app/rate_limiter.py` reads like a global
floor, but slowapi only applies default limits through `SlowAPIMiddleware`, and
that middleware is not registered — `backend/app/server.py` installs the limiter
on `app.state` and its exception handler, nothing more. Between #561 and #565,
`documents_search` therefore had no limit at all. **Adding a route to the public
allowlist does not give it a rate limit; the `@limiter.limit` decorator does.**

Two known gaps remain, tracked on #565:

- The search BFF (`frontend/app/api/search/documents/route.ts`) builds its own
  header dict and forwards neither `X-Forwarded-For` nor
  `X-RateLimit-Identity`, and `TRUSTED_PROXY` is unset in
  `docker-compose.yml`. Every proxied request therefore keys on the frontend
  container's address, so the limit is currently shared across all visitors
  rather than per-visitor.
- Cookieless anonymous searches still mint one Redis hash each. The per-IP
  limit now bounds how fast that can happen, but the sessions are not minted
  lazily at charge time.

### Semantic search stays behind sign-in

`semantic_ratio` is a query param, but the handler clamps it to `0` whenever
there is no authenticated user (`backend/app/api/search.py`). Any value above 0
embeds the query on the TEI GPU service, which costs real money per call — so
an anonymous caller cannot opt into it with `?semantic_ratio=1`. Signed-in
callers get the value they asked for.

### When Redis is down

The guest allowance **fails open**: search keeps working, unmetered, and a
warning is logged. An outage in the free-search counter must not take down
reading of public court rulings. The allowance is also inert when `REDIS_HOST`
is unset, which is what keeps it out of the way in unit tests.

The per-IP limiter does not fail open. When its storage is unreachable slowapi
marks the backend dead and switches to a process-local counter seeded with
`DEFAULT_RATE_LIMITS` — so the limit survives a Redis outage, but each backend
replica then counts on its own and the route's own 60/minute is replaced by the
fallback's 100/minute. Unit tests pin `RATE_LIMIT_STORAGE_URI=memory://` so they
exercise the configured limit rather than that fallback.

## Guest identity and sign-up stitching

Guest activity is recorded against `guest_session_id` in `app_events`
(`backend/app/api/events.py` reads it from the payload or the cookie). The
envelope carries the same field after login, so pre-signup and post-signup
activity can be joined.

`POST /api/guest/convert` migrates a session to a new account. Note its search
history migration is still a `TODO` in `backend/app/guest_sessions.py` — it
deletes the guest session and reports the count, but does not yet re-key
`search_analytics` rows, which have no `guest_session_id` column.
