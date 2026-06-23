# Judgment field surface

Single source of truth for every `public.judgments` column and where it is
exposed across the platform. See issue #198.

The `judgments` table stores fields across four semantic layers:

| Layer | Prefix | Source migration |
|---|---|---|
| **Core** | _(none)_ | `20260209000001_create_judgments_table.sql` |
| **Structure** (Pass 1 — structural segmentation) | `structure_` | `20260324000001_add_structure_and_deep_analysis_columns.sql` |
| **Deep** (Pass 2 — deep analysis) | `deep_` | `20260324000001_add_structure_and_deep_analysis_columns.sql` |
| **Base** (UK criminal base-schema extraction) | `base_` | `20260226000001_create_judgment_base_extractions_table.sql`, `20260403000001_*`, `20260505000001_extend_base_schema_filterable_searchable.sql` |

## Presence flags

- **Meili** — present in the Meilisearch index (`backend/app/services/meilisearch_config.py`).
- **API** — exposed by the document API (`GET /documents/{id}`, `POST /documents/batch`).
  - `extraction_fields` and `base_fields` are populated **only** when
    `include_base_fields=true` is requested.
- **Export** — reachable through the collection-export pathway
  (`frontend/lib/collection-export.ts`). The export ships three column presets:
  - `Default` — core bibliographic fields + full UK `base_*` schema.
  - `Full` — Default + all `structure_*`/`deep_*` typed columns.
  - `Research` — core + deep-analysis research-value signals only.

