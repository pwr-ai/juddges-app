/**
 * Canonical fixed field metadata for legal-document responses.
 *
 * Source of truth for:
 *   - Detail view (`lib/styles/components/key-information.tsx`)
 *   - Collection table view (`lib/collection-export.ts`)
 *
 * Keep these aligned with the backend `base_*` columns in
 * `supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql`.
 */

import {
  type LucideIcon,
  Calendar,
  FileText,
  Scale,
  MapPin,
  Globe,
  Hash,
  User,
  Users,
  Gavel,
  Building2,
  Tag,
  BookOpen,
  Activity,
  Clock,
  Database,
  Layers,
  Link as LinkIcon,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

export interface FieldMeta {
  label: string;
  icon?: LucideIcon;
  wide?: boolean;
}

/**
 * Known metadata keys → curated label, icon, and column-span hint.
 * Anything not in this map is rendered with a generic icon and a prettified key.
 */
export const FIELD_LABELS: Record<string, FieldMeta> = {
  document_id:           { label: 'Document ID',           icon: Hash },
  title:                 { label: 'Title',                 icon: FileText,    wide: true },
  document_type:         { label: 'Document Type',         icon: FileText },
  document_number:       { label: 'Document Number',       icon: Hash },
  date_issued:           { label: 'Date Issued',           icon: Calendar },
  publication_date:      { label: 'Publication Date',      icon: Calendar },
  ingestion_date:        { label: 'Ingestion Date',        icon: Clock },
  last_updated:          { label: 'Last Updated',          icon: Clock },
  language:              { label: 'Language',              icon: Globe },
  country:               { label: 'Country',               icon: MapPin },
  court_name:            { label: 'Court',                 icon: Scale },
  department_name:       { label: 'Department',            icon: Building2 },
  issuing_body:          { label: 'Issuing Body',          icon: Building2 },
  presiding_judge:       { label: 'Presiding Judge',       icon: Gavel },
  judges:                { label: 'Judges',                icon: Users,       wide: true },
  parties:               { label: 'Parties',               icon: User,        wide: true },
  outcome:               { label: 'Outcome',               icon: Tag,         wide: true },
  legal_bases:           { label: 'Legal Bases',           icon: Building2,   wide: true },
  extracted_legal_bases: { label: 'Extracted Legal Bases', icon: Building2,   wide: true },
  legal_references:      { label: 'Legal References',      icon: BookOpen,    wide: true },
  legal_concepts:        { label: 'Legal Concepts',        icon: BookOpen,    wide: true },
  references:            { label: 'References',            icon: BookOpen,    wide: true },
  keywords:              { label: 'Keywords',              icon: Tag,         wide: true },
  source_url:            { label: 'Source URL',            icon: LinkIcon,    wide: true },
  processing_status:     { label: 'Processing Status',     icon: Activity },
  interpretation_status: { label: 'Interpretation Status', icon: Activity },
  case_type:             { label: 'Case Type',             icon: Layers },
  decision_type:         { label: 'Decision Type',         icon: Sparkles },
  court_level:           { label: 'Court Level',           icon: Scale },
  jurisdiction:          { label: 'Jurisdiction',          icon: MapPin },
  x:                     { label: 'Embedding X',           icon: Database },
  y:                     { label: 'Embedding Y',           icon: Database },

  // ---------------------------------------------------------------------------
  // Base extraction schema (criminal-case fields stored as typed columns on
  // `judgments` and surfaced under the original `base_*` keys to avoid
  // collisions with regular metadata).
  // ---------------------------------------------------------------------------
  base_extraction_status:                              { label: 'Extraction Status',          icon: Activity },
  base_extraction_model:                               { label: 'Extraction Model',           icon: Sparkles },
  base_extracted_at:                                   { label: 'Extracted At',               icon: Clock },
  base_schema_key:                                     { label: 'Base Schema',                icon: Layers },
  base_schema_version:                                 { label: 'Base Schema Version',        icon: Hash },

  base_case_name:                                      { label: 'Case Name',                  icon: FileText,    wide: true },
  base_neutral_citation_number:                        { label: 'Neutral Citation',           icon: Hash },
  base_case_number:                                    { label: 'Base Case Number',           icon: Hash },
  base_date_of_appeal_court_judgment:                  { label: 'Appeal Court Judgment Date', icon: Calendar },

  base_appeal_court_judges_names:                      { label: 'Appeal Court Judges',        icon: Users,       wide: true },
  base_offender_representative_name:                   { label: 'Offender Representative',    icon: User,        wide: true },
  base_crown_attorney_general_representative_name:     { label: 'Crown / AG Representative',  icon: User,        wide: true },

  base_conv_court_names:                               { label: 'Conviction Court(s)',        icon: Scale,       wide: true },
  base_sent_court_name:                                { label: 'Sentencing Court',           icon: Scale,       wide: true },

  base_plea_point:                                     { label: 'Plea Point',                 icon: Gavel },
  base_convict_plea_dates:                             { label: 'Plea Dates',                 icon: Calendar,    wide: true },
  base_convict_offences:                               { label: 'Convicted Offences',         icon: Gavel,       wide: true },
  base_acquit_offences:                                { label: 'Acquitted Offences',         icon: Gavel,       wide: true },
  base_did_offender_confess:                           { label: 'Offender Confessed',         icon: User },
  base_remand_decision:                                { label: 'Remand Decision',            icon: Gavel },
  base_remand_custody_time:                            { label: 'Remand Custody Time',        icon: Clock },

  base_sentences_received:                             { label: 'Sentences Received',         icon: Scale,       wide: true },
  base_sentence_serve:                                 { label: 'Sentence Service',           icon: Activity },
  base_what_ancilliary_orders:                         { label: 'Ancillary Orders',           icon: BookOpen,    wide: true },

  base_offender_gender:                                { label: 'Offender Gender',            icon: User },
  base_offender_age_offence:                           { label: 'Offender Age at Offence',    icon: User },
  base_offender_job_offence:                           { label: 'Offender Employment',        icon: User },
  base_offender_home_offence:                          { label: 'Offender Housing',           icon: User },
  base_offender_mental_offence:                        { label: 'Offender Mental State',      icon: User },
  base_offender_intox_offence:                         { label: 'Offender Intoxication',      icon: User },
  base_offender_victim_relationship:                   { label: 'Offender-Victim Relationship', icon: Users },

  base_victim_type:                                    { label: 'Victim Type',                icon: User },
  base_num_victims:                                    { label: 'Number of Victims',          icon: Users },
  base_victim_gender:                                  { label: 'Victim Gender',              icon: User },
  base_victim_age_offence:                             { label: 'Victim Age at Offence',      icon: User },
  base_victim_job_offence:                             { label: 'Victim Employment',          icon: User },
  base_victim_home_offence:                            { label: 'Victim Housing',             icon: User },
  base_victim_mental_offence:                          { label: 'Victim Mental State',        icon: User },
  base_victim_intox_offence:                           { label: 'Victim Intoxication',        icon: User },

  base_pros_evid_type_trial:                           { label: 'Prosecution Evidence',       icon: BookOpen,    wide: true },
  base_def_evid_type_trial:                            { label: 'Defence Evidence',           icon: BookOpen,    wide: true },
  base_pre_sent_report:                                { label: 'Pre-sentence Report',        icon: FileText },
  base_agg_fact_sent:                                  { label: 'Aggravating Factors',        icon: Tag,         wide: true },
  base_mit_fact_sent:                                  { label: 'Mitigating Factors',         icon: Tag,         wide: true },
  base_vic_impact_statement:                           { label: 'Victim Impact Statement',    icon: MessageSquare },

  base_appellant:                                      { label: 'Appellant',                  icon: User },
  base_co_def_acc_num:                                 { label: 'Co-defendants',              icon: Users },
  base_appeal_against:                                 { label: 'Appeal Against',             icon: Tag,         wide: true },
  base_appeal_ground:                                  { label: 'Appeal Grounds',             icon: BookOpen,    wide: true },
  base_sent_guide_which:                               { label: 'Sentencing Guidelines',      icon: BookOpen,    wide: true },
  base_appeal_outcome:                                 { label: 'Appeal Outcome',             icon: Tag,         wide: true },
  base_reason_quash_conv:                              { label: 'Reasons to Quash Conviction', icon: BookOpen,   wide: true },
  base_reason_sent_excessive:                          { label: 'Reasons Sentence Excessive', icon: BookOpen,    wide: true },
  base_reason_sent_lenient:                            { label: 'Reasons Sentence Lenient',   icon: BookOpen,    wide: true },
  base_reason_dismiss:                                 { label: 'Reasons for Dismissal',      icon: BookOpen,    wide: true },

  base_keywords:                                       { label: 'Extracted Keywords',         icon: Tag,         wide: true },
};

/**
 * Map enum-coded extraction values (e.g. `gender_male`, `outcome_conviction_quashed`)
 * to short human labels. Only applied when the field key starts with `base_` so we
 * don't accidentally rewrite generic strings elsewhere in the metadata.
 */
export const ENUM_VALUE_LABELS: Record<string, string> = {
  // Genders
  gender_male: 'Male',
  gender_female: 'Female',
  gender_unknown: 'Unknown',
  // Intoxication
  intox_alcohol: 'Alcohol',
  intox_drugs: 'Drugs',
  intox_unknown: 'Unknown',
  // Sentence service
  serve_concurrent: 'Concurrent',
  serve_consecutive: 'Consecutive',
  serve_unknown: 'Unknown',
  // Appeal against
  appeal_conviction_unsafe: 'Conviction unsafe',
  appeal_sentence_excessive: 'Sentence excessive',
  appeal_sentence_lenient: 'Sentence lenient',
  appeal_other: 'Other',
  appeal_unknown: 'Unknown',
  // Appeal outcomes
  outcome_dismissed_or_refused: 'Dismissed / refused',
  outcome_conviction_quashed: 'Conviction quashed',
  outcome_sentence_more_severe: 'Sentence increased',
  outcome_sentence_more_lenient: 'Sentence reduced',
  outcome_other: 'Other',
  outcome_unknown: 'Unknown',
  // Appellant
  offender: 'Offender',
  attorney_general: 'Attorney General',
  other: 'Other',
  // Plea points
  police_presence: 'Police presence',
  first_court_appearance: 'First court appearance',
  before_trial: 'Before trial',
  first_day_of_trial: 'First day of trial',
  after_first_day_of_trial: 'After first day of trial',
  dont_know: 'Unknown',
  // Remand
  unconditional_bail: 'Unconditional bail',
  conditional_bail: 'Conditional bail',
  remanded_in_custody: 'Remanded in custody',
  // Employment
  employed: 'Employed',
  self_employed: 'Self-employed',
  unemployed: 'Unemployed',
  student: 'Student',
  retired: 'Retired',
  // Housing
  fixed_address: 'Fixed address',
  homeless: 'Homeless',
  temporary_accommodation: 'Temporary accommodation',
  // Victim type
  individual_person: 'Individual',
  organisation: 'Organisation',
  // Pre-sent report
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  // Offender-victim relationship
  stranger: 'Stranger',
  relative: 'Relative',
  acquaintance: 'Acquaintance',
};

/** Display order for known fields; unknown keys append after, sorted alphabetically. */
export const FIELD_ORDER: string[] = [
  'title',
  'document_type',
  'document_number',
  'date_issued',
  'publication_date',
  'jurisdiction',
  'country',
  'language',
  'court_name',
  'court_level',
  'department_name',
  'issuing_body',
  'presiding_judge',
  'judges',
  'parties',
  'case_type',
  'decision_type',
  'outcome',
  'legal_bases',
  'extracted_legal_bases',
  'legal_references',
  'legal_concepts',
  'references',
  'keywords',
  'source_url',

  // Base extraction schema — surfaced after core metadata, in the order they
  // make sense narratively (case identity → people → plea/sentence →
  // offender → victim → evidence → appeal → metadata).
  'base_case_name',
  'base_neutral_citation_number',
  'base_case_number',
  'base_date_of_appeal_court_judgment',
  'base_appeal_court_judges_names',
  'base_offender_representative_name',
  'base_crown_attorney_general_representative_name',
  'base_conv_court_names',
  'base_sent_court_name',
  'base_plea_point',
  'base_convict_plea_dates',
  'base_convict_offences',
  'base_acquit_offences',
  'base_did_offender_confess',
  'base_remand_decision',
  'base_remand_custody_time',
  'base_sentences_received',
  'base_sentence_serve',
  'base_what_ancilliary_orders',
  'base_offender_gender',
  'base_offender_age_offence',
  'base_offender_job_offence',
  'base_offender_home_offence',
  'base_offender_mental_offence',
  'base_offender_intox_offence',
  'base_offender_victim_relationship',
  'base_victim_type',
  'base_num_victims',
  'base_victim_gender',
  'base_victim_age_offence',
  'base_victim_job_offence',
  'base_victim_home_offence',
  'base_victim_mental_offence',
  'base_victim_intox_offence',
  'base_pros_evid_type_trial',
  'base_def_evid_type_trial',
  'base_pre_sent_report',
  'base_agg_fact_sent',
  'base_mit_fact_sent',
  'base_vic_impact_statement',
  'base_appellant',
  'base_co_def_acc_num',
  'base_appeal_against',
  'base_appeal_ground',
  'base_sent_guide_which',
  'base_appeal_outcome',
  'base_reason_quash_conv',
  'base_reason_sent_excessive',
  'base_reason_sent_lenient',
  'base_reason_dismiss',
  'base_keywords',
  'base_extracted_at',
  'base_extraction_status',
  'base_extraction_model',
  'base_schema_key',
  'base_schema_version',

  'processing_status',
  'interpretation_status',
  'ingestion_date',
  'last_updated',
  'document_id',
  'x',
  'y',
];

/** Subset of FIELD_ORDER restricted to base_* keys, preserving order. */
export const BASE_FIELD_ORDER: string[] = FIELD_ORDER.filter((k) =>
  k.startsWith('base_')
);

/**
 * Keys we never want to render directly in this component.
 *  - body content (huge): full_text, raw_content, html, summary, thesis
 *  - binary / internal: embeddings, chunks, vectors
 */
const SKIP_KEYS = new Set<string>([
  'summary',
  'thesis',
  'full_text',
  'raw_content',
  'raw_html',
  'html',
  'html_content',
  'embedding',
  'summary_embedding',
  'vectors',
  'chunks',
]);

export const shouldSkipKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  if (SKIP_KEYS.has(lower)) return true;
  if (lower.endsWith('_embedding')) return true;
  if (lower.includes('chunk')) return true;
  return false;
};

