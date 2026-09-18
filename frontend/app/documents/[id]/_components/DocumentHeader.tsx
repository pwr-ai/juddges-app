import React from 'react';
import { ExternalLink, Calendar, Building2 } from 'lucide-react';

import { QueryHighlight } from '@/lib/styles/components/query-highlight';
import type { DocumentMetadata } from './types';

interface DocumentHeaderProps {
  metadata: DocumentMetadata;
  queryFromSearch: string | null;
  headerTitle: string;
  headerDocNumber: string | null;
  headerDate: string | null;
  headerCourtName: string | null;
  jurisdictionLabel: string | null;
  headerDocType: string | null;
}

export function DocumentHeader({
  metadata,
  queryFromSearch,
  headerTitle,
  headerDocNumber,
  headerDate,
  headerCourtName,
  jurisdictionLabel,
  headerDocType,
}: DocumentHeaderProps): React.JSX.Element {
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 pb-4 pt-2 bg-parchment border-b border-rule mb-6">
      {/* Title */}
      <h1 className="text-2xl font-serif font-semibold text-ink leading-tight mb-1">
        <QueryHighlight as="span" text={headerTitle} query={queryFromSearch} />
      </h1>

      {/* Document number (secondary) */}
      {headerDocNumber && (
        <p className="text-xs text-ink-soft font-mono mb-3">
          {headerDocNumber}
        </p>
      )}

      {/* Key metadata row: court, date, jurisdiction badge, document type badge */}
      <div className="flex items-center gap-3 flex-wrap">
        {headerCourtName && (
          <div className="flex items-center gap-1.5 text-xs text-ink-soft font-mono">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-ink-soft" />
            <span>{headerCourtName}</span>
          </div>
        )}
        {headerDate && (
          <div className="flex items-center gap-1.5 text-xs text-ink-soft font-mono">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-ink-soft" />
            <span>{headerDate}</span>
          </div>
        )}
        {jurisdictionLabel && (
          <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink">
            {jurisdictionLabel}
          </span>
        )}
        {headerDocType && (
          <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink-soft">
            {headerDocType}
          </span>
        )}
      </div>

      {/* Source info bar */}
      {(metadata.source_url || headerCourtName || headerDate) && (
        <div className="mt-3 flex items-center gap-2 text-xs font-mono text-ink-soft">
          {headerCourtName && (
            <span>Source: {headerCourtName}</span>
          )}
          {headerCourtName && headerDate && (
            <span className="text-rule">|</span>
          )}
          {headerDate && (
            <span>Published: {headerDate}</span>
          )}
          {metadata.source_url && (
            <>
              <span className="text-rule">|</span>
              <a
                href={metadata.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-oxblood hover:underline transition-colors"
              >
                View on source website
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
