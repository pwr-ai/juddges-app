// =============================================================================
// Registry of every base_* extraction field surfaced by the filter UI.
//
// Single source of truth for: human label, semantic group, control type,
// underlying enum values. The /search/extractions page iterates this list
// when rendering grouped sections of the advanced-filter drawer; the URL
// serialiser uses `control` to decide how to encode each field.
//
// Mirrors the migration's CHECK constraints (supabase/migrations/
// 20260226000001_create_judgment_base_extractions_table.sql) and the Pydantic
// model in backend/app/extraction_domain/nl_filter_generator.py.
// =============================================================================

export type FilterGroup =
  | "offender"
  | "victim"
  | "charges_plea"
  | "sentence"
  | "appeal"
  | "court_date"
  | "evidence"
  | "other";

export type FilterControl =
  | "enum_multi"        // multi-select over fixed enum values, RPC ANY/&&
  | "tag_array"         // free-text array, RPC && — values discovered via facets
  | "boolean_tri"       // tri-state: true / false / unset
  | "numeric_range"     // {min,max} or scalar equality
  | "date_range"        // {from,to} ISO dates
  | "substring";        // ILIKE substring match

export interface FilterFieldConfig {
  /** RPC field name (matches `BaseSchemaFilters` key in types/base-schema-filter.ts). */
  field: string;
  /** Human label shown in the UI. */
  label: string;
  /** Short helper hint surfaced under the control. */
  help?: string;
  group: FilterGroup;
  control: FilterControl;
  /** Allowed values for enum controls. Undefined for free-text arrays. */
  enumValues?: readonly string[];
}

export const GROUP_LABELS: Record<FilterGroup, string> = {
  offender: "Offender",
  victim: "Victim",
  charges_plea: "Charges & Plea",
  sentence: "Sentence",
  appeal: "Appeal",
  court_date: "Court & Date",
  evidence: "Evidence & Reasons",
  other: "Other",
};

/** Order groups appear in the drawer. */
export const GROUP_ORDER: readonly FilterGroup[] = [
  "court_date",
  "offender",
  "victim",
  "charges_plea",
  "sentence",
  "appeal",
  "evidence",
  "other",
] as const;

// -----------------------------------------------------------------------------
// Enum option lists (must mirror migration CHECK constraints).
// -----------------------------------------------------------------------------

const APPELLANT = ["offender", "attorney_general", "other"] as const;
const PLEA_POINT = [
  "police_presence",
  "first_court_appearance",
  "before_trial",
  "first_day_of_trial",
  "after_first_day_of_trial",
  "dont_know",
] as const;
const REMAND_DECISION = [
  "unconditional_bail",
  "conditional_bail",
  "remanded_in_custody",
  "dont_know",
] as const;
const SENTENCE_SERVE = [
  "serve_concurrent",
  "serve_consecutive",
  "serve_unknown",
] as const;
const GENDER = ["gender_male", "gender_female", "gender_unknown"] as const;
const INTOXICATION = ["intox_alcohol", "intox_drugs", "intox_unknown"] as const;
const VICTIM_TYPE = ["individual_person", "organisation"] as const;
const PRE_SENT_REPORT = ["low", "medium", "high", "dont_know"] as const;
const OFFENDER_JOB = [
  "employed",
  "self_employed",
  "unemployed",
  "student",
  "retired",
  "other",
  "dont_know",
] as const;
const OFFENDER_HOME = [
  "fixed_address",
  "homeless",
  "temporary_accommodation",
  "dont_know",
] as const;
const OFFENDER_VICTIM_REL = [
  "stranger",
  "relative",
  "acquaintance",
  "dont_know",
] as const;
const APPEAL_AGAINST = [
  "appeal_conviction_unsafe",
  "appeal_sentence_excessive",
  "appeal_sentence_lenient",
  "appeal_other",
  "appeal_unknown",
] as const;
const APPEAL_OUTCOME = [
  "outcome_dismissed_or_refused",
  "outcome_conviction_quashed",
  "outcome_sentence_more_severe",
  "outcome_sentence_more_lenient",
  "outcome_other",
  "outcome_unknown",
] as const;

