import React from 'react';
import { ChevronDown, ChevronUp, FileText, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { BaseCard, Button, Badge, AIDisclaimerBadge } from '@/lib/styles/components';
import type { SummarizeDocumentsResponse } from '@/lib/api';
import { AuthRequiredAIActionsNotice } from './AuthRequiredAIActionsNotice';

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
  return (
    <div className="mb-6">
      <BaseCard
        className="rounded-2xl"
        clickable={false}
        variant="light"
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-lg text-foreground">AI Summary</h3>
              <Badge variant="secondary" className="text-xs flex items-center gap-1 bg-blue-100 text-blue-700 border-blue-200">
                <Sparkles className="h-3 w-3" />
                GPT-4
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="gap-2"
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
        }
      >
        <div
          className={`transition-all duration-300 ease-in-out ${isSummaryPanelOpen
            ? 'opacity-100'
            : 'opacity-0 max-h-0 overflow-hidden'
            }`}
        >
          {authLoading ? (
            <p className="text-sm text-muted-foreground">Checking whether AI analysis is available for your account...</p>
          ) : !canUseDocumentAI ? (
            <AuthRequiredAIActionsNotice message="AI-generated summaries are available for signed-in users." />
          ) : (
            <>
              {/* Summary Controls */}
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Summary Type
                  </label>
                  <select
                    value={summaryType}
                    onChange={(e) => onSummaryTypeChange(e.target.value as 'executive' | 'key_findings' | 'synthesis')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    disabled={isSummarizing}
                  >
                    <option value="executive">Executive Summary</option>
                    <option value="key_findings">Key Findings</option>
                    <option value="synthesis">Document Synthesis</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Length
                  </label>
                  <select
                    value={summaryLength}
                    onChange={(e) => onSummaryLengthChange(e.target.value as 'short' | 'medium' | 'long')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                    className="gap-2 whitespace-nowrap"
                  >
                    {isSummarizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Summary
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Summary Error */}
              {summaryError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {summaryError}
                </div>
              )}

              {/* Summary Result */}
              {summaryResult && (
                <div className="space-y-4">
                  <div className="prose prose-sm max-w-none text-foreground">
                    <ReactMarkdown>{summaryResult.summary}</ReactMarkdown>
                  </div>

                  {summaryResult.key_points && summaryResult.key_points.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <h4 className="text-sm font-semibold text-foreground mb-2">Key Points</h4>
                      <ul className="space-y-1.5">
                        {summaryResult.key_points.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-3 border-t border-border">
                    <AIDisclaimerBadge showBorder={false} linkText="See disclaimer" />
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!summaryResult && !summaryError && !isSummarizing && (
                <p className="text-sm text-muted-foreground">
                  Select summary type and length, then click &quot;Generate Summary&quot; to create an AI-powered analysis of this document.
                </p>
              )}
            </>
          )}
        </div>
      </BaseCard>
    </div>
  );
}
