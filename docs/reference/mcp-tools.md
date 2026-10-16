# MCP tools reference

The Juddges MCP server exposes three read-only tools. For setup, see [Connect an AI client to the Juddges MCP server](../how-to/mcp-server.md).

A tool call that fails reaches the client as a tool error (`isError: true`) whose text starts with `Error executing tool <name>: ` followed by the message quoted below.

## Authentication, scopes and identity

The tools take no credential argument. The MCP key in the `Authorization` header (or `JUDDGES_MCP_KEY` for stdio) is resolved to its owner before any tool runs, and each call acts as that user.

### Scopes are reserved and not enforced

Every key is created with the scope list `["search:read"]`, the API returns it as `scopes` in key listings, and the resolver attaches it to the request's principal as `mcp_scopes`. **Nothing reads it.** No tool or endpoint checks a scope, so a scope does not restrict, and cannot grant, anything today. This is harmless only because all three tools are read-only and every key has the same scope. Do not rely on a scope to limit what a key can do; if a tool that writes is ever added, enforcement has to be built first.

## `search_judgments`

Search Polish and UK judgments by meaning and keyword. Returns citations and snippets only; use `get_judgment` for full text.

| Argument | Type | Default | Notes |
|---|---|---|---|
| `query` | string | required | Polish or English. Must be a non-empty string after trimming; at most 2000 characters. |
| `jurisdiction` | string | none | Restrict to one jurisdiction. The stored values are `PL` and `UK`, and the filter is an exact match with no case normalisation in the code path. |
| `court` | string | none | Restrict to one court name (exact match on the stored name). |
| `date_from` | string | none | Earliest judgment date, ISO `YYYY-MM-DD`. |
| `date_to` | string | none | Latest judgment date, ISO `YYYY-MM-DD`. |
| `limit` | integer | `10` | Number of judgments, `1` to `25` inclusive. |

**Returns** a list of hits in rank order, one per judgment. Each hit:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Pass to `get_judgment` / `get_extracted_fields`. |
| `court` | string or null | |
| `case_number` | string or null | |
| `judgment_date` | string or null | ISO date. |
| `jurisdiction` | string or null | |
| `url` | string or null | Source URL. |
| `snippet` | string | The best-matching passage, at most 600 characters. |
| `score` | number or null | Rank score; only comparable within one result list. |

**Errors**

| Condition | Message |
|---|---|
| `query` not a string | `query must be a string` |
| `query` empty or blank | `query must not be empty` |
| `query` longer than 2000 characters | rejected by the shared search code with an HTTP 400 "too long" error |
| `limit` not an integer (booleans count as non-integers) | `limit must be an integer` |
| `limit` outside 1 to 25 | `limit must be between 1 and 25; got <n>` |
| `date_from` / `date_to` not an ISO date | `<field> must be an ISO date (YYYY-MM-DD); got '<value>'` |
| `date_from` later than `date_to` | `date_from must not be later than date_to` |

## `get_judgment`

Fetch one judgment's text, or one named section of it.

| Argument | Type | Default | Notes |
|---|---|---|---|
| `id` | string | required | An id from `search_judgments`. Letters, digits, `-`, `_`, `.` only; at most 255 characters. |
| `section` | string | `full_text` | One of the sections below. |

| Section | Source | Provenance |
|---|---|---|
| `full_text` | the judgment text | The court's verbatim wording. The only section that may be quoted as such. |
| `summary` | publisher-supplied summary | Not verbatim, not machine-generated. |
| `case_identification` | extraction pass | Machine-generated. |
| `facts` | extraction pass | Machine-generated. |
| `court_analysis` | extraction pass | Machine-generated. |
| `operative_part` | extraction pass | Machine-generated. |
| `conclusion` | extraction pass | Machine-generated. |

**Returns** an object with the citation fields `id`, `court`, `case_number`, `judgment_date`, `jurisdiction`, `url`, plus:

| Field | Type | Notes |
|---|---|---|
| `section` | string | The section returned (`full_text` when none was requested). |
| `text` | string | The section text; empty string when there is none. |
| `chars` | integer | Length of `text`. |
| `empty` | boolean | True when the section exists but holds nothing (for example, not extracted yet). |
| `generated` | boolean | True for the machine-generated sections. It is false for **both** `full_text` and `summary`, so check `section` before treating `text` as verbatim. |

**Errors**

| Condition | Message |
|---|---|
| `id` not a string | `id must be a string` |
| `id` empty or malformed | `id cannot be empty`, or `id contains invalid characters. Only alphanumeric, hyphens, underscores, and dots are allowed`, or `id exceeds maximum length of 255 characters` |
| `section` not a string | `section must be a string` |
| unknown `section` | `Unknown section '<value>'. Available sections: full_text, summary, case_identification, facts, court_analysis, operative_part, conclusion` |
| no such judgment | `No judgment with id '<id>'` |

A successful read is recorded in the audit log as a document view with `transport: mcp`.

## `get_extracted_fields`

Fetch the structured fields already extracted for one judgment. It reads stored values only and never runs the extraction agent. The values are machine-extracted, not the court's wording.

| Argument | Type | Default | Notes |
|---|---|---|---|
| `id` | string | required | As for `get_judgment`. |

**Returns** the citation fields (as for `get_judgment`) plus:

| Field | Type | Notes |
|---|---|---|
| `extraction_status` | object | `base`, `structure` and `deep_analysis`, each `pending`, `completed` or `failed`. `pending` means not extracted yet; `completed` with few fields means extracted and little found. |
| `base_fields` | object | Base-schema values. |
| `extraction_fields` | object | Other extracted values. |

The two field objects also carry bookkeeping columns such as `base_extraction_status`, so they are never empty for a stored judgment. Do not read a status entry as a legal finding.

**Errors** are those of `get_judgment` for `id`: the same messages for a non-string, empty or malformed `id`, and `No judgment with id '<id>'` when there is none. A successful read is audit-logged like `get_judgment`.

## HTTP-level responses

| Status | When |
|---|---|
| `401` | Missing, non-Bearer, unknown, revoked or expired key. Body `{"error": "Invalid or missing MCP key"}`, header `WWW-Authenticate: Bearer`. |
| `429` | Per-key budget spent (`MCP_RATE_LIMIT`, default `120/hour`), or, only when `TRUSTED_PROXY=true`, the caller's IP has spent its rejected-key budget (`MCP_IP_RATE_LIMIT`, default `20/minute`). Carries `Retry-After`. See [Rate limits](../how-to/mcp-server.md#6-rate-limits). |
| `503` | The MCP server is not running in this process. |
