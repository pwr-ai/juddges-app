# App Events Taxonomy

Juddges captures a first-party product-event stream in the `app_events`
Postgres table (Supabase). It complements — and never duplicates — the two
existing telemetry streams:

- **Langfuse** — LLM traces (prompts, completions, chain runs).
- **`search_analytics`** — search *queries* (raw query text, hit counts,
  latency). `app_events` stores search *interactions* only; raw query text is
  never sent to `app_events`.

## Storage

`app_events` (migration `20260717000001`) is partitioned monthly by
`created_at` (`PARTITION BY RANGE`, partitions named `app_events_y2026m07`).
The migration bootstraps the current and next month; the Celery Beat task
`maintenance.roll_app_events_partitions` (25th of each month) rolls new
partitions forward via the idempotent SQL function
`create_app_events_partition(month_start date)`.

Access is service-role-only (RLS deny-all for `anon`/`authenticated`, on the
parent and on every partition). Timestamps are server-side only
(`created_at DEFAULT now()`); client batching can introduce up to ~5 s of
skew, which is accepted.

## Identity fields

Each row carries the identity envelope of the batch it arrived in:

| Field | Source | Notes |
|---|---|---|
| `user_id` | Stamped by the backend from the Supabase JWT | Never accepted from the request body (`extra="forbid"`). FK to `auth.users` with `ON DELETE SET NULL` — deleting an account anonymizes events but keeps volume metrics. |
| `guest_session_id` | Device-scoped UUID minted by `track()` in localStorage (`juddges-guest-id`), with the HttpOnly `guest_session_id` cookie as backend fallback | Sent even when authenticated, so pre/post-signup funnels can be stitched. |
| `session_id` | Tab-scoped UUID in sessionStorage (`juddges-session-id`) | |
| `surface` | `web` (browser via `track()`), `api` (server-emitted) or `mcp` (MCP tool calls) | |
| `locale` | Active UI locale, pushed into `track()` by `LanguageProvider` via `setTrackLocale` (falls back to the stored `preferred-locale`) | |
| `app_version` | `NEXT_PUBLIC_APP_VERSION` (from `frontend/package.json`) | |

## Event list

Source of truth: `EVENT_ALLOWLIST` in `backend/app/services/app_events.py`,
mirrored by `ClientEventName` in `frontend/lib/analytics/track.ts`.

### Auth (server-authoritative — never client-emittable)

| Event | Emitted by | Properties |
|---|---|---|
| `auth_signed_up` | DB trigger on `auth.users` INSERT (migration `20260717000002`) | — |
| `auth_signed_in` | DB trigger on `auth.users` when `last_sign_in_at` changes | — |
| `auth_signed_out` | Next.js route `frontend/app/api/auth/signout/route.ts` (server-side signOut, then direct backend POST with the API key) | — |

**Trust model.** The FastAPI `/api/events` endpoint requires `X-API-Key`, a
server-only secret. Browsers can only reach it through the Next.js
`/api/events` proxy, which rejects every `auth_*` event before forwarding.
`auth_signed_up` / `auth_signed_in` are additionally rejected even from
API-key callers — those two can only originate from the DB triggers.

### Search (interactions only — raw query text lives in `search_analytics`)

| Event | Emitted from | Properties |
|---|---|---|
| `search_submitted` | `frontend/hooks/useSearchResults.ts` after first page lands (`surface='web'`); also server-side from `POST /documents/search` (`surface='api'`, `backend/app/judgments_pkg/__init__.py`) | `result_count`, `query_length`, `mode`; API rows add `endpoint`, `facets_only` |
| `search_zero_results` | Same, when zero hits | `query_length`, `mode` |
| `search_result_clicked` | `frontend/lib/styles/components/search-document-card.tsx` | `document_id`, `position` |

### Judgments

| Event | Emitted from | Properties |
|---|---|---|
| `judgment_viewed` | `frontend/app/documents/[id]/_components/useDocument.ts` on metadata fetch success | `document_id` |
| `judgment_exported` | `frontend/components/collection-documents-table.tsx` after export success | `format`, `count`, `preset` |
| `judgment_copied_citation` | *Taxonomy-only* — no citation-copy UI exists yet | `document_id` |

`judgment_exported` is **server-attributed, not server-authoritative**:
exports run fully in the browser (exceljs), so there is no server chokepoint;
the backend stamps `user_id` from the JWT but the trigger is client-side. A
future server-side export endpoint would upgrade this to server-authoritative.

### Annotations (TipTap)

`annotation_created`, `annotation_updated`, `annotation_deleted` —
*taxonomy-only*: no document-annotation feature exists yet (TipTap is
currently only used by the blog editor). Reserved so the event names are
stable when the feature lands.

### Chat

