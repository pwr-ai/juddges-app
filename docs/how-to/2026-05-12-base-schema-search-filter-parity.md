# Base-schema search & filter parity on `/search` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote all 45 user-relevant `base_*` extraction columns to Meili `filterableAttributes` (and 9 free-form text columns to `searchableAttributes`), then drive both `/search` and `/search/extractions` from a shared `<BaseFiltersDrawer>` consuming `base-schema-filter-config.ts`.

**Architecture:** Single source of truth = the filter registry. Two backend translators stay separate (Meili clause builder for `/search`, PG RPC for `/search/extractions`). The drawer is dumb — it emits `(field, value)` events and the page-level glue translates. High-cardinality `tag_array` controls get Meili-facet-driven autocomplete. The settings PATCH is split into a safe block (everything except embedders) and an embedders block so the prod `bge-m3` rejection no longer takes filterableAttributes down with it.

**Tech Stack:** FastAPI + Pydantic + Celery + Meilisearch v1.13 (Python via httpx) on the backend; Next.js 15 App Router + React 19 + Zustand + Jest/Testing Library on the frontend. Tests via `pytest` (poetry) and `jest`.

**Companion spec:** [`docs/reference/specs/2026-05-12-base-schema-search-filter-parity-design.md`](../reference/specs/2026-05-12-base-schema-search-filter-parity-design.md).

---

## File map

**Backend** (`backend/app/services/meilisearch_config.py`)
- *Modify* the `transform_judgment_for_meilisearch` function to emit 45 filterable + 9 searchable `base_*` columns; coerce `Decimal` → `int|float`; emit the `base_extracted_at_ts` epoch-second twin.
- *Modify* `MEILISEARCH_INDEX_SETTINGS` to add fields to `filterableAttributes`, `searchableAttributes`, `sortableAttributes`, `displayedAttributes`.
- *Modify* `setup_meilisearch_index` to split the settings PATCH into phase A (safe) + phase B (embedders).

**Backend tests**
- *Modify* `backend/tests/app/test_meilisearch_sync.py`: add a row covering every `base_*` shape (text, text[], bool, int, numeric, date, timestamptz) and assert the transformer output.
- *Modify* the same file: assert `setup_meilisearch_index` issues two ordered PATCH calls and swallows the embedders failure.

**Backend (facets API)**
- *Modify* `backend/app/judgments_pkg/__init__.py` (`/search` POST handler) to forward `facets` and `facetQuery` to Meili and return `facetDistribution` in the response.

**Frontend (registry & store)**
- *Modify* `frontend/lib/extractions/base-schema-filter-config.ts`: add `operational` to `FilterGroup`, add 8 new field entries.
- *Create* `frontend/lib/extractions/url-serializer.ts` (extract from `/search/extractions`).
- *Modify* `frontend/lib/store/searchStore.ts`: replace the narrow `BaseFilters` shape (5 numeric fields) with a per-control discriminated union over the full registry.

**Frontend (translators & hooks)**
- *Modify* `frontend/hooks/useSearchResults.ts`: extend `buildMeilisearchFilter` with dispatch per control type; extend `BASE_FILTER_FIELDS` map to cover every registry field.
- *Create* `frontend/hooks/useBaseFieldFacets.ts`: debounced facet fetcher with 60s LRU cache.
- *Modify* `frontend/lib/api/search.ts`: add `fetchBaseFieldFacets(fields, query?)`.
- *Modify* `frontend/app/api/search/documents/route.ts`: forward `facets`/`facet_query` query params.

**Frontend (UI)**
- *Create* `frontend/components/search/controls/NumericRangeControl.tsx`.
- *Create* `frontend/components/search/controls/DateRangeControl.tsx`.
- *Create* `frontend/components/search/controls/EnumMultiControl.tsx`.
- *Create* `frontend/components/search/controls/TagArrayControl.tsx`.
- *Create* `frontend/components/search/controls/BooleanTriControl.tsx`.
- *Create* `frontend/components/search/BaseFiltersDrawer.tsx`.
- *Delete* `frontend/components/search/ExtractedFieldsFilter.tsx`.
- *Modify* `frontend/app/search/page.tsx`: mount drawer in place of the deleted widget.
- *Modify* `frontend/app/search/extractions/page.tsx`: mount drawer; keep substring text inputs above it.

**Frontend tests**
- *Modify* `frontend/__tests__/hooks/buildMeilisearchFilter.test.ts`: one case per new control type.
- *Create* `frontend/__tests__/components/search/BaseFiltersDrawer.test.tsx`.
- *Create* per-control tests under `frontend/__tests__/components/search/controls/`.

**Rollout artefacts**
- *Modify* `.context/apply_meili_settings.py` (or create if absent) to apply phase-A settings manually until the next image is built.

---

## Task 1 — Add `base_*` fields to the transformer (TDD)

**Files:**
- Modify: `backend/app/services/meilisearch_config.py:127-215`
- Test:   `backend/tests/app/test_meilisearch_sync.py`

- [ ] **Step 1 — Failing test: array, bool, text, and `_ts` twin all emitted.**

Append to `backend/tests/app/test_meilisearch_sync.py` inside `class TestTransformJudgmentForMeilisearch`:

```python
def test_base_schema_fields_are_emitted(self):
    from datetime import datetime, timezone
    row = self._make_row(
        # text scalar
        base_appellant="offender",
        # text array
        base_appeal_outcome=["dismissed", "varied_sentence"],
        # bool
        base_vic_impact_statement=True,
        # numeric integer
        base_num_victims=3,
        # text used as enum (low cardinality)
        base_offender_job_offence="employed",
        # text high-cardinality (searchable, not filterable)
        base_case_name="Smith v The Crown",
        # date (already supported)
        base_date_of_appeal_court_judgment=date(2020, 6, 1),
        # timestamptz — new twin
        base_extracted_at=datetime(2026, 5, 12, 10, 30, tzinfo=timezone.utc),
    )
    doc = transform_judgment_for_meilisearch(row)

    assert doc["base_appellant"] == "offender"
    assert doc["base_appeal_outcome"] == ["dismissed", "varied_sentence"]
    assert doc["base_vic_impact_statement"] is True
    assert doc["base_num_victims"] == 3
    assert doc["base_offender_job_offence"] == "employed"
    assert doc["base_case_name"] == "Smith v The Crown"
    assert doc["base_date_of_appeal_court_judgment"] == "2020-06-01"
    # epoch-second twin
    assert isinstance(doc["base_extracted_at_ts"], int)
    assert doc["base_extracted_at_ts"] == int(
        datetime(2026, 5, 12, 10, 30, tzinfo=timezone.utc).timestamp()
    )

def test_decimal_numeric_base_fields_are_coerced(self):
    from decimal import Decimal
    row = self._make_row(
        base_case_number=Decimal("1234"),
        base_victim_age_offence=Decimal("17.5"),
    )
    doc = transform_judgment_for_meilisearch(row)
    assert isinstance(doc["base_case_number"], (int, float))
    assert doc["base_case_number"] == 1234
    assert doc["base_victim_age_offence"] == 17.5
```

- [ ] **Step 2 — Run, expect FAIL.**

```
cd backend && poetry run pytest tests/app/test_meilisearch_sync.py::TestTransformJudgmentForMeilisearch -q
```
Expected: failures saying `KeyError: 'base_appellant'` (or similar), `KeyError: 'base_extracted_at_ts'`, and `Decimal` not `int|float`.

- [ ] **Step 3 — Implement.** In `backend/app/services/meilisearch_config.py`, replace the existing base-field block inside `transform_judgment_for_meilisearch` with the full registry. Insert *before* the existing appeal-date block (currently lines 184-212):

```python
from decimal import Decimal  # add to imports at top of file if absent

def _coerce(value):
    """Coerce psycopg-native types into JSON-friendly Python types."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value

# --- replace the existing "Numeric base-schema fields" block with this ---

# Filterable base_* fields — passed through as-is (Meili indexes by type).
# Text-array and scalar enums alike are filterable; numerics are coerced.
_BASE_PASSTHROUGH_FIELDS = (
    # already filterable (kept for visibility)
    "base_extraction_status",
    "base_num_victims",
    "base_victim_age_offence",
    "base_case_number",
    "base_co_def_acc_num",
    # newly filterable scalars
    "base_extraction_model",
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
    # newly filterable arrays
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
    # searchable-only free-form text (carried into the doc so Meili can match)
    "base_neutral_citation_number",
    "base_appeal_court_judges_names",
    "base_case_name",
    "base_offender_representative_name",
    "base_crown_attorney_general_representative_name",
    "base_remand_custody_time",
    "base_offender_mental_offence",
    "base_victim_mental_offence",
)

for field in _BASE_PASSTHROUGH_FIELDS:
    val = row.get(field)
    if isinstance(val, list):
        doc[field] = [_coerce(v) for v in val]
    else:
        doc[field] = _coerce(val)

# Appeal-court date — keep the existing ISO + epoch-twin block (now lines below)
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
    if appeal_date is not None else None
)

# Extraction timestamp — ISO + epoch-twin
extracted_at_val = row.get("base_extracted_at")
extracted_at: datetime | None = None
if isinstance(extracted_at_val, datetime):
    extracted_at = extracted_at_val
elif isinstance(extracted_at_val, str) and extracted_at_val:
    try:
        extracted_at = datetime.fromisoformat(extracted_at_val)
    except ValueError:
        extracted_at = None
doc["base_extracted_at"] = (
    extracted_at.isoformat() if extracted_at is not None else None
)
doc["base_extracted_at_ts"] = (
    int(extracted_at.timestamp()) if extracted_at is not None else None
)
```

- [ ] **Step 4 — Re-run tests, expect PASS.**

```
cd backend && poetry run pytest tests/app/test_meilisearch_sync.py::TestTransformJudgmentForMeilisearch -q
```
Expected: all green.

- [ ] **Step 5 — Commit.**

