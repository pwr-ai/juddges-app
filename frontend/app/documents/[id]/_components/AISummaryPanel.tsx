import React from 'react';
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { EditorialCard, StatusBadge } from '@/components/editorial';
import { Button } from '@/components/ui/button';
import { AIDisclaimerBadge, ErrorCard } from '@/lib/styles/components';
import type { SummarizeDocumentsResponse } from '@/lib/api';
import { AuthRequiredAIActionsNotice } from './AuthRequiredAIActionsNotice';
import logger from '@/lib/logger';

const panelLogger = logger.child('AISummaryPanel');

interface AISummaryPanelProps {
  isSummaryPanelOpen: boolean;
  onToggle: () => void;
  authLoading: boolean;
  canUseDocumentAI: boolean;
  summaryType: 'executive' | 'key_findings' | 'synthesis';
  onSummaryTypeChange: (value: 'executive' | 'key_findings' | 'synthesis') => void;
  summaryLength: 'short' | 'medium' | 'long';
  onSummaryLengthChange: (value: 'short' | 'medium' | 'long') => void;
  isSummarizing: boolean;
  summaryError: string | null;
  summaryResult: SummarizeDocumentsResponse | null;
  onGenerateSummary: () => void;
}

export function AISummaryPanel({
  isSummaryPanelOpen,
  onToggle,
  authLoading,
  canUseDocumentAI,
  summaryType,
  onSummaryTypeChange,
  summaryLength,
  onSummaryLengthChange,
  isSummarizing,
  summaryError,
  summaryResult,
  onGenerateSummary,
}: AISummaryPanelProps): React.JSX.Element {
  // `summaryError` is the raw exception message from the generation call. Keep it
  // in the console for debugging and show the reader actionable copy instead.
  React.useEffect(() => {
    if (summaryError) panelLogger.error('Summary generation failed', summaryError);
  }, [summaryError]);

  return (
    <div className="mb-6">
      <EditorialCard
        flat
        className="p-5 border-rule bg-parchment"
      >
        <div className="flex items-center justify-between w-full pb-4 border-b border-rule mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-oxblood" />
            <h3 className="font-serif text-lg font-semibold text-ink">AI Summary</h3>
            <StatusBadge status="gpt-4" label="GPT-4" tone="gold" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="gap-2 rounded-none font-mono text-xs text-ink hover:bg-parchment-deep"
          >
            {isSummaryPanelOpen ? (
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
          className={`transition-opacity duration-200 ${isSummaryPanelOpen
            ? 'opacity-100'
            : 'opacity-0 max-h-0 overflow-hidden'
            }`}
        >
          {authLoading ? (
            <p className="font-mono text-xs text-ink-soft">Checking whether AI analysis is available for your account...</p>
          ) : !canUseDocumentAI ? (
            <AuthRequiredAIActionsNotice message="AI-generated summaries are available for signed-in users." />
          ) : (
            <>
              {/* Summary Controls */}
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <label className="block font-mono text-xs uppercase tracking-wider text-ink-soft mb-1.5">
                    Summary Type
                  </label>
                  <select
                    value={summaryType}
                    onChange={(e) => onSummaryTypeChange(e.target.value as 'executive' | 'key_findings' | 'synthesis')}
                    className="w-full rounded-none border border-rule bg-parchment px-3 py-2 font-mono text-xs text-ink focus:outline-none focus:border-ink"
                    disabled={isSummarizing}
                  >
                    <option value="executive">Executive Summary</option>
                    <option value="key_findings">Key Findings</option>
                    <option value="synthesis">Document Synthesis</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block font-mono text-xs uppercase tracking-wider text-ink-soft mb-1.5">
                    Length
                  </label>
                  <select
                    value={summaryLength}
                    onChange={(e) => onSummaryLengthChange(e.target.value as 'short' | 'medium' | 'long')}
                    className="w-full rounded-none border border-rule bg-parchment px-3 py-2 font-mono text-xs text-ink focus:outline-none focus:border-ink"
                    disabled={isSummarizing}
                  >
                    <option value="short">Short (~150 words)</option>
                    <option value="medium">Medium (~300 words)</option>
                    <option value="long">Long (~600 words)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={onGenerateSummary}
                    disabled={isSummarizing}
                    className="gap-2 whitespace-nowrap rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs"
                  >
                    {isSummarizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Summary'
                    )}
                  </Button>
                </div>
              </div>

              {/* Summary Error */}
              {summaryError && (
                <ErrorCard
                  className="mb-4"
                  title="The summary could not be generated"
                  message="The AI summarisation service did not return a summary for this judgment. Nothing was saved and the document itself is untouched. Long judgments occasionally time out — try again, or pick a shorter summary length before retrying."
                  onRetry={onGenerateSummary}
                  retryLabel={isSummarizing ? 'Generating…' : 'Try again'}
                />
              )}

              {/* Summary Result */}
              {summaryResult && (
                <div className="space-y-4">
                  <div className="prose prose-sm max-w-none text-ink">
                    <ReactMarkdown>{summaryResult.summary}</ReactMarkdown>
                  </div>

                  {summaryResult.key_points && summaryResult.key_points.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-rule">
                      <h4 className="font-serif text-sm font-semibold text-ink mb-2">Key Points</h4>
                      <ul className="space-y-1.5">
                        {summaryResult.key_points.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-ink-soft">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-none bg-oxblood flex-shrink-0" />
                            {point}
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
              {!summaryResult && !summaryError && !isSummarizing && (
                <p className="font-mono text-xs text-ink-soft">
                  Select summary type and length, then click &quot;Generate Summary&quot; to create an AI-powered analysis of this document.
                </p>
              )}
            </>
          )}
        </div>
      </EditorialCard>
    </div>
  );
}
