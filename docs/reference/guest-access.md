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
the data behind it is public either way. The backstop against scripted abuse is
the per-IP limiter in `backend/app/rate_limiter.py`, which is independent of
this counter.

### When Redis is down

The quota **fails open**: search keeps working, unmetered, and a warning is
logged. An outage in the free-search counter must not take down reading of
public court rulings. The quota is also inert when `REDIS_HOST` is unset, which
is what keeps it out of the way in unit tests.

## Guest identity and sign-up stitching

Guest activity is recorded against `guest_session_id` in `app_events`
(`backend/app/api/events.py` reads it from the payload or the cookie). The
envelope carries the same field after login, so pre-signup and post-signup
activity can be joined.

`POST /api/guest/convert` migrates a session to a new account. Note its search
history migration is still a `TODO` in `backend/app/guest_sessions.py` — it
deletes the guest session and reports the count, but does not yet re-key
`search_analytics` rows, which have no `guest_session_id` column.
