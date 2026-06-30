import React from 'react';
import { ChevronDown, ChevronUp, Scale, Loader2, Sparkles, MessageSquare, BookOpen } from 'lucide-react';

import { BaseCard, Button, Badge, AIDisclaimerBadge } from '@/lib/styles/components';
import type { ExtractKeyPointsResponse } from '@/lib/api';
import { AuthRequiredAIActionsNotice } from './AuthRequiredAIActionsNotice';

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
  return (
    <div className="mb-6">
      <BaseCard
        className="rounded-2xl"
        clickable={false}
        variant="light"
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-lg text-foreground">Key Points</h3>
              <Badge variant="secondary" className="text-xs flex items-center gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                <Sparkles className="h-3 w-3" />
                AI Analysis
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="gap-2"
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
        }
      >
        <div
          className={`transition-all duration-300 ease-in-out ${isKeyPointsPanelOpen
            ? 'opacity-100'
            : 'opacity-0 max-h-0 overflow-hidden'
            }`}
        >
          {authLoading ? (
            <p className="text-sm text-muted-foreground">Checking whether AI analysis is available for your account...</p>
          ) : !canUseDocumentAI ? (
            <AuthRequiredAIActionsNotice message="AI key-point extraction is available for signed-in users." />
          ) : (
            <>
              {/* Extract Button */}
              <div className="mb-4">
                <Button
                  onClick={onExtractKeyPoints}
                  disabled={isExtractingKeyPoints}
                  className="gap-2"
                >
                  {isExtractingKeyPoints ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Extract Key Points
                    </>
                  )}
                </Button>
              </div>

              {/* Error */}
              {keyPointsError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {keyPointsError}
                </div>
              )}

              {/* Key Points Result */}
              {keyPointsResult && (
                <div className="space-y-6">
                  {/* Arguments Section */}
                  {keyPointsResult.arguments.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-4 w-4 text-blue-600" />
                        <h4 className="text-sm font-semibold text-foreground">Arguments</h4>
                        <Badge variant="secondary" className="text-xs">{keyPointsResult.arguments.length}</Badge>
                      </div>
                      <ul className="space-y-3">
                        {keyPointsResult.arguments.map((arg, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-blue-700">{arg.party}:</span>
                              <span className="text-foreground ml-1">{arg.text}</span>
                              <span className="ml-2 text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
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
                        <Scale className="h-4 w-4 text-amber-600" />
                        <h4 className="text-sm font-semibold text-foreground">Holdings</h4>
                        <Badge variant="secondary" className="text-xs">{keyPointsResult.holdings.length}</Badge>
                      </div>
                      <ul className="space-y-3">
                        {keyPointsResult.holdings.map((holding, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-foreground">{holding.text}</span>
                              <span className="ml-2 text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
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
                        <BookOpen className="h-4 w-4 text-purple-600" />
                        <h4 className="text-sm font-semibold text-foreground">Legal Principles</h4>
                        <Badge variant="secondary" className="text-xs">{keyPointsResult.legal_principles.length}</Badge>
                      </div>
                      <ul className="space-y-3">
                        {keyPointsResult.legal_principles.map((principle, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-foreground">{principle.text}</span>
                              {principle.legal_basis && (
                                <span className="ml-2 text-xs font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                                  {principle.legal_basis}
                                </span>
                              )}
                              <span className="ml-2 text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
                                {principle.source_ref}
                              </span>
                            </div>
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
              {!keyPointsResult && !keyPointsError && !isExtractingKeyPoints && (
                <p className="text-sm text-muted-foreground">
                  Click &quot;Extract Key Points&quot; to identify key arguments, holdings, and legal principles from this document with source paragraph references.
                </p>
              )}
            </>
          )}
        </div>
      </BaseCard>
    </div>
  );
}
