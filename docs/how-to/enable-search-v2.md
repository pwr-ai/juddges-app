# Enable search v2 (Weaviate, test) on production

`POST /search/v2` is a test search engine over the Weaviate v2 corpus
(`JudgmentChunks`, `mmlw-retrieval-e5-large` embeddings served by TEI), built
for issue #867. On `/search`, signed-in users get an engine selector:
**Standard** (the default, unchanged) and **v2 (Weaviate, test)**. Guests never
see the selector, and the BFF route `/api/search/v2` answers 401 to them
without calling the backend.

The v2 stack is **not** part of this repository. It is the JuDDGES repo's
compose project `juddges_weaviate_v2` (containers
`juddges_weaviate_v2-weaviate-1` and `juddges_weaviate_v2-embeddings-1`) on the
same host. The backend reaches it over that project's default network.

## How it behaves

| State | `/search/v2` | UI message |
|---|---|---|
| `WEAVIATE_V2_HTTP_HOST` or `WEAVIATE_V2_TEI_URL` unset | 503 `search v2 not configured` | "v2 nieskonfigurowane" |
| Env set, Weaviate or TEI unreachable | 503 `search v2 unavailable` | "v2 niedostępne" |
| Env set, stack up | 200 `{results, took_ms, engine: "weaviate-v2"}` | results list |

The env is read on every request, so v2 can be switched on and off by editing
`.env` and recreating the backend. No new image is needed.

A result links to `/documents/<supabase_id>` only when the backend matched it
to a row in `judgments` by `source_id`. Otherwise the result is labelled
"spoza bazy aplikacji (tylko v2)" ("outside the app database, v2 only").

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

End to end, sign in on the site, open `/search`, pick **v2 (Weaviate, test)**
and run a query. You should get a list with signatures, courts, dates, scores
and excerpts. The footer line shows `… ms · weaviate-v2`.

## Turn it off

Clear `WEAVIATE_V2_HTTP_HOST` (or `WEAVIATE_V2_TEI_URL`) in `.env` and recreate
the backend. `/search/v2` goes back to 503 "not configured". The network
attachment can stay.