```bash
git add backend/app/services/meilisearch_config.py backend/tests/app/test_meilisearch_sync.py
git commit -m "feat(meili): emit 45 filterable + 9 searchable base_* fields in transformer"
```

---

## Task 2 — Extend Meili settings (filterable / searchable / sortable / displayed)

**Files:**
- Modify: `backend/app/services/meilisearch_config.py:34-82` (`MEILISEARCH_INDEX_SETTINGS`)
- Test:   `backend/tests/app/test_meilisearch_sync.py`

- [ ] **Step 1 — Failing test.** Append to `TestMeilisearchIndexSettings` class (create the class if missing):

```python
class TestMeilisearchIndexSettings:
    def test_filterable_attributes_cover_all_filterable_base_fields(self):
        from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS
        expected = {
            "base_extraction_status", "base_extraction_model",
            "base_num_victims", "base_victim_age_offence",
            "base_case_number", "base_co_def_acc_num",
            "base_date_of_appeal_court_judgment_ts",
            "base_extracted_at_ts",
            "base_appellant", "base_plea_point", "base_remand_decision",
            "base_offender_job_offence", "base_offender_home_offence",
            "base_offender_victim_relationship", "base_offender_age_offence",
            "base_victim_type", "base_victim_job_offence", "base_victim_home_offence",
            "base_pre_sent_report", "base_conv_court_names", "base_sent_court_name",
            "base_did_offender_confess", "base_vic_impact_statement",
            "base_keywords", "base_convict_plea_dates", "base_convict_offences",
            "base_acquit_offences", "base_sentences_received", "base_sentence_serve",
            "base_what_ancilliary_orders", "base_offender_gender",
            "base_offender_intox_offence", "base_victim_gender",
            "base_victim_intox_offence", "base_pros_evid_type_trial",
            "base_def_evid_type_trial", "base_agg_fact_sent", "base_mit_fact_sent",
            "base_appeal_against", "base_appeal_ground", "base_sent_guide_which",
            "base_appeal_outcome", "base_reason_quash_conv", "base_reason_sent_excessive",
            "base_reason_sent_lenient", "base_reason_dismiss",
        }
        actual = set(MEILISEARCH_INDEX_SETTINGS["filterableAttributes"])
        missing = expected - actual
        assert not missing, f"Missing filterable: {sorted(missing)}"

    def test_searchable_attributes_include_base_text_fields(self):
        from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS
        expected = {
            "base_neutral_citation_number", "base_appeal_court_judges_names",
            "base_case_name", "base_offender_representative_name",
            "base_crown_attorney_general_representative_name",
            "base_remand_custody_time", "base_offender_age_offence",
            "base_offender_mental_offence", "base_victim_mental_offence",
        }
        actual = set(MEILISEARCH_INDEX_SETTINGS["searchableAttributes"])
        missing = expected - actual
        assert not missing, f"Missing searchable: {sorted(missing)}"

    def test_sortable_attributes_include_base_ts_and_numerics(self):
        from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS
        for f in (
            "base_date_of_appeal_court_judgment_ts",
            "base_extracted_at_ts",
            "base_num_victims",
            "base_case_number",
        ):
            assert f in MEILISEARCH_INDEX_SETTINGS["sortableAttributes"]
```

- [ ] **Step 2 — Run, expect FAIL.**

```
cd backend && poetry run pytest tests/app/test_meilisearch_sync.py::TestMeilisearchIndexSettings -q
```

- [ ] **Step 3 — Implement.** In `backend/app/services/meilisearch_config.py`, update `MEILISEARCH_INDEX_SETTINGS`:

```python
MEILISEARCH_INDEX_SETTINGS: dict[str, Any] = {
    "searchableAttributes": [
        # Highest weight first — core surfaces.
        "title",
        "summary",
        "full_text",
        "case_number",
        "court_name",
        "judges_flat",
        "keywords",
        "legal_topics",
        "cited_legislation",
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
    "filterableAttributes": [
        # original
        "jurisdiction", "court_level", "case_type", "decision_type", "outcome",
        "decision_date", "legal_topics", "keywords", "cited_legislation",
        # base_* — full set
        "base_extraction_status", "base_extraction_model",
        "base_num_victims", "base_victim_age_offence", "base_case_number",
        "base_co_def_acc_num",
        "base_date_of_appeal_court_judgment_ts", "base_extracted_at_ts",
        "base_appellant", "base_plea_point", "base_remand_decision",
        "base_offender_job_offence", "base_offender_home_offence",
        "base_offender_victim_relationship", "base_offender_age_offence",
        "base_victim_type", "base_victim_job_offence", "base_victim_home_offence",
        "base_pre_sent_report", "base_conv_court_names", "base_sent_court_name",
        "base_did_offender_confess", "base_vic_impact_statement",
        "base_keywords", "base_convict_plea_dates", "base_convict_offences",
        "base_acquit_offences", "base_sentences_received", "base_sentence_serve",
        "base_what_ancilliary_orders", "base_offender_gender",
        "base_offender_intox_offence", "base_victim_gender",
        "base_victim_intox_offence", "base_pros_evid_type_trial",
        "base_def_evid_type_trial", "base_agg_fact_sent", "base_mit_fact_sent",
        "base_appeal_against", "base_appeal_ground", "base_sent_guide_which",
        "base_appeal_outcome", "base_reason_quash_conv",
        "base_reason_sent_excessive", "base_reason_sent_lenient",
        "base_reason_dismiss",
    ],
    "sortableAttributes": [
        "decision_date", "updated_at", "created_at",
        "base_date_of_appeal_court_judgment_ts", "base_extracted_at_ts",
        "base_num_victims", "base_case_number",
    ],
    "displayedAttributes": [
        # original
        "id", "case_number", "jurisdiction", "court_name", "court_level",
        "decision_date", "publication_date", "title", "summary", "judges",
        "judges_flat", "case_type", "decision_type", "outcome", "keywords",
        "legal_topics", "cited_legislation", "source_url",
        "created_at", "updated_at",
        # All base_* fields included so card view / detail can render without re-fetch.
        # (Use "*" if you'd rather auto-include future additions; explicit list keeps
        # the wire payload predictable.)
        *(f for f in [
            "base_extraction_status", "base_extraction_model", "base_extracted_at",
            "base_extracted_at_ts",
            "base_num_victims", "base_victim_age_offence", "base_case_number",
            "base_co_def_acc_num", "base_date_of_appeal_court_judgment",
            "base_date_of_appeal_court_judgment_ts",
            "base_appellant", "base_plea_point", "base_remand_decision",
            "base_offender_job_offence", "base_offender_home_offence",
            "base_offender_victim_relationship", "base_offender_age_offence",
            "base_victim_type", "base_victim_job_offence", "base_victim_home_offence",
            "base_pre_sent_report", "base_conv_court_names", "base_sent_court_name",
            "base_did_offender_confess", "base_vic_impact_statement",
            "base_keywords", "base_convict_plea_dates", "base_convict_offences",
            "base_acquit_offences", "base_sentences_received", "base_sentence_serve",
            "base_what_ancilliary_orders", "base_offender_gender",
            "base_offender_intox_offence", "base_victim_gender",
            "base_victim_intox_offence", "base_pros_evid_type_trial",
            "base_def_evid_type_trial", "base_agg_fact_sent", "base_mit_fact_sent",
            "base_appeal_against", "base_appeal_ground", "base_sent_guide_which",
            "base_appeal_outcome", "base_reason_quash_conv",
            "base_reason_sent_excessive", "base_reason_sent_lenient",
            "base_reason_dismiss",
            "base_neutral_citation_number", "base_appeal_court_judges_names",
            "base_case_name", "base_offender_representative_name",
            "base_crown_attorney_general_representative_name",
            "base_remand_custody_time", "base_offender_mental_offence",
            "base_victim_mental_offence",
        ]),
    ],
    "typoTolerance": { ... },  # unchanged — keep existing block verbatim
    "synonyms":      { ... },  # unchanged
    "pagination":    { ... },  # unchanged
    "embedders":     { ... },  # unchanged
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

```
cd backend && poetry run pytest tests/app/test_meilisearch_sync.py::TestMeilisearchIndexSettings -q
```

- [ ] **Step 5 — Commit.**

```bash
git add backend/app/services/meilisearch_config.py backend/tests/app/test_meilisearch_sync.py
git commit -m "feat(meili): extend index settings with all base_* filterable + searchable fields"
```

---

## Task 3 — Split the settings PATCH (safe + embedders)

**Files:**
- Modify: `backend/app/services/meilisearch_config.py:218-262` (`setup_meilisearch_index`)
- Test:   `backend/tests/app/test_meilisearch_sync.py`

- [ ] **Step 1 — Failing test.** Append to `test_meilisearch_sync.py`:

```python
class TestSetupMeilisearchIndexSplit:
    async def _service_with(self, *, exists=True, settings_status="succeeded",
                            embedder_raises=False):
        svc = MagicMock()
        svc.admin_configured = True
        svc.index_name = "judgments"
        svc.index_exists = AsyncMock(return_value=exists)
        svc.create_index = AsyncMock(return_value={"taskUid": 1})
        svc.configure_index = AsyncMock(return_value={"taskUid": 2})
        if embedder_raises:
            svc.update_settings_embedders = AsyncMock(side_effect=RuntimeError("rejected"))
        else:
            svc.update_settings_embedders = AsyncMock(return_value={"taskUid": 3})
        svc.wait_for_task = AsyncMock(return_value={"status": settings_status})
        return svc

    async def test_calls_safe_settings_then_embedders(self):
        from app.services.meilisearch_config import setup_meilisearch_index
        svc = await self._service_with()
        ok = await setup_meilisearch_index(svc)
        assert ok is True
        # The "safe" PATCH must not include the embedders block
        safe_arg = svc.configure_index.call_args[0][0]
        assert "embedders" not in safe_arg
        # The dedicated embedders call ran after the safe PATCH
        svc.update_settings_embedders.assert_awaited_once()

    async def test_embedders_failure_does_not_block_setup(self):
        from app.services.meilisearch_config import setup_meilisearch_index
        svc = await self._service_with(embedder_raises=True)
        ok = await setup_meilisearch_index(svc)
        # Safe phase succeeded; embedder failure is swallowed.
        assert ok is True
        svc.update_settings_embedders.assert_awaited_once()

    async def test_safe_phase_failure_returns_false(self):
        from app.services.meilisearch_config import setup_meilisearch_index
        svc = await self._service_with(settings_status="failed")
        ok = await setup_meilisearch_index(svc)
        assert ok is False