export const stripTags = (value: string): string => value.replace(/<[^>]*>/g, '').trim();

export const prettifyKey = (key: string): string =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (raw: string): string => {
  const clean = stripTags(raw);
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return clean;
  return parsed.toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const looksLikeDate = (key: string, value: string): boolean => {
  if (/_date$|_at$|date_/i.test(key)) return true;
  // ISO 8601-ish: 2024-01-15 or 2024-01-15T... with optional Z/offset
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(value);
};

/**
 * Render an unknown / generic primitive into a display string.
 * Returns null if the value carries no real information.
 */
export const formatValue = (key: string, value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  // Booleans (e.g. base_did_offender_confess, base_vic_impact_statement)
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Arrays → comma-separated list of cleaned items
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatValue(key, item))
      .filter((s): s is string => Boolean(s));
    if (items.length === 0) return null;
    return items.join(', ');
  }

  // Objects → pick the most informative single value if shallow, else JSON
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Common patterns: {name, court_level, country}, {id, label}
    if (typeof obj.name === 'string' && obj.name.trim() !== '') {
      const extras = [obj.court_level, obj.country]
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .join(' · ');
      return extras ? `${obj.name} (${extras})` : obj.name;
    }
    if (typeof obj.label === 'string' && obj.label.trim() !== '') {
      return obj.label;
    }
    const flat = Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${prettifyKey(k)}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('; ');
    return flat || null;
  }

  // Primitives
  const str = typeof value === 'string' ? stripTags(value) : String(value);
  if (str === '' || str === '-' || str === '[]' || str === '{}' || str === '[object Object]') {
    return null;
  }

  // Try to parse embedded JSON arrays/objects
  if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('{') && str.endsWith('}'))) {
    try {
      return formatValue(key, JSON.parse(str));
    } catch {
      // fall through
    }
  }

  // Enum-coded base_* values (gender_male, outcome_conviction_quashed, …) →
  // human label. Scoped to base_* so we don't rewrite generic strings
  // elsewhere in metadata.
  if (key.startsWith('base_') && Object.prototype.hasOwnProperty.call(ENUM_VALUE_LABELS, str)) {
    return ENUM_VALUE_LABELS[str];
  }

  if (looksLikeDate(key, str)) {
    return formatDate(str);
  }

  return str;
};
