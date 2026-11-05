# How to Rank Features by Usage

Read-only SQL reports for deciding what to keep, fix or remove, based on what
people actually use. They read `app_events` (see
[App Events Taxonomy](../explanation/event-taxonomy.md)) plus the entity
tables each feature writes to.

Two groups:

- **Run any time** — reports over data that already exists (entity tables,
  older events, `audit_logs`). Useful today.
- **Run after 30–60 days** — reports over the usage events added for this
  purpose: `page_viewed` (browser), `api_route_rollup` (backend, per route)
  and `mcp_tool_called` (MCP). They only mean something once a full month or
  two of traffic has accumulated after the deploy that introduced them.

All queries are `SELECT`s. Run them in the Supabase SQL editor or with
`psql` against a read replica or with a read-only role. Never run ad-hoc SQL
against production with a write-capable role.

## Before you start: exclude yourself

Your own testing dominates a low-traffic service. Look up your auth uid once
and substitute it for `<your-auth-uid>` below:

```sql
SELECT id, email, last_sign_in_at FROM auth.users ORDER BY last_sign_in_at DESC NULLS LAST LIMIT 10;
```

Guest (signed-out) traffic carries a `guest_session_id` instead of a
`user_id`; the "actors" columns below count either.

## Run any time

### Feature footprint over entity tables (Q8)

What each feature has stored in the last 180 days, by how many distinct users.

```sql
WITH me AS (SELECT '<your-auth-uid>'::uuid AS uid)
SELECT 'chats' f, count(*) n, count(DISTINCT user_id) users, max(created_at) last FROM chats, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'collections', count(*), count(DISTINCT user_id), max(created_at) FROM collections, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'extraction_jobs', count(*), count(DISTINCT user_id), max(created_at) FROM extraction_jobs, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'research_sessions', count(*), count(DISTINCT user_id), max(created_at) FROM research_sessions, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'saved_searches', count(*), count(DISTINCT user_id), max(coalesce(last_used_at, created_at)) FROM saved_searches, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'reasoning_lines', count(*), NULL, max(created_at) FROM reasoning_lines WHERE created_at > now() - interval '180 days'
UNION ALL SELECT 'publications', count(*), count(DISTINCT user_id), max(created_at) FROM publications, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'blog_posts', count(*), count(DISTINCT author_id), max(created_at) FROM blog_posts WHERE created_at > now() - interval '180 days'
UNION ALL SELECT 'mcp_api_keys (used)', count(*), count(DISTINCT user_id), max(last_used_at) FROM mcp_api_keys, me WHERE last_used_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'search_feedback', count(*), count(DISTINCT user_id), max(created_at) FROM search_feedback, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
UNION ALL SELECT 'feature_requests', count(*), count(DISTINCT user_id), max(created_at) FROM feature_requests, me WHERE created_at > now() - interval '180 days' AND user_id IS DISTINCT FROM me.uid
ORDER BY users DESC NULLS LAST, n DESC;

-- Denominator: how many people signed in at all.
SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '90 days';
```

If a table in this list has been dropped by the time you run it, delete its
line.

### Existing product events (Q2)

```sql
SELECT event_name, count(*) n,
       count(DISTINCT coalesce(user_id::text, guest_session_id)) actors,
       max(created_at) last
FROM app_events
WHERE created_at > now() - interval '180 days'
  AND user_id IS DISTINCT FROM '<your-auth-uid>'::uuid
GROUP BY 1
ORDER BY actors DESC;
```

### Topic chip clicks (Q7)

```sql
SELECT topic_id, count(*) clicks, count(DISTINCT user_id) users
FROM search_topic_clicks
WHERE created_at > now() - interval '180 days'
GROUP BY 1 ORDER BY 2 DESC LIMIT 50;
```

### Signed-in write actions (Q9)