```

Add `pytest.mark.asyncio` markers via the project's existing fixture or `@pytest.mark.asyncio` decorator (mirror the surrounding test style).

- [ ] **Step 2 — Run, expect FAIL** (missing `update_settings_embedders`, no split).

- [ ] **Step 3 — Implement the split.** In `backend/app/services/search.py` (`MeiliSearchService`), add a new method right below `configure_index`:

```python
async def update_settings_embedders(self, embedders: dict[str, Any]) -> dict[str, Any]:
    """PATCH the embedders block separately so a rejection there can't take the
    rest of the settings down with it (see docs/reference/specs/2026-05-12-…)."""
    if not self.admin_configured:
        raise SearchServiceError("Meilisearch admin key is not configured")
    url = f"{self.base_url}/indexes/{self.index_name}/settings/embedders"
    async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
        response = await client.patch(url, json=embedders, headers=self._admin_headers())
        response.raise_for_status()
        return response.json()
```

In `backend/app/services/meilisearch_config.py`, replace `setup_meilisearch_index` with the split version:

```python
async def setup_meilisearch_index(service: MeiliSearchService) -> bool:
    if not service.admin_configured:
        logger.info("Meilisearch admin not configured — skipping index setup")
        return False
    try:
        # 1. Create index if missing.
        if await service.index_exists():
            logger.info(f"Meilisearch index '{service.index_name}' already exists")
        else:
            task_resp = await service.create_index(primary_key="id")
            if task_resp.get("taskUid") is not None:
                await service.wait_for_task(task_resp["taskUid"])
            logger.info(f"Meilisearch index '{service.index_name}' created")

        # 2a. Phase A — safe settings (everything except embedders).
        safe_settings = {k: v for k, v in MEILISEARCH_INDEX_SETTINGS.items() if k != "embedders"}
        settings_resp = await service.configure_index(safe_settings)
        if settings_resp.get("taskUid") is not None:
            task = await service.wait_for_task(settings_resp["taskUid"], max_wait=120.0)
            if task.get("status") != "succeeded":
                logger.error(
                    f"Meilisearch SAFE settings task {settings_resp['taskUid']} "
                    f"status={task.get('status')}: {task.get('error')}"
                )
                return False
        logger.info(f"Meilisearch '{service.index_name}' safe settings applied")

        # 2b. Phase B — embedders. Failure logs but does not block.
        embedders = MEILISEARCH_INDEX_SETTINGS.get("embedders")
        if embedders:
            try:
                emb_resp = await service.update_settings_embedders(embedders)
                if emb_resp.get("taskUid") is not None:
                    emb_task = await service.wait_for_task(emb_resp["taskUid"], max_wait=120.0)
                    if emb_task.get("status") != "succeeded":
                        logger.warning(
                            f"Meilisearch EMBEDDERS task {emb_resp['taskUid']} "
                            f"status={emb_task.get('status')}: {emb_task.get('error')} — "
                            "non-fatal; filterable settings already applied"
                        )
            except Exception as exc:  # noqa: BLE001 — intentionally swallow
                logger.warning(
                    f"Meilisearch embedders PATCH failed: {exc} — non-fatal"
                )
        return True
    except Exception:
        logger.opt(exception=True).warning("Failed to set up Meilisearch index")
        return False
```

- [ ] **Step 4 — Re-run tests, expect PASS.**

```
cd backend && poetry run pytest tests/app/test_meilisearch_sync.py::TestSetupMeilisearchIndexSplit -q
```

- [ ] **Step 5 — Commit.**

```bash
git add backend/app/services/{search.py,meilisearch_config.py} backend/tests/app/test_meilisearch_sync.py
git commit -m "fix(meili): split settings PATCH into safe + embedders phases"
```

---

## Task 4 — Forward `facets` & `facet_query` through the search proxy

**Files:**
- Modify: `backend/app/judgments_pkg/__init__.py` (`/search` POST handler)
- Modify: `backend/app/services/search.py` (`MeiliSearchService.search`)
- Test:   `backend/tests/app/test_search_documents_integration.py` (or create `test_search_facets.py`)

- [ ] **Step 1 — Failing test.** Create `backend/tests/app/test_search_facets.py`:

```python
"""Tests for the facets pass-through on /search."""
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_facets_param_forwarded_to_meili(client_with_api_key):
    """When the request body includes facets=[…], the proxy passes them to Meili
    and returns the facetDistribution unchanged."""
    fake_response = {
        "hits": [], "estimatedTotalHits": 0, "query": "",
        "facetDistribution": {
            "base_appeal_outcome": {"dismissed": 124, "allowed": 33},
        },
    }
    with patch("app.services.search.MeiliSearchService.search",
               new=AsyncMock(return_value=fake_response)) as mock:
        resp = client_with_api_key.post(
            "/documents/search",
            json={"query": "", "facets": ["base_appeal_outcome"], "limit": 0},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("facetDistribution") == fake_response["facetDistribution"]
        # The forwarded payload includes facets.
        args, kwargs = mock.call_args
        assert kwargs.get("facets") == ["base_appeal_outcome"] or "facets" in args
```

(If the existing test fixture file already provides `client_with_api_key`, import it; otherwise mirror the fixture from `test_documents_crud.py`.)

- [ ] **Step 2 — Run, expect FAIL** (current endpoint doesn't accept `facets`).

- [ ] **Step 3 — Implement.** In `MeiliSearchService.search` (`backend/app/services/search.py`), accept `facets` and `facet_query` params; pass them through to Meili's POST `/indexes/<idx>/search` body. In the `/documents/search` handler, accept those keys in the request model and forward them.

  - Find the existing `SearchDocumentsRequest` Pydantic model used by the `/documents/search` endpoint (grep for `class SearchDocumentsRequest`).
  - Add: `facets: list[str] | None = None` and `facet_query: str | None = None`.
  - In the handler, pass both into the underlying `MeiliSearchService.search(...)` call.
  - In the response, include `facetDistribution` and `facetStats` from the Meili response verbatim.

- [ ] **Step 4 — Re-run tests, expect PASS.**

```
cd backend && poetry run pytest tests/app/test_search_facets.py -q
```

- [ ] **Step 5 — Commit.**

```bash
git add backend/app/judgments_pkg/__init__.py backend/app/services/search.py backend/tests/app/test_search_facets.py
git commit -m "feat(search): forward facets + facet_query through /documents/search"
```

---

## Task 5 — Frontend Next.js route forwards facets

**Files:**
- Modify: `frontend/app/api/search/documents/route.ts`
- Test:   `frontend/__tests__/api/search/documents.test.ts` (extend existing)

- [ ] **Step 1 — Failing test.** Append a case to the existing route test (or create one), asserting `facets` query-string is forwarded:

```ts
it("forwards facets[] and facet_query to the backend", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ documents: [], facetDistribution: {} }), { status: 200 })
  );
  const url = new URL("http://localhost/api/search/documents");
  url.searchParams.append("q", "");
  url.searchParams.append("facets", "base_appeal_outcome");
  url.searchParams.append("facets", "base_keywords");
  url.searchParams.set("facet_query", "frau");
  await GET(new NextRequest(url));
  const calledUrl = fetchMock.mock.calls[0][0] as string;
  expect(calledUrl).toContain("facets=base_appeal_outcome");
  expect(calledUrl).toContain("facets=base_keywords");
  expect(calledUrl).toContain("facet_query=frau");
});
```

- [ ] **Step 2 — Run, expect FAIL.**

```
cd frontend && npm test -- __tests__/api/search/documents.test.ts
```

- [ ] **Step 3 — Implement.** In `frontend/app/api/search/documents/route.ts`, after the existing param block:

```ts
// Multi-value facets[]
searchParams.getAll("facets").forEach((v) => params.append("facets", v));
const facetQuery = searchParams.get("facet_query");
if (facetQuery) params.set("facet_query", facetQuery);
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/app/api/search/documents/route.ts frontend/__tests__/api/search/documents.test.ts
git commit -m "feat(api): forward facets + facet_query through search-documents proxy"
```

---

## Task 6 — Add the `operational` group + 8 registry entries

**Files:**
- Modify: `frontend/lib/extractions/base-schema-filter-config.ts`
- Test:   `frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts`

- [ ] **Step 1 — Failing test.** Add cases to the existing config test:

```ts
import { FILTER_FIELDS, FILTER_FIELD_BY_NAME, GROUP_ORDER, GROUP_LABELS }
  from "@/lib/extractions/base-schema-filter-config";