| Event | Emitted from | Properties |
|---|---|---|
| `chat_message_sent` | `frontend/hooks/useChatLogic.ts` `handleSendMessage` | `message_length` |
| `chat_response_received` | Same, in the stream `onComplete` | `duration_ms`, `sources_count` |
| `chat_feedback_thumbs_up` / `chat_feedback_thumbs_down` | *Taxonomy-only* — chat-message thumbs UI not wired yet (search-result thumbs use `search_feedback`) | — |

### Collections

| Event | Emitted from | Properties |
|---|---|---|
| `collection_created` | `frontend/lib/api/collections.ts` `createCollection` | `collection_id` |
| `collection_item_added` | Same, `addDocumentToCollection` / `addDocumentsToCollection` | `collection_id`, `count` |

### Errors

| Event | Emitted from | Properties |
|---|---|---|
| `error_boundary_triggered` | `frontend/components/errors/ErrorBoundary.tsx` `componentDidCatch` | `error_name`, `message` (truncated to 200 chars) |

### Usage (feature ranking)

These exist to rank features by real use before pruning them; the read-only
reports live in [How to rank features by usage](../how-to/rank-features-by-usage.md).

| Event | Emitted from | Properties |
|---|---|---|
| `page_viewed` | `frontend/components/analytics/PageViewTracker.tsx` (mounted in the root layout) on every pathname change | `route` — the route template from `normalizeRoute()` (`/documents/[id]`), never the concrete path or query string |
| `mcp_tool_called` | `backend/packages/juddges_mcp/juddges_mcp/usage.py` (`instrumented()`, applied where `server.py` registers the tools) | `tool`, `outcome` (`ok` or the exception class), `duration_ms`, `result_count` for list results. Never the tool arguments. `user_id` is the MCP key's owner |
| `api_route_rollup` | `backend/app/services/route_rollup.py` (`RouteRollupMiddleware`), one row per worker per 15-minute window and on shutdown | `counts` (`{"GET /documents/{document_id}": n, ...}`, route templates only, unmatched requests lumped as `<unmatched>`), `window_start`, `window_end`, `total` |

**Server-only.** `mcp_tool_called` and `api_route_rollup` are in
`SERVER_ONLY_EVENTS`: `POST /api/events` rejects them (422) even from API-key
callers, so the usage numbers cannot be inflated from outside. They are not in
`ClientEventName`.

**Cost.** None of the three adds a request or blocks one: `page_viewed` rides
the existing `track()` batch; the backend events go through
`emit_app_event_in_background`, which hands the synchronous Supabase insert to
the thread pool. The rollup middleware costs one dict increment per request.
`API_ROUTE_ROLLUP_ENABLED=false` turns the rollup off;
`API_ROUTE_ROLLUP_INTERVAL_SECONDS` changes the window.

**Privacy.** There is no cookie-consent banner or analytics opt-out in the
frontend today; these events follow exactly the same identity rules as every
other first-party event above (device-scoped guest id in localStorage, no
third-party cookies, no PII). If a consent gate is added later, gate `track()`
itself and all of these follow.

## PII rules

`properties` must never contain personal data:

- **No email, password, token, secret, authorization values.** The `track()`
  wrapper strips these keys (one level of nesting) before sending and warns in
  development builds.
- **No raw query content.** The `query` key is on the same denylist — use
  derived fields (`query_length`) instead; full queries already live in
  `search_analytics`.
- Server-side callers of `emit_app_event()` / `emit_app_event_in_background()`
  must follow the same rules — there is no server-side stripping.
- Additional caps: max 20 events per batch, max 8 KB serialized `properties`
  per event.

## Pipeline overview

```
track() (browser, batched ≤20 / 5s, sendBeacon on page-hide)
  → POST /api/events (Next.js proxy: rejects auth_*, injects X-API-Key + JWT)
    → POST /api/events (FastAPI: allowlist + caps, stamps user_id from JWT)
      → BackgroundTasks → record_app_events() → Supabase app_events
auth.users triggers ────────────────────────────────────────────┘
backend code (MCP tools, route rollup, POST /documents/search)
  → emit_app_event_in_background() → thread pool → record_app_events()
```

Writes never sit on a request's critical path (`BackgroundTasks`), and every
layer is fire-and-forget: an analytics failure never breaks a user flow.

## Verifying locally

1. Apply migrations against the local Supabase stack (`supabase db push` or
   `psql "$DATABASE_URL" -f supabase/migrations/20260717000001_...sql`).
2. `\d+ public.app_events` — expect two partitions (current + next month).
3. `SELECT public.create_app_events_partition('2026-09-01');` twice —
   idempotent, no error.
4. Create a user in Supabase Studio → an `auth_signed_up` row appears; sign in
   → `auth_signed_in`.
5. Exercise the surfaces above in the dev app and watch
   `SELECT event_name, user_id, properties FROM app_events ORDER BY id DESC`.

To add a new event, follow the checklist in
[How to add an app event](../how-to/add-event.md).
