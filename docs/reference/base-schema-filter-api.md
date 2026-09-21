# Base-schema filter API (reference)

Shared filter contract used by `/search/extractions`, "save filter as
collection", the NL-question-to-filter flow (`POST
/extractions/base-schema/nl-filter`), and the PL/UK comparison (`/compare`,
`backend/app/compare/`).

## RPC `public.list_extracted_filter_matches(p_filters JSONB, p_text_query TEXT)`

Returns every judgment matching `p_filters`/`p_text_query` as `(id UUID,
jurisdiction TEXT)`. Always restricted to `base_extraction_status =
'completed'`. Introduced in migration
`20260920000001_shared_extracted_filter_matches.sql`, which lifted the
~300-line `WHERE` clause out of `filter_documents_by_extracted_data` verbatim.

| Key in `p_filters` | Type | Semantics |
|---|---|---|
| `jurisdiction` | `["PL" \| "UK", …]` | `judgments.jurisdiction = ANY(...)` |
| `decision_date` | `{"from","to"}` / `{"min","max"}` / `"YYYY-MM-DD"` | inclusive range / equality on `judgments.decision_date` |
| `collection_ids` | `["<uuid>", …]` | membership in `collection_judgments` (any of the ids) |
| 42 `base_*` keys | see `frontend/lib/extractions/base-schema-filter-config.ts` | unchanged (introduced in `20260226000001`, `20260505000001`) |

**Empty-array edge cases** (both are deliberate, not bugs — document as-is):

- `jurisdiction: []` yields **zero rows**. The helper
  `_jsonb_to_text_array` turns a present-but-empty JSON array into an empty
  `TEXT[]` (not `NULL`), so the `v_jurisdiction IS NULL OR j.jurisdiction =
  ANY(v_jurisdiction)` guard evaluates `ANY('{}')`, which is always false.
- `collection_ids: []` acts as **"no filter"**. The same empty `TEXT[]` gets
  `unnest()`-ed into zero rows, and `array_agg(x::uuid)` over zero input rows
  returns `NULL` (not an empty array) — so `v_collection_ids IS NULL` is
  true and the collection-membership clause is skipped entirely.

**`collection_ids` and RLS:** the RPC is `SECURITY INVOKER`, so PostgREST
callers get row-level security enforced against the caller's own JWT — a
user can only match ids in collections they own. That protection does not
exist for backend code paths that call this RPC (directly, or through
`filter_documents_by_extracted_data`) with the **service-role** client,
which bypasses RLS entirely. Two such paths exist and both guard
`collection_ids` themselves rather than relying on the database:

- `POST /extractions/base-schema/filter`
  (`backend/app/extraction_domain/results_router.py::filter_by_extracted_data`)
  has no `get_current_user` dependency at all (see the auth-deferral note in
  that file) and rejects any request whose `filters` contains
  `collection_ids` with `400 COLLECTION_IDS_NOT_ALLOWED` — the endpoint has
  no caller identity to scope the check to, so the key is refused outright.
- `POST /collections/from-filter`
  (`backend/app/collections_from_filter.py::create_collection_from_filter`)
  is authenticated and validates `collection_ids` against the caller before
  calling `resolve_filter_ids` — see the errors table below.

## RPC `public.filter_documents_by_extracted_data(p_filters, p_text_query, p_limit, p_offset)`

Thin wrapper over `list_extracted_filter_matches` — same signature and columns
as before (`id, case_number, title, jurisdiction, decision_date,
extracted_data, total_count`), same `ORDER BY decision_date DESC NULLS LAST,
id`, same `LIMIT`/`OFFSET` clamping. The signature is a wire contract:
PostgREST matches by argument names, and a second overload answers HTTP 300.
Pinned by `backend/tests/db/test_migration_chain.py`
(`EXPECTED_RPC_ARGS`, `test_rpc_has_exactly_one_overload`).

## RPC `public.get_extracted_facet_counts_by_jurisdiction(p_filters, field_path, p_text_query)`

Sibling of `get_extracted_facet_counts(field_path)` (which stays untouched):
per-jurisdiction value counts **with coverage**, for the PL/UK comparison
(`backend/app/compare/service.py::CompareService`, one call per compared
field). Introduced in migration
`20260921000001_facet_counts_by_jurisdiction.sql`.

```
(p_filters JSONB DEFAULT '{}', field_path TEXT DEFAULT NULL, p_text_query TEXT DEFAULT NULL)
  -> TABLE(jurisdiction TEXT, value TEXT, count BIGINT, total BIGINT, covered BIGINT, coverage NUMERIC)