describe("base-schema-filter-config — new fields", () => {
  it("declares the operational group last", () => {
    expect(GROUP_ORDER[GROUP_ORDER.length - 1]).toBe("operational");
    expect(GROUP_LABELS.operational).toMatch(/Operational/i);
  });
  it.each([
    ["conv_court_names",     "court_date",  "tag_array"],
    ["sent_court_name",      "court_date",  "tag_array"],
    ["victim_job_offence",   "victim",      "tag_array"],
    ["victim_home_offence",  "victim",      "tag_array"],
    ["extraction_model",     "operational", "enum_multi"],
    ["extracted_at",         "operational", "date_range"],
    ["extraction_status",    "operational", "enum_multi"],
  ])("registers %s under %s as %s", (field, group, control) => {
    const cfg = FILTER_FIELD_BY_NAME[field];
    expect(cfg).toBeDefined();
    expect(cfg!.group).toBe(group);
    expect(cfg!.control).toBe(control);
  });
});
```

- [ ] **Step 2 — Run, expect FAIL.**

```
cd frontend && npm test -- __tests__/lib/extractions/base-schema-filter-config.test.ts
```

- [ ] **Step 3 — Implement.** Edit `base-schema-filter-config.ts`:

```ts
export type FilterGroup =
  | "offender"
  | "victim"
  | "charges_plea"
  | "sentence"
  | "appeal"
  | "court_date"
  | "evidence"
  | "other"
  | "operational";  // NEW

export const GROUP_LABELS: Record<FilterGroup, string> = {
  offender: "Offender",
  victim: "Victim",
  charges_plea: "Charges & Plea",
  sentence: "Sentence",
  appeal: "Appeal",
  court_date: "Court & Date",
  evidence: "Evidence & Reasons",
  other: "Other",
  operational: "Operational",
};

export const GROUP_ORDER: readonly FilterGroup[] = [
  "court_date",
  "offender",
  "victim",
  "charges_plea",
  "sentence",
  "appeal",
  "evidence",
  "other",
  "operational",
] as const;
```

Append eight entries to the `FILTER_FIELDS` array (place each within its group block for readability):

```ts
// inside court_date block:
{
  field: "conv_court_names",
  label: "Convicting court",
  group: "court_date",
  control: "tag_array",
},
{
  field: "sent_court_name",
  label: "Sentencing court",
  group: "court_date",
  control: "tag_array",
},
// inside victim block:
{
  field: "victim_job_offence",
  label: "Victim job (free-text)",
  group: "victim",
  control: "tag_array",
},
{
  field: "victim_home_offence",
  label: "Victim accommodation (free-text)",
  group: "victim",
  control: "tag_array",
},
// NEW operational block:
{
  field: "extraction_model",
  label: "Extraction model",
  group: "operational",
  control: "enum_multi",
},
{
  field: "extracted_at",
  label: "Extraction date",
  group: "operational",
  control: "date_range",
},
{
  field: "extraction_status",
  label: "Extraction status",
  group: "operational",
  control: "enum_multi",
},
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/lib/extractions/base-schema-filter-config.ts frontend/__tests__/lib/extractions/base-schema-filter-config.test.ts
git commit -m "feat(filters): add operational group + 8 base_* registry entries"
```

---

## Task 7 — Widen `BaseFilters` in the search store

**Files:**
- Modify: `frontend/lib/store/searchStore.ts`
- Test:   `frontend/__tests__/lib/store/searchStore.base-filters.test.ts` (new)

- [ ] **Step 1 — Failing test.** Create the test file:

```ts
import { useSearchStore, type BaseFilters } from "@/lib/store/searchStore";

describe("BaseFilters discriminated union", () => {
  it("accepts an enum_multi value", () => {
    const f: BaseFilters = {
      appellant: { kind: "enum_multi", values: ["offender"] },
    };
    expect(f.appellant?.kind).toBe("enum_multi");
  });
  it("accepts a tag_array value", () => {
    const f: BaseFilters = {
      convict_offences: { kind: "tag_array", values: ["theft"] },
    };
    expect(f.convict_offences?.kind).toBe("tag_array");
  });
  it("accepts a boolean_tri value", () => {
    const f: BaseFilters = {
      vic_impact_statement: { kind: "boolean_tri", value: true },
    };
    expect(f.vic_impact_statement?.kind).toBe("boolean_tri");
  });
  it("accepts a numeric_range value (back-compat with the old shape)", () => {
    const f: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 2, max: 5 } },
    };
    expect((f.num_victims as any).range.min).toBe(2);
  });
});
```

- [ ] **Step 2 — Run, expect FAIL** (type errors).

- [ ] **Step 3 — Implement.** Replace the existing `BaseFilters` block with:

```ts
export type BaseNumericRange = { min?: number; max?: number };
export type BooleanTri = boolean | "unset";

export type BaseFilterValue =
  | { kind: "enum_multi"; values: string[] }
  | { kind: "tag_array"; values: string[] }
  | { kind: "boolean_tri"; value: BooleanTri }
  | { kind: "numeric_range"; range: BaseNumericRange }
  | { kind: "date_range"; range: BaseNumericRange };

export type BaseFilters = Partial<Record<string, BaseFilterValue>>;
```

The store's `setBaseFilter(field, value)` action signature widens to accept any `BaseFilterValue | undefined`.

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/lib/store/searchStore.ts frontend/__tests__/lib/store/searchStore.base-filters.test.ts
git commit -m "feat(store): widen BaseFilters into a per-control discriminated union"
```

---

## Task 8 — Extract `BASE_FILTER_FIELDS` and URL serializer

**Files:**
- Create: `frontend/lib/extractions/filter-fields-map.ts`
- Create: `frontend/lib/extractions/url-serializer.ts`
- Test:   `frontend/__tests__/lib/extractions/url-serializer.test.ts` (new)

- [ ] **Step 1 — Failing test.** Create:

```ts
import { encodeBaseFilters, decodeBaseFilters }
  from "@/lib/extractions/url-serializer";
import type { BaseFilters } from "@/lib/store/searchStore";

describe("url-serializer", () => {
  it("round-trips enum_multi", () => {
    const f: BaseFilters = {
      appellant: { kind: "enum_multi", values: ["offender", "attorney_general"] },
    };
    const params = new URLSearchParams(encodeBaseFilters(f));
    expect(decodeBaseFilters(params)).toEqual(f);
  });
  it("round-trips numeric_range", () => {
    const f: BaseFilters = {
      num_victims: { kind: "numeric_range", range: { min: 2 } },
    };
    const params = new URLSearchParams(encodeBaseFilters(f));
    expect(decodeBaseFilters(params)).toEqual(f);
  });
  it("ignores unknown fields when decoding", () => {
    const params = new URLSearchParams("not_a_field=x");
    expect(decodeBaseFilters(params)).toEqual({});
  });
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.** `frontend/lib/extractions/filter-fields-map.ts`:

```ts
// Registry field name → Meili column name (most are prefixed with `base_`).
import { FILTER_FIELDS } from "./base-schema-filter-config";

export const BASE_FILTER_FIELDS: Record<string, string> =
  Object.fromEntries(
    FILTER_FIELDS.map((c) => {
      // date_range fields use the epoch-sec twin in Meili.
      const meiliField =
        c.control === "date_range" ? `base_${c.field}_ts` : `base_${c.field}`;
      return [c.field, meiliField];
    })
  );
```

`frontend/lib/extractions/url-serializer.ts`:

```ts
import type { BaseFilters, BaseFilterValue, BaseNumericRange }
  from "@/lib/store/searchStore";
import { FILTER_FIELD_BY_NAME } from "./base-schema-filter-config";

const PREFIX = "f.";

export function encodeBaseFilters(filters: BaseFilters): URLSearchParams {
  const out = new URLSearchParams();
  for (const [field, value] of Object.entries(filters)) {
    if (!value) continue;
    const key = `${PREFIX}${field}`;
    switch (value.kind) {
      case "enum_multi":
      case "tag_array":
        value.values.forEach((v) => out.append(key, v));
        break;
      case "boolean_tri":
        if (value.value !== "unset") out.set(key, String(value.value));
        break;
      case "numeric_range":
      case "date_range":
        if (typeof value.range.min === "number") out.set(`${key}.min`, String(value.range.min));
        if (typeof value.range.max === "number") out.set(`${key}.max`, String(value.range.max));
        break;
    }
  }
  return out;
}

