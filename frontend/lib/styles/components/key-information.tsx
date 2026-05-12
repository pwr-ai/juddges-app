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
        wide && 'sm:col-span-2 lg:col-span-2 xl:col-span-2',
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
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
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
