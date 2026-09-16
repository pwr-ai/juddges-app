import React from 'react';
import { ChevronDown, ChevronUp, Scale, Loader2, MessageSquare, BookOpen } from 'lucide-react';

import { EditorialCard, StatusBadge } from '@/components/editorial';
import { Button } from '@/components/ui/button';
import { AIDisclaimerBadge, ErrorCard } from '@/lib/styles/components';
import type { ExtractKeyPointsResponse } from '@/lib/api';
import { AuthRequiredAIActionsNotice } from './AuthRequiredAIActionsNotice';
import logger from '@/lib/logger';

const panelLogger = logger.child('KeyPointsPanel');

interface KeyPointsPanelProps {
  isKeyPointsPanelOpen: boolean;
  onToggle: () => void;
  authLoading: boolean;
  canUseDocumentAI: boolean;
  isExtractingKeyPoints: boolean;
  keyPointsError: string | null;
  keyPointsResult: ExtractKeyPointsResponse | null;
  onExtractKeyPoints: () => void;
}

export function KeyPointsPanel({
  isKeyPointsPanelOpen,
  onToggle,
  authLoading,
  canUseDocumentAI,
  isExtractingKeyPoints,
  keyPointsError,
  keyPointsResult,
  onExtractKeyPoints,
}: KeyPointsPanelProps): React.JSX.Element {
  // `keyPointsError` is the raw exception message from the extraction call. Keep it
  // in the console for debugging and show the reader actionable copy instead.
  React.useEffect(() => {
    if (keyPointsError) panelLogger.error('Key-point extraction failed', keyPointsError);
  }, [keyPointsError]);

  return (
    <div className="mb-6">
      <EditorialCard
        flat
        className="p-5 border-rule bg-parchment"
      >
        <div className="flex items-center justify-between w-full pb-4 border-b border-rule mb-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-oxblood" />
            <h3 className="font-serif text-lg font-semibold text-ink">Key Points</h3>
            <StatusBadge status="ai_analysis" label="AI Analysis" tone="gold" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="gap-2 rounded-none font-mono text-xs text-ink hover:bg-parchment-deep"
          >
            {isKeyPointsPanelOpen ? (
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
          className={`transition-opacity duration-200 ${isKeyPointsPanelOpen
            ? 'opacity-100'
            : 'opacity-0 max-h-0 overflow-hidden'
            }`}
        >
          {authLoading ? (
            <p className="font-mono text-xs text-ink-soft">Checking whether AI analysis is available for your account...</p>
          ) : !canUseDocumentAI ? (
            <AuthRequiredAIActionsNotice message="AI key-point extraction is available for signed-in users." />
          ) : (
            <>
              {/* Extract Button */}
              <div className="mb-4">
                <Button
                  onClick={onExtractKeyPoints}
                  disabled={isExtractingKeyPoints}
                  className="gap-2 rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs"
                >
                  {isExtractingKeyPoints ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    'Extract Key Points'
                  )}
                </Button>
              </div>

              {/* Error */}
              {keyPointsError && (
                <ErrorCard
                  className="mb-4"
                  title="Key points could not be extracted"
                  message="The AI extraction service did not return arguments or holdings for this judgment. Nothing was saved and the document itself is untouched. Long judgments occasionally time out — try again, and if it keeps failing read the judgment text below directly."
                  onRetry={onExtractKeyPoints}
                  retryLabel={isExtractingKeyPoints ? 'Extracting…' : 'Try again'}
                />
              )}

              {/* Key Points Result */}
              {keyPointsResult && (
                <div className="space-y-6">
                  {/* Arguments Section */}
                  {keyPointsResult.arguments.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-4 w-4 text-oxblood" />
                        <h4 className="font-serif text-sm font-semibold text-ink">Arguments</h4>
                        <span className="px-1.5 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink-soft">
                          {keyPointsResult.arguments.length}
                        </span>
                      </div>
                      <ul className="space-y-3">
                        {keyPointsResult.arguments.map((arg, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-none bg-oxblood flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-xs font-semibold text-oxblood">{arg.party}:</span>
                              <span className="text-ink ml-1.5">{arg.text}</span>
                              <span className="ml-2 font-mono text-xs text-ink-soft bg-parchment-deep border border-rule px-1.5 py-0.5 rounded-none">
                                {arg.source_ref}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Holdings Section */}
                  {keyPointsResult.holdings.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Scale className="h-4 w-4 text-gold" />
                        <h4 className="font-serif text-sm font-semibold text-ink">Holdings</h4>
                        <span className="px-1.5 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink-soft">
                          {keyPointsResult.holdings.length}
                        </span>
                      </div>
                      <ul className="space-y-3">
                        {keyPointsResult.holdings.map((holding, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-none bg-gold flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-ink">{holding.text}</span>
                              <span className="ml-2 font-mono text-xs text-ink-soft bg-parchment-deep border border-rule px-1.5 py-0.5 rounded-none">
                                {holding.source_ref}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Legal Principles Section */}
                  {keyPointsResult.legal_principles.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="h-4 w-4 text-ink" />
                        <h4 className="font-serif text-sm font-semibold text-ink">Legal Principles</h4>
                        <span className="px-1.5 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink-soft">
                          {keyPointsResult.legal_principles.length}
                        </span>
                      </div>
                      <ul className="space-y-3">
                        {keyPointsResult.legal_principles.map((principle, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-none bg-ink flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-ink">{principle.text}</span>
                              {principle.legal_basis && (
                                <span className="ml-2 font-mono text-xs text-oxblood bg-parchment-deep border border-rule px-1.5 py-0.5 rounded-none">
                                  {principle.legal_basis}
                                </span>
                              )}
                              <span className="ml-2 font-mono text-xs text-ink-soft bg-parchment-deep border border-rule px-1.5 py-0.5 rounded-none">
                                {principle.source_ref}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-3 border-t border-rule">
                    <AIDisclaimerBadge showBorder={false} linkText="See disclaimer" />
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!keyPointsResult && !keyPointsError && !isExtractingKeyPoints && (
                <p className="font-mono text-xs text-ink-soft">
                  Click &quot;Extract Key Points&quot; to identify key arguments, holdings, and legal principles from this document with source paragraph references.
                </p>
              )}
            </>
          )}
        </div>
      </EditorialCard>
    </div>
  );
}