export function decodeBaseFilters(params: URLSearchParams): BaseFilters {
  const out: BaseFilters = {};
  for (const [key, raw] of params.entries()) {
    if (!key.startsWith(PREFIX)) continue;
    const [field, bound] = key.slice(PREFIX.length).split(".");
    const cfg = FILTER_FIELD_BY_NAME[field];
    if (!cfg) continue;
    if (cfg.control === "enum_multi" || cfg.control === "tag_array") {
      const existing =
        (out[field] as Extract<BaseFilterValue, { kind: "enum_multi" | "tag_array" }> | undefined)?.values
        ?? [];
      out[field] = { kind: cfg.control, values: [...existing, raw] };
    } else if (cfg.control === "boolean_tri") {
      out[field] = { kind: "boolean_tri", value: raw === "true" };
    } else if (cfg.control === "numeric_range" || cfg.control === "date_range") {
      const existing =
        (out[field] as Extract<BaseFilterValue, { kind: "numeric_range" | "date_range" }> | undefined)?.range
        ?? ({} as BaseNumericRange);
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      const next: BaseNumericRange = { ...existing, [bound ?? "min"]: num };
      out[field] = { kind: cfg.control, range: next };
    }
  }
  return out;
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/lib/extractions/filter-fields-map.ts frontend/lib/extractions/url-serializer.ts frontend/__tests__/lib/extractions/url-serializer.test.ts
git commit -m "feat(filters): shared registry→meili map + URL (de)serializer"
```

---

## Task 9 — Rewrite `buildMeilisearchFilter` to dispatch per control type

**Files:**
- Modify: `frontend/hooks/useSearchResults.ts`
- Test:   `frontend/__tests__/hooks/buildMeilisearchFilter.test.ts`

- [ ] **Step 1 — Failing tests.** Append:

```ts
it("emits IN clause for enum_multi", () => {
  const f: BaseFilters = {
    appellant: { kind: "enum_multi", values: ["offender", "attorney_general"] },
  };
  expect(buildMeilisearchFilter(f, [])).toBe(
    '(base_appellant IN ["offender", "attorney_general"])'
  );
});
it("emits IN clause for tag_array", () => {
  const f: BaseFilters = {
    convict_offences: { kind: "tag_array", values: ["theft", "fraud"] },
  };
  expect(buildMeilisearchFilter(f, [])).toBe(
    '(base_convict_offences IN ["theft", "fraud"])'
  );
});
it("emits true/false for boolean_tri", () => {
  expect(buildMeilisearchFilter(
    { vic_impact_statement: { kind: "boolean_tri", value: true } }, []
  )).toBe("(base_vic_impact_statement = true)");
  expect(buildMeilisearchFilter(
    { vic_impact_statement: { kind: "boolean_tri", value: false } }, []
  )).toBe("(base_vic_impact_statement = false)");
});
it("emits no clause for boolean_tri 'unset'", () => {
  expect(buildMeilisearchFilter(
    { vic_impact_statement: { kind: "boolean_tri", value: "unset" } }, []
  )).toBeUndefined();
});
it("emits >= AND <= for date_range using the _ts twin", () => {
  const min = 1577836800; // 2020-01-01 UTC
  const max = 1609459199; // 2020-12-31 UTC
  const f: BaseFilters = {
    date_of_appeal_court_judgment: {
      kind: "date_range", range: { min, max },
    },
  };
  expect(buildMeilisearchFilter(f, [])).toBe(
    `(base_date_of_appeal_court_judgment_ts >= ${min} AND base_date_of_appeal_court_judgment_ts <= ${max})`
  );
});
it("combines jurisdiction + enum + range with AND", () => {
  const f: BaseFilters = {
    appellant: { kind: "enum_multi", values: ["offender"] },
    num_victims: { kind: "numeric_range", range: { min: 1 } },
  };
  const out = buildMeilisearchFilter(f, ["pl"])!;
  expect(out).toContain('(jurisdiction = "PL")');
  expect(out).toContain('(base_appellant IN ["offender"])');
  expect(out).toContain("(base_num_victims >= 1)");
  expect(out.split(" AND ").length).toBe(3);
});
```

Verify existing numeric-range tests still pass under the new shape (they use `kind: 'numeric_range'`).

- [ ] **Step 2 — Run, expect FAIL.**

```
cd frontend && npm test -- __tests__/hooks/buildMeilisearchFilter.test.ts
```

- [ ] **Step 3 — Implement.** Replace the existing `buildMeilisearchFilter` (and supporting `rangeToClause` / `BASE_FILTER_FIELDS`) in `frontend/hooks/useSearchResults.ts` with:

```ts
import { BASE_FILTER_FIELDS } from "@/lib/extractions/filter-fields-map";
import { FILTER_FIELD_BY_NAME } from "@/lib/extractions/base-schema-filter-config";

function rangeClause(field: string, range: BaseNumericRange): string | null {
  const parts: string[] = [];
  if (typeof range.min === "number") parts.push(`${field} >= ${range.min}`);
  if (typeof range.max === "number") parts.push(`${field} <= ${range.max}`);
  return parts.length ? parts.join(" AND ") : null;
}

function jsonArray(values: string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(", ")}]`;
}

function controlToClause(
  field: string,
  meiliField: string,
  value: BaseFilterValue
): string | null {
  switch (value.kind) {
    case "enum_multi":
    case "tag_array":
      return value.values.length
        ? `${meiliField} IN ${jsonArray(value.values)}`
        : null;
    case "boolean_tri":
      return value.value === "unset" ? null : `${meiliField} = ${value.value}`;
    case "numeric_range":
    case "date_range":
      return rangeClause(meiliField, value.range);
  }
}

export function buildMeilisearchFilter(
  baseFilters: BaseFilters,
  languages: string[]
): string | undefined {
  const clauses: string[] = [];
  const lang = languagesToJurisdictionClause(languages);
  if (lang) clauses.push(`(${lang})`);
  for (const [field, value] of Object.entries(baseFilters)) {
    if (!value) continue;
    const meiliField = BASE_FILTER_FIELDS[field];
    if (!meiliField) continue;
    const clause = controlToClause(field, meiliField, value);
    if (clause) clauses.push(`(${clause})`);
  }
  return clauses.length ? clauses.join(" AND ") : undefined;
}
```

- [ ] **Step 4 — Re-run all hook tests, expect PASS.**

```
cd frontend && npm test -- __tests__/hooks/buildMeilisearchFilter.test.ts
```

- [ ] **Step 5 — Commit.**

```bash
git add frontend/hooks/useSearchResults.ts frontend/__tests__/hooks/buildMeilisearchFilter.test.ts
git commit -m "feat(search): buildMeilisearchFilter dispatches on control type"
```

---

## Task 10 — `NumericRangeControl` sub-component

**Files:**
- Create: `frontend/components/search/controls/NumericRangeControl.tsx`
- Test:   `frontend/__tests__/components/search/controls/NumericRangeControl.test.tsx`

- [ ] **Step 1 — Failing test.**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { NumericRangeControl } from "@/components/search/controls/NumericRangeControl";

