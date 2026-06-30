import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Sparkles } from 'lucide-react';

import { BaseCard, Button, Badge, AIDisclaimerBadge } from '@/lib/styles/components';
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
        <BaseCard
          className="rounded-2xl"
          clickable={false}
          variant="light"
          title={
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-lg text-foreground">Document Summary</h3>
              <Badge variant="secondary" className="text-xs flex items-center gap-1 bg-purple-100 text-purple-700 border-purple-200 whitespace-normal break-words">
                <Sparkles className="h-3 w-3" />
                AI Generated
              </Badge>
            </div>
          }
        >
          <div>
            <p className="text-sm text-slate-700 leading-relaxed text-justify">
              <QueryHighlight as="span" text={metadata.summary} query={queryFromSearch} />
            </p>
            <div className="mt-3 pt-3 border-t border-border">
              <AIDisclaimerBadge showBorder={false} linkText="See disclaimer" />
            </div>
          </div>
        </BaseCard>
      )}

      {metadata.thesis && (
        <BaseCard
          className="rounded-2xl"
          clickable={false}
          variant="light"
          title={
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-foreground">Thesis</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsThesisExpanded(!isThesisExpanded)}
                className="gap-2"
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
          }
        >
          <div
            className={`transition-all duration-300 ease-in-out ${isThesisExpanded
              ? 'opacity-100'
              : 'opacity-0 max-h-0 overflow-hidden'
              }`}
          >
            <div className="text-foreground text-base leading-7 break-words whitespace-normal">
              {metadata.thesis}
            </div>
          </div>
        </BaseCard>
      )}
    </div>
  );
}
