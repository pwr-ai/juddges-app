"""Meilisearch index configuration and data transformation for judgments."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from loguru import logger

if TYPE_CHECKING:
    from app.services.search import MeiliSearchService

# Allow-list of base_* extraction columns emitted to Meili — kept here so the index settings module and the transformer share one source of truth.
BASE_SCHEMA_FIELDS = [
    "base_extraction_status",
    "base_extraction_model",
    "base_num_victims",
    "base_victim_age_offence",
    "base_case_number",
    "base_co_def_acc_num",
    "base_appellant",
    "base_plea_point",
    "base_remand_decision",
    "base_offender_job_offence",
    "base_offender_home_offence",
    "base_offender_victim_relationship",
    "base_offender_age_offence",
    "base_victim_type",
    "base_victim_job_offence",
    "base_victim_home_offence",
    "base_pre_sent_report",
    "base_conv_court_names",
    "base_sent_court_name",
    "base_did_offender_confess",
    "base_vic_impact_statement",
    "base_keywords",
    "base_convict_plea_dates",
    "base_convict_offences",
    "base_acquit_offences",
    "base_sentences_received",
    "base_sentence_serve",
    "base_what_ancilliary_orders",
    "base_offender_gender",
    "base_offender_intox_offence",
    "base_victim_gender",
    "base_victim_intox_offence",
    "base_pros_evid_type_trial",
    "base_def_evid_type_trial",
    "base_agg_fact_sent",
    "base_mit_fact_sent",
    "base_appeal_against",
    "base_appeal_ground",
    "base_sent_guide_which",
    "base_appeal_outcome",
    "base_reason_quash_conv",
    "base_reason_sent_excessive",
    "base_reason_sent_lenient",
    "base_reason_dismiss",
    "base_neutral_citation_number",
    "base_appeal_court_judges_names",
    "base_case_name",
    "base_offender_representative_name",
    "base_crown_attorney_general_representative_name",
    "base_remand_custody_time",
    "base_offender_mental_offence",
    "base_victim_mental_offence",
]

# Index settings applied when the index is first created or reconfigured.
# Order of searchableAttributes affects relevance ranking — earlier = higher weight.
MEILISEARCH_INDEX_SETTINGS: dict[str, Any] = {
    "searchableAttributes": [
        # Highest weight first — core surfaces.
        "title",
        "case_number",
        "summary",
        "court_name",
        "judges_flat",
        "keywords",
        "legal_topics",
        "cited_legislation",
        "full_text",
        # Lower weight — base_* free-form text used to break ties.
        "base_neutral_citation_number",
        "base_appeal_court_judges_names",
        "base_case_name",
        "base_offender_representative_name",
        "base_crown_attorney_general_representative_name",
        "base_remand_custody_time",
        "base_offender_age_offence",
        "base_offender_mental_offence",
        "base_victim_mental_offence",
    ],
    "rankingRules": [
        "words",
        "typo",
        "proximity",
        "attribute",
        "sort",
        "exactness",
    ],
    "filterableAttributes": [
        # original
        "jurisdiction",
        "court_level",
        "case_type",
        "decision_type",
        "outcome",
        "decision_date",
        "legal_topics",
        "keywords",
        "cited_legislation",
        # base_* — full filterable set
        "base_extraction_status",
        "base_extraction_model",
        "base_num_victims",
        "base_victim_age_offence",
        "base_case_number",
        "base_co_def_acc_num",
        "base_date_of_appeal_court_judgment_ts",
        "base_extracted_at_ts",
        "base_appellant",
        "base_plea_point",
        "base_remand_decision",
        "base_offender_job_offence",
        "base_offender_home_offence",
        "base_offender_victim_relationship",
        "base_offender_age_offence",
        "base_victim_type",
        "base_victim_job_offence",
        "base_victim_home_offence",
        "base_pre_sent_report",
        "base_conv_court_names",
        "base_sent_court_name",
        "base_did_offender_confess",
        "base_vic_impact_statement",
        "base_keywords",
        "base_convict_plea_dates",
        "base_convict_offences",
        "base_acquit_offences",
        "base_sentences_received",
        "base_sentence_serve",
        "base_what_ancilliary_orders",
        "base_offender_gender",
        "base_offender_intox_offence",
        "base_victim_gender",
        "base_victim_intox_offence",
        "base_pros_evid_type_trial",
        "base_def_evid_type_trial",
        "base_agg_fact_sent",
        "base_mit_fact_sent",
        "base_appeal_against",
        "base_appeal_ground",
        "base_sent_guide_which",
        "base_appeal_outcome",
        "base_reason_quash_conv",
        "base_reason_sent_excessive",
        "base_reason_sent_lenient",
        "base_reason_dismiss",
    ],
    "sortableAttributes": [
        "decision_date",
        "updated_at",
        "created_at",
        "base_date_of_appeal_court_judgment_ts",
        "base_extracted_at_ts",
        "base_num_victims",
        "base_case_number",
    ],
    "displayedAttributes": [
        "id",
        "case_number",
        "jurisdiction",
        "court_name",
        "court_level",
        "decision_date",
        "publication_date",
        "title",
        "summary",
        "judges",
        "judges_flat",
        "case_type",
        "decision_type",
        "outcome",
        "keywords",
        "legal_topics",
        "cited_legislation",
        "source_url",
        "created_at",
        "updated_at",
        *BASE_SCHEMA_FIELDS,
        "base_extracted_at",
        "base_extracted_at_ts",
        "base_date_of_appeal_court_judgment",
        "base_date_of_appeal_court_judgment_ts",
        # NOTE: full_text and embedding are intentionally excluded to keep
        # autocomplete responses small. full_text is still *searchable*.
    ],
    "typoTolerance": {
        "enabled": True,
        "minWordSizeForTypos": {
            "oneTypo": 4,
            "twoTypos": 8,
        },
        "disableOnWords": [
            "ii",
            "iii",
            "iv",
            "v",
            "vi",
            "vii",
            "viii",
            "ix",
            "x",
        ],
    },
    "synonyms": {
        "appeal": ["appeals", "odwolanie", "apelacja"],
        "apeal": ["appeal"],
        "odwolanie": ["apelacja", "appeal"],
        "criminal": ["karne", "karny"],
        "kriminalna": ["karna", "criminal"],
        "odpowiedzialnosc": ["odpowiedzialnosc", "odpowiedzialnosc karna"],
        "contract": ["umowa", "contracts"],
        "murdre": ["murder"],
        "sentancing": ["sentencing"],
        "senta": ["sentencing"],
        "dimissed": ["dismissed"],
        "damages": ["odszkodowanie", "compensation"],
    },
    "pagination": {
        "maxTotalHits": 1000,
    },
    "embedders": {
        "bge-m3": {
            "source": "userProvided",
            "dimensions": 1024,
        },
    },
}


def transform_judgment_for_meilisearch(row: dict[str, Any]) -> dict[str, Any]:
    """Transform a Supabase judgments row into a Meilisearch document.

    - Converts UUID ``id`` to string (Meilisearch requires string primary key).
    - Flattens JSONB ``judges`` into a single searchable string ``judges_flat``.
    - Drops the ``embedding`` vector (not useful in Meilisearch).
    - Coerces date objects to ISO-8601 strings.
    """
    doc: dict[str, Any] = {}

    doc["id"] = str(row["id"])

    # Scalar fields — pass through (Meilisearch handles None fine)
    for field in (
        "case_number",
        "jurisdiction",
        "court_name",
        "court_level",
        "case_type",
        "decision_type",
        "outcome",
        "title",
        "summary",
        "full_text",
        "source_url",
    ):
        doc[field] = row.get(field)

    # Date fields → ISO-8601 strings (None stays None)
    for date_field in ("decision_date", "publication_date", "created_at", "updated_at"):
        val = row.get(date_field)
        doc[date_field] = str(val) if val is not None else None

    # Array fields (TEXT[])
    for arr_field in ("keywords", "legal_topics", "cited_legislation"):
        val = row.get(arr_field)
        doc[arr_field] = list(val) if val else []

    # JSONB judges → flat string for full-text search
    judges = row.get("judges")
    doc["judges"] = judges
    if isinstance(judges, list):
        parts: list[str] = []
        for j in judges:
            if isinstance(j, dict):
                name = j.get("name", "")
                role = j.get("role", "")
                parts.append(f"{name} ({role})" if role else name)
            elif isinstance(j, str):
                parts.append(j)
        doc["judges_flat"] = ", ".join(parts)
    else:
        doc["judges_flat"] = str(judges) if judges else ""

    # Helper to coerce Decimal values from psycopg NUMERIC columns
    def coerce_numeric_value(value: Any) -> Any:
        """Convert psycopg Decimal scalars/lists into JSON-friendly int|float; pass through everything else."""
        if isinstance(value, Decimal):
            # Convert to int if integral, else float
            return int(value) if value % 1 == 0 else float(value)
        if isinstance(value, list):
            # Recursively coerce each element in arrays
            return [coerce_numeric_value(item) for item in value]
        return value

    # Pass through all base_* fields with Decimal coercion
    for field in BASE_SCHEMA_FIELDS:
        val = row.get(field)
        doc[field] = coerce_numeric_value(val)

    # Appeal-court judgment date: keep ISO string for display, expose an epoch
    # seconds field for numeric range filtering.
    appeal_date_val = row.get("base_date_of_appeal_court_judgment")
    appeal_date: date | None = None
    if isinstance(appeal_date_val, str) and appeal_date_val:
        try:
            appeal_date = date.fromisoformat(appeal_date_val)
        except ValueError:
            appeal_date = None
    elif isinstance(appeal_date_val, date):
        appeal_date = appeal_date_val

    doc["base_date_of_appeal_court_judgment"] = (
        appeal_date.isoformat() if appeal_date is not None else None
    )
    doc["base_date_of_appeal_court_judgment_ts"] = (
        int(datetime.combine(appeal_date, datetime.min.time()).timestamp())
        if appeal_date is not None
        else None
    )

    # Extraction timestamp: ISO string + epoch seconds twin for numeric filtering
    extracted_at_val = row.get("base_extracted_at")
    extracted_at: datetime | None = None
    if isinstance(extracted_at_val, datetime):
        extracted_at = extracted_at_val
    elif isinstance(extracted_at_val, str) and extracted_at_val:
        try:
            extracted_at = datetime.fromisoformat(
                extracted_at_val.replace("Z", "+00:00")
            )
        except ValueError:
            extracted_at = None

    doc["base_extracted_at"] = (
        extracted_at.isoformat() if extracted_at is not None else None
    )
    doc["base_extracted_at_ts"] = (
        int(extracted_at.timestamp()) if extracted_at is not None else None
    )

    # Explicitly skip embedding — it's useless in Meilisearch and huge
    return doc


async def setup_meilisearch_index(service: MeiliSearchService) -> bool:
    """Create the Meilisearch index and apply settings.

    Returns True if successful, False otherwise. Never raises — caller should
    treat Meilisearch as optional.
    """
    if not service.admin_configured:
        logger.info("Meilisearch admin not configured — skipping index setup")
        return False

    try:
        # 1. Create index only if it doesn't already exist
        if await service.index_exists():
            logger.info(
                f"Meilisearch index '{service.index_name}' already exists — skipping creation"
            )
        else:
            task_resp = await service.create_index(primary_key="id")
            task_uid = task_resp.get("taskUid")
            if task_uid is not None:
                await service.wait_for_task(task_uid)
            logger.info(f"Meilisearch index '{service.index_name}' created")

        # 2. Apply settings — and surface failure. ``wait_for_task`` only WARNs
        # on failed/canceled, so we must inspect the terminal status here or a
        # rejected embedder block silently leaves the index half-configured.
        settings_resp = await service.configure_index(MEILISEARCH_INDEX_SETTINGS)
        task_uid = settings_resp.get("taskUid")
        if task_uid is not None:
            task = await service.wait_for_task(task_uid, max_wait=120.0)
            status = task.get("status")
            if status != "succeeded":
                logger.error(
                    f"Meilisearch settings task {task_uid} did not succeed "
                    f"(status={status}): {task.get('error')}"
                )
                return False
        logger.info(f"Meilisearch index '{service.index_name}' settings applied")

        return True
    except Exception:
        logger.opt(exception=True).warning(
            "Failed to set up Meilisearch index — autocomplete will be unavailable"
        )
        return False


# ---------------------------------------------------------------------------
# Topics index
# ---------------------------------------------------------------------------

# Index settings for the ``topics`` index (bilingual criminal-case topic concepts).
# Order of searchableAttributes affects relevance ranking — earlier = higher weight.
MEILISEARCH_TOPICS_INDEX_SETTINGS: dict[str, Any] = {
    "searchableAttributes": [
        "label_pl",
        "label_en",
        "aliases_pl",
        "aliases_en",
    ],
    "filterableAttributes": [
        "category",
        "jurisdictions",
    ],
    "sortableAttributes": [
        "doc_count",
    ],
    # "*" instructs Meilisearch to display all stored fields (the default, but
    # set explicitly so future schema additions are auto-included).
    "displayedAttributes": ["*"],
    "rankingRules": [
        "words",
        "typo",
        "proximity",
        "attribute",
        "exactness",
        "doc_count:desc",
    ],
    "typoTolerance": {
        "enabled": True,
        "minWordSizeForTypos": {
            "oneTypo": 4,
            "twoTypos": 8,
        },
    },
    # Topics are short canonical phrases; stop-word removal would harm recall.
    "stopWords": [],
    "pagination": {
        "maxTotalHits": 500,  # matches the 500-concept cap in scripts/generate_search_topics.py
    },
}


async def setup_topics_meilisearch_index(service: MeiliSearchService) -> bool:
    """Create the Meilisearch ``topics`` index and apply settings.

    Returns True if successful, False otherwise.  Never raises — caller should
    treat Meilisearch as optional.
    """
    if not service.admin_configured:
        logger.info("Meilisearch admin not configured — skipping topics index setup")
        return False

    try:
        # 1. Create index only if it doesn't already exist
        if await service.index_exists():
            logger.info(
                f"Meilisearch index '{service.index_name}' already exists — skipping creation"
            )
        else:
            task_resp = await service.create_index(primary_key="id")
            task_uid = task_resp.get("taskUid")
            if task_uid is not None:
                await service.wait_for_task(task_uid)
            logger.info(f"Meilisearch index '{service.index_name}' created")

        # 2. Apply settings and surface failure.
        settings_resp = await service.configure_index(MEILISEARCH_TOPICS_INDEX_SETTINGS)
        task_uid = settings_resp.get("taskUid")
        if task_uid is not None:
            task = await service.wait_for_task(task_uid, max_wait=120.0)
            status = task.get("status")
            if status != "succeeded":
                logger.error(
                    f"Meilisearch topics settings task {task_uid} did not succeed "
                    f"(status={status}): {task.get('error')}"
                )
                return False
        logger.info(f"Meilisearch index '{service.index_name}' settings applied")

        return True
    except Exception:
        logger.opt(exception=True).warning(
            "Failed to set up Meilisearch topics index — topic autocomplete will be unavailable"
        )
        return False


# Columns fetched from the ``judgments`` table for the Meilisearch sync path.
# Used by both the Celery sync tasks and the one-shot backfill script.
# The embedding ``vector`` column is intentionally excluded (~6 KB/row, unused
# downstream — Meilisearch only stores the BGE-M3 vector we send via _vectors).
JUDGMENT_SYNC_COLUMNS = (
    "id, case_number, jurisdiction, court_name, court_level, decision_date, "
    "publication_date, title, summary, full_text, judges, case_type, "
    "decision_type, outcome, keywords, legal_topics, cited_legislation, "
    "source_url, created_at, updated_at, "
    "base_extraction_status, "
    "base_num_victims, base_victim_age_offence, "
    "base_case_number, base_co_def_acc_num, "
    "base_date_of_appeal_court_judgment, "
    "base_case_name, base_keywords, "
    "structure_case_identification_summary, "
    "structure_facts_summary, "
    "structure_operative_part_summary"
)