```

- `p_filters`/`p_text_query` are the same `BaseSchemaFilters` shape as
  `list_extracted_filter_matches` (which this RPC calls internally to build
  `matched`); `field_path` is resolved to a `judgments` column via the
  existing `_base_field_to_column` helper (unknown field → `RAISE EXCEPTION`,
  surfaced by the service as `FieldNotComparableError`).
- `total` = matched judgments in that jurisdiction **with completed base
  extraction** (`list_extracted_filter_matches` already restricts to
  `base_extraction_status = 'completed'`), not every judgment matched by the
  raw filter.
- `covered` = matched judgments whose column is "filled": `text[]` → at least
  one element that is not `NULL`/`''`; `text` → `NULLIF(BTRIM(col), '')` is
  not null; anything else → `col IS NOT NULL`. This is the SQL-side
  definition referenced (as "planned" before this migration landed) by
  `backend/app/extraction_domain/completeness.py`'s docstring — it only
  treats SQL `NULL`/`''` as empty, unlike the Python-side `is_empty_value`
  used for free-text extraction results.
- `coverage` = `covered / total`, rounded to 4 decimals, `NULL` when
  `total = 0`.
- A jurisdiction with `total > 0` and `covered = 0` still yields exactly one
  row (`value IS NULL`, `count IS NULL`, via a `LEFT JOIN` from the per-jurisdiction
  totals to the value counts) so callers learn `total` even when nothing is
  codeable — this is what lets `app.compare.layout.tier_for` distinguish
  "unavailable" (zero coverage in one jurisdiction) from "empty" (zero
  matches in both).
- Rows are ordered `jurisdiction, count DESC NULLS LAST, value` — stable, but
  callers that need cross-jurisdiction value alignment (the comparison UI)
  re-sort in Python (`app.compare.layout.build_field`), not in SQL.

## `POST /collections/from-filter`

Implemented in `backend/app/collections_from_filter.py`.

Request body:

```json
{
  "name": "string, 1–255 chars",
  "description": "string, ≤1000 chars, optional",
  "filters": { "...": "BaseSchemaFilters" },
  "text_query": "string, ≤1000 chars, optional",
  "split_by_jurisdiction": false
}
```

Success — `201 Created`:

```json
{
  "collections": [
    { "jurisdiction": null, "collection": { "...": "Collection" }, "added_count": 42 }
  ],
  "total_matched": 42,
  "pair_id": null,
  "ignored_filter_keys": []
}
```

The response is list-shaped (`collections: []`, not a single `collection`)
because the same request serves both shapes. With the default
`split_by_jurisdiction: false`, `collections` has exactly one entry with
`jurisdiction: null` and `pair_id` is `null`.

### `split_by_jurisdiction: true` — a PL/UK pair

Creates two collections from one filter — `"<name> — PL"` and `"<name> — UK"`
(both with the request's `description`) — and links them in
`public.collection_pairs` (migration `20260921000002`). There is no separate
"create pair" endpoint. Differences from the single-collection path:

- `filters.jurisdiction` is dropped by `strip_ignored()` before the RPC runs
  (honouring it would blank one side) and echoed back as
  `ignored_filter_keys: ["jurisdiction"]`. The pair row stores the cleaned
  filter.
- The cap applies **per side** (`check_cap(..., per_jurisdiction=True)`), so
  `413 FILTER_TOO_LARGE` names the offending side in `detail.jurisdiction`.
- A side with zero matches is `400 FILTER_EMPTY` with `detail.jurisdiction`
  set to that side (`null` when neither side matches anything).
- All-or-nothing: `create_pair_from_ids()` creates PL, then UK, then the pair
  row inside one `try`; if any step fails every collection created so far is
  deleted (best-effort, logged) before the original error propagates — the
  user never ends up with half a pair.
- `collection_ids` ownership is checked exactly as for the single path.
- `name` is stripped of surrounding whitespace once, in the request's
  `model_validator` (blank after strip → `422`), and that stripped value is
  what both side names and the pair row receive. In split mode it is limited
  to **200 characters** (`PAIR_NAME_MAX_LENGTH` → `422`): `collection_pairs.name`
  is `CHECK`ed at 1–200 and each side's collection name adds `" — PL"`/`" — UK"`
  under the 255-char `collections.name` bound. Checked before any query, so a
  too-long name never creates and fills two collections only to fail the pair
  insert.
- Audit: `collection_created` + `collection_document_added` per side plus one
  `collection_pair_created` (`resource_type: collection_pair`).
- Not transactional across processes: a crash between the PL and UK writes
  (or before the pair insert) can leave an ordinary orphan collection
  `"<name> — PL"` with no pair row; it shows up in `GET /collections` and is
  deletable like any other collection.

```json
{
  "collections": [
    { "jurisdiction": "PL", "collection": { "name": "Fraud — PL", "...": "" }, "added_count": 312 },
    { "jurisdiction": "UK", "collection": { "name": "Fraud — UK", "...": "" }, "added_count": 87 }
  ],
  "total_matched": 399,
  "pair_id": "uuid",
  "ignored_filter_keys": ["jurisdiction"]
}
```

Errors:

| Status | `detail.code` | When |
|---|---|---|
| `400` | `INVALID_COLLECTION_ID` | `filters.collection_ids` contains a non-string or non-UUID entry — checked before `resolve_filter_ids` runs |
| `404` | `COLLECTION_NOT_FOUND` | `filters.collection_ids` contains an id the caller does not own; which one is never revealed |
| `400` | `FILTER_EMPTY` | `resolve_filter_ids` returns zero ids (split: zero ids on one side — `detail.jurisdiction` names it, `null` when both are empty) |
| `413` | `FILTER_TOO_LARGE` | match count exceeds the cap (split: per side); body also carries `total`, `cap`, `jurisdiction` (`null` when not split) |
| `503` | `DATABASE_UNAVAILABLE` | `supabase_client` is not configured |

## `GET /collections/pairs`, `GET /collections/pairs/{pair_id}`, `DELETE /collections/pairs/{pair_id}`

Implemented in `backend/app/collection_pairs.py` (router registered before
`collections_router` so `/collections/{collection_id}` does not swallow the
literal `pairs` segment). DB layer:
`backend/packages/juddges_search/juddges_search/db/collection_pairs_db.py::CollectionPairsDB`
(`create_pair`, `list_pairs`, `find_pair`, `delete_pair`,
`pairs_by_collection`) — service-role client, so every query filters by
`user_id` itself.

`CollectionPair`:

```json
{
  "id": "uuid", "user_id": "uuid", "name": "Fraud",
  "filters": { "appellant": ["offender"] }, "text_query": "fraud",
  "created_at": "…", "updated_at": "…",
  "sides": [
    { "jurisdiction": "PL", "collection_id": "uuid" },
    { "jurisdiction": "UK", "collection_id": "uuid" }
  ]
}
```

`sides` carries no `document_count` — the read path cannot compute it cheaply;
`GET /collections` already returns per-collection counts. `GET /collections`
also carries the pair the other way round: each `CollectionWithDocuments` has
a `pair: {id, name, role, partner_collection_id} | null`
(`backend/app/collections.py::CollectionPairRef`/`transform_collection`),
resolved best-effort from `pairs_db.pairs_by_collection(user.id)` — a
transient failure there logs a warning and every collection gets `pair:
null` rather than breaking the whole list.

- `GET /collections/pairs` → `200 [CollectionPair]`, newest first, caller's own.
- `GET /collections/pairs/{pair_id}` → `200 CollectionPair`; `404` when the id
  is not a UUID, does not exist, or belongs to someone else (indistinguishable).
- `DELETE /collections/pairs/{pair_id}` → `204`; **unlinks only** — the pair
  row is deleted, both collections survive as ordinary collections. Deleting
  either collection via `DELETE /collections/{id}` cascades the pair row
  instead (`ON DELETE CASCADE`). `404` as for `GET`.

The `413` uses `starlette.status.HTTP_413_CONTENT_TOO_LARGE` directly (verified
present in the installed Starlette version — no fallback needed).

**`collection_ids` ownership check:** before `resolve_filter_ids` runs,
`check_collection_ids_ownership()` (`backend/app/collections_from_filter.py`, also
used by the `/compare/*` endpoints in `backend/app/compare/router.py`)
validates `filters.collection_ids` (a no-op when the key is absent or an
empty list, matching the RPC's own "no filter" semantics): every entry must
be a UUID string (else `400 INVALID_COLLECTION_ID`), and every id must
belong to the authenticated caller, checked in one call to
`db.get_user_collections(user.id)` (else `404 COLLECTION_NOT_FOUND`,
without saying which id was foreign). This is required because
`resolve_filter_ids` calls `list_extracted_filter_matches` with the
service-role client, which bypasses the RPC's own RLS.

Cap: `SAVE_FROM_FILTER_MAX_DOCUMENTS` (env var, default `5000`), enforced per
collection by `check_cap()` in `backend/app/extraction_domain/filter_ids.py`
before any documents are added. The server resolves ids once with
`resolve_filter_ids()` (which calls `list_extracted_filter_matches`) and then
`create_collection_from_ids()` upserts `collection_judgments` in chunks of
`BULK_ADD_CHUNK = 1000` (a module constant in `collections_from_filter.py`,
distinct from the frontend's 100-id batch chunk below).

**Compensating delete on partial failure:** `create_collection_from_ids()`
creates the collection first, then loops over 1000-id chunks calling
`db.bulk_add_documents(...)`. If any chunk raises, the function best-effort
deletes the collection it just created (logging a warning with how many of
the total ids were added before the failure) and re-raises the original
exception. If the compensating delete itself fails, that is logged at
`ERROR` ("a partial collection may remain") but the original exception still
propagates. Net effect: on success the caller gets a fully-populated
collection; on failure the caller gets an error and, best-effort, no
orphaned partial collection — never a collection silently holding only some
of the matched ids.

The pre-existing 100-id cap on `POST /collections/{id}/documents/batch`
(`settings.MAX_BATCH_DOCUMENT_IDS` in `backend/app/config.py`, defaulting to
`100`) is unchanged and unrelated — it protects a browser-driven add-to-collection
loop, whereas `/collections/from-filter` runs the loop server-side.

### `backend/app/extraction_domain/filter_ids.py`

- `FILTER_IDS_RPC = "list_extracted_filter_matches"`
- `SAVE_FROM_FILTER_MAX_DOCUMENTS: int` — alias of `app.config.settings.SAVE_FROM_FILTER_MAX_DOCUMENTS` (env var `SAVE_FROM_FILTER_MAX_DOCUMENTS`, default `5000`); kept importable from here so existing callers/tests don't break.
- `class FilterTooLargeError(Exception)` — carries `.total`, `.cap`, `.jurisdiction` (`None` unless raised per-jurisdiction).
- `class FilterIdsResult` (frozen dataclass) — `ids: list[str]`, `by_jurisdiction: dict[str, list[str]]`, plus a `.total` property.
- `resolve_filter_ids(client, filters, text_query) -> FilterIdsResult` — calls the RPC once and buckets ids by `jurisdiction` in the same pass (used by `split_by_jurisdiction` below and, indirectly, by `CompareService` via the facet RPC).
- `check_cap(result, cap=SAVE_FROM_FILTER_MAX_DOCUMENTS, *, per_jurisdiction=False) -> None` — raises `FilterTooLargeError` if `result.total > cap` (or, with `per_jurisdiction=True`, if either side's count exceeds `cap`).

### BFF proxy

- `POST /api/collections/from-filter` — `frontend/app/api/collections/from-filter/route.ts` reads the JSON body and forwards it via `proxyToBackend({ path: "/collections/from-filter", method: "POST", body })`.
- `frontend/app/api/utils/backend-proxy.ts::proxyToBackend()` — shared authenticated BFF → FastAPI forwarder. Requires a Supabase session (401 otherwise); passes the upstream response's status and body through unchanged, including FastAPI's `{"detail": {...}}` error envelope, so error unwrapping happens in exactly one frontend place. Supports `passthroughHeaders` (for binary/streamed responses that return `2xx`) and a `timeoutMs` (default `30_000`).
- `frontend/lib/api/collections.ts::createCollectionFromFilter(request)` — POSTs to `/api/collections/from-filter`, and on a non-OK response unwraps either the FastAPI `{detail: {...}}` shape or the BFF's flat `{error}` shape into one `CollectionFromFilterError` (has `.code`, `.status`, and optionally `.total`/`.cap`/`.jurisdiction`). On success it fires a `collection_created` analytics event per created collection and returns the parsed `CollectionFromFilterResponse`.

## `POST /compare/facets`, `POST /compare/export`, `GET /compare/pairs/{pair_id}`

Implemented in `backend/app/compare/router.py`
(`APIRouter(prefix="/compare")`). Every endpoint requires `Authorization:
Bearer <JWT>` (`get_current_user`) on top of the router-level API key — they
read collection membership, so there is no anonymous mode. `503
DATABASE_UNAVAILABLE` when `supabase_client` is not configured.

**Comparable fields** — the registry
(`backend/app/compare/fields.py::base_compare_fields()`) is every
enum/`enum` array item/boolean property of the base extraction schema
(`juddges_search.info_extraction.BaseSchemaExtractor().schema`), in
`x-ui-order` then name order, with `appeal_outcome`, `offender_gender`,
`sentence_serve`, `plea_point` pinned first (`DEFAULT_FIRST`). Free-text
array fields (`keywords`, `convict_offences`, …) are excluded on purpose —
high-cardinality and effectively PL-only.

### `POST /compare/facets`

Request body (`CompareRequest`):

```json
{
  "filters": { "...": "BaseSchemaFilters, same shape as /extractions/base-schema/filter" },
  "text_query": "string, ≤1000 chars, optional",
  "fields": ["appeal_outcome", "sentence_serve"]
}
```

`fields` (optional) is bounded to the registry size (`MAX_FIELDS = len(base_compare_fields())`)
and de-duplicated in request order by `select_base_fields()`; omitted →
every comparable field, in registry order. So one request never costs more
than one facet RPC call per registered field.

Success — `200 CompareResponse`:

```json
{
  "jurisdictions": ["PL", "UK"],
  "totals": { "PL": 153, "UK": 200 },
  "fields": [
    {
      "field": "sentence_serve",
      "label": "Sentence served",
      "source": "base",
      "kind": "enum_array",
      "coverage": {
        "PL": { "covered": 118, "total": 153, "ratio": 0.7712 },
        "UK": { "covered": 179, "total": 200, "ratio": 0.895 }
      },
      "tier": "partial",
      "missing_in": [],
      "values": [
        { "value": "custody", "counts": { "PL": 40, "UK": 60 }, "shares": { "PL": 0.339, "UK": 0.3352 } }
      ]
    }
  ],
  "ignored_filter_keys": [],
  "filters": { "...": "echoed back" },
  "text_query": null,
  "pair": null
}
```

- `coverage[j].total` counts only matched judgments **with completed base
  extraction** in jurisdiction `j` (see the facet RPC above); `covered`
  counts those with a non-empty value; `ratio = covered/total`, `null` when
  `total = 0`.
- `values[].shares[j] = counts[j] / coverage[j].covered`, `null` when
  `covered = 0`. Values are ordered by summed count across jurisdictions,
  then alphabetically, so PL and UK bars line up in the same order.
- `tier` (`backend/app/compare/layout.py`): `"empty"` (no judgment matched in
  either jurisdiction — the frontend hides these fields entirely), `"unavailable"`
  (at least one jurisdiction has `covered = 0` — listed as a sentence, never
  charted; `missing_in` names which), `"partial"` (every jurisdiction
  covered, but at least one below 80 %, `LOW_COVERAGE_THRESHOLD` — charted
  with a coverage badge), `"primary"` (every jurisdiction at or above 80 %).
- `ignored_filter_keys` is currently always `[]` for this endpoint (unlike
  `/collections/from-filter`'s `split_by_jurisdiction`, `/compare` never
  drops `jurisdiction` from the request because it never accepts one — the
  frontend's filter bar has no jurisdiction control).

Errors: `400 UNKNOWN_FIELD` (a requested field is not in the registry;
`detail.fields` names the offending ones — either `select_base_fields()`'s
own check or the service's `FieldNotComparableError` are both surfaced this
way), `400 INVALID_COLLECTION_ID` / `404 COLLECTION_NOT_FOUND`
(`filters.collection_ids` malformed or not owned — same
`check_collection_ids_ownership()` as `/collections/from-filter`), `500
COMPARE_FAILED` (any other failure computing the comparison), `503
DATABASE_UNAVAILABLE`.

### `POST /compare/export`

Same `CompareRequest` body as `/compare/facets`. Runs the identical
comparison and streams it as a long-format CSV — one row per (field, value,
jurisdiction) — built from
`backend/app/compare/csv_export.py::to_csv_rows`/`csv_bytes`, so the file can
never disagree with what `/compare/facets` would show for the same request.
UTF-8 with a BOM (Excel renders Polish labels correctly), headers
`Content-Disposition: attachment; filename="compare_<YYYY-MM-DD>.csv"` and
`X-Rows-Count: <n>`. Columns, in order:

| Column | Meaning |
|---|---|
| `field` | base-schema field name |
| `value` | one coded value of that field |
| `jurisdiction` | `PL` or `UK` |
| `count` | matched judgments with this value, in this jurisdiction |
| `share` | `count / covered`; empty cell when `covered = 0` |
| `coverage` | `covered / total`; empty cell when `total = 0` |
| `covered` | judgments in this jurisdiction with the field coded |
| `total` | judgments in this jurisdiction matched by the filter, with completed base extraction |

A field with tier `"unavailable"`/`"empty"` contributes no rows — its
coverage is already visible in the app; there is nothing to compare. Same
error codes as `/compare/facets`.

### `GET /compare/pairs/{pair_id}`

No request body or filters. The pair row is looked up with
`find_pair(pair_id, user.id)` — `404` if it does not exist or belongs to
someone else (indistinguishable) — and the base fields are computed over
`{"collection_ids": [pl_collection_id, uk_collection_id]}` built server-side
from that row; the lookup itself is the ownership check.

Success — `200 PairCompareResponse` (all of `CompareResponse` plus):

```json
{
  "...": "CompareResponse fields, filters = {\"collection_ids\": [pl_id, uk_id]}",
  "pair": { "id": "uuid", "name": "Fraud, suspended sentence", "pl_collection_id": "uuid", "uk_collection_id": "uuid" },
  "extension": {
    "schema_id": "uuid",
    "schema_name": "Sentencing extension v2",
    "source": "schema:<extraction_schema_id>",
    "jobs": {
      "PL": { "job_id": "celery-task-id", "completed_at": "2026-09-20T10:00:00Z" },
      "UK": { "job_id": "celery-task-id", "completed_at": "2026-09-19T08:00:00Z" }
    },
    "totals": { "PL": 118, "UK": 92 },
    "fields": [ "...same CompareField shape as the base fields, source = 'schema:<id>'" ]
  },
  "extension_reason": null
}
```

- The response's own `filters` is `{"collection_ids": [pl_id, uk_id]}` — the
  exact body `POST /compare/export` accepts to get a CSV of the same numbers
  (there is no separate pair-export endpoint).
- Exactly one of `extension` / `extension_reason` is set. The extension tally
  (`backend/app/compare/schema_tally.py`) picks each collection's **newest
  `SUCCESS`** extraction job that has a schema, requires both sides to have
  run the **same** `schema_id`, and derives comparable fields from that
  schema the same way as the base registry (enum/enum-array/boolean
  properties). Coverage denominators there are each job's completed
  documents, not the collection size, so `extension.totals` can differ from
  the base `totals`.
- `extension_reason` values (`ExtensionReason` in
  `backend/app/compare/models.py`): `no_jobs` (neither side has a usable
  job), `no_job_pl` / `no_job_uk` (only one side does), `schema_mismatch`
  (both have a job, but different `schema_id`), `schema_not_found` (the
  shared `schema_id` no longer resolves in `extraction_schemas`),
  `extension_failed` (reading jobs/schema raised — the base comparison is
  still returned; logged as an exception server-side).

Errors: `404` (pair not found/not owned), `500 COMPARE_FAILED` (base
comparison itself failed — the extension tally failing does not fail the
request; it degrades to `extension_reason: "extension_failed"`), `503
DATABASE_UNAVAILABLE`.

### Frontend

`/compare` and `/compare/[pairId]` (`frontend/app/compare/`) share the
`?f=`/`?q=`/`?nl=` URL codec with `/search/extractions`
(`buildComparePermalink` in `frontend/lib/compare/permalink.ts`, built on the
same `buildFilterHref`), so a link is portable between the two pages. A
saved pair opens at `/compare/{pairId}` with no filter blob needed. BFF
proxy routes live under `frontend/app/api/compare/` and
`frontend/app/api/collections/pairs/`.

## `POST /extractions/base-schema/nl-filter`

Implemented in `backend/app/extraction_domain/results_router.py::nl_to_filter`,
translator in `backend/app/extraction_domain/nl_filter_generator.py`.
Authenticated (`get_current_user`). Body `{"query": "<NL question>"}` →
`{"filters": {...}, "text_query": "..." | null}` (an `NLFilterResponse`, the
same shape `BaseSchemaFilter.to_rpc_payload()` returns). It is an opt-in
"paste your question" shortcut that pre-fills the `/search/extractions` form
— it never runs a search itself. Every request is logged (fire-and-forget)
via `record_search_query` in `search_analytics` so NL→filter usage can be
compared against form usage later.

Errors: `422 NL_FILTER_INVALID` when the LLM's output fails Pydantic
validation (an unknown/hallucinated enum value — surfaced as a 422 so the
caller can ask the user to rephrase rather than run a poisoned query); `502
NL_FILTER_FAILED` on any other translation failure.

### `BaseSchemaFilter` (`nl_filter_generator.py`)

A Pydantic model (`extra="forbid"`) mirroring every key
`filter_documents_by_extracted_data` accepts, structured-output-decoded from
an LLM (`llm.with_structured_output(BaseSchemaFilter)`, `use_mini_model=True`
by default) driven by a versioned system prompt (`SYSTEM_PROMPT`,
`NL_FILTER_PROMPT`). Field groups: core judgment columns (`jurisdiction:
list[Jurisdiction] | None`, `decision_date: DateRange | str | None`), scalar
and multi-value enums (one `Literal[...]` type per CHECK constraint in the
base-extraction migrations, so a hallucinated value raises a
`ValidationError` instead of reaching the database), free-text array
fields, booleans, numerics (`NumericRange | float | None`), a second date
field (`date_of_appeal_court_judgment`), ILIKE substring fields, and a
sibling `text_query: str | None` carried outside `p_filters`.
`to_rpc_payload()` calls `model_dump(exclude_none=True, by_alias=True)`,
pops `text_query` out of the dump, and returns `{"filters": ..., "text_query":
...}` — the exact body `POST /extractions/base-schema/filter` and
`/collections/from-filter` expect.

`NL_EXCLUDED_CORE_FIELDS: frozenset[str] = frozenset({"case_type",
"court_level"})` — these two `judgments` columns are deliberately **not**
modeled on `BaseSchemaFilter` at all (not merely hidden) because the data is
wrong (`case_type='Civil'` on UK criminal appeals, `court_level='Crown
Court'` on Court of Appeal; see `docs/reference/APP_STATUS_2026-08-21.md`
§4). `tests/app/test_nl_filter_prompt_contract.py` pins that neither field
name appears in the system prompt text or in the model's JSON Schema, so a
future prompt edit can't reintroduce them silently.

**Date semantics** (`SYSTEM_PROMPT` rule 4 — Polish and English phrasings
both map to the same ISO range):

| Phrase | Range |
|---|---|
| "in 2024" / "w 2024 r." | `{"from": "2024-01-01", "to": "2024-12-31"}` |
| "since 2020" / "od 2020" | `{"from": "2020-01-01"}` — **inclusive** of 2020 |
| "after 2020" / "po 2020" | `{"from": "2021-01-01"}` — **strictly next year**, exclusive of 2020 |
| "before 2010" / "przed 2010" | `{"to": "2009-12-31"}` — previous year-end, exclusive of 2010 |
| "between 2015 and 2024" / "2015–2024" / "w latach 2015–2024" | `{"from": "2015-01-01", "to": "2024-12-31"}` |

`decision_date` (judgment date, populated for every PL and UK row) is the
prompt's default date field; `date_of_appeal_court_judgment` is used only
when the user names the appeal-court judgment date explicitly — the two
fields are easy to conflate (an earlier prompt revision defaulted to the
latter) and users relying on the old default now get `decision_date`
instead.

`jurisdiction` (rule 8) is set only when the user names a country or legal
system — "UK" / "England" / "brytyjskie" / "w Anglii" → `["UK"]`; "Poland" /
"polskie" / "w Polsce" → `["PL"]`; "PL i UK" / "both countries" → `["PL",
"UK"]`. Writing the question in Polish is **not** by itself a reason to set
`["PL"]` — this deliberately does not reuse the diacritics-based PL/EN
heuristic in `backend/app/query_analysis.py`, which serves a different
(free-text search) heuristic where that inference is appropriate.

## Frontend URL state

`?f=<base64url JSON of BaseSchemaFilters>` · `?q=<text_query>` · `?page=<n>` ·
`?nl=<question>` (optional, truncated to 255 chars).

One codec, both in `frontend/lib/extractions/use-extracted-data-filters.ts`:

- `buildFilterSearchParams(state: FilterUrlState): URLSearchParams` — the single place that writes `f`/`q`/`page`/`nl`. `FilterUrlState` has an optional `nlQuestion` field and the function serialises it to `?nl=`. `useExtractedDataFilters()` reads/writes `nlQuestion` too: `FilterState.nlQuestion` is populated from `?nl=` on mount, `setNlQuestion(next: string | undefined)` updates it (round-tripping through `writeUrl`/`buildFilterSearchParams`), and `clearAll()` resets it to `undefined`. `NlFilterDialog.onApply(filters, textQuery, question)` passes the trimmed question through, and `/search/extractions`'s `applyNlFilters` calls `setNlQuestion(question)` alongside `setFilters`/`setTextQuery` so a shared link or reload keeps the originating question (used later to default a "Save as collection" name).
- `buildFilterHref(pathname, state, origin = ""): string` — `pathname` + the query string from `buildFilterSearchParams`, optionally prefixed by an absolute `origin`.

Core fields `jurisdiction`/`decision_date` are registered in
`CORE_FILTER_FIELDS` (`frontend/lib/extractions/base-schema-filter-config.ts`),
**not** in `FILTER_FIELDS` — `FIELDS_BY_GROUP`/`BaseFiltersDrawer` and
`filter-fields-map.ts` (Meili `base_*` columns) only iterate `FILTER_FIELDS`,
and neither applies to these two judgment columns. `BaseFiltersDrawer` and
`QuickFilters` are therefore unchanged by this migration. `isCoreFilterField()`
and `ALL_FILTER_FIELD_BY_NAME` (= `FILTER_FIELD_BY_NAME` merged with
`CORE_FILTER_FIELD_BY_NAME`) let chip-rendering code resolve labels for core
fields without special-casing them.

### `frontend/lib/extractions/drawer-adapter.ts`

Converts between `BaseSchemaFilters` (the RPC's JSON shape) and `BaseFilters`
(the drawer/control union used by `searchStore`), lifted out of
`app/search/extractions/page.tsx` so `/search/extractions` and future pages
(the PL/UK comparison, the NL scope filters) share one conversion:

- `toDrawerFilters(s: BaseSchemaFilters): BaseFilters` — every non-substring, non-core field, run through the value adapter.
- `coreToDrawerValue(field, value): BaseFilterValue | undefined` — same value adapter for a core field (`jurisdiction`/`decision_date`), additionally special-casing `enum_multi` control kind (looked up from `CORE_FILTER_FIELD_BY_NAME[field].control`, never hardcoded by field name) so a `tag_array` value renders as an `enum_multi` control.
- `applyDrawerChange(s, field, value): BaseSchemaFilters` — the inverse: control value → RPC JSON, setting or deleting the key.
- `applyCoreChange` — an alias of `applyDrawerChange`, exported separately purely so call sites read clearly when applying a core-field change.

Date-range handling is the one behavioral fix in this file: dates flow
through `frontend/lib/extractions/epoch-date.ts`'s `dateToEpochSeconds` /
`epochSecondsToDate` (not `isoToEpochSeconds` — that name does not exist).
The RPC speaks ISO `{from,to}` strings; `DateRangeControl` and
`BaseFilterValue`'s `date_range` kind speak epoch-second `{min,max}` numbers.
The adapter this file replaced passed epoch-second numbers straight into
`from`/`to`, producing invalid casts like `'1735689600'::DATE` in Postgres;
this adapter converts both ways through the epoch helpers instead. It also
accepts `{min,max}` with ISO-string values for date ranges (reachable only via
a hand-edited URL) by treating `min`/`max` as `from`/`to` before converting.

### `frontend/components/search/ScopeFilters.tsx`

`<ScopeFilters filters onChange disabled? />` — a "Scope" strip rendered on
`/search/extractions` above `BaseFiltersDrawer`, one `EnumMultiControl` for
`jurisdiction` and one `DateRangeControl` for `decision_date`, both driven by
`CORE_FILTER_FIELD_BY_NAME` and `coreToDrawerValue`/`applyCoreChange` from
`drawer-adapter.ts` above. It renders unconditionally (no feature flag) and
is deliberately outside `BaseFiltersDrawer` — the two core columns never
touch `FILTER_FIELDS`/`FIELDS_BY_GROUP`, so the drawer and its facet counts
are provably unchanged by this feature.

### Result rows and document highlighting

`frontend/lib/extractions/document-href.ts::buildDocumentHref(id, filters):
string` builds each `/search/extractions` result row's link via
`buildFilterHref` — `/documents/{id}?f=<same filters blob>`, plus a
`#base-fields` anchor (`BASE_FIELDS_ANCHOR`) appended whenever the filter
blob is non-empty (the presence of a query string is itself "the filter
carried something", so there's no second `encodeFilters` call to decide the
anchor).

`app/documents/[id]/_components/DocumentPageClient.tsx` reads `?f=` back
with `decodeFilters()`, fetches the document's metadata, and calls
`frontend/lib/extractions/filter-match.ts::matchedMetadataKeys(filters,
metadata): Set<string>` to compute which metadata keys satisfied the filter.
`matchedMetadataKeys` mirrors the RPC's per-control-kind matching semantics
(`= ANY` / array overlap / range / ILIKE) against a small
`CORE_FIELD_TO_METADATA_KEY` map (`jurisdiction` → `country`, `decision_date`
→ `date_issued`; everything else is `base_<field>`), so a highlighted cell is
exactly one the query actually matched on — not merely a field the filter
mentioned.

The result feeds `KeyInformation` (`frontend/lib/styles/components/key-information.tsx`)
via three props: `id={BASE_FIELDS_ANCHOR}` (the scroll target for the row
link above), `highlightKeys` (the matched-key set, rendered with emphasis),
and `highlightCaption` (e.g. "3 fields matched your filter"), plus a
screen-reader-only "Matched filter" marker on each highlighted cell.

### `SaveAsCollectionDialog` (`frontend/components/search/SaveAsCollectionDialog.tsx`)

Rendered in the `/search/extractions` results bar. `defaultName` is the `?nl=`
question when one is present, else a `Filtered judgments — <date>` fallback;
the field is editable up to 255 chars before saving. The trigger button is
disabled only when `total === 0` (via a `title` tooltip) or while the parent
page is loading/erroring — **there is no client-side row-count cap**. On
submit it calls `createCollectionFromFilter` and on success routes to
`/collections/{collections[0].collection.id}`; on a `CollectionFromFilterError`
with `total`/`cap` set (the `413` case) it renders the backend's message
plus `"(<total> matched, limit <cap>.)"` inline in the dialog rather than
guessing a limit client-side.

## Completeness helpers (backend)

`backend/app/extraction_domain/completeness.py`, with its own test coverage
(`tests/app/test_completeness.py`). Its docstring originally named four
**intended consumers that did not exist yet**; two have since landed —
`compare/layout.py` (`coverage_ratio`) and `compare/schema_tally.py`
(`completed_rows`, `is_empty_value`), both part of the PL/UK compare (#684).
The other two are still ahead of this module's consumers:
`extraction_domain/summary.py` and `extraction_domain/dataset_export.py`
(research-flow, #685). The module was written ahead of all four so the
sample review, the dataset export and the PL/UK comparison won't disagree
later about what counts as "empty" or "done".

- `COMPLETED_STATUSES: frozenset[str]` — `{"completed", "success", "partially_completed"}`.
- `EMPTY_MARKERS: frozenset[str]` — lowercase, stripped marker strings (`""`, `"n/a"`, `"na"`, `"not available"`, `"none"`, `"null"`, `"unknown"`, `"brak"`, `"brak danych"`, `"nie dotyczy"`, `"not applicable"`).
- `is_empty_value(value) -> bool` — `None`, marker strings (case-insensitive, stripped), and empty `list`/`dict` are empty; `0` and `False` are **not**.
- `flatten(obj, prefix="") -> dict` — dotted-key flattening of nested dicts; a non-empty dict value is recursed into, an *empty* dict is kept as a leaf value (not descended into).
- `completed_rows(results) -> list[dict]` — rows whose `status` (case-insensitive) is in `COMPLETED_STATUSES`; rows with a missing/`None`/empty status are excluded.
- `coverage_ratio(covered, total) -> float | None` — `covered / total` rounded to 4 decimals, or `None` when `total == 0`.

**Two definitions of "empty" are intended to coexist, not to converge:**
Python-side `is_empty_value` (above) is for free-text LLM output in
`extraction_jobs.results` (used by `compare/schema_tally.py` for the
extension-schema tally) and includes LLM markers such as `"n/a"` /
`"brak danych"`. The SQL-side facet RPC
(`get_extracted_facet_counts_by_jurisdiction`, documented above) follows the
contract this module's docstring anticipated: it treats only SQL
`NULL`/`''` as empty, because the `base_*` columns are enum-coded and cannot
contain an LLM marker string. The two scopes aren't expected to overlap —
one reads JSON results, the other reads typed columns — but a caller mixing
them would get different coverage numbers for what looks like the same
"empty" concept.

## Testing helper: `frontend/tests/route-contract-e2e/synthetic-session.ts`

Shared by the PR-gated Playwright route-contract harness (`npm run
test:e2e:route-contract`), which boots the standalone Next server against a
stub-services adapter and needs an authenticated session without a real
Supabase project:

- `APP_BASE_URL = 'http://127.0.0.1:3006'`, `ADAPTER_BASE_URL = 'http://127.0.0.1:4311'`, `USER_ID` (a fixed synthetic UUID).
- `interface AdapterRequest { method, path, query, unexpected? }` — the shape of one recorded request the stub adapter observed.
- `setSyntheticSession(context: BrowserContext): Promise<void>` — clears cookies and injects a synthetic `sb-127-auth-token` cookie encoding a valid-looking Supabase session.
- `expectNoUnexpectedStubRequests(request: APIRequestContext): Promise<void>` — asserts the stub recorded no request flagged `unexpected: true`, i.e. the spec didn't hit an unrouted backend path.