```sql
SELECT action_type, api_endpoint, count(*) n, count(DISTINCT user_id) users, max(created_at) last
FROM audit_logs
WHERE created_at > now() - interval '180 days'
GROUP BY 1, 2 ORDER BY 4 DESC;
```

## Run after 30–60 days

### Page views by route (Q1)

`page_viewed` carries the route *template* (`/documents/[id]`), never the
concrete path or query string.

```sql
SELECT properties->>'route' route,
       count(*) views,
       count(DISTINCT coalesce(user_id::text, guest_session_id)) visitors,
       count(DISTINCT user_id) signed_in_visitors,
       max(created_at) last
FROM app_events
WHERE event_name = 'page_viewed'
  AND created_at > now() - interval '90 days'
  AND user_id IS DISTINCT FROM '<your-auth-uid>'::uuid
GROUP BY 1
ORDER BY visitors DESC;
```

Admin-only pages (judge fingerprint, argumentation, topic modeling) only ever
show admin traffic; a near-zero row there is the expected default, and a
reason to remove them.

### Backend route hits (Q10)

Each backend worker counts requests per `METHOD /route/{template}` in memory
and writes one `api_route_rollup` row per 15-minute window (and on shutdown).
Summing the windows gives hits per route across all workers. Requests that
matched no route appear as `METHOD <unmatched>`; MCP traffic appears under
`/mcp/…`.

```sql
SELECT kv.key route, sum(kv.value::bigint) hits
FROM app_events e, jsonb_each_text(e.properties->'counts') kv
WHERE e.event_name = 'api_route_rollup'
  AND e.created_at > now() - interval '60 days'
GROUP BY 1
ORDER BY 2 DESC;
```

The rollup has no `user_id`: it measures whether anything calls a route, not
who. It also counts health checks and the frontend's own background calls, so
read it as "is this route reachable in practice", and use Q1 for "do people
use this feature".

**Routes nobody called.** Every route in the OpenAPI snapshot that is missing
from Q10 is a deletion candidate. Export Q10 to `hits.csv` (columns
`route,hits`) and diff it against the snapshot:

```bash
jq -r '.paths | to_entries[] | .key as $p | .value | keys[]
       | select(. != "parameters") | "\(ascii_upcase) \($p)"' \
  scripts/openapi-snapshot.json | sort > /tmp/declared.txt
cut -d, -f1 hits.csv | tail -n +2 | sort > /tmp/called.txt
comm -23 /tmp/declared.txt /tmp/called.txt   # declared but never called
```

Before deleting anything this flags, `git grep` for callers that only run
rarely (monthly Celery tasks, admin pages, scripts) — 60 days can miss them.

### MCP tool calls (Q11)

```sql
SELECT properties->>'tool' tool,
       count(*) calls,
       count(DISTINCT user_id) key_owners,
       count(*) FILTER (WHERE properties->>'outcome' <> 'ok') failed,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'duration_ms')::int) p50_ms
FROM app_events
WHERE event_name = 'mcp_tool_called'
  AND created_at > now() - interval '90 days'
GROUP BY 1
ORDER BY calls DESC;
```

### API-side search volume

`POST /documents/search` records `search_submitted` with `surface = 'api'`;
the browser's search page records the same event with `surface = 'web'`.

```sql
SELECT surface, properties->>'mode' mode, count(*) searches,
       count(*) FILTER (WHERE (properties->>'result_count')::int = 0) zero_results
FROM app_events
WHERE event_name = 'search_submitted'
  AND created_at > now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

## Outside SQL

- **Langfuse**: trace counts for `search`, chat and `schema_generation` over
  90 days.
- **Sentry Performance** (if `SENTRY_DSN` is set in production):
  transactions sorted by throughput.

## Turning numbers into decisions

A feature with no visitors in Q1, no rows in Q8 and no hits in Q10 over 60
days is a removal candidate. Low but non-zero use is a judgment call — check
who the users are (a pilot partner outweighs ten anonymous visits) before
removing anything.