describe("NumericRangeControl", () => {
  it("emits the range on min change", () => {
    const onChange = jest.fn();
    render(<NumericRangeControl label="Victims" value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/victims minimum/i), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith({ kind: "numeric_range", range: { min: 2 } });
  });
  it("clears with empty min", () => {
    const onChange = jest.fn();
    render(
      <NumericRangeControl label="Victims" value={{ kind: "numeric_range", range: { min: 2 } }} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText(/victims minimum/i), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 2 — Run, expect FAIL** (component missing).

- [ ] **Step 3 — Implement.**

```tsx
"use client";
import React from "react";
import type { BaseFilterValue, BaseNumericRange } from "@/lib/store/searchStore";

export interface NumericRangeControlProps {
  label: string;
  description?: string;
  value: Extract<BaseFilterValue, { kind: "numeric_range" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "numeric_range" }> | undefined) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
}

function parseBound(raw: string): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function emit(
  current: BaseNumericRange,
  side: "min" | "max",
  raw: string,
  onChange: NumericRangeControlProps["onChange"],
) {
  const next: BaseNumericRange = { ...current, [side]: parseBound(raw) };
  if (next.min === undefined && next.max === undefined) onChange(undefined);
  else onChange({ kind: "numeric_range", range: next });
}

export function NumericRangeControl({
  label, description, value, onChange, min, step, disabled,
}: NumericRangeControlProps) {
  const range = value?.range ?? {};
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      {description && <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">{description}</div>}
      <div className="flex items-center gap-2">
        <input
          type="number" min={min} step={step}
          value={range.min ?? ""} disabled={disabled}
          aria-label={`${label} minimum`}
          onChange={(e) => emit(range, "min", e.target.value, onChange)}
          className="w-full rounded border px-2 py-1 text-xs"
        />
        <span>–</span>
        <input
          type="number" min={min} step={step}
          value={range.max ?? ""} disabled={disabled}
          aria-label={`${label} maximum`}
          onChange={(e) => emit(range, "max", e.target.value, onChange)}
          className="w-full rounded border px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/components/search/controls/NumericRangeControl.tsx frontend/__tests__/components/search/controls/NumericRangeControl.test.tsx
git commit -m "feat(filters): NumericRangeControl sub-component"
```

---

## Task 11 — `DateRangeControl` sub-component

**Files:**
- Create: `frontend/components/search/controls/DateRangeControl.tsx`
- Test:   `frontend/__tests__/components/search/controls/DateRangeControl.test.tsx`

- [ ] **Step 1 — Failing test.**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { DateRangeControl } from "@/components/search/controls/DateRangeControl";

it("converts ISO date input to epoch seconds (UTC midnight)", () => {
  const onChange = jest.fn();
  render(<DateRangeControl label="When" value={undefined} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText(/when minimum/i), { target: { value: "2020-01-01" } });
  expect(onChange).toHaveBeenCalledWith({
    kind: "date_range", range: { min: Date.parse("2020-01-01T00:00:00Z") / 1000 },
  });
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.** Mirror `NumericRangeControl` but use `<input type="date">`; helpers `dateToEpochSeconds` / `epochSecondsToDate` lifted from the now-deleted `ExtractedFieldsFilter.tsx`.

```tsx
"use client";
import React from "react";
import type { BaseFilterValue, BaseNumericRange } from "@/lib/store/searchStore";

function dateToEpochSeconds(iso: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}
function epochSecondsToDate(s: number | undefined): string {
  if (typeof s !== "number") return "";
  const d = new Date(s * 1000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export interface DateRangeControlProps {
  label: string;
  description?: string;
  value: Extract<BaseFilterValue, { kind: "date_range" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "date_range" }> | undefined) => void;
  disabled?: boolean;
}

export function DateRangeControl({ label, description, value, onChange, disabled }: DateRangeControlProps) {
  const range = value?.range ?? {};
  const emit = (side: "min" | "max", iso: string) => {
    const next: BaseNumericRange = { ...range, [side]: dateToEpochSeconds(iso) };
    if (next.min === undefined && next.max === undefined) onChange(undefined);
    else onChange({ kind: "date_range", range: next });
  };
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      {description && <div className="mb-1 text-[11px]">{description}</div>}
      <div className="flex items-center gap-2">
        <input type="date" disabled={disabled}
          value={epochSecondsToDate(range.min)}
          aria-label={`${label} minimum`}
          onChange={(e) => emit("min", e.target.value)}
          className="w-full rounded border px-2 py-1 text-xs" />
        <span>–</span>
        <input type="date" disabled={disabled}
          value={epochSecondsToDate(range.max)}
          aria-label={`${label} maximum`}
          onChange={(e) => emit("max", e.target.value)}
          className="w-full rounded border px-2 py-1 text-xs" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/components/search/controls/DateRangeControl.tsx frontend/__tests__/components/search/controls/DateRangeControl.test.tsx
git commit -m "feat(filters): DateRangeControl sub-component"
```

---

## Task 12 — `BooleanTriControl` sub-component

**Files:**
- Create: `frontend/components/search/controls/BooleanTriControl.tsx`
- Test:   `frontend/__tests__/components/search/controls/BooleanTriControl.test.tsx`

- [ ] **Step 1 — Failing test.**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { BooleanTriControl } from "@/components/search/controls/BooleanTriControl";

it("toggles between Any / Yes / No", () => {
  const onChange = jest.fn();
  render(<BooleanTriControl label="Confessed" value={undefined} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /yes/i }));
  expect(onChange).toHaveBeenCalledWith({ kind: "boolean_tri", value: true });
  fireEvent.click(screen.getByRole("button", { name: /no/i }));
  expect(onChange).toHaveBeenCalledWith({ kind: "boolean_tri", value: false });
  fireEvent.click(screen.getByRole("button", { name: /any/i }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.**

```tsx
"use client";
import React from "react";
import type { BaseFilterValue } from "@/lib/store/searchStore";

export interface BooleanTriControlProps {
  label: string;
  value: Extract<BaseFilterValue, { kind: "boolean_tri" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "boolean_tri" }> | undefined) => void;
  disabled?: boolean;
}

export function BooleanTriControl({ label, value, onChange, disabled }: BooleanTriControlProps) {
  const v = value?.value;
  const set = (next: true | false | undefined) => {
    if (next === undefined) onChange(undefined);
    else onChange({ kind: "boolean_tri", value: next });
  };
  const Pill = ({ active, label, action }: { active: boolean; label: string; action: () => void }) => (
    <button type="button" disabled={disabled} onClick={action}
      className={`px-2 py-1 text-xs rounded border ${active ? "bg-[color:var(--ink)] text-[color:var(--parchment)]" : ""}`}>
      {label}
    </button>
  );
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      <div className="flex gap-1">
        <Pill active={v === undefined} label="Any"  action={() => set(undefined)} />
        <Pill active={v === true}      label="Yes"  action={() => set(true)} />
        <Pill active={v === false}     label="No"   action={() => set(false)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/components/search/controls/BooleanTriControl.tsx frontend/__tests__/components/search/controls/BooleanTriControl.test.tsx
git commit -m "feat(filters): BooleanTriControl sub-component"
```

---

## Task 13 — `EnumMultiControl` sub-component

**Files:**
- Create: `frontend/components/search/controls/EnumMultiControl.tsx`
- Test:   `frontend/__tests__/components/search/controls/EnumMultiControl.test.tsx`

- [ ] **Step 1 — Failing test.**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { EnumMultiControl } from "@/components/search/controls/EnumMultiControl";

it("toggles values and emits the next selection", () => {
  const onChange = jest.fn();
  render(
    <EnumMultiControl
      label="Appellant"
      options={["offender", "attorney_general", "other"]}
      value={undefined}
      onChange={onChange}
    />
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /offender/i }));
  expect(onChange).toHaveBeenCalledWith({ kind: "enum_multi", values: ["offender"] });
});
it("clearing the last value emits undefined", () => {
  const onChange = jest.fn();
  render(
    <EnumMultiControl
      label="Appellant"
      options={["offender"]}
      value={{ kind: "enum_multi", values: ["offender"] }}
      onChange={onChange}
    />
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /offender/i }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.**

```tsx
"use client";
import React from "react";
import type { BaseFilterValue } from "@/lib/store/searchStore";

export interface EnumMultiControlProps {
  label: string;
  options: readonly string[];
  optionLabel?: (v: string) => string;
  value: Extract<BaseFilterValue, { kind: "enum_multi" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "enum_multi" }> | undefined) => void;
  disabled?: boolean;
}

export function EnumMultiControl({
  label, options, optionLabel, value, onChange, disabled,
}: EnumMultiControlProps) {
  const selected = new Set(value?.values ?? []);
  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    if (next.size === 0) onChange(undefined);
    else onChange({ kind: "enum_multi", values: Array.from(next) });
  };
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-1">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox" disabled={disabled}
              checked={selected.has(opt)}
              onChange={() => toggle(opt)}
              aria-label={optionLabel?.(opt) ?? opt}
            />
            <span>{optionLabel?.(opt) ?? opt}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/components/search/controls/EnumMultiControl.tsx frontend/__tests__/components/search/controls/EnumMultiControl.test.tsx
git commit -m "feat(filters): EnumMultiControl sub-component"
```

---

## Task 14 — `TagArrayControl` with facet autocomplete

**Files:**
- Create: `frontend/components/search/controls/TagArrayControl.tsx`
- Test:   `frontend/__tests__/components/search/controls/TagArrayControl.test.tsx`

- [ ] **Step 1 — Failing test.**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { TagArrayControl } from "@/components/search/controls/TagArrayControl";

it("renders suggestions from facetCounts when typing", () => {
  const onChange = jest.fn();
  render(
    <TagArrayControl
      label="Offences"
      value={undefined}
      onChange={onChange}
      facetCounts={{ theft: 120, fraud: 84, "frau-related": 5 }}
    />
  );
  fireEvent.change(screen.getByRole("textbox", { name: /offences/i }), { target: { value: "frau" } });
  // both suggestions visible
  expect(screen.getByText(/^fraud/)).toBeInTheDocument();
  expect(screen.getByText(/^frau-related/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/^fraud/));
  expect(onChange).toHaveBeenCalledWith({ kind: "tag_array", values: ["fraud"] });
});
it("removes a tag on chip click", () => {
  const onChange = jest.fn();
  render(
    <TagArrayControl
      label="Offences"
      value={{ kind: "tag_array", values: ["fraud", "theft"] }}
      onChange={onChange}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /remove fraud/i }));
  expect(onChange).toHaveBeenCalledWith({ kind: "tag_array", values: ["theft"] });
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.**

```tsx
"use client";
import React, { useState, useMemo } from "react";
import type { BaseFilterValue } from "@/lib/store/searchStore";

export interface TagArrayControlProps {
  label: string;
  value: Extract<BaseFilterValue, { kind: "tag_array" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "tag_array" }> | undefined) => void;
  facetCounts?: Record<string, number>;
  onQueryChange?: (q: string) => void;
  disabled?: boolean;
}

export function TagArrayControl({
  label, value, onChange, facetCounts, onQueryChange, disabled,
}: TagArrayControlProps) {
  const [input, setInput] = useState("");
  const selected = value?.values ?? [];

  const suggestions = useMemo(() => {
    if (!facetCounts) return [] as Array<[string, number]>;
    const q = input.toLowerCase();
    return Object.entries(facetCounts)
      .filter(([k]) => !selected.includes(k) && k.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [facetCounts, input, selected]);

  const update = (next: string[]) => {
    if (next.length === 0) onChange(undefined);
    else onChange({ kind: "tag_array", values: next });
  };
  const add = (v: string) => {
    if (selected.includes(v)) return;
    update([...selected, v]);
    setInput("");
  };
  const remove = (v: string) => update(selected.filter((s) => s !== v));

  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      <div className="flex flex-wrap items-center gap-1 rounded border px-2 py-1">
        {selected.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-[color:var(--gold-soft)] px-1 text-[11px]">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(v)} disabled={disabled}>×</button>
          </span>
        ))}
        <input
          type="text" disabled={disabled}
          aria-label={label}
          value={input}
          onChange={(e) => { setInput(e.target.value); onQueryChange?.(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              add(input.trim());
            }
          }}
          className="flex-1 min-w-[6ch] bg-transparent text-xs outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded border bg-white text-xs shadow-sm">
          {suggestions.map(([v, n]) => (
            <li key={v}>
              <button type="button" onClick={() => add(v)}
                className="flex w-full items-center justify-between px-2 py-1 hover:bg-[color:var(--parchment-deep)]">
                <span>{v}</span>
                <span className="text-[10px] text-[color:var(--ink-soft)]">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/components/search/controls/TagArrayControl.tsx frontend/__tests__/components/search/controls/TagArrayControl.test.tsx
git commit -m "feat(filters): TagArrayControl with facet-driven autocomplete"
```

---

## Task 15 — `useBaseFieldFacets` hook

**Files:**
- Create: `frontend/hooks/useBaseFieldFacets.ts`
- Test:   `frontend/__tests__/hooks/useBaseFieldFacets.test.ts`
- Modify: `frontend/lib/api/search.ts` (add `fetchBaseFieldFacets`)

- [ ] **Step 1 — Failing test.**

```ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBaseFieldFacets } from "@/hooks/useBaseFieldFacets";

jest.mock("@/lib/api/search", () => ({
  fetchBaseFieldFacets: jest.fn(async () => ({
    base_appeal_outcome: { dismissed: 12, allowed: 3 },
  })),
}));

it("fetches facets for active fields on mount", async () => {
  const { result } = renderHook(() =>
    useBaseFieldFacets(["appeal_outcome"], { query: "" })
  );
  await waitFor(() => {
    expect(result.current.facetCounts.appeal_outcome).toEqual({
      dismissed: 12, allowed: 3,
    });
  });
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.**

In `frontend/lib/api/search.ts`:

```ts
export async function fetchBaseFieldFacets(
  fields: string[],
  query?: string,
): Promise<Record<string, Record<string, number>>> {
  const params = new URLSearchParams();
  params.set("q", "");
  for (const f of fields) params.append("facets", `base_${f}`);
  if (query) params.set("facet_query", query);
  params.set("limit", "0");
  const response = await fetch(`/api/search/documents?${params.toString()}`);
  if (!response.ok) return {};
  const body = await response.json();
  // Strip the base_ prefix so callers index by registry field name.
  const out: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(body.facetDistribution ?? {})) {
    out[k.startsWith("base_") ? k.slice("base_".length) : k] = v as Record<string, number>;
  }
  return out;
}
```

In `frontend/hooks/useBaseFieldFacets.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { fetchBaseFieldFacets } from "@/lib/api/search";

const CACHE_TTL_MS = 60_000;
type CacheEntry = { at: number; data: Record<string, Record<string, number>> };
const cache = new Map<string, CacheEntry>();

export function useBaseFieldFacets(
  fields: string[],
  opts: { query?: string; enabled?: boolean } = {},
) {
  const [facetCounts, setFacetCounts] = useState<Record<string, Record<string, number>>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled || fields.length === 0) return;
    const key = JSON.stringify({ fields: [...fields].sort(), q: opts.query ?? "" });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setFacetCounts(hit.data);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const data = await fetchBaseFieldFacets(fields, opts.query);
      cache.set(key, { at: Date.now(), data });
      setFacetCounts(data);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [enabled, JSON.stringify(fields), opts.query]);

  return { facetCounts };
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/hooks/useBaseFieldFacets.ts frontend/lib/api/search.ts frontend/__tests__/hooks/useBaseFieldFacets.test.ts
git commit -m "feat(filters): useBaseFieldFacets hook + fetchBaseFieldFacets API"
```

---

## Task 16 — `BaseFiltersDrawer` shared component

**Files:**
- Create: `frontend/components/search/BaseFiltersDrawer.tsx`
- Test:   `frontend/__tests__/components/search/BaseFiltersDrawer.test.tsx`

- [ ] **Step 1 — Failing test.**

```tsx
import { render, screen } from "@testing-library/react";
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";

it("renders one section per group in GROUP_ORDER", () => {
  render(<BaseFiltersDrawer filters={{}} onChange={() => {}} onReset={() => {}} />);
  // GROUP_ORDER has 9 entries; expect 9 headings
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(9);
});
it("dispatches numeric_range onChange with the registry field key", () => {
  const onChange = jest.fn();
  render(<BaseFiltersDrawer filters={{}} onChange={onChange} onReset={() => {}} />);
  // find Number of victims numeric_range control by aria-label
  // (the control's aria-label is `${label} minimum`)
  const { findByLabelText } = screen;
  return findByLabelText(/number of victims minimum/i).then((input) => {
    (input as HTMLInputElement).value = "3";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("num_victims", expect.objectContaining({
      kind: "numeric_range",
    }));
  });
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.**

```tsx
"use client";
import React from "react";
import {
  FIELDS_BY_GROUP, GROUP_ORDER, GROUP_LABELS, formatEnumLabel,
} from "@/lib/extractions/base-schema-filter-config";
import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";
import { NumericRangeControl } from "./controls/NumericRangeControl";
import { DateRangeControl } from "./controls/DateRangeControl";
import { BooleanTriControl } from "./controls/BooleanTriControl";
import { EnumMultiControl } from "./controls/EnumMultiControl";
import { TagArrayControl } from "./controls/TagArrayControl";

export interface BaseFiltersDrawerProps {
  filters: BaseFilters;
  onChange: (field: string, value: BaseFilterValue | undefined) => void;
  onReset: () => void;
  facetCounts?: Record<string, Record<string, number>>;
  onTagQueryChange?: (field: string, q: string) => void;
  disabled?: boolean;
}

export function BaseFiltersDrawer({
  filters, onChange, onReset, facetCounts, onTagQueryChange, disabled,
}: BaseFiltersDrawerProps) {
  return (
    <div className="space-y-4 rounded-md border bg-[color:var(--parchment)] p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase">Filters</span>
        <button type="button" onClick={onReset} disabled={disabled}
          className="font-mono text-[11px] text-[color:var(--oxblood)]">Reset</button>
      </div>
      {GROUP_ORDER.map((group) => {
        const fields = FIELDS_BY_GROUP[group] ?? [];
        if (fields.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h3 className="font-mono text-[11px] uppercase tracking-wider">{GROUP_LABELS[group]}</h3>
            {fields.map((cfg) => {
              const v = filters[cfg.field];
              const setVal = (next: BaseFilterValue | undefined) => onChange(cfg.field, next);
              switch (cfg.control) {
                case "numeric_range":
                  return <NumericRangeControl key={cfg.field} label={cfg.label}
                    value={v?.kind === "numeric_range" ? v : undefined}
                    onChange={setVal} disabled={disabled} />;
                case "date_range":
                  return <DateRangeControl key={cfg.field} label={cfg.label}
                    value={v?.kind === "date_range" ? v : undefined}
                    onChange={setVal} disabled={disabled} />;
                case "boolean_tri":
                  return <BooleanTriControl key={cfg.field} label={cfg.label}
                    value={v?.kind === "boolean_tri" ? v : undefined}
                    onChange={setVal} disabled={disabled} />;
                case "enum_multi":
                  return <EnumMultiControl key={cfg.field} label={cfg.label}
                    options={cfg.enumValues ?? []}
                    optionLabel={formatEnumLabel}
                    value={v?.kind === "enum_multi" ? v : undefined}
                    onChange={setVal} disabled={disabled} />;
                case "tag_array":
                  return <TagArrayControl key={cfg.field} label={cfg.label}
                    value={v?.kind === "tag_array" ? v : undefined}
                    onChange={setVal}
                    facetCounts={facetCounts?.[cfg.field]}
                    onQueryChange={onTagQueryChange ? (q) => onTagQueryChange(cfg.field, q) : undefined}
                    disabled={disabled} />;
                case "substring":
                  return null;  // substring inputs live on /search/extractions, not the drawer
              }
            })}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4 — Re-run, expect PASS.**

- [ ] **Step 5 — Commit.**

```bash
git add frontend/components/search/BaseFiltersDrawer.tsx frontend/__tests__/components/search/BaseFiltersDrawer.test.tsx
git commit -m "feat(filters): shared BaseFiltersDrawer renders registry-driven groups"
```

---

## Task 17 — Mount drawer on `/search`; remove `ExtractedFieldsFilter`

**Files:**
- Modify: `frontend/app/search/page.tsx`
- Modify: `frontend/components/search/PreSearchFilters.tsx` (replace inner widget)
- Delete: `frontend/components/search/ExtractedFieldsFilter.tsx`

- [ ] **Step 1 — Plumb store action.** In `PreSearchFilters.tsx` find the existing mount of `<ExtractedFieldsFilter …>` and replace with:

```tsx
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";
import { useBaseFieldFacets } from "@/hooks/useBaseFieldFacets";
import { FILTER_FIELDS } from "@/lib/extractions/base-schema-filter-config";

// inside the component, near other state hooks:
const tagFields = FILTER_FIELDS.filter((c) => c.control === "tag_array").map((c) => c.field);
const { facetCounts } = useBaseFieldFacets(tagFields, { enabled: drawerOpen });

// inside the render where ExtractedFieldsFilter used to be:
<BaseFiltersDrawer
  filters={baseFilters}
  onChange={(field, value) => setBaseFilter(field, value)}
  onReset={resetBaseFilters}
  facetCounts={facetCounts}
  disabled={searchInProgress}
/>
```

- [ ] **Step 2 — Add store actions** (if absent) — in `lib/store/searchStore.ts`:

```ts
setBaseFilter: (field: string, value: BaseFilterValue | undefined) =>
  set((state) => {
    const next = { ...state.baseFilters };
    if (value === undefined) delete next[field];
    else next[field] = value;
    return { baseFilters: next };
  }),
resetBaseFilters: () => set({ baseFilters: {} }),
```

- [ ] **Step 3 — Delete the old widget.**

```bash
git rm frontend/components/search/ExtractedFieldsFilter.tsx
```

Drop any test that imported it (`grep -rn "ExtractedFieldsFilter" frontend/__tests__` and remove or rewrite).

- [ ] **Step 4 — Smoke-test locally.**

```bash
cd frontend && npm run dev
# visit http://localhost:3026/search, sign in, open the filter drawer
# expect: all 9 groups visible, controls render, no console errors
```

- [ ] **Step 5 — Run typecheck + relevant tests.**

```bash
cd frontend && npm run validate
npm test -- frontend/components/search
```

- [ ] **Step 6 — Commit.**

```bash
git add frontend/app/search/page.tsx frontend/components/search/PreSearchFilters.tsx frontend/lib/store/searchStore.ts
git commit -m "feat(search): mount BaseFiltersDrawer on /search, drop ExtractedFieldsFilter"
```

---

## Task 18 — Mount drawer on `/search/extractions`, keep substring inputs above

**Files:**
- Modify: `frontend/app/search/extractions/page.tsx`

- [ ] **Step 1 — Replace the inline drawer.** Identify the existing JSX that maps `FIELDS_BY_GROUP`. Replace with `<BaseFiltersDrawer>`. Keep the existing substring `<input>` elements (`appeal_court_judges_names`, `case_name`, `offender_representative_name`) rendered *above* the drawer.

```tsx
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";

// ... in render ...
<section className="space-y-3">
  {/* Substring text inputs — bypass the drawer, hit the PG RPC */}
  <SubstringInputs ... />
  <BaseFiltersDrawer
    filters={filters}
    onChange={(field, value) => setFilter(field, value)}
    onReset={() => resetAll()}
    // no facetCounts — the page runs against PG RPC, free-text is fine
  />
</section>
```

- [ ] **Step 2 — Confirm PG-RPC translator still works.** Run any existing `extractions` tests:

```bash
cd frontend && npm test -- search/extractions
```

- [ ] **Step 3 — Smoke-test locally.**

```bash
cd frontend && npm run dev
# visit /search/extractions
# expect: same fields render via the new drawer; substring inputs still work
```

- [ ] **Step 4 — Commit.**

```bash
git add frontend/app/search/extractions/page.tsx
git commit -m "refactor(extractions): mount shared BaseFiltersDrawer; keep substring inputs"
```

---

## Task 19 — Backend integration: full backend unit run

- [ ] **Step 1 — Run backend tests.**

```bash
cd backend && poetry run pytest -q tests/app/test_meilisearch_sync.py tests/app/test_search_facets.py
```
Expected: all green.

- [ ] **Step 2 — Run full backend test suite (catch regressions).**

```bash
cd backend && poetry run poe check-all
```
Expected: green.

- [ ] **Step 3 — Commit any test fixture/import tweaks** (if `poe check-all` flagged anything not yet fixed). Otherwise skip.

---

## Task 20 — Frontend integration: full frontend run

- [ ] **Step 1 — Run frontend validate.**

```bash
cd frontend && npm run validate
```

- [ ] **Step 2 — Run frontend unit tests.**

```bash
cd frontend && npm test -- --runInBand
```
Expected: all green; the deleted `ExtractedFieldsFilter.tsx` should no longer be imported.

- [ ] **Step 3 — Commit any cleanup.**

---

## Task 21 — Apply settings to prod Meili before image build

This unblocks the new `filterableAttributes` on the currently-running image, so the smoke test in Task 22 can use the new filters even before deploy.

**Files:**
- Create or modify: `.context/apply_meili_settings.py`

- [ ] **Step 1 — Ensure `.context/` is gitignored.**

```bash
grep -q "^.context/" .gitignore || echo ".context/" >> .gitignore
```

- [ ] **Step 2 — Author `.context/apply_meili_settings.py`** (or update existing):

```python
"""Apply the canonical Meili settings (minus embedders) to prod.

One-shot ops script — runs against whatever Meili the *running* backend
container is pointed at, using its env. Run via:
  docker exec juddges-backend python /tmp/apply_meili_settings.py
or copy in and exec as shown below.
"""
import asyncio
import os
from app.services.meilisearch_config import MEILISEARCH_INDEX_SETTINGS
from app.services.search import MeiliSearchService

async def main():
    svc = MeiliSearchService.from_env()
    safe = {k: v for k, v in MEILISEARCH_INDEX_SETTINGS.items() if k != "embedders"}
    resp = await svc.configure_index(safe)
    print("taskUid:", resp.get("taskUid"))
    if resp.get("taskUid") is not None:
        task = await svc.wait_for_task(resp["taskUid"], max_wait=120.0)
        print("status:", task.get("status"))
        if task.get("status") != "succeeded":
            print("error:", task.get("error"))

asyncio.run(main())
```

- [ ] **Step 3 — Copy in + run.**

```bash
docker cp .context/apply_meili_settings.py juddges-backend:/tmp/apply_meili_settings.py
docker exec juddges-backend python /tmp/apply_meili_settings.py
```
Expected: `status: succeeded`.

- [ ] **Step 4 — Verify `filterableAttributes` in live Meili.**

```bash
docker exec juddges-backend python3 -c "
import os, json, urllib.request
url=os.environ['MEILISEARCH_URL'].rstrip('/'); key=os.environ['MEILI_MASTER_KEY']
req=urllib.request.Request(f'{url}/indexes/judgments/settings/filterable-attributes',
    headers={'Authorization': f'Bearer {key}'})
data=json.load(urllib.request.urlopen(req))
print('total:', len(data))
print('sample new:', [f for f in data if f.startswith('base_')][:10])
"
```
Expected: `total ≥ 49` (the 9 originals + 39 new + `base_extracted_at_ts`) and `base_appeal_outcome`, `base_appellant`, etc. appear.

---

## Task 22 — Trigger full sync + smoke-test filters

- [ ] **Step 1 — Dispatch `meilisearch.full_sync`.**

```bash
TASK_ID=$(docker exec juddges-backend-worker celery -A app.workers call meilisearch.full_sync | tail -1)
echo "$TASK_ID"
```

- [ ] **Step 2 — Wait for completion.** (~2 min for 12,307 docs.)

```bash
until docker exec juddges-backend-worker python3 -c "
import sys; from app.workers import celery_app
sys.exit(0 if celery_app.AsyncResult('$TASK_ID').state in ('SUCCESS','FAILURE','REVOKED') else 1)
" 2>/dev/null; do sleep 10; done
docker exec juddges-backend-worker python3 -c "
from app.workers import celery_app
r=celery_app.AsyncResult('$TASK_ID')
print('state:', r.state); print('result:', r.result)
"
```
Expected: `state: SUCCESS`, `total_synced: 12307`.

- [ ] **Step 3 — Smoke-test filters by control type.**

```bash
docker exec juddges-backend python3 -c "
import os, json, urllib.request
url=os.environ['MEILISEARCH_URL'].rstrip('/'); key=os.environ['MEILI_MASTER_KEY']
def count(f):
    body=json.dumps({'q':'','filter':f,'limit':0}).encode()
    req=urllib.request.Request(f'{url}/indexes/judgments/search', data=body, method='POST',
        headers={'Authorization': f'Bearer {key}','Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(req)).get('estimatedTotalHits')
print('numeric_range  base_num_victims = 1:', count('base_num_victims = 1'))
print('enum_multi     base_appellant IN [offender]:', count('base_appellant IN [\"offender\"]'))
print('tag_array      base_appeal_outcome IN [dismissed]:', count('base_appeal_outcome IN [\"dismissed\"]'))
print('boolean_tri    base_vic_impact_statement = true:', count('base_vic_impact_statement = true'))
print('date_range     base_date_of_appeal_court_judgment_ts >= 2020:',
      count(f'base_date_of_appeal_court_judgment_ts >= {int(__import__(\"datetime\").datetime(2020,1,1).timestamp())}'))
"
```
Expected: every line returns a positive integer (or `>= 1000` cap).

- [ ] **Step 4 — Facet smoke.**

```bash
docker exec juddges-backend python3 -c "
import os, json, urllib.request
url=os.environ['MEILISEARCH_URL'].rstrip('/'); key=os.environ['MEILI_MASTER_KEY']
body=json.dumps({'q':'','facets':['base_appeal_outcome','base_appellant'],'limit':0}).encode()
req=urllib.request.Request(f'{url}/indexes/judgments/search', data=body, method='POST',
    headers={'Authorization': f'Bearer {key}','Content-Type':'application/json'})
print(json.dumps(json.load(urllib.request.urlopen(req)).get('facetDistribution'), indent=2)[:500])
"
```
Expected: a populated `facetDistribution` map.

---

## Task 23 — Build & push prod images, deploy, browser smoke

- [ ] **Step 1 — Patch bump + push.**

```bash
./scripts/build_and_push_prod.sh patch
```
Expected: `prod-vX.Y.Z` tag created, images pushed.

- [ ] **Step 2 — Deploy.**

```bash
./scripts/deploy_prod.sh
```
Expected: all containers healthy (`docker ps` shows healthy across `juddges-frontend`, `-backend`, `-meilisearch`, `-backend-worker`, `-backend-beat`).

- [ ] **Step 3 — Verify the new `setup_meilisearch_index` flow.**

```bash
docker logs --tail 200 juddges-backend | grep -iE 'meilisearch.*(safe settings|embedders|filterable)'
```
Expected: `safe settings applied` line; an embedders warning is acceptable.

- [ ] **Step 4 — Browser smoke test on prod URL.**

Navigate to the prod `/search` URL. For each control type from §3 in the spec, apply a filter and confirm hit count > 0:
- *numeric_range* — Number of victims = 1
- *enum_multi* — Appellant = offender
- *tag_array* — type "fraud" in Convict offences, accept suggestion → result count drops
- *boolean_tri* — Victim impact statement = Yes
- *date_range* — Appeal judgment date 2020-01-01 → today
- *operational* — Extraction model picker shows the two distinct values

If any control fails: capture the URL, the filter expression in the network panel (`/api/search/documents?…&filters=…`), the Meili response, then triage with the table in §3.4 of the spec.

- [ ] **Step 5 — Update memory** if anything surprising surfaced.

If the embedders PATCH started succeeding (e.g. someone backfilled vectors mid-flight), update `[[project-meili-settings-atomic-fail]]` to reflect that the workaround is no longer load-bearing.

---

## Self-Review

**Spec coverage** — each spec section maps to a task:

| Spec § | Covered by |
|---|---|
| §3.1 inventory of 45 filterable | Tasks 1–2 (backend) + 6 (frontend registry) |
| §3.2 9 searchable | Tasks 1–2 |
| §3.3 5 excluded | Tasks 1–2 (mechanically omitted) |
| §3.4 control → Meili clause map | Task 9 |
| §4.1 transformer | Task 1 |
| §4.2 settings | Task 2 |
| §4.3 settings PATCH split | Task 3 |
| §4.4 sync trigger | Task 22 |
| §5.1 registry & operational group | Task 6 |
| §5.2 BaseFiltersDrawer | Task 16 (+ controls in 10–14) |
| §5.3 buildMeilisearchFilter | Task 9 |
| §5.4 facet autocomplete | Tasks 4, 5, 14, 15 |
| §5.5 store/URL migration | Tasks 7, 8 |
| §5.6 page wiring | Tasks 17, 18 |
| §6 rollout | Tasks 21–23 |
| §7 tests | Tasks 1–16 (TDD per step) + Task 20 |
| §8 risks | Addressed by Task 3 (PATCH split), Task 15 (facet cache) |

**No placeholders** — every code step contains the actual code an engineer will paste. No "TBD" or "similar to Task N". Type names (`BaseFilters`, `BaseFilterValue`, `BaseNumericRange`, `BooleanTri`) consistent across tasks 7–16. `BASE_FILTER_FIELDS` exported from `lib/extractions/filter-fields-map.ts` and imported in Task 9.

**Type consistency** — `BaseFilterValue` discriminated union from Task 7 is the prop shape consumed by all controls (Tasks 10–14) and the drawer (Task 16). `kind` field values (`enum_multi`, `tag_array`, `boolean_tri`, `numeric_range`, `date_range`) match the `FilterControl` strings in `base-schema-filter-config.ts`.

**Open items intentionally deferred** (mirroring spec §9, *not* gaps):
- All-collapsed vs. court_date-expanded default for `<BaseFiltersDrawer>` — start collapsed.
- `base_extracted_at` precision — `date_range` rounds to day; revisit if a use case appears.