// -----------------------------------------------------------------------------
// Field registry. Every key in `BaseSchemaFilters` must appear here exactly
// once. Order within a group drives display order in the drawer.
// -----------------------------------------------------------------------------

export const FILTER_FIELDS: readonly FilterFieldConfig[] = [
  // --- court_date ----------------------------------------------------------
  {
    field: "case_name",
    label: "Case name",
    help: "Substring match (ILIKE).",
    group: "court_date",
    control: "substring",
  },
  {
    field: "neutral_citation_number",
    label: "Neutral citation",
    help: "Substring match.",
    group: "court_date",
    control: "substring",
  },
  {
    field: "appeal_court_judges_names",
    label: "Judges",
    help: "Substring match against judge names.",
    group: "court_date",
    control: "substring",
  },
  {
    field: "offender_representative_name",
    label: "Offender representative",
    help: "Substring match.",
    group: "court_date",
    control: "substring",
  },
  {
    field: "date_of_appeal_court_judgment",
    label: "Date of appeal judgment",
    group: "court_date",
    control: "date_range",
  },
  {
    field: "case_number",
    label: "Case number",
    group: "court_date",
    control: "numeric_range",
  },

  // --- offender ------------------------------------------------------------
  {
    field: "offender_gender",
    label: "Gender",
    group: "offender",
    control: "enum_multi",
    enumValues: GENDER,
  },
  {
    field: "offender_intox_offence",
    label: "Intoxication at offence",
    group: "offender",
    control: "enum_multi",
    enumValues: INTOXICATION,
  },
  {
    field: "offender_job_offence",
    label: "Employment status",
    group: "offender",
    control: "enum_multi",
    enumValues: OFFENDER_JOB,
  },
  {
    field: "offender_home_offence",
    label: "Accommodation status",
    group: "offender",
    control: "enum_multi",
    enumValues: OFFENDER_HOME,
  },
  {
    field: "offender_victim_relationship",
    label: "Relationship to victim",
    group: "offender",
    control: "enum_multi",
    enumValues: OFFENDER_VICTIM_REL,
  },
  {
    field: "co_def_acc_num",
    label: "Co-defendants count",
    help: "Number of co-defendants accused.",
    group: "offender",
    control: "numeric_range",
  },
  {
    field: "did_offender_confess",
    label: "Offender confessed",
    group: "offender",
    control: "boolean_tri",
  },

  // --- victim --------------------------------------------------------------
  {
    field: "victim_type",
    label: "Victim type",
    group: "victim",
    control: "enum_multi",
    enumValues: VICTIM_TYPE,
  },
  {
    field: "victim_gender",
    label: "Victim gender",
    group: "victim",
    control: "enum_multi",
    enumValues: GENDER,
  },
  {
    field: "victim_intox_offence",
    label: "Victim intoxication",
    group: "victim",
    control: "enum_multi",
    enumValues: INTOXICATION,
  },
  {
    field: "num_victims",
    label: "Number of victims",
    group: "victim",
    control: "numeric_range",
  },
  {
    field: "victim_age_offence",
    label: "Victim age at offence",
    group: "victim",
    control: "numeric_range",
  },
  {
    field: "vic_impact_statement",
    label: "Victim impact statement filed",
    group: "victim",
    control: "boolean_tri",
  },

  // --- charges_plea --------------------------------------------------------
  {
    field: "convict_offences",
    label: "Convicted offences",
    group: "charges_plea",
    control: "tag_array",
  },
  {
    field: "acquit_offences",
    label: "Acquitted offences",
    group: "charges_plea",
    control: "tag_array",
  },
  {
    field: "plea_point",
    label: "Plea point",
    group: "charges_plea",
    control: "enum_multi",
    enumValues: PLEA_POINT,
  },
  {
    field: "remand_decision",
    label: "Remand decision",
    group: "charges_plea",
    control: "enum_multi",
    enumValues: REMAND_DECISION,
  },
  {
    field: "convict_plea_dates",
    label: "Conviction / plea dates",
    group: "charges_plea",
    control: "tag_array",
  },

  // --- sentence ------------------------------------------------------------
  {
    field: "sentences_received",
    label: "Sentences received",
    group: "sentence",
    control: "tag_array",
  },
  {
    field: "sentence_serve",
    label: "Serve mode",
    group: "sentence",
    control: "enum_multi",
    enumValues: SENTENCE_SERVE,
  },
  {
    field: "what_ancilliary_orders",
    label: "Ancillary orders",
    group: "sentence",
    control: "tag_array",
  },
  {
    field: "agg_fact_sent",
    label: "Aggravating factors",
    group: "sentence",
    control: "tag_array",
  },
  {
    field: "mit_fact_sent",
    label: "Mitigating factors",
    group: "sentence",
    control: "tag_array",
  },
  {
    field: "sent_guide_which",
    label: "Sentencing guidelines cited",
    group: "sentence",
    control: "tag_array",
  },
  {
    field: "pre_sent_report",
    label: "Pre-sentence report risk",
    group: "sentence",
    control: "enum_multi",
    enumValues: PRE_SENT_REPORT,
  },

  // --- appeal --------------------------------------------------------------
  {
    field: "appellant",
    label: "Appellant",
    group: "appeal",
    control: "enum_multi",
    enumValues: APPELLANT,
  },
  {
    field: "appeal_against",
    label: "Appeal against",
    group: "appeal",
    control: "enum_multi",
    enumValues: APPEAL_AGAINST,
  },
  {
    field: "appeal_outcome",
    label: "Appeal outcome",
    group: "appeal",
    control: "enum_multi",
    enumValues: APPEAL_OUTCOME,
  },
  {
    field: "appeal_ground",
    label: "Appeal grounds",
    group: "appeal",
    control: "tag_array",
  },

  // --- evidence ------------------------------------------------------------
  {
    field: "pros_evid_type_trial",
    label: "Prosecution evidence types",
    group: "evidence",
    control: "tag_array",
  },
  {
    field: "def_evid_type_trial",
    label: "Defence evidence types",
    group: "evidence",
    control: "tag_array",
  },
  {
    field: "reason_quash_conv",
    label: "Reasons conviction quashed",
    group: "evidence",
    control: "tag_array",
  },
  {
    field: "reason_sent_excessive",
    label: "Reasons sentence excessive",
    group: "evidence",
    control: "tag_array",
  },
  {
    field: "reason_sent_lenient",
    label: "Reasons sentence lenient",
    group: "evidence",
    control: "tag_array",
  },
  {
    field: "reason_dismiss",
    label: "Reasons appeal dismissed",
    group: "evidence",
    control: "tag_array",
  },

  // --- other ---------------------------------------------------------------
  {
    field: "keywords",
    label: "Keywords",
    group: "other",
    control: "tag_array",
  },
] as const;

/** Quick lookup by field name. */
export const FILTER_FIELD_BY_NAME: Record<string, FilterFieldConfig> =
  Object.fromEntries(FILTER_FIELDS.map((c) => [c.field, c]));

/** Fields grouped for display, in `GROUP_ORDER`. */
export const FIELDS_BY_GROUP: Record<FilterGroup, FilterFieldConfig[]> =
  GROUP_ORDER.reduce(
    (acc, g) => {
      acc[g] = FILTER_FIELDS.filter((c) => c.group === g);
      return acc;
    },
    {} as Record<FilterGroup, FilterFieldConfig[]>,
  );

/** Format a snake_case enum value for display ("gender_male" → "Gender male"). */
export function formatEnumLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
