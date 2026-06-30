# Grafana dashboards-as-code

Versioned, reviewable Grafana provisioning for Juddges ops metrics (#196).
Dashboards live as JSON here and are loaded via Grafana **file-based
provisioning** — never clicked-through in the UI.

```
infra/grafana/
├── README.md
├── dashboards/
│   ├── search.json          # ✅ live — backed by the search_analytics table
│   ├── api-health.json      # ⛔ placeholder — needs request metrics (see below)
│   ├── celery.json          # ⛔ placeholder — needs broker/Celery metrics
│   ├── llm-cost.json        # ⛔ placeholder — needs Langfuse export
│   └── web-vitals.json      # ⛔ placeholder — needs app_events table
└── provisioning/
    ├── datasources/supabase.yaml      # Postgres datasource (env-templated)
    ├── dashboards/provider.yaml       # file provider → dashboards/
    └── alerting/search-alerts.yaml    # "search p95 > 2s for 10m" rule
```

## Status of each dashboard

| Dashboard | State | Data source | Blocking dependency |
|---|---|---|---|
| `search` | **Live** | `search_analytics` (Supabase) | — |
| `api-health` | Placeholder | none | No `/metrics`/Prometheus instrumentation in FastAPI |
| `celery` | Placeholder | none | No Celery/broker metrics exporter |
| `llm-cost` | Placeholder | Langfuse | No Langfuse→Prometheus/SQL export; cache-rate also needs `LANGCHAIN_CACHE_DATABASE_URL` |
| `web-vitals` | Placeholder | `app_events` | `app_events` table not yet created |

The four placeholders are committed so the set is complete and reviewable. Each
is a single text panel describing the intended tiles and what must land first —
they render cleanly and contain **no panels that would error** against a
datasource that does not exist yet. Promote each to real panels as its
dependency lands (all tracked as follow-ups to #196).

## Provisioning a Grafana instance

Mount this tree into the Grafana container and point the provisioning paths at
it. With the official `grafana/grafana` image:

```yaml
# docker-compose snippet
grafana:
  image: grafana/grafana:11.1.0
  environment:
    SUPABASE_DB_HOST: ${SUPABASE_DB_HOST}
    SUPABASE_DB_PORT: ${SUPABASE_DB_PORT:-5432}
    SUPABASE_DB_NAME: ${SUPABASE_DB_NAME:-postgres}
    SUPABASE_DB_USER: ${SUPABASE_DB_USER}
    SUPABASE_DB_PASSWORD: ${SUPABASE_DB_PASSWORD}
  volumes:
    - ./infra/grafana/provisioning/datasources:/etc/grafana/provisioning/datasources:ro
    - ./infra/grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards:ro
    - ./infra/grafana/provisioning/alerting:/etc/grafana/provisioning/alerting:ro
    # provider.yaml expects the JSON dashboards here:
    - ./infra/grafana/dashboards:/etc/grafana/provisioning/dashboards/juddges:ro
  ports:
    - "3000:3000"
```

### Required environment variables

| Var | Example | Notes |
|---|---|---|
| `SUPABASE_DB_HOST` | `db.<ref>.supabase.co` | direct host, or the pooler host |
| `SUPABASE_DB_PORT` | `5432` / `6543` | 6543 = transaction pooler |
| `SUPABASE_DB_NAME` | `postgres` | |
| `SUPABASE_DB_USER` | `grafana_ro` | **use a read-only role**, see below |
| `SUPABASE_DB_PASSWORD` | — | provided via `secureJsonData` |

### Recommended read-only role

Grafana should never need write access. Create a dedicated role scoped to the
tables the dashboards read:

```sql
CREATE ROLE grafana_ro LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE postgres TO grafana_ro;
GRANT USAGE ON SCHEMA public TO grafana_ro;
GRANT SELECT ON public.search_analytics TO grafana_ro;
-- add further GRANT SELECTs as placeholder dashboards become live
```

## Alerts

`provisioning/alerting/search-alerts.yaml` defines one rule — **search p95
latency > 2s sustained for 10m** — the only alert the current data supports.
Notification routing (Slack/PagerDuty) is intentionally out of scope (separate
issue); the rule fires to the default contact point until a policy is added.
Add one alert per dashboard as each placeholder gains real data.

## Editing dashboards

Edit the JSON here and commit — do not edit in the Grafana UI (`allowUiUpdates:
false`). To iterate visually, export the dashboard model from the UI (Share →
Export → *Export for sharing externally* off) and paste the JSON back here,
keeping the stable `uid`.
