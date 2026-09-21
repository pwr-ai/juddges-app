"""Aggregable-field allowlist for ``aggregate_extracted_data`` (#707).

Canonical list: frontend/lib/extractions/aggregable-fields.json. Derived from
FILTER_FIELDS (base-schema-filter-config.ts) — every field whose control is
enum_multi / boolean_tri / tag_array / numeric_range / date_range — minus
extraction metadata (extraction_status, extraction_model, extracted_at) and
identifiers (case_number, convict_plea_dates); plus offender_age_offence (a
base_* TEXT column without a filter control), the three core judgment
columns, and the deep_* scores and enums. Free-text (substring) fields are
never aggregable. tests/app/test_aggregate_fields.py asserts this module
equals the JSON; tests/db/test_aggregate_contract.py asserts the SQL kind
dispatch accepts every entry.
"""

from __future__ import annotations

AGGREGABLE_FIELDS: frozenset[str] = frozenset(
    {
        # enum_multi
        "appeal_against",
        "appeal_outcome",
        "appellant",
        "offender_gender",
        "offender_home_offence",
        "offender_intox_offence",
        "offender_job_offence",
        "offender_victim_relationship",
        "plea_point",
        "pre_sent_report",
        "remand_decision",
        "sentence_serve",
        "victim_gender",
        "victim_intox_offence",
        "victim_type",
        # boolean_tri
        "did_offender_confess",
        "vic_impact_statement",
        # tag_array
        "acquit_offences",
        "agg_fact_sent",
        "appeal_ground",
        "conv_court_names",
        "convict_offences",
        "def_evid_type_trial",
        "keywords",
        "mit_fact_sent",
        "pros_evid_type_trial",
        "reason_dismiss",
        "reason_quash_conv",
        "reason_sent_excessive",
        "reason_sent_lenient",
        "sent_court_name",
        "sentences_received",
        "sent_guide_which",
        "victim_home_offence",
        "victim_job_offence",
        "what_ancilliary_orders",
        # numeric_range
        "co_def_acc_num",
        "num_victims",
        "victim_age_offence",
        # base TEXT without a filter control
        "offender_age_offence",
        # date_range
        "date_of_appeal_court_judgment",
        # core judgment columns
        "jurisdiction",
        "decision_date",
        "court_name",
        # deep_* model scores / enums
        "deep_complexity_score",
        "deep_reasoning_quality_score",
        "deep_legal_domains",
        "deep_reasoning_patterns",
        "deep_judicial_tone",
        "deep_precedential_value",
    }
)

DEFAULT_AGGREGATE_FIELDS: tuple[str, ...] = (
    "offender_age_offence",
    "offender_gender",
    "convict_offences",
    "sentences_received",
    "appeal_outcome",
    "did_offender_confess",
    "court_name",
    "decision_date",
)

CORE_AGGREGATE_FIELDS: frozenset[str] = frozenset(
    {"jurisdiction", "decision_date", "court_name"}
)


def validate_fields(fields: list[str] | None) -> list[str]:
    """Return the ordered, de-duplicated field list to aggregate.

    ``None`` means the default set. Raises ``ValueError`` naming the first
    field that is not aggregable, or when the list is empty.
    """
    if fields is None:
        return list(DEFAULT_AGGREGATE_FIELDS)
    if not fields:
        raise ValueError("fields must contain at least one field")
    seen: list[str] = []
    for field in fields:
        if field not in AGGREGABLE_FIELDS:
            raise ValueError(f"field {field!r} is not aggregable")
        if field not in seen:
            seen.append(field)
    return seen
