import React, { useState } from 'react';
import { ExternalLink, Info, FileText, Globe } from 'lucide-react';

import { SanitizedHtmlView } from './SanitizedHtmlView';
import type { DocumentMetadata } from './types';

interface DocumentBodyProps {
  hasHtmlContent: boolean;
  htmlString: string | null;
  metadata: DocumentMetadata;
}

export function DocumentBody({
  hasHtmlContent,
  htmlString,
  metadata,
}: DocumentBodyProps): React.JSX.Element {
  // Local to this section: the document body collapse state lives only here.
  const [isDocumentExpanded] = useState(true);

  return (
    <div>
      <div
        className={`printable transition-opacity duration-200 ${isDocumentExpanded
          ? 'opacity-100'
          : 'opacity-0 max-h-0 overflow-hidden'
          } printable-document-content`}
      >
        {hasHtmlContent ? (
          <SanitizedHtmlView
            htmlString={htmlString}
            metadata={metadata}
          />
        ) : (
          /* Enhanced fallback when no HTML content is available */
          <div className="rounded-none border border-rule bg-parchment p-8">
            <div className="text-center mb-6">
              <FileText className="h-12 w-12 text-ink-soft/40 mx-auto mb-3" />
              <h3 className="font-serif text-lg font-semibold text-ink mb-1">
                Full document content is not available for this judgment
              </h3>
              <p className="text-sm text-ink-soft">
                The original document text could not be retrieved. See the summary or metadata for available information.
              </p>
            </div>

            {/* Show summary as fallback content if available */}
            {metadata.summary && (
              <div className="mt-6 pt-6 border-t border-rule">
                <h4 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4 text-oxblood" />
                  Document Summary
                </h4>
                <p className="text-sm text-ink leading-relaxed text-justify">
                  {metadata.summary}
                </p>
              </div>
            )}

            {/* Prominent source link if available */}
            {metadata.source_url && (
              <div className="mt-6 pt-6 border-t border-rule text-center">
                <a
                  href={metadata.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-2 rounded-none bg-oxblood px-5 py-2.5 font-mono text-xs font-medium text-parchment hover:bg-oxblood-deep transition-colors"
                >
                  <Globe className="h-4 w-4" />
                  View on source website
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
