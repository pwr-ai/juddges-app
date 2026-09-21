// =============================================================================
// TS mirror of the PL/UK comparison API (backend/app/compare/models.py,
// backend/app/compare/router.py, backend/app/collection_pairs.py).
//
// `Jurisdiction` is NOT redeclared here — it already lives in
// @/types/base-schema-filter as the single source of truth for the frontend.
//
// Deviations from the original Task 13 brief (backend is the source of
// truth; see task-13-14-report.md for the full list):
//   - `PairCompareResponse` carries `extension`/`extension_reason` as landed
//     (extension-schema fields are NOT merged into `fields`).
//   - `CollectionPair.sides[]` has no `document_count` (the read path cannot
//     compute it cheaply) and `CollectionPair` carries `updated_at`.
//   - `CompareRequest.fields` is a plain optional string array; the backend
//     bounds and dedupes it.
// =============================================================================

import type { BaseSchemaFilters, Jurisdiction } from "@/types/base-schema-filter";

export type Tier = "primary" | "partial" | "unavailable" | "empty";
export type FieldKind = "enum" | "enum_array" | "boolean";

/** Why `PairCompareResponse.extension` is null instead of populated. */
export type ExtensionReason =
  | "no_jobs"
  | "no_job_pl"
  | "no_job_uk"
  | "schema_mismatch"
  | "schema_not_found"
  | "extension_failed";

export interface CoverageStat {
  covered: number;
  total: number;
  /** covered / total; null when total is 0. */
  ratio: number | null;
}

export interface CompareValue {
  value: string;
  counts: Record<string, number>;
  /** count / covered per jurisdiction; null where covered is 0. */
  shares: Record<string, number | null>;
}

export interface CompareField {
  field: string;
  label: string;
  /** 'base' or 'schema:<extraction_schema_id>'. */
  source: string;
  kind: FieldKind;
  coverage: Record<string, CoverageStat>;
  tier: Tier;
  missing_in: string[];
  values: CompareValue[];
}

export interface PairSummary {
  id: string;
  name: string;
  pl_collection_id: string;
  uk_collection_id: string;
}

export interface CompareResponse {
  jurisdictions: string[];
  totals: Record<string, number>;
  fields: CompareField[];
  ignored_filter_keys: string[];
  filters: BaseSchemaFilters;
  text_query: string | null;
  pair: PairSummary | null;
}

export interface ExtensionJobRef {
  /** Celery task id, as used by /extractions/jobs/{job_id}. */
  job_id: string;
  completed_at: string | null;
}

export interface ExtensionCompare {
  schema_id: string;
  schema_name: string | null;
  /** 'schema:<extraction_schema_id>', as on each field. */
  source: string;
  jobs: Record<string, ExtensionJobRef>;
  totals: Record<string, number>;
  fields: CompareField[];
}

/**
 * `CompareResponse` over a saved pair's membership, plus the extension tally.
 * Exactly one of `extension` / `extension_reason` is set.
 */
export interface PairCompareResponse extends CompareResponse {
  pair: PairSummary;
  extension: ExtensionCompare | null;
  extension_reason: ExtensionReason | null;
}

export interface CompareRequest {
  filters: BaseSchemaFilters;
  text_query?: string | null;
  /** Backend caps (registry size) and dedupes; defaults to every comparable field. */
  fields?: string[];
}

export interface CollectionPairSide {
  jurisdiction: Jurisdiction;
  collection_id: string;
}

export interface CollectionPair {
  id: string;
  user_id: string;
  name: string;
  filters: BaseSchemaFilters;
  text_query: string | null;
  created_at: string;
  updated_at: string;
  /** Always in JURISDICTIONS order (PL, UK); no `document_count` per side. */
  sides: CollectionPairSide[];
}