Raw JSONB extraction blobs (`structure_raw_extraction`, `deep_analysis_raw`,
`base_raw_extraction`) are intentionally **never** exposed in the API
`extraction_fields`/`base_fields` surface or the export (issue #198 non-goal).

---

## Core layer

| Column | Type | Meili | API | Export |
|---|---|---|---|---|
| `id` | uuid (PK) | displayed | yes (`document_id`) | yes |
| `case_number` | text | searchable+filterable | yes (`document_number`) | yes |
| `jurisdiction` | text (`PL`/`UK`) | filterable | yes (`country`) | yes |
| `court_name` | text | searchable | yes | yes |
| `court_level` | text | filterable | yes (`issuing_body.court_level`) | yes |
| `decision_date` | date | filterable+sortable | yes (`date_issued`) | yes |
| `publication_date` | date | — | yes | — |
| `title` | text | searchable | yes | yes |
| `summary` | text | searchable | yes | yes |
| `full_text` | text | searchable (not displayed) | yes | yes |
| `judges` | jsonb | displayed (`judges_flat`) | yes | yes |
| `case_type` | text | filterable | yes (metadata) | — |
| `decision_type` | text | filterable | yes (metadata) | — |
| `outcome` | text | filterable | yes | yes |
| `keywords` | text[] | searchable | yes | yes |
| `legal_topics` | text[] | searchable | yes (`references`) | yes |
| `cited_legislation` | text[] | searchable | yes (`legal_bases`) | yes |
| `embedding` | vector(1536→768/1024) | user embedder | only with `return_vectors` | — |
| `metadata` | jsonb | — | yes | partial |
| `source_dataset` | text | — | yes (metadata) | — |
| `source_id` | text | — | yes | — |
| `source_url` | text | — | yes | yes |
| `created_at` | timestamptz | sortable | yes (`ingestion_date`) | — |
| `updated_at` | timestamptz | sortable | yes (`last_updated`) | — |

## Structure layer (`structure_*`)

Surfaced under the API `extraction_fields` key and the `Full` export preset.

| Column | Type | API | Export |
|---|---|---|---|
| `structure_extraction_status` | text | `extraction_fields` | Full |
| `structure_extraction_model` | text | `extraction_fields` | Full |
| `structure_extracted_at` | timestamptz | `extraction_fields` | Full |
| `structure_raw_extraction` | jsonb | **excluded** | **excluded** |
| `structure_section_count` | integer | `extraction_fields` | Full |
| `structure_confidence` | text | `extraction_fields` | Full |
| `structure_case_identification_summary` | text | `extraction_fields` | Full |
| `structure_facts_summary` | text | `extraction_fields` | Full |
| `structure_operative_part_summary` | text | `extraction_fields` | Full |
| `structure_court_analysis_summary` | text | `extraction_fields` | Full |
| `structure_conclusion_summary` | text | `extraction_fields` | Full |

## Deep layer (`deep_*`)

Surfaced under the API `extraction_fields` key. Research-value signals are also
in the `Research` export preset.

| Column | Type | API | Export |
|---|---|---|---|
| `deep_analysis_status` | text | `extraction_fields` | Full |
| `deep_analysis_model` | text | `extraction_fields` | Full |
| `deep_analysed_at` | timestamptz | `extraction_fields` | Full |
| `deep_analysis_raw` | jsonb | **excluded** | **excluded** |
| `deep_complexity_score` | integer (1-5) | `extraction_fields` | Full, Research |
| `deep_factual_complexity` | text | `extraction_fields` | Full, Research |
| `deep_legal_complexity` | text | `extraction_fields` | Full, Research |
| `deep_reasoning_quality_score` | integer (1-5) | `extraction_fields` | Full, Research |
| `deep_legal_domains` | text[] | `extraction_fields` | Full, Research |
| `deep_reasoning_patterns` | text[] | `extraction_fields` | Full, Research |
| `deep_judicial_tone` | text | `extraction_fields` | Full, Research |
| `deep_precedential_value` | text | `extraction_fields` | Full, Research |
| `deep_research_value` | text | `extraction_fields` | Full, Research |
| `deep_text_quality` | text | `extraction_fields` | Full |
| `deep_analysis_confidence` | text | `extraction_fields` | Full |

## Base layer (`base_*`)

The full UK criminal base-schema (30+ typed columns). Surfaced under the API
`base_fields` key and the `Default`/`Full` export presets. A small slice
(`base_extraction_status`, `base_num_victims`, `base_victim_age_offence`,
`base_case_number`, `base_co_def_acc_num`,
`base_date_of_appeal_court_judgment_ts`) is filterable in Meilisearch; the
rest are **not** indexed (the autocomplete index is kept lean by design — issue
#198 non-goal). Canonical column list + labels live in
`frontend/lib/document-fields.ts` (`BASE_FIELD_ORDER`, `FIELD_LABELS`) and in
`backend/.../db/documents_db.py` (`_JUDGMENT_COLS`). The raw JSONB blob
`base_raw_extraction` is **excluded** from both the API surface and export.

---

## `SearchDocument` ↔ `judgments` field mapping

The frontend `SearchDocument` shape (PL-styled labels, historical) does **not**
1:1 match the `judgments` columns. The mapping is applied in the search-API
transform (`backend/app/judgments_pkg/conversion.py`) and consumed by the
export flattener (`frontend/lib/collection-export.ts`).

| `SearchDocument` (UI) | `judgments` column (DB) | Notes |
|---|---|---|
| `document_id` | `id` | UUID primary key (falls back to `source_id`) |
| `title` | `title` | |
| `date_issued` | `decision_date` | parsed to datetime |
| `publication_date` | `publication_date` | |
| `country` | `jurisdiction` | `PL` / `UK` |
| `document_number` | `case_number` | |
| `court_name` | `court_name` | |
| `issuing_body.name` | `court_name` | derived |
| `issuing_body.court_level` | `court_level` | derived |
| `summary` | `summary` | |
| `full_text` | `full_text` | |
| `keywords` | `keywords` | |
| `judges` | `judges` (jsonb) | |
| `outcome` | `outcome` | |
| `legal_bases` | `cited_legislation` | |
| `references` | `legal_topics` | name reuse |
| `source_url` | `source_url` | also under `metadata.source_url` |
| `ingestion_date` | `created_at` | |
| `last_updated` | `updated_at` | |
| `extracted_legal_bases` | _(legacy `legal_documents` only)_ | None on `judgments` rows |
| `thesis`, `parties`, `factual_state`, `legal_state`, `presiding_judge`, `department_name` | _(legacy `legal_documents` only)_ | None on `judgments` rows |
| `base_fields[base_*]` | `base_*` columns | `include_base_fields=true` only |
| `extraction_fields[structure_* / deep_*]` | `structure_*` / `deep_*` columns | `include_base_fields=true` only |
