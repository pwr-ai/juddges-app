import React from 'react';
import { ExternalLink, Calendar, Building2 } from 'lucide-react';

import { Badge } from '@/lib/styles/components';
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
    <div className="sticky top-0 z-10 -mx-4 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-b border-border/50 mb-6">
      {/* Title */}
      <h1 className="text-2xl font-bold text-foreground leading-tight mb-1">
        <QueryHighlight as="span" text={headerTitle} query={queryFromSearch} />
      </h1>

      {/* Document number (secondary) */}
      {headerDocNumber && (
        <p className="text-sm text-muted-foreground font-mono mb-3">
          {headerDocNumber}
        </p>
      )}

      {/* Key metadata row: court, date, jurisdiction badge, document type badge */}
      <div className="flex items-center gap-3 flex-wrap">
        {headerCourtName && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4 flex-shrink-0" />
            <span>{headerCourtName}</span>
          </div>
        )}
        {headerDate && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span>{headerDate}</span>
          </div>
        )}
        {jurisdictionLabel && (
          <Badge variant="secondary" className="text-xs font-semibold bg-blue-100 text-blue-800 border-blue-200">
            {jurisdictionLabel}
          </Badge>
        )}
        {headerDocType && (
          <Badge variant="secondary" className="text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
            {headerDocType}
          </Badge>
        )}
      </div>

      {/* Source info bar */}
      {(metadata.source_url || headerCourtName || headerDate) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {headerCourtName && (
            <span>Source: {headerCourtName}</span>
          )}
          {headerCourtName && headerDate && (
            <span className="text-border">|</span>
          )}
          {headerDate && (
            <span>Published: {headerDate}</span>
          )}
          {metadata.source_url && (
            <>
              <span className="text-border">|</span>
              <a
                href={metadata.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
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
