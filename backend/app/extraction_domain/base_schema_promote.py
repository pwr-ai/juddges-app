"""Promote BaseSchemaExtractor output to typed ``base_*`` columns on judgments.

The extractor stores all 51 fields under ``base_raw_extraction`` (JSONB).
Supabase has matching typed ``base_*`` columns used by filter RPCs and now
also synced to Meilisearch. ``promote_to_typed_columns`` converts a raw
extraction dict into the ``{base_*: typed_value}`` payload that must be
merged into the row UPDATE so the typed columns are populated.

The extractor encodes missing values as the *string* ``"null"`` rather than
JSON null — these are coerced to ``None`` so downstream filters see SQL NULL.
"""

from __future__ import annotations

from datetime import date
from typing import Any

# CHECK-constraint allow-lists copied from
# supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql.
# Values outside these sets get coerced to None so a bad LLM output never blocks
# the typed-column UPDATE for an otherwise-good row.
_ENUM_SCALAR_ALLOWED: dict[str, frozenset[str]] = {
    "plea_point": frozenset(
        {
            "police_presence",
            "first_court_appearance",
            "before_trial",
            "first_day_of_trial",
            "after_first_day_of_trial",
            "dont_know",
        }
    ),
    "remand_decision": frozenset(
        {
            "unconditional_bail",
            "conditional_bail",
            "remanded_in_custody",
            "dont_know",
        }
    ),
    "offender_job_offence": frozenset(
        {
            "employed",
            "self_employed",
            "unemployed",
            "student",
            "retired",
            "other",
            "dont_know",
        }
    ),
    "offender_home_offence": frozenset(
        {
            "fixed_address",
            "homeless",
            "temporary_accommodation",
            "dont_know",
        }
    ),
    "offender_victim_relationship": frozenset(
        {
            "stranger",
            "relative",
            "acquaintance",
            "dont_know",
        }
    ),
    "victim_type": frozenset({"individual_person", "organisation"}),
    "pre_sent_report": frozenset({"low", "medium", "high", "dont_know"}),
    "appellant": frozenset({"offender", "attorney_general", "other"}),
}

_ENUM_ARRAY_ALLOWED: dict[str, frozenset[str]] = {
    "sentence_serve": frozenset(
        {"serve_concurrent", "serve_consecutive", "serve_unknown"}
    ),
    "offender_gender": frozenset({"gender_male", "gender_female", "gender_unknown"}),
    "offender_intox_offence": frozenset(
        {"intox_alcohol", "intox_drugs", "intox_unknown"}
    ),
    "victim_gender": frozenset({"gender_male", "gender_female", "gender_unknown"}),
    "victim_intox_offence": frozenset(
        {"intox_alcohol", "intox_drugs", "intox_unknown"}
    ),
    "appeal_against": frozenset(
        {
            "appeal_conviction_unsafe",
            "appeal_sentence_excessive",
            "appeal_sentence_lenient",
            "appeal_other",
            "appeal_unknown",
        }
    ),
    "appeal_outcome": frozenset(
        {
            "outcome_dismissed_or_refused",
            "outcome_conviction_quashed",
            "outcome_sentence_more_severe",
            "outcome_sentence_more_lenient",
            "outcome_other",
            "outcome_unknown",
        }
    ),
}


_STRING_FIELDS: tuple[str, ...] = (
    "neutral_citation_number",
    "appeal_court_judges_names",
    "case_name",
    "offender_representative_name",
    "crown_attorney_general_representative_name",
    "conv_court_names",
    "plea_point",
    "remand_decision",
    "remand_custody_time",
    "sent_court_name",
    "offender_age_offence",
    "offender_job_offence",
    "offender_home_offence",
    "offender_mental_offence",
    "offender_victim_relationship",
    "victim_type",
    "victim_job_offence",
    "victim_home_offence",
    "victim_mental_offence",
    "pre_sent_report",
    "appellant",
)

_DATE_FIELDS: tuple[str, ...] = ("date_of_appeal_court_judgment",)

_INT_FIELDS: tuple[str, ...] = ("num_victims", "co_def_acc_num")

_NUMERIC_FIELDS: tuple[str, ...] = ("case_number", "victim_age_offence")

_BOOLEAN_FIELDS: tuple[str, ...] = ("did_offender_confess", "vic_impact_statement")

