'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, ChevronUp, GitCompare, RotateCcw, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { BaseCard, Button, Badge } from '@/lib/styles/components';
import DOMPurify from 'dompurify';
import {
  getVersionHistory,
  getVersionDiff,
  createVersionSnapshot,
  revertToVersion,
} from '@/lib/api';
import type {
  DocumentVersion,
  VersionHistoryResponse,
  VersionDiffResponse,
} from '@/types/versioning';

interface VersionHistoryProps {
  documentId: string;
  onRevert?: () => void; // Called after successful revert to refresh document data
}

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  initial: { label: 'Initial', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  amendment: { label: 'Amendment', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  correction: { label: 'Correction', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' },
  consolidation: { label: 'Consolidation', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  repeal: { label: 'Repeal', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Sanitize diff HTML from the backend.
 * The diff HTML is generated server-side with HTML-escaped content wrapped in <span> tags.
 * We use DOMPurify as defense-in-depth.
 */
function sanitizeDiffHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['span'],
    ALLOWED_ATTR: ['class'],
  });
}

export function VersionHistory({ documentId, onRevert }: VersionHistoryProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyData, setHistoryData] = useState<VersionHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Diff state
  const [diffData, setDiffData] = useState<VersionDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<{ from: number | null; to: number | null }>({ from: null, to: null });

  // Action states
  const [isCreating, setIsCreating] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [revertTarget, setRevertTarget] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getVersionHistory(documentId);
      setHistoryData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isExpanded && !historyData) {
      fetchHistory();
    }
  }, [isExpanded, historyData, fetchHistory]);

  const handleCompare = useCallback(async (fromVersion: number, toVersion: number) => {
    try {
      setDiffLoading(true);
      setDiffData(null);
      setSelectedVersions({ from: fromVersion, to: toVersion });
      const data = await getVersionDiff(documentId, fromVersion, toVersion);
      setDiffData(data);
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to generate diff' });
    } finally {
      setDiffLoading(false);
    }
  }, [documentId]);

  const handleCreateSnapshot = useCallback(async () => {
    try {
      setIsCreating(true);
      setActionMessage(null);
      await createVersionSnapshot(documentId, {
        change_description: 'Manual snapshot',
        change_type: 'amendment',
      });
      setActionMessage({ type: 'success', text: 'Version snapshot created successfully' });
      await fetchHistory();
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create snapshot' });
    } finally {
      setIsCreating(false);
    }
  }, [documentId, fetchHistory]);

  const handleRevert = useCallback(async (versionNumber: number) => {
    try {
      setIsReverting(true);
      setActionMessage(null);
      await revertToVersion(documentId, {
        version_number: versionNumber,
        change_description: `Reverted to version ${versionNumber}`,
      });
      setActionMessage({ type: 'success', text: `Document reverted to version ${versionNumber}` });
      setRevertTarget(null);
      await fetchHistory();
      onRevert?.();
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to revert' });
    } finally {
      setIsReverting(false);
    }
  }, [documentId, fetchHistory, onRevert]);

  return (
    <div className="mb-6">
      <BaseCard
        className="rounded-2xl"
        clickable={false}
        variant="light"
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-lg text-foreground">Version History</h3>
              {historyData && (
                <Badge variant="secondary" className="text-xs">
                  {historyData.total_versions} version{historyData.total_versions !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="gap-2"
            >
              {isExpanded ? (
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
          className={`transition-all duration-300 ease-in-out ${
            isExpanded ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden'
          }`}
        >
          {/* Action Message */}
          {actionMessage && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                actionMessage.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          {/* Create Snapshot Button */}
          <div className="mb-4 flex items-center gap-2">
            <Button
              onClick={handleCreateSnapshot}
              disabled={isCreating}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Create Snapshot
            </Button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading version history...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
              <Button variant="ghost" size="sm" onClick={fetchHistory} className="ml-2">
                Retry
              </Button>
            </div>
          )}

          {/* Empty State */}
          {historyData && historyData.versions.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground py-4">
              No version history available. Click &quot;Create Snapshot&quot; to save the current document state as a version.
            </p>
          )}

          {/* Version List */}
          {historyData && historyData.versions.length > 0 && (
            <div className="space-y-3">
              {/* Current Version Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-xs font-medium text-primary">
                  Current version: v{historyData.current_version}
                </span>
              </div>

              {/* Version Timeline */}
              {historyData.versions.map((version, index) => {
                const typeInfo = CHANGE_TYPE_LABELS[version.change_type] || CHANGE_TYPE_LABELS.amendment;
                const isLatest = index === 0;
                const prevVersion = index < historyData.versions.length - 1 ? historyData.versions[index + 1] : null;

                return (
                  <div
                    key={version.id}
                    className="relative flex items-start gap-3 px-3 py-3 rounded-lg border border-border/50 hover:border-border transition-colors"
                  >
                    {/* Timeline dot */}
                    <div className="flex-shrink-0 mt-1">
                      <div className={`w-3 h-3 rounded-full border-2 ${isLatest ? 'bg-primary border-primary' : 'bg-background border-muted-foreground/30'}`} />
                    </div>

                    {/* Version Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm text-foreground">
                          v{version.version_number}
                        </span>
                        <Badge variant="secondary" className={`text-xs ${typeInfo.color}`}>
                          {typeInfo.label}
                        </Badge>
                        {version.title && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {version.title}
                          </span>
                        )}
                      </div>

                      {version.change_description && (
                        <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                          {version.change_description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatDate(version.created_at)}</span>
                        <span>by {version.created_by}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Compare with previous */}
                      {prevVersion && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => handleCompare(prevVersion.version_number, version.version_number)}
                          title="Compare with previous version"
                        >
                          <GitCompare className="h-3 w-3" />
                          Diff
                        </Button>
                      )}

                      {/* Revert */}
                      {!isLatest && (
                        <>
                          {revertTarget === version.version_number ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => handleRevert(version.version_number)}
                                disabled={isReverting}
                              >
                                {isReverting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <AlertTriangle className="h-3 w-3" />
                                )}
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setRevertTarget(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => setRevertTarget(version.version_number)}
                              title="Revert to this version"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Revert
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Diff View */}
          {(diffLoading || diffData) && (
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <GitCompare className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">
                  {diffData
                    ? `Diff: v${diffData.from_version} → v${diffData.to_version}`
                    : `Loading diff: v${selectedVersions.from} → v${selectedVersions.to}`}
                </h4>
                {diffData && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Badge variant="secondary" className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      +{diffData.diff_stats.additions}
                    </Badge>
                    <Badge variant="secondary" className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                      -{diffData.diff_stats.deletions}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => { setDiffData(null); setSelectedVersions({ from: null, to: null }); }}
                    >
                      Close
                    </Button>
                  </div>
                )}
              </div>

              {diffLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Generating diff...</span>
                </div>
              )}

              {diffData && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <style>{`
                    .diff-view .diff-add { color: #22c55e; background: rgba(34,197,94,0.1); }
                    .diff-view .diff-del { color: #ef4444; background: rgba(239,68,68,0.1); }
                    .diff-view .diff-hunk { color: #6366f1; font-weight: 600; }
                    .diff-view .diff-ctx { color: inherit; }
                    html.dark .diff-view .diff-add { color: #4ade80; background: rgba(74,222,128,0.1); }
                    html.dark .diff-view .diff-del { color: #f87171; background: rgba(248,113,113,0.1); }
                    html.dark .diff-view .diff-hunk { color: #818cf8; }
                  `}</style>
                  {diffData.diff_stats.total_changes === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No differences found between these versions.
                    </div>
                  ) : (
                    <pre className="diff-view p-4 text-xs font-mono overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-900/50">
                      <code dangerouslySetInnerHTML={{ __html: sanitizeDiffHtml(diffData.diff_html) }} />
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </BaseCard>
    </div>
  );
}
