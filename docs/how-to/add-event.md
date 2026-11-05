# How to Add an App Event

Checklist for adding a new event to the `app_events` product-analytics stream.
Background and PII rules: [App Events Taxonomy](../explanation/event-taxonomy.md).

## 1. Name the event

`snake_case`, `<domain>_<action>` (past tense): `judgment_viewed`,
`collection_created`. Decide who may emit it:

- **Client-emittable** — normal product interaction from the browser.
- **Server-only** — security-relevant (auth-like); must originate from a DB
  trigger or a server route, never from `track()`.

## 2. Backend allowlist

Add the name to `EVENT_ALLOWLIST` in `backend/app/services/app_events.py`.
If it is server-only *and* emitted by a DB trigger, also add it to
`DB_TRIGGER_ONLY_EVENTS`; if it is emitted only by backend code (MCP tools,
middleware), add it to `SERVER_ONLY_EVENTS`. Both sets are subtracted from
`API_EVENT_ALLOWLIST`, so `POST /api/events` rejects them.

## 3. Frontend type (client-emittable events only)

Add the name to the `ClientEventName` union in
`frontend/lib/analytics/track.ts`. Server-only events are deliberately
excluded from this union — the compiler then blocks `track('auth_...')`.

## 4. Instrument

- **Component code:** `const trackEvent = useTrackEvent()` from
  `frontend/hooks/useTrackEvent.ts` (locale is stamped by `LanguageProvider`), then
  `trackEvent('my_event', { ... })`.
- **Non-React modules** (`lib/api/*` etc.): import `track` from
  `@/lib/analytics/track` directly.
- **Backend code paths:** in a route with `BackgroundTasks`, schedule
  `emit_app_event` on it. Elsewhere in async code (MCP tools, middleware),
  call `emit_app_event_in_background`, which runs the synchronous Supabase
  insert on the thread pool so the event loop never waits. Both never raise.

Properties rules:

- No PII — no emails, tokens, or raw query text (`query` is stripped
  client-side; use `query_length`). See the taxonomy doc for the denylist.
- Keep them small (8 KB serialized cap) and flat.

## 5. Tests

- Backend: extend `backend/tests/app/test_app_events.py` if the event has
  special handling (e.g., a new server-only rule).
- Frontend: extend `frontend/__tests__/lib/analytics/track.test.ts` (wrapper
  behaviour) or `frontend/__tests__/api/events-route.test.ts` (proxy rules)
  only when the rules change — plain new event names need no new tests.

## 6. Document

Add the event to the table in
`docs/explanation/event-taxonomy.md` with: emitter (file path), properties,
and whether it is server-authoritative.

## 7. Verify

Run the affected surface in the dev stack and confirm the row lands:

```sql
SELECT event_name, user_id, guest_session_id, properties, created_at
FROM app_events
ORDER BY id DESC
LIMIT 10;
```
