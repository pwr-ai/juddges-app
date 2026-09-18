import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

import { EditorialCard, StatusBadge } from '@/components/editorial';
import { Button } from '@/components/ui/button';
import { AIDisclaimerBadge } from '@/lib/styles/components';
import { QueryHighlight } from '@/lib/styles/components/query-highlight';
import type { DocumentMetadata } from './types';

interface SummaryThesisSectionProps {
  metadata: DocumentMetadata;
  queryFromSearch: string | null;
}

export function SummaryThesisSection({
  metadata,
  queryFromSearch,
}: SummaryThesisSectionProps): React.JSX.Element | null {
  // Local to this section: only the thesis card toggles this.
  const [isThesisExpanded, setIsThesisExpanded] = useState(false);

  if (!(metadata.summary || metadata.thesis)) return null;

  return (
    <div className="mb-6 space-y-4">
      {metadata.summary && (
        <EditorialCard
          flat
          className="p-5 border-rule bg-parchment"
        >
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-rule">
            <Info className="h-4 w-4 text-oxblood" />
            <h3 className="font-serif text-lg font-semibold text-ink">Document Summary</h3>
            <StatusBadge status="ai_generated" label="AI Generated" tone="gold" />
          </div>
          <div>
            <p className="text-sm text-ink leading-relaxed text-justify">
              <QueryHighlight as="span" text={metadata.summary} query={queryFromSearch} />
            </p>
            <div className="mt-3 pt-3 border-t border-rule">
              <AIDisclaimerBadge showBorder={false} linkText="See disclaimer" />
            </div>
          </div>
        </EditorialCard>
      )}

      {metadata.thesis && (
        <EditorialCard
          flat
          className="p-5 border-rule bg-parchment"
        >
          <div className="flex items-center justify-between pb-3 border-b border-rule mb-3">
            <h3 className="font-serif text-lg font-semibold text-ink">Thesis</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsThesisExpanded(!isThesisExpanded)}
              className="gap-2 rounded-none font-mono text-xs text-ink hover:bg-parchment-deep"
            >
              {isThesisExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Expand
                </>
              )}
            </Button>
          </div>
          <div
            className={`transition-opacity duration-200 ${isThesisExpanded
              ? 'opacity-100'
              : 'opacity-0 max-h-0 overflow-hidden'
              }`}
          >
            <div className="text-ink text-base leading-7 break-words whitespace-normal font-serif">
              {metadata.thesis}
            </div>
          </div>
        </EditorialCard>
      )}
    </div>
  );
}
