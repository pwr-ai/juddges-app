// =============================================================================
// TS mirror of `BaseSchemaFilter` (backend/app/extraction_domain/nl_filter_generator.py)
// and the parameters of the Postgres RPC `filter_documents_by_extracted_data`
// (supabase/migrations/20260226000001_* + 20260505000001_*).
//
// Keep enum unions in sync with CHECK constraints in the migration. The
// frontend filter UI uses these types as the single source of truth — the
// React hook serialises them to JSON, the Next.js API route POSTs them to the
// FastAPI proxy, and the RPC interprets them.
// =============================================================================

export type Appellant = "offender" | "attorney_general" | "other";

export type PleaPoint =
  | "police_presence"
  | "first_court_appearance"
  | "before_trial"
  | "first_day_of_trial"
  | "after_first_day_of_trial"
  | "dont_know";

export type RemandDecision =
  | "unconditional_bail"
  | "conditional_bail"
  | "remanded_in_custody"
  | "dont_know";

export type SentenceServe =
  | "serve_concurrent"
  | "serve_consecutive"
  | "serve_unknown";

export type Gender = "gender_male" | "gender_female" | "gender_unknown";

export type Intoxication = "intox_alcohol" | "intox_drugs" | "intox_unknown";

export type VictimType = "individual_person" | "organisation";

export type PreSentReport = "low" | "medium" | "high" | "dont_know";

export type OffenderJob =
  | "employed"
  | "self_employed"
  | "unemployed"
  | "student"
  | "retired"
  | "other"
  | "dont_know";

export type OffenderHome =
  | "fixed_address"
  | "homeless"
  | "temporary_accommodation"
  | "dont_know";

export type OffenderVictimRel =
  | "stranger"
  | "relative"
  | "acquaintance"
  | "dont_know";

export type AppealAgainst =
  | "appeal_conviction_unsafe"
  | "appeal_sentence_excessive"
  | "appeal_sentence_lenient"
  | "appeal_other"
  | "appeal_unknown";

export type AppealOutcome =
  | "outcome_dismissed_or_refused"
  | "outcome_conviction_quashed"
  | "outcome_sentence_more_severe"
  | "outcome_sentence_more_lenient"
  | "outcome_other"
  | "outcome_unknown";

// -----------------------------------------------------------------------------
// Range helpers — match the JSONB shapes the RPC accepts.
// -----------------------------------------------------------------------------

export interface NumericRange {
  min?: number;
  max?: number;
}

export interface DateRange {
  /** Inclusive ISO date YYYY-MM-DD. Mapped to RPC `from`. */
  from?: string;
  /** Inclusive ISO date YYYY-MM-DD. */
  to?: string;
}

// -----------------------------------------------------------------------------
// Top-level filter object — mirrors Pydantic BaseSchemaFilter.
// All keys optional; absent keys mean "no filter on this field".
// -----------------------------------------------------------------------------

export interface BaseSchemaFilters {
  // scalar enums (IN-list)
  appellant?: Appellant[];
  plea_point?: PleaPoint[];
  remand_decision?: RemandDecision[];
  victim_type?: VictimType[];
  pre_sent_report?: PreSentReport[];
  offender_job_offence?: OffenderJob[];
  offender_home_offence?: OffenderHome[];
  offender_victim_relationship?: OffenderVictimRel[];

  // multi-value enums (array overlap)
  appeal_against?: AppealAgainst[];
  appeal_outcome?: AppealOutcome[];
  sentence_serve?: SentenceServe[];
  offender_gender?: Gender[];
  offender_intox_offence?: Intoxication[];
  victim_gender?: Gender[];
  victim_intox_offence?: Intoxication[];

  // free-text array overlap
  keywords?: string[];
  convict_offences?: string[];
  acquit_offences?: string[];
  appeal_ground?: string[];
  sentences_received?: string[];
  what_ancilliary_orders?: string[];
  pros_evid_type_trial?: string[];
  def_evid_type_trial?: string[];
  agg_fact_sent?: string[];
  mit_fact_sent?: string[];
  sent_guide_which?: string[];
  reason_quash_conv?: string[];
  reason_sent_excessive?: string[];
  reason_sent_lenient?: string[];
  reason_dismiss?: string[];
  convict_plea_dates?: string[];

  // booleans
  did_offender_confess?: boolean;
  vic_impact_statement?: boolean;

  // numerics (eq or range)
  num_victims?: number | NumericRange;
  case_number?: number | NumericRange;
  victim_age_offence?: number | NumericRange;
  co_def_acc_num?: number | NumericRange;

  // date
  date_of_appeal_court_judgment?: string | DateRange;

  // substring (ILIKE)
  case_name?: string;
  neutral_citation_number?: string;
  appeal_court_judges_names?: string;
  offender_representative_name?: string;
}

// -----------------------------------------------------------------------------
// Wire shape sent to /api/extractions/base-schema/filter.
// -----------------------------------------------------------------------------

export interface BaseSchemaFilterRequest {
  filters: BaseSchemaFilters;
  text_query?: string;
  limit?: number;
  offset?: number;
}

export interface BaseSchemaFilterResultRow {
  id: string;
  case_number: string | null;
  title: string | null;
  jurisdiction: string | null;
  decision_date: string | null;
  extracted_data: Record<string, unknown>;
}

export interface BaseSchemaFilterResponse {
  documents: BaseSchemaFilterResultRow[];
  total_count: number;
  limit: number;
  offset: number;
}

// -----------------------------------------------------------------------------
// Facet count shape (returned by /api/extractions/base-schema/facets/[field]).
// -----------------------------------------------------------------------------

export interface FacetCount {
  value: string;
  count: number;
}
