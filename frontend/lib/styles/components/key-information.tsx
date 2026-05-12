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
  Tag,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FIELD_LABELS,
  FIELD_ORDER,
  formatValue,
  prettifyKey,
  shouldSkipKey,
  type FieldMeta,
} from '@/lib/document-fields';

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

interface ResolvedField {
  key: string;
  config: FieldMeta & { icon: IconType };
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

    const meta = FIELD_LABELS[key];
    const config: FieldMeta & { icon: IconType } = {
      label: meta?.label ?? prettifyKey(key),
      icon: meta?.icon ?? Tag,
      wide: meta?.wide,
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