_ARRAY_FIELDS: tuple[str, ...] = (
    "keywords",
    "convict_plea_dates",
    "convict_offences",
    "acquit_offences",
    "sentences_received",
    "sentence_serve",
    "what_ancilliary_orders",
    "offender_gender",
    "offender_intox_offence",
    "victim_gender",
    "victim_intox_offence",
    "pros_evid_type_trial",
    "def_evid_type_trial",
    "agg_fact_sent",
    "mit_fact_sent",
    "appeal_against",
    "appeal_ground",
    "sent_guide_which",
    "appeal_outcome",
    "reason_quash_conv",
    "reason_sent_excessive",
    "reason_sent_lenient",
    "reason_dismiss",
)


def _is_null_sentinel(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"", "null", "none"}
    return False


def _coerce_str(value: Any) -> str | None:
    if _is_null_sentinel(value):
        return None
    if isinstance(value, str):
        s = value.strip()
        # LLMs occasionally wrap enums in literal quotes: '"offender"' -> 'offender'.
        if len(s) >= 2 and s[0] == s[-1] and s[0] in {'"', "'"}:
            s = s[1:-1].strip()
        # Common typo: "don't_know" → "dont_know".
        if s.lower() == "don't_know":
            s = "dont_know"
        return s or None
    return str(value)


def _coerce_int(value: Any) -> int | None:
    if _is_null_sentinel(value) or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        v = value.strip()
        try:
            return int(v)
        except ValueError:
            try:
                f = float(v)
            except ValueError:
                return None
            return int(f) if f.is_integer() else None
    return None


def _coerce_numeric(value: Any) -> int | float | None:
    if _is_null_sentinel(value) or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return value
    if isinstance(value, str):
        v = value.strip()
        try:
            return int(v)
        except ValueError:
            try:
                return float(v)
            except ValueError:
                return None
    return None


def _coerce_bool(value: Any) -> bool | None:
    if _is_null_sentinel(value):
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"true", "yes", "t", "1"}:
            return True
        if v in {"false", "no", "f", "0"}:
            return False
    return None


def _coerce_array(value: Any) -> list[str] | None:
    if _is_null_sentinel(value):
        return None
    if isinstance(value, str):
        s = value.strip()
        return [s] if s else None
    if not isinstance(value, list):
        return None
    cleaned: list[str] = []
    for item in value:
        if _is_null_sentinel(item):
            continue
        s = item.strip() if isinstance(item, str) else str(item)
        if s:
            cleaned.append(s)
    return cleaned or None


def _coerce_date(value: Any) -> str | None:
    s = _coerce_str(value)
    if s is None:
        return None
    try:
        date.fromisoformat(s)
    except ValueError:
        return None
    return s


def promote_to_typed_columns(extracted: dict[str, Any] | None) -> dict[str, Any]:
    """Map extracted JSON → ``{base_*: typed_value}`` for every typed column.

    Always returns a key for every column. ``None`` is emitted for missing or
    sentinel values so re-extracting a row clears stale values rather than
    leaving them behind.
    """
    blob = extracted or {}
    out: dict[str, Any] = {}
    for f in _STRING_FIELDS:
        val = _coerce_str(blob.get(f))
        allowed = _ENUM_SCALAR_ALLOWED.get(f)
        if allowed is not None and val is not None and val not in allowed:
            val = None
        out[f"base_{f}"] = val
    for f in _DATE_FIELDS:
        out[f"base_{f}"] = _coerce_date(blob.get(f))
    for f in _INT_FIELDS:
        out[f"base_{f}"] = _coerce_int(blob.get(f))
    for f in _NUMERIC_FIELDS:
        out[f"base_{f}"] = _coerce_numeric(blob.get(f))
    for f in _BOOLEAN_FIELDS:
        out[f"base_{f}"] = _coerce_bool(blob.get(f))
    for f in _ARRAY_FIELDS:
        arr = _coerce_array(blob.get(f))
        allowed = _ENUM_ARRAY_ALLOWED.get(f)
        if allowed is not None and arr is not None:
            arr = [v for v in arr if v in allowed] or None
        out[f"base_{f}"] = arr
    return out


ALL_TYPED_COLUMNS: tuple[str, ...] = tuple(
    f"base_{f}"
    for f in (
        *_STRING_FIELDS,
        *_DATE_FIELDS,
        *_INT_FIELDS,
        *_NUMERIC_FIELDS,
        *_BOOLEAN_FIELDS,
        *_ARRAY_FIELDS,
    )
)
