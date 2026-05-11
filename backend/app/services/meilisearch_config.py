"""Meilisearch index configuration and data transformation for judgments."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from loguru import logger

if TYPE_CHECKING:
    from app.services.search import MeiliSearchService

# Index settings applied when the index is first created or reconfigured.
# Order of searchableAttributes affects relevance ranking — earlier = higher weight.
MEILISEARCH_INDEX_SETTINGS: dict[str, Any] = {
    "searchableAttributes": [
        "title",
        "case_number",
        "summary",
        "court_name",
        "judges_flat",
        "keywords",
        "legal_topics",
        "cited_legislation",
        "full_text",
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
        "jurisdiction",
        "court_level",
        "case_type",
        "decision_type",
        "outcome",
        "decision_date",
        "base_extraction_status",
        "base_num_victims",
        "base_victim_age_offence",
        "base_case_number",
        "base_co_def_acc_num",
        "base_date_of_appeal_court_judgment_ts",
    ],
    "sortableAttributes": [
        "decision_date",
        "updated_at",
        "created_at",
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

    # Base-schema extraction status (used to filter to fully-extracted docs)
    doc["base_extraction_status"] = row.get("base_extraction_status")

    # Numeric base-schema fields — kept native so Meilisearch can do range filters.
    for num_field in (
        "base_num_victims",
        "base_victim_age_offence",
        "base_case_number",
        "base_co_def_acc_num",
    ):
        doc[num_field] = row.get(num_field)

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

        # 2. Apply settings
        settings_resp = await service.configure_index(MEILISEARCH_INDEX_SETTINGS)
        task_uid = settings_resp.get("taskUid")
        if task_uid is not None:
            await service.wait_for_task(task_uid, max_wait=120.0)
        logger.info(f"Meilisearch index '{service.index_name}' settings applied")

        return True
    except Exception:
        logger.opt(exception=True).warning(
            "Failed to set up Meilisearch index — autocomplete will be unavailable"
        )
        return False
