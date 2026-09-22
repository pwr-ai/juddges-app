"""Extension-schema half of the pair view (Spec C AC4), tallied in Python.

Extension results live in `extraction_jobs.results` as JSONB
(`[{document_id, status, extracted_data}, ...]`), not in typed columns, so the
by-jurisdiction facet RPC cannot serve them. This module picks the job for each
side, checks both ran the same schema, derives the comparable fields from that
schema and counts values per jurisdiction through the same `build_field`
layout policy as the base fields.

Vocabulary, kept apart on purpose:

* **Job status** is `extraction_jobs.status`, constrained by the table to
  `PENDING | STARTED | SUCCESS | FAILURE`; a usable job is `SUCCESS`
  (`JOB_STATUS_SUCCESS`).
* **Document status** is the per-row `status` inside `results`; "done" rows
  are `COMPLETED_STATUSES` (`completed_rows`), and "filled" is
  `not is_empty_value(value)`, both shared with the sample review and the
  dataset export (`app.extraction_domain.completeness`). This means marker
  strings such as "unknown" or "n/a" count as not filled even when an
  extension enum lists them as a value.

Job selection is "the newest SUCCESS job with a schema per collection"
(ruling for #684). If the two newest jobs disagree on `schema_id` there is no
extension comparison, even if an older pair of jobs would have matched.

The metadata query never downloads `results`; those are fetched by id only
once both sides are known to share a schema, so a mismatch costs one small
query.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from loguru import logger

from app.compare.fields import FieldSpec, comparable_fields_from_schema
from app.compare.layout import JURISDICTIONS, build_field, coverage_ratio
from app.compare.models import (
    CompareField,
    CoverageStat,
    ExtensionCompare,
    ExtensionJobRef,
    ExtensionReason,
)
from app.extraction_domain.completeness import completed_rows, is_empty_value

__all__ = [
    "JOB_STATUS_SUCCESS",
    "ExtensionOutcome",
    "extension_for_pair",
    "latest_success_jobs",
    "load_job_results",
    "load_schema",
    "schema_properties",
    "tally_schema_fields",
    "value_tokens",
]

# extraction_jobs.status CHECK vocabulary (migration 20260807000001); job-level,
# distinct from the per-document COMPLETED_STATUSES inside `results`.
JOB_STATUS_SUCCESS = "SUCCESS"

_JOB_META_COLUMNS = "id, job_id, collection_id, schema_id, status, completed_at"
_JOB_RESULTS_COLUMNS = "id, results"
_SCHEMA_COLUMNS = "id, name, text"


def value_tokens(value: Any, kind: str) -> list[str]:
    """Distinct string tokens a filled value contributes to the value counts.

    boolean    -> "true"/"false" (real bools; anything else lower-cased as is)
    enum_array -> each non-empty item once (a scalar is treated as one item)
    enum       -> the value as a string
    """
    if kind == "boolean":
        if isinstance(value, bool):
            return ["true" if value else "false"]
        return [str(value).strip().lower()]
    if kind == "enum_array":
        items = value if isinstance(value, list) else [value]
        return list(dict.fromkeys(str(v) for v in items if not is_empty_value(v)))
    return [str(value)]


def tally_schema_fields(
    results_by_jurisdiction: dict[str, list[dict[str, Any]]],
    specs: list[FieldSpec],
) -> list[CompareField]:
    """Per-field coverage and value counts from `results` rows, per jurisdiction.

    `total` = completed rows on that side; `covered` = rows whose value for the
    field is filled. A row without `extracted_data` counts towards `total` only.
    """
    done = {
        j: completed_rows(results_by_jurisdiction.get(j, [])) for j in JURISDICTIONS
    }
    fields: list[CompareField] = []
    for spec in specs:
        coverage: dict[str, CoverageStat] = {}
        counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for j in JURISDICTIONS:
            covered = 0
            for row in done[j]:
                data = row.get("extracted_data")
                value = data.get(spec.field) if isinstance(data, dict) else None
                if is_empty_value(value):
                    continue
                covered += 1
                for token in value_tokens(value, spec.kind):
                    counts[j][token] += 1
            total = len(done[j])
            coverage[j] = CoverageStat(
                covered=covered, total=total, ratio=coverage_ratio(covered, total)
            )
        fields.append(
            build_field(spec, coverage, {j: dict(c) for j, c in counts.items()})
        )
    return fields


def schema_properties(text: Any) -> dict[str, dict[str, Any]]:
    """`extraction_schemas.text` -> JSON Schema `properties`.

    The column holds either a JSON Schema (`{"properties": {...}}`) or the
    editor's flat internal format (`{field: {type, ...}}`); the simplified
    `{field: "description"}` form has no typed fields and yields nothing.
    """
    if not isinstance(text, dict):
        return {}
    props = text.get("properties")
    if isinstance(props, dict):
        return {k: v for k, v in props.items() if isinstance(v, dict)}
    return {k: v for k, v in text.items() if isinstance(v, dict)}


def latest_success_jobs(
    client: Any, collection_ids: list[str], *, user_id: str
) -> dict[str, dict[str, Any]]:
    """`collection_id -> newest SUCCESS job (metadata only)` for the caller's jobs.

    Scoped by `user_id` because the client is service-role (bypasses RLS); jobs
    without a `schema_id` (base-schema runs) are skipped. `results` is not
    selected here — see `load_job_results`. `nullsfirst=False` keeps a
    still-running/never-completed row (`completed_at IS NULL`, which
    shouldn't occur for status=SUCCESS but costs nothing to guard) from
    sorting ahead of a real timestamp.
    """
    response = (
        client.table("extraction_jobs")
        .select(_JOB_META_COLUMNS)
        .in_("collection_id", collection_ids)
        .eq("user_id", user_id)
        .eq("status", JOB_STATUS_SUCCESS)
        .not_.is_("schema_id", "null")
        .order("completed_at", desc=True, nullsfirst=False)
        .execute()
    )
    newest: dict[str, dict[str, Any]] = {}
    for row in response.data or []:
        newest.setdefault(str(row["collection_id"]), row)
    return newest


def load_job_results(
    client: Any, job_ids: list[str]
) -> dict[str, list[dict[str, Any]]]:
    """`job id -> results rows` for exactly the given jobs (the heavy JSONB read)."""
    response = (
        client.table("extraction_jobs")
        .select(_JOB_RESULTS_COLUMNS)
        .in_("id", job_ids)
        .execute()
    )
    return {
        str(row["id"]): list(row.get("results") or []) for row in response.data or []
    }


def load_schema(client: Any, schema_id: str) -> dict[str, Any] | None:
    response = (
        client.table("extraction_schemas")
        .select(_SCHEMA_COLUMNS)
        .eq("id", schema_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


@dataclass(frozen=True)
class ExtensionOutcome:
    """Either an `ExtensionCompare` or the reason there is none."""

    extension: ExtensionCompare | None = None
    reason: ExtensionReason | None = None


def extension_for_pair(
    client: Any, pl_collection_id: str, uk_collection_id: str, *, user_id: str
) -> ExtensionOutcome:
    """Blocking: select jobs, check the schema, tally. Never raises HTTP errors."""
    sides = {"PL": pl_collection_id, "UK": uk_collection_id}
    newest = latest_success_jobs(client, list(sides.values()), user_id=user_id)
    jobs = {j: newest.get(cid) for j, cid in sides.items()}
    missing = [j for j in JURISDICTIONS if jobs[j] is None]
    if missing:
        if len(missing) == len(JURISDICTIONS):
            return ExtensionOutcome(reason="no_jobs")
        return ExtensionOutcome(reason=f"no_job_{missing[0].lower()}")  # type: ignore[arg-type]

    schema_ids = {str(job["schema_id"]) for job in jobs.values() if job}
    if len(schema_ids) != 1:
        logger.info("pair extension: schema mismatch {}", sorted(schema_ids))
        return ExtensionOutcome(reason="schema_mismatch")
    schema_id = schema_ids.pop()

    schema = load_schema(client, schema_id)
    if schema is None:
        return ExtensionOutcome(reason="schema_not_found")

    source = f"schema:{schema_id}"
    specs = comparable_fields_from_schema(
        {"properties": schema_properties(schema.get("text"))}, source=source
    )
    results = load_job_results(client, [str(job["id"]) for job in jobs.values() if job])
    by_side = {j: results.get(str(job["id"]), []) for j, job in jobs.items() if job}
    fields = tally_schema_fields(by_side, specs)
    totals = {j: len(completed_rows(rows)) for j, rows in by_side.items()}
    logger.info(
        "pair extension: schema {} -> {} fields, totals={}",
        schema_id,
        len(fields),
        totals,
    )
    return ExtensionOutcome(
        extension=ExtensionCompare(
            schema_id=schema_id,
            schema_name=schema.get("name"),
            source=source,
            jobs={
                j: ExtensionJobRef(
                    job_id=str(job["job_id"]), completed_at=job.get("completed_at")
                )
                for j, job in jobs.items()
                if job
            },
            totals=totals,
            fields=fields,
        )
    )
