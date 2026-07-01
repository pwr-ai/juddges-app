import React from 'react';
import { ExternalLink } from 'lucide-react';

import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import { BaseCard, Badge } from '@/lib/styles/components';
import type { SimilarDocument } from './types';

interface RelatedDocumentsProps {
  similarDocs: SimilarDocument[];
  enrichedSimilarDocs: SimilarDocument[];
  onNavigate: (documentId: string) => void;
}

export function RelatedDocuments({
  similarDocs,
  enrichedSimilarDocs,
  onNavigate,
}: RelatedDocumentsProps): React.JSX.Element | null {
  if (similarDocs.length === 0) return null;

  return (
    <div className="mb-6 bg-transparent">
      <h3 className="font-bold text-lg text-foreground mb-4">Similar Documents</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(enrichedSimilarDocs.length > 0 ? enrichedSimilarDocs : similarDocs).map((doc) => {
          // Format document type for display
          const formatDocumentType = (): string | null => {
            if (!doc.document_type) return null;
            return doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          };

          // Format date for display - use date_issued, fallback to publication_date
          const formatDate = (): string | null => {
            const dateValue = doc.date_issued || doc.publication_date;
            if (!dateValue) return null;
            try {
              const date = new Date(dateValue);
              return date.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
            } catch {
              return dateValue;
            }
          };

          const documentType = formatDocumentType();
          const dateStr = formatDate();
          const displayId = doc.document_id?.replace(/^\/doc\//, '') || doc.document_id;

          // Use title if available, then document_number, then document_id
          const displayText = doc.title && doc.title.trim() !== ''
            ? doc.title
            : (doc.document_number && doc.document_number.trim() !== ''
              ? doc.document_number
              : displayId);

          // Format judges array
          const judgesText = doc.judges && doc.judges.length > 0
            ? doc.judges.join(', ')
            : null;

          // Collect all meaningful metadata fields
          // Extract issuing body name if available (more readable than court ID)
          const issuingBodyName = doc.issuing_body && typeof doc.issuing_body === 'object' && doc.issuing_body !== null
            ? (doc.issuing_body as { name?: string }).name
            : null;

          // Determine court display name: prefer issuing_body.name, then court_name
          // Show court_name even if it looks like an ID - it's still useful information
          const courtDisplayName = issuingBodyName && issuingBodyName.trim() !== ''
            ? issuingBodyName
            : (doc.court_name && doc.court_name.trim() !== '' ? doc.court_name : null);

          const hasCourtInfo = courtDisplayName !== null;
          const hasDepartmentInfo = doc.department_name && doc.department_name.trim() !== '';
          const hasPresidingJudge = doc.presiding_judge && doc.presiding_judge.trim() !== '';
          const hasJudges = judgesText && judgesText.trim() !== '';
          // Handle parties: filter out empty arrays represented as "[]" string
          const partiesValue = Array.isArray(doc.parties)
            ? (doc.parties.length > 0 ? doc.parties.join(', ') : null)
            : (doc.parties && doc.parties.trim() !== '' && doc.parties.trim() !== '[]' ? doc.parties : null);
          const hasParties = partiesValue !== null;
          const hasOutcome = doc.outcome && doc.outcome.trim() !== '';
          const hasDocumentNumber = doc.document_number && doc.document_number.trim() !== '' && doc.document_number !== displayText;
          const hasCountry = doc.country && doc.country.trim() !== '';
          const hasLanguage = doc.language && doc.language.trim() !== '';

          const hasAnyMetadata = hasCourtInfo || hasDepartmentInfo || hasPresidingJudge || hasJudges || hasParties || hasOutcome || hasDocumentNumber || hasCountry || hasLanguage;

          return (
            <BaseCard
              key={doc.document_id}
              className="rounded-xl border border-border/50 hover:border-primary/50 transition-all duration-200 hover:shadow-md"
              clickable={true}
              variant="light"
              onClick={() => onNavigate(`/documents/${cleanDocumentIdForUrl(doc.document_id)}`)}
            >
              <div className="flex flex-col gap-4 p-1">
                {/* Header */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-foreground leading-tight line-clamp-2 mb-1.5 group-hover:text-primary transition-colors">
                      {displayText}
                    </h4>
                    {hasDocumentNumber && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {doc.document_number}
                      </p>
                    )}
                  </div>
                </div>

                {/* Primary metadata badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {documentType && (
                    <Badge variant="secondary" className="text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
                      {documentType}
                    </Badge>
                  )}
                  {dateStr && (
                    <Badge variant="secondary" className="text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
                      {dateStr}
                    </Badge>
                  )}
                  {hasCountry && (
                    <Badge variant="secondary" className="text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
                      {doc.country}
                    </Badge>
                  )}
                </div>

                {/* Additional metadata - only show if there's meaningful content */}
                {hasAnyMetadata && (
                  <div className="space-y-2 pt-3 border-t border-border/50">
                    {(hasCourtInfo || hasDepartmentInfo) && (
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">Court:</span>
                        <span className="text-muted-foreground ml-1.5">
                          {courtDisplayName || ''}
                          {hasCourtInfo && hasDepartmentInfo && ` - `}
                          {hasDepartmentInfo && doc.department_name}
                        </span>
                      </div>
                    )}
                    {hasPresidingJudge && (
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">Presiding Judge:</span>
                        <span className="text-muted-foreground ml-1.5">{doc.presiding_judge}</span>
                      </div>
                    )}
                    {hasJudges && !hasPresidingJudge && (
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">Judges:</span>
                        <span className="text-muted-foreground ml-1.5">{judgesText}</span>
                      </div>
                    )}
                    {hasParties && (
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">Parties:</span>
                        <span className="text-muted-foreground ml-1.5 line-clamp-2">{partiesValue}</span>
                      </div>
                    )}
                    {hasOutcome && (
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">Outcome:</span>
                        <span className="text-muted-foreground ml-1.5 line-clamp-2">{doc.outcome}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer with link indicator */}
                <div className="flex items-center justify-end pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    <span className="font-medium">View document</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </BaseCard>
          );
        })}
      </div>
    </div>
  );
}
