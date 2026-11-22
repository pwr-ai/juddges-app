# Enable the full-corpus search engine (Weaviate v2) on production

`/search` has two engines. Since #867 the **full corpus** is the default for
signed-in users:

| Engine | `?engine=` | Corpus | Backend |
|---|---|---|---|
| **Pełna baza** (default, signed-in) | `full` | ~2.7M Polish judgments (pl-court + NSA), ~30.7M chunks, no LLM extractions | `POST /search/v2`, `GET /search/v2/judgments/{judgment_id}` over Weaviate v2 |
| **Baza kuratorowana** | `curated` | ~6k PL + ~6k EN judgments with extractions, collections, facets | `/api/search/documents` (Supabase + Meilisearch), unchanged |

Guests always get the curated engine: both `/search/v2` endpoints require a
signed-in Supabase user, and the BFF routes answer 401 (the middleware
login-redirects a guest before that). The switch still shows the full corpus,
locked, with "Dostępna po zalogowaniu." How the engine is picked, and why, is
in [Search engines](../explanation/search-engines.md).

The Weaviate v2 stack (`JudgmentChunks` + `Judgments`, `mmlw-retrieval-e5-large`
embeddings served by TEI) is **not** part of this repository. It is the JuDDGES
repo's compose project `juddges_weaviate_v2` (containers
`juddges_weaviate_v2-weaviate-1` and `juddges_weaviate_v2-embeddings-1`) on the
same host. The backend reaches it over that project's default network.

## How it behaves

| State | `/search/v2` | UI message |
|---|---|---|
| `WEAVIATE_V2_HTTP_HOST` or `WEAVIATE_V2_TEI_URL` unset | 503 `search v2 not configured` | "Pełna baza nieskonfigurowana" |
| Env set, Weaviate or TEI unreachable | 503 `search v2 unavailable` | "Pełna baza niedostępna" |
| Env set, stack up | 200 `{results, took_ms, engine: "weaviate-v2"}` | results list, headed "Wyniki z pełnej bazy (Weaviate)" |
| Session expired | BFF call is login-redirected | "Sesja wygasła…" (the client rejects a redirected or non-JSON response) |

The env is read on every request, so the engine can be switched on and off by
editing `.env` and recreating the backend. No new image is needed. With the
env unset, signed-in users still land on the full engine and see the "not
configured" message; they can switch to the curated engine.

### Filters

`POST /search/v2` takes optional filters, served by the fields denormalized
onto `JudgmentChunks`:

| Field | Meaning |
|---|---|
| `court_type` | list of exact values; the corpus has `ordinary_court` (pl-court) and `administrative_court` (NSA, WSA) |
| `date_from`, `date_to` | inclusive whole days on `date_issued` (both ingest paths store UTC midnight of the Polish calendar day) |

There is **no `source` filter**: `source` lives on `Judgments` only, not on
`JudgmentChunks`, and unknown request fields are rejected with 422. In the
current corpus `court_type=administrative_court` selects exactly the NSA
source. The panel offers these three filters next to the query input.

### Opening a result

A result opens `/documents/<supabase_id>` when the backend matched it to a row
in `judgments` by `source_id` (see `backend/app/search_v2/supabase_ids.py`).
Otherwise it opens `/judgments/full/<encodeURIComponent(judgment_id)>`, which
renders `GET /search/v2/judgments/{judgment_id}` (via the BFF
`/api/search/v2/judgments/[judgmentId]`): signature, court, date, thesis,
metadata lists, the full text, and the note "Orzeczenie z pełnej bazy (bez
ekstrakcji)". NSA ids are paths (`/doc/39FBE5DB09`), hence the encoding and
the backend's `{judgment_id:path}` route. The full text is returned whole
(GZip middleware compresses it; a long judgment is ~100k characters) and is
capped at 1M characters with `full_text_truncated: true` only as a guard.
The page is auth-gated: it is not in `lib/supabase/public-route-policy.ts`.

## 1. Network

`docker-compose.yml` attaches the `backend` service to the external network
`juddges_weaviate_v2_default`. `scripts/deploy_prod.sh` checks that it exists
(as well as `data_stack_network`) **before** stopping anything, and exits if it
is missing.

```bash
docker network inspect juddges_weaviate_v2_default >/dev/null && echo present
```

If the v2 stack is not running on the host, create an empty network so the
deploy can go ahead. `/search/v2` then answers 503:

```bash
docker network create juddges_weaviate_v2_default
```

## 2. Environment

Add to the production `.env` (the template is in `.env.example`):

```bash
WEAVIATE_V2_HTTP_HOST=juddges_weaviate_v2-weaviate-1
WEAVIATE_V2_HTTP_PORT=8080
WEAVIATE_V2_GRPC_PORT=50051
WEAVIATE_V2_TEI_URL=http://juddges_weaviate_v2-embeddings-1:80
WEAVIATE_V2_API_KEY=<a key from the v2 stack's AUTHENTICATION_APIKEY_ALLOWED_KEYS>
```

The v2 Weaviate has anonymous access disabled, so the API key is required.
Only `WEAVIATE_V2_*` names are used. The legacy `WEAVIATE_URL` /
`WEAVIATE_API_KEY` variables are unrelated and stay unset.

Then deploy (`./scripts/deploy_prod.sh`), or recreate just the backend after an
env-only change:

```bash
docker compose up -d --no-deps --force-recreate backend
```

## 3. Verify

Production publishes no host ports, so check from inside the container.

Check that the backend is on the network and can reach both services:

```bash
docker inspect juddges-backend \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# expect: ... juddges_weaviate_v2_default ...

docker exec juddges-backend python -c "
from app.search_v2.config import load_settings
from app.search_v2.engine import WeaviateV2Engine
engine = WeaviateV2Engine(load_settings())
hits = engine.search('zachowek', 3, 0.25)
print(len(hits), [h.judgment_id for h, _ in hits])
engine.close()
"
# expect: 3 [...]
```

`load_settings()` returns `None` while the env is incomplete, and the snippet
then fails with an `AttributeError`. That is the 503 "not configured" case.

End to end, sign in on the site and open `/search`: **Pełna baza** is selected
and the URL carries `?engine=full`. Run a query. You should get a list headed
"Wyniki z pełnej bazy (Weaviate)" with signatures, courts, dates, scores and
excerpts. Open a result marked "tylko w pełnej bazie (bez ekstrakcji)": it
lands on `/judgments/full/…` with the full text.

## Turn it off

Clear `WEAVIATE_V2_HTTP_HOST` (or `WEAVIATE_V2_TEI_URL`) in `.env` and recreate
the backend. `/search/v2` goes back to 503 "not configured", and users need
to pick **Baza kuratorowana** by hand (or follow `?engine=curated` links). The
network attachment can stay.
