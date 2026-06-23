# How-to: query-time attribute parsing on `/search`

The general document-search endpoint can parse structural attributes out of a
free-text query at request time and turn them into Meilisearch filter clauses,
leaving the rest of the query as full-text search (FTS). This tightens recall
and reduces wrong-jurisdiction hits (e.g. PL ↔ UK).

Parsing is **opt-in** via the `parse_attributes=true` flag. With the flag off
(the default) the endpoint behaves exactly as before.

## Endpoint

```
GET /api/search/documents?q=<query>&parse_attributes=true
```

Other parameters (`limit`, `offset`, `filters`, `semantic_ratio`) work as usual.
A caller-supplied `filters` expression is **preserved** and AND-combined with
the parsed filter rather than overwritten.

## What gets parsed

| Attribute | Examples | Becomes |
|---|---|---|
| Court | `SN`, `NSA`, `TK`, `SO`, `SR` (PL); `UKSC`, `EWCA`, `EWHC` (UK) | FTS term + infers jurisdiction |
| Jurisdiction | `pl`, `uk`, `jurisdiction:pl` | `jurisdiction = "..."` filter |
| Year | `2023` | `decision_date` range filter |
| Date range | `2020-2023`, `od 2021 do 2023` | `decision_date` range filter |
| Case number | `III CSK 245/22`, `[2023] EWCA Civ 1234` | FTS term |
| Case-number prefix | `III CSK` | FTS term |
| Judge | `sędzia Jan Kowalski`, `before Lord Reed` | FTS term |

Only **jurisdiction** and **decision_date** are *filterable* in the Meili index,
so only those become filter clauses. Court / case number / judge are
*searchable* (not filterable), so they are appended to the FTS query to keep
recall high.

## Examples

### Polish supreme-court query

```
GET /api/search/documents?q=wyrok SN 2023 III CSK&parse_attributes=true
```

Parsed:

```json
{
  "court": "SN",
  "jurisdiction": "pl",
  "year": 2023,
  "case_number_prefix": "III CSK"
}
```

Resulting Meili call:

- `filter`: `jurisdiction = "pl" AND decision_date >= "2023-01-01" AND decision_date <= "2023-12-31"`
- `q` (FTS): `wyrok SN III CSK`  (year consumed into the filter; court + docket
  prefix kept as searchable terms)

### Year range + topic

```
GET /api/search/documents?q=rozwód od 2021 do 2023&parse_attributes=true
```

- `filter`: `decision_date >= "2021-01-01" AND decision_date <= "2023-12-31"`
- `q` (FTS): `rozwód`

### UK neutral citation

```
GET /api/search/documents?q=appeal [2023] EWCA Civ 1234&parse_attributes=true
```

- `q` (FTS): `appeal [2023] EWCA Civ 1234` (citation kept as a searchable term;
  no filterable attribute is produced because the bracketed year is part of the
  citation, not a free-standing decision year)

### Plain query (no recognised tokens)

```
GET /api/search/documents?q=umowa najmu lokalu&parse_attributes=true
```

Nothing matches, so the query and filters are passed through unchanged and the
response is byte-identical to base search.

## Response

When parsing produced at least one attribute, the response includes a
`parsed_attributes` object (only non-null fields):

```json
{
  "documents": [...],
  "query": "wyrok SN III CSK",
  "parsed_attributes": {
    "court": "SN",
    "jurisdiction": "pl",
    "year": 2023,
    "case_number_prefix": "III CSK"
  }
}
```

For plain queries `parsed_attributes` is `null`.

## Implementation notes

- The parser is deterministic regex/heuristics only — no LLM. It is cheap when
  it doesn't match, so the search SLO is unaffected. An LLM fallback is
  intentionally out of scope until heuristics prove insufficient.
- Module: `backend/app/judgments_pkg/query_attribute_parser.py`
  (`parse_query_attributes`, `build_meili_filter`).
- Writing `parsed_attributes` into `search_analytics` is gated on a companion
  issue that extends that table; the endpoint currently logs the original
  user query and caller filter only.
