/**
 * Key Information Component
 * Displays document metadata fields in a structured, readable layout.
 *
 * Two modes:
 *  - `layout="sidebar"` (default): compact 1–2 column layout for narrow sidebars,
 *    showing a curated set of fields.
 *  - `layout="grid"` + `showAll`: full-width responsive grid that renders every
 *    meaningful field returned by the metadata API (known fields get curated
 *    label/icon; unknown keys are prettified automatically).
 */

import React, { memo } from 'react';
import {
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
  ExternalLink,
  BookOpen,
  Activity,
  Clock,
  Database,
  Layers,
  Link as LinkIcon,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KeyInformationProps {
  /**
   * Document metadata object containing all document fields
   */
  metadata: {
    document_id?: string | null;
    title?: string | null;
    document_type?: string | null;
    date_issued?: string | null;
    document_number?: string | null;
    language?: string | null;
    country?: string | null;
    court_name?: string | null;
    department_name?: string | null;
    presiding_judge?: string | null;
    judges?: string[] | null;
    parties?: string | null;
    outcome?: string | null;
    legal_bases?: string[] | null;
    publication_date?: string | null;
    [key: string]: unknown;
  };
  /** Optional className for the container */
  className?: string;
  /** Layout variant. Default `sidebar` keeps the original compact 1–2 col layout. */
  layout?: 'sidebar' | 'grid';
  /**
   * When true, render every meaningful field from `metadata` (known + unknown).
   * When false (default), only the curated set of fields is rendered.
   */
  showAll?: boolean;
  /** Optional heading rendered inside the card. */
  title?: string;
}

type IconType = React.ComponentType<{ className?: string }>;

interface FieldConfig {
  label: string;
  icon: IconType;
  /** Span more columns in grid mode (for long-form values) */
  wide?: boolean;
}

/**
 * Known metadata keys → curated label, icon, and column-span hint.
 * Anything not in this map is rendered with a generic icon and a prettified key.
 */
const FIELD_CONFIG: Record<string, FieldConfig> = {
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
const ENUM_VALUE_LABELS: Record<string, string> = {
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

const shouldSkipKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  if (SKIP_KEYS.has(lower)) return true;
  if (lower.endsWith('_embedding')) return true;
  if (lower.includes('chunk')) return true;
  return false;
};

/** Display order for known fields; unknown keys append after, sorted alphabetically. */
const FIELD_ORDER: string[] = [
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

const stripTags = (value: string): string => value.replace(/<[^>]*>/g, '').trim();

const prettifyKey = (key: string): string =>
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
const formatValue = (key: string, value: unknown): string | null => {
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

interface ResolvedField {
  key: string;
  config: FieldConfig;
  display: string;
}

const buildFields = (
  metadata: KeyInformationProps['metadata'],
  showAll: boolean,
): ResolvedField[] => {
  // Curated subset for the sidebar mode (matches the historical behaviour)
  const CURATED_KEYS = [
    'document_type',
    'date_issued',
    'publication_date',
    'document_number',
    'language',
    'country',
    'court_name',
    'presiding_judge',
    'judges',
    'parties',
    'outcome',
    'legal_bases',
  ];

  const keysToConsider = showAll
    ? Object.keys(metadata).filter((k) => !shouldSkipKey(k))
    : CURATED_KEYS.filter((k) => k in metadata);

  // Stable ordering: FIELD_ORDER first, then remaining keys alphabetically.
  const knownOrder = new Map(FIELD_ORDER.map((k, i) => [k, i]));
  const sorted = [...keysToConsider].sort((a, b) => {
    const ai = knownOrder.has(a) ? knownOrder.get(a)! : Number.MAX_SAFE_INTEGER;
    const bi = knownOrder.has(b) ? knownOrder.get(b)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });

  const fields: ResolvedField[] = [];
  for (const key of sorted) {
    // For sidebar mode, exclude `court_name + department_name` collapsed into one field below
    const value = metadata[key as keyof typeof metadata];
    let display = formatValue(key, value);
    if (!display) continue;

    // Merge department into court display when both exist (sidebar UX)
    if (key === 'court_name') {
      const dept = formatValue('department_name', metadata.department_name);
      if (dept) display = `${display} — ${dept}`;
    }
    if (key === 'department_name' && metadata.court_name) {
      // Already merged into court_name above
      continue;
    }

    const config: FieldConfig = FIELD_CONFIG[key] ?? {
      label: prettifyKey(key),
      icon: Tag,
    };

    fields.push({ key, config, display });
  }

  return fields;
};

/**
 * Render one field cell (icon + label + value). Source URL gets a link affordance.
 */
const FieldCell = memo(function FieldCell({
  field,
  wide,
}: {
  field: ResolvedField;
  wide?: boolean;
}) {
  const { config, display, key } = field;
  const Icon = config.icon;
  const isUrl = key === 'source_url' && /^https?:\/\//i.test(display);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-slate-200/60 bg-white/70 p-3 backdrop-blur-sm',
        wide && 'sm:col-span-2 lg:col-span-2 xl:col-span-2 2xl:col-span-3',
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className="rounded-lg p-2 bg-slate-100/80 border border-slate-200/50">
          <Icon className="h-4 w-4 text-slate-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 mb-1">
          {config.label}
        </div>
        <div className="text-sm text-slate-900 break-words">
          {isUrl ? (
            <a
              href={display}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 underline-offset-4 hover:underline"
            >
              <span className="truncate">{display}</span>
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
          ) : (
            display
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Key Information Component
 *
 * Displays document metadata in a structured layout (sidebar list or full-width grid).
 * Only renders fields that carry meaningful values.
 */
export const KeyInformation = memo(function KeyInformation({
  metadata,
  className,
  layout = 'sidebar',
  showAll = false,
  title,
}: KeyInformationProps) {
  const fields = buildFields(metadata, showAll);

  if (fields.length === 0) {
    return null;
  }

  const isGrid = layout === 'grid';

  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200/50 bg-white/60 backdrop-blur-md p-6',
        className,
      )}
      aria-label={title ?? 'Document metadata'}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-lg text-foreground">{title}</h3>
          <span className="text-xs font-medium text-muted-foreground">
            {fields.length} {fields.length === 1 ? 'field' : 'fields'}
          </span>
        </div>
      )}

      <div
        className={cn(
          'grid gap-3',
          isGrid
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
            : 'grid-cols-1 md:grid-cols-2',
        )}
      >
        {fields.map((field) => (
          <FieldCell
            key={field.key}
            field={field}
            wide={isGrid && field.config.wide}
          />
        ))}
      </div>
    </section>
  );
});
