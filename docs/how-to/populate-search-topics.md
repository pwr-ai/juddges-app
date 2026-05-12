# Populate Search Topics in Production Meilisearch

This runbook generates and publishes the `topics` Meilisearch index that powers
the search-bar autocomplete chips. The pipeline is offline, idempotent, and
performs a zero-downtime atomic swap, so it is safe to re-run.

> **When to run:** initial prod bootstrap; periodic refresh as the corpus
> grows (e.g. quarterly, or after a large ingestion batch); when autocomplete
> stops returning chips and the cause is traced to an empty `topics` index.

---

## TL;DR

```bash
# On the prod host, from the deploy directory:
docker compose run --rm \
  -e MEILISEARCH_INTERNAL_URL=http://meilisearch:7700 \
  backend python -m scripts.generate_search_topics
```

Confirm `y` at the swap prompt. Total wall-clock: ~10–20 min (most of it
BERTopic + embeddings).

---

## 1. Prerequisites

### Access

- SSH access to the prod host with permission to run `docker compose`.
- The prod `.env` (or compose env-file) must already provide:

| Variable | Used for |
|---|---|
| `SUPABASE_URL` | Pull criminal judgments |
| `SUPABASE_SERVICE_ROLE_KEY` | Pull criminal judgments (read-all) |
| `OPENAI_API_KEY` | GPT-4o-mini labelling + cross-lingual alignment |
| `MEILISEARCH_INTERNAL_URL` *or* `MEILISEARCH_URL` | Reach the `meilisearch` container |
| `MEILISEARCH_ADMIN_KEY` *or* `MEILI_MASTER_KEY` | Create/swap indexes |

The script falls back from `ADMIN_KEY` → `MEILI_MASTER_KEY` and from
`INTERNAL_URL` → `URL` automatically
(`scripts/generate_search_topics.py:789-808`).

### Cost / resource budget

- **OpenAI:** ~150 GPT-4o-mini calls (75 cluster-label calls per jurisdiction
  + 1 alignment call). Single-digit USD.
- **CPU/RAM:** BERTopic + Sentence-Transformers run *inside the backend
  container*. Plan for ~4 GB peak RAM and a few minutes of sustained CPU.
  Do not run during peak user traffic on a small host.
- **Meilisearch:** writes ≤ 500 documents to a staging index, then swaps. No
  effect on the live `judgments` index.

### Pre-flight check

Confirm the current state before touching anything:

```bash
# Are services up?
docker compose ps meilisearch backend

# Current topics index document count (expect 0 on first run)
docker exec juddges-meilisearch curl -s \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  http://localhost:7700/indexes/topics/stats
```

---

## 2. Run the pipeline

From the prod-host deploy directory (the one containing the active
`docker-compose.yml`):

```bash
docker compose run --rm \
  -e MEILISEARCH_INTERNAL_URL=http://meilisearch:7700 \
  backend python -m scripts.generate_search_topics
```

Flags worth knowing (all optional):

| Flag | Default | When to change |
|---|---|---|
| `--jurisdictions` | `pl,uk` | Single-jurisdiction debug runs |
| `--case-type` | `criminal` | Future expansion to civil etc. |
| `--sample-per-jurisdiction` | `6000` | Smaller value for a cheap smoke test |
| `--max-concepts` | `500` | Hard cap; matches Meili `maxTotalHits` |
| `--dry-run` | off | Generate JSON only, **skip** the Meili push |

Use `--dry-run` first if you want to inspect
`frontend/lib/stats/search-topics.json` before publishing.

---

## 3. What you will see

The script is interactive and Rich-formatted. Expect these phases:

1. **Pull from Supabase** — ~6 000 PL + ~6 000 UK criminal judgments.
2. **Cluster per jurisdiction** — BERTopic targets 75 clusters each.
3. **Label clusters** — 75 + 75 GPT-4o-mini calls (structured output).
4. **Cross-lingual alignment** — one GPT-4o-mini call → up to 500 unified
   concepts.
5. **Write JSON** to `frontend/lib/stats/search-topics.json` (inside the
   container — this file is also committed to git from local dev runs).
6. **Atomic Meili swap:**
   - Creates staging index `topics_new` with full settings.
   - Upserts the 500 concepts.
   - Diffs staging vs live `topics` (added / removed / shifted `doc_count`).
   - **Prompts:** `Swap topics_new → topics? [y/N]`.
   - On `y`: `swapIndexes` → delete leftover staging → done.
   - On `n`: leaves `topics_new` in place; cleanup hint is printed.

Implementation: `push_to_meilisearch` in
`scripts/generate_search_topics.py:773`.

---

## 4. Verify

After the swap completes:

```bash
# Document count (expect ≤ 500)
docker exec juddges-meilisearch curl -s \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  http://localhost:7700/indexes/topics/stats

# Sample a real query as the autocomplete endpoint would
docker exec juddges-meilisearch curl -s -X POST \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q":"narko","limit":5,"attributesToRetrieve":["id","label_pl","label_en","category","doc_count"]}' \
  http://localhost:7700/indexes/topics/search

# End-to-end via the backend API (replace HOST):
curl -s "https://<prod-host>/api/v1/search/autocomplete?q=fraud&limit=5" \
  -H "Authorization: Bearer $BACKEND_API_KEY"
```

Finally, open the prod site, click the search bar, and confirm that topic
chips appear under the input.

---

## 5. Failure modes & recovery

| Symptom | Likely cause | Fix |
|---|---|---|
| `Meilisearch admin key not configured — cannot push topics.` | Neither `MEILISEARCH_ADMIN_KEY` nor `MEILI_MASTER_KEY` reaches the container | Pass it via `-e` or fix the env-file, then re-run |
| Pipeline aborted before swap | Staging index `topics_new` left behind | Re-run; the script deletes leftover staging on startup (`generate_search_topics.py:820`) |
| `task ... did not succeed (status=failed)` during upsert | Schema drift between code and live `topics` settings | See [Meili settings atomic-apply caveat](#related) — apply settings out-of-band, then re-run |
| User clicked `n` at the prompt | `topics_new` retained, live `topics` untouched | Re-run when ready; or delete staging: `curl -X DELETE -H "Authorization: Bearer $MEILI_MASTER_KEY" http://localhost:7700/indexes/topics_new` |
| Autocomplete still empty after swap | Backend cached the topics service before the swap | The service is process-cached (`search.py: _topics_service`). Restart `backend`: `docker compose restart backend` |
| GPT-4o-mini rate-limit / timeout | OpenAI transient error | Re-run; cluster labelling is per-cluster and the alignment call is a single request — both safe to retry from scratch |

Rolling back **after** a successful swap is intentionally not automated:
just run the pipeline again with the previous corpus, or restore Meili from
its volume snapshot if a deeper issue surfaces.

---

## 6. Related

- `scripts/generate_search_topics.py` — pipeline source.
- `backend/app/services/meilisearch_config.py:269` — `topics` index settings
  (searchable/filterable/sortable attributes, `maxTotalHits: 500`).
- `backend/app/services/search.py` (`MeiliSearchService.topics_from_env`,
  `autocomplete`) — the consumer side.
- `backend/app/api/search.py` — HTTP route that surfaces topic chips.
- `docs/how-to/deployment.md` — broader prod deploy context.
- Known caveat: a separate startup PATCH on the `judgments` index settings
  fails atomically due to the `bge-m3` embedders block; this does **not**
  affect the `topics` index, whose settings call succeeds independently.
