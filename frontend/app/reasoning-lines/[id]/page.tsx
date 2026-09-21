'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  GitBranch,
  ArrowLeft,
  Scale,
  Calendar,
  Hash,
  Trash2,
  ExternalLink,
  BarChart3,
  Activity,
  Link2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageContainer,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  Badge,
} from '@/lib/styles/components';
import { EditorialCard, StatusBadge } from '@/components/editorial';
import { Button } from '@/components/ui/button';
import {
  getReasoningLineDetail,
  deleteReasoningLine,
  getReasoningLineTimeline,
  classifyOutcomes,
  analyzeReasoningLineDrift,
  getRelatedLines,
} from '@/lib/api/reasoning-lines';
import type { ReasoningLineMember } from '@/types/reasoning-lines';
import type { DriftAnalysisResponse, RelatedLine } from '@/types/reasoning-lines';
import Link from 'next/link';
import { OutcomeTimeline } from '@/components/reasoning-lines/OutcomeTimeline';
import { DriftChart } from '@/components/reasoning-lines/DriftChart';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { logger } from '@/lib/logger';

/** Format date string to a short, locale-stable numeric format */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function ReasoningLineDetailPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.app_metadata?.is_admin === true;
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;

  // Confirmation state for delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Drift analysis result stored locally (POST action, not a query)
  const [driftData, setDriftData] = useState<DriftAnalysisResponse | null>(null);

  // Fetch detail
  const detailQuery = useQuery({
    queryKey: ['reasoning-line', id],
    queryFn: () => getReasoningLineDetail(id),
    enabled: !!id,
  });

  // Fetch timeline (GET — auto-fetched when id is available)
  const timelineQuery = useQuery({
    queryKey: ['reasoning-line-timeline', id],
    queryFn: () => getReasoningLineTimeline(id),
    enabled: !!id,
    // Timeline may 404 if no outcomes classified yet — handle gracefully
    retry: false,
  });

  // Fetch related lines (M6)
  const relatedQuery = useQuery({
    queryKey: ['reasoning-line-related', id],
    queryFn: () => getRelatedLines(id),
    enabled: !!id,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteReasoningLine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reasoning-lines'] });
      router.push('/reasoning-lines');
    },
    onError: (error) => {
      logger.error('Deleting a reasoning line failed', error);
    },
  });

  // Classify outcomes mutation
  const classifyMutation = useMutation({
    mutationFn: () => classifyOutcomes(id),
    onSuccess: () => {
      // Refetch timeline after classification completes
      queryClient.invalidateQueries({ queryKey: ['reasoning-line-timeline', id] });
      // Also refetch the detail to get updated outcome_direction on members
      queryClient.invalidateQueries({ queryKey: ['reasoning-line', id] });
    },
    onError: (error) => {
      logger.error('Classifying reasoning line outcomes failed', error);
    },
  });

  // Drift analysis mutation
  const driftMutation = useMutation({
    mutationFn: () => analyzeReasoningLineDrift(id),
    onSuccess: (result) => {
      setDriftData(result);
    },
    onError: (error) => {
      logger.error('Reasoning line drift analysis failed', error);
    },
  });

  const handleDelete = useCallback(() => {
    deleteMutation.mutate();
  }, [deleteMutation]);

  // Keep the technical failure reason in the logs; the UI shows fixed, actionable copy.
  useEffect(() => {
    if (detailQuery.error) {
      logger.error('Loading the reasoning line detail failed', detailQuery.error);
    }
  }, [detailQuery.error]);

  useEffect(() => {
    if (relatedQuery.error) {
      logger.error('Loading related reasoning lines failed', relatedQuery.error);
    }
  }, [relatedQuery.error]);

  // Loading state
  if (detailQuery.isLoading) {
    return (
      <PageContainer width="medium" fillViewport>
        <LoadingIndicator
          variant="centered"
          size="lg"
          message={t('reasoningLines.detailLoading')}
        />
      </PageContainer>
    );
  }

  // Error state
  if (detailQuery.isError) {
    return (
      <PageContainer width="medium" fillViewport>
        <ErrorCard
          title={t('reasoningLines.detailErrorTitle')}
          message={t('reasoningLines.detailErrorMessage')}
          onRetry={() => detailQuery.refetch()}
          retryLabel={t('common.retry')}
        />
      </PageContainer>
    );
  }

  const line = detailQuery.data;
  if (!line) {
    return (
      <PageContainer width="medium" fillViewport>
        <EmptyState
          title={t('reasoningLines.detailNotFoundTitle')}
          description={t('reasoningLines.detailNotFoundDescription')}
          icon={GitBranch}
        />
      </PageContainer>
    );
  }

  // Sort members chronologically by decision_date
  const sortedMembers = [...line.members].sort(
    (a, b) => new Date(a.decision_date).getTime() - new Date(b.decision_date).getTime()
  );

  const coherencePct = Math.round(line.coherence_score * 100);
  const coherenceTone =
    coherencePct >= 70
      ? 'text-ink'
      : coherencePct >= 50
        ? 'text-gold'
        : 'text-oxblood';

  const statusLabelMap: Record<string, string> = {
    active: t('reasoningLines.statusActive'),
    archived: t('reasoningLines.statusArchived'),
    deleted: t('reasoningLines.statusDeleted'),
  };

  return (
    <PageContainer width="medium" fillViewport>
      {/* Back button */}
      <Link
        href="/reasoning-lines"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('reasoningLines.backToList')}
      </Link>

      {/* Header card */}
      <EditorialCard flat className="p-5">
        <div className="space-y-4">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 border border-rule bg-parchment-deep flex items-center justify-center flex-shrink-0">
                <GitBranch className="h-5 w-5 text-oxblood" />
              </div>
              <div className="space-y-1 min-w-0">
                <h1 className="text-xl font-bold font-serif text-ink">
                  {line.label}
                </h1>
                {line.legal_question && (
                  <p className="text-sm text-ink-soft">
                    {line.legal_question}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
              <StatusBadge status={line.status} label={statusLabelMap[line.status] ?? line.status} />
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-none text-xs font-mono border border-rule tabular-nums ${coherenceTone}`}
              >
                {t('reasoningLines.coherenceValue', { percent: coherencePct })}
              </span>
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {t('reasoningLines.caseCount', { count: line.case_count })}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(line.date_range_start)} - {formatDate(line.date_range_end)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {t('reasoningLines.createdLabel', { date: formatDate(line.created_at) })}
            </span>
          </div>

          {/* Keywords */}
          {line.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {line.keywords.map((keyword) => (
                <Badge
                  key={keyword}
                  variant="outline"
                  className="text-xs rounded-none font-mono border-rule text-ink-soft bg-transparent"
                >
                  {keyword}
                </Badge>
              ))}
            </div>
          )}

          {/* Legal bases */}
          {line.legal_bases.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-mono uppercase tracking-wider text-ink-soft flex items-center gap-1">
                <Scale className="h-3 w-3" />
                {t('reasoningLines.legalBasesLabel')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {line.legal_bases.map((base) => (
                  <Badge key={base} variant="outline" className="text-xs rounded-none font-mono border-rule text-ink-soft">
                    {base}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Deleting a global reasoning line is admin-only. */}
          {isAdmin && (
            <div className="flex items-center gap-3 pt-2 border-t border-rule">
              {!showDeleteConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 text-xs text-oxblood border-oxblood/40 hover:bg-oxblood/10 hover:text-oxblood"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('reasoningLines.deleteLine')}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-soft font-mono">
                    {t('reasoningLines.deleteConfirmQuestion')}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="flex items-center gap-1.5 text-xs rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleteMutation.isPending
                      ? t('reasoningLines.deletePending')
                      : t('reasoningLines.deleteConfirm')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-xs rounded-none border-rule"
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
              {deleteMutation.isError && (
                <span className="text-xs font-mono text-oxblood">
                  {t('reasoningLines.deleteError')}
                </span>
              )}
            </div>
          )}
        </div>
      </EditorialCard>

      {/* Timeline of member judgments */}
      <div className="space-y-4">
        <h2 className="text-lg font-serif font-semibold text-ink flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-oxblood" />
          {t('reasoningLines.membersHeading', { count: sortedMembers.length })}
        </h2>

        {sortedMembers.length === 0 ? (
          <EmptyState
            title={t('reasoningLines.membersEmptyTitle')}
            description={t('reasoningLines.membersEmptyDescription')}
            icon={Scale}
          />
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[23px] top-0 bottom-0 w-px bg-rule" />

            <div className="space-y-3">
              {sortedMembers.map((member, index) => (
                <TimelineEntry
                  key={member.judgment_id}
                  member={member}
                  index={index}
                  isLast={index === sortedMembers.length - 1}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Outcome Timeline section (M3)                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-serif font-semibold text-ink flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-oxblood" />
            {t('reasoningLines.outcomeHeading')}
          </h2>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => classifyMutation.mutate()}
              disabled={classifyMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-mono rounded-none border-rule"
            >
              <BarChart3 className="h-3.5 w-3.5 text-oxblood" />
              {classifyMutation.isPending
                ? t('reasoningLines.classifyPending')
                : t('reasoningLines.classify')}
            </Button>
          )}
        </div>

        {/* Classification result feedback */}
        {classifyMutation.isSuccess && classifyMutation.data && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink">
              {t('reasoningLines.classifyClassified', { count: classifyMutation.data.classified })}
            </span>
            {classifyMutation.data.skipped > 0 && (
              <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink-soft">
                {t('reasoningLines.classifySkipped', { count: classifyMutation.data.skipped })}
              </span>
            )}
            {classifyMutation.data.errors > 0 && (
              <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-oxblood">
                {t('reasoningLines.classifyErrors', { count: classifyMutation.data.errors })}
              </span>
            )}
          </div>
        )}
        {classifyMutation.isError && (
          <span className="text-xs font-mono text-oxblood">
            {t('reasoningLines.classifyError')}
          </span>
        )}

        {/* Timeline chart */}
        {timelineQuery.isLoading && (
          <LoadingIndicator
            variant="inline"
            size="sm"
            message={t('reasoningLines.timelineLoading')}
          />
        )}
        {timelineQuery.isError && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {isAdmin
              ? t('reasoningLines.timelineErrorAdmin')
              : t('reasoningLines.timelineError')}
          </div>
        )}
        {timelineQuery.data && timelineQuery.data.points.length > 0 && (
          <>
            <OutcomeTimeline data={timelineQuery.data} />
            {/* Summary stats below the chart */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {t('reasoningLines.timelineTotalClassified', {
                  count: timelineQuery.data.total_classified,
                })}
              </span>
              {timelineQuery.data.total_unclassified > 0 && (
                <span className="tabular-nums">
                  {t('reasoningLines.timelineTotalUnclassified', {
                    count: timelineQuery.data.total_unclassified,
                  })}
                </span>
              )}
            </div>
          </>
        )}
        {timelineQuery.data && timelineQuery.data.points.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {isAdmin
              ? t('reasoningLines.timelineEmptyAdmin')
              : t('reasoningLines.timelineEmpty')}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Language Drift section (M3)                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-serif font-semibold text-ink flex items-center gap-2">
            <Activity className="h-5 w-5 text-oxblood" />
            {t('reasoningLines.driftHeading')}
          </h2>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => driftMutation.mutate()}
              disabled={driftMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-mono rounded-none border-rule"
            >
              <Activity className="h-3.5 w-3.5 text-oxblood" />
              {driftMutation.isPending
                ? t('reasoningLines.driftPending')
                : t('reasoningLines.driftAnalyze')}
            </Button>
          )}
        </div>

        {driftMutation.isError && (
          <span className="text-xs font-mono text-oxblood">
            {t('reasoningLines.driftError')}
          </span>
        )}

        {driftMutation.isPending && (
          <LoadingIndicator
            variant="inline"
            size="sm"
            message={t('reasoningLines.driftLoading')}
          />
        )}

        {driftData && <DriftChart data={driftData} />}

        {!driftData && !driftMutation.isPending && !driftMutation.isError && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {isAdmin ? t('reasoningLines.driftIdleAdmin') : t('reasoningLines.driftIdle')}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Related Lines section (M6)                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-4">
        <h2 className="text-lg font-serif font-semibold text-ink flex items-center gap-2">
          <Link2 className="h-5 w-5 text-oxblood" />
          {t('reasoningLines.relatedHeading')}
        </h2>

        {relatedQuery.isLoading && (
          <LoadingIndicator
            variant="inline"
            size="sm"
            message={t('reasoningLines.relatedLoading')}
          />
        )}

        {relatedQuery.isError && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {t('reasoningLines.relatedError')}
          </div>
        )}

        {relatedQuery.data && relatedQuery.data.related.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {t('reasoningLines.relatedEmpty')}
          </div>
        )}

        {relatedQuery.data && relatedQuery.data.related.length > 0 && (
          <EditorialCard flat className="p-4">
            <div className="space-y-3">
              {relatedQuery.data.related.map((related) => (
                <RelatedLineCard key={related.id} related={related} />
              ))}
            </div>
          </EditorialCard>
        )}
      </div>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single entry in the vertical timeline */
function TimelineEntry({
  member,
  index,
  isLast,
}: {
  member: ReasoningLineMember;
  index: number;
  isLast: boolean;
}) {
  const similarityPct = Math.round(member.similarity_to_centroid * 100);
  const similarityTone =
    similarityPct >= 80
      ? 'text-ink'
      : similarityPct >= 60
        ? 'text-gold'
        : 'text-oxblood';

  return (
    <Link
      href={`/documents/${member.judgment_id}`}
      className="block group"
    >
      <div className="relative flex items-start gap-4 pl-0">
        {/* Timeline dot */}
        <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[47px]">
          <div className="w-7 h-7 rounded-none bg-parchment border border-rule group-hover:border-ink flex items-center justify-center transition-colors">
            <span className="text-[10px] font-mono text-ink tabular-nums">
              {member.position_in_line || index + 1}
            </span>
          </div>
        </div>

        {/* Card content */}
        <div className="flex-1 min-w-0 pb-3">
          <div className="p-3 rounded-none bg-parchment border border-rule hover:-translate-y-px transition-transform">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                {/* Signature */}
                <p className="text-sm font-semibold text-ink group-hover:text-oxblood transition-colors">
                  {member.signature}
                </p>

                {/* Court and date */}
                <p className="text-xs text-muted-foreground">
                  {member.court_name}
                  {member.decision_date && (
                    <span className="inline-flex items-center gap-1 ml-2">
                      <Calendar className="h-3 w-3" />
                      {formatDate(member.decision_date)}
                    </span>
                  )}
                </p>

                {/* Title */}
                {member.title && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {member.title}
                  </p>
                )}

                {/* Extra metadata */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {member.reasoning_pattern && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-none border border-rule text-ink bg-transparent">
                      {member.reasoning_pattern}
                    </span>
                  )}
                  {member.outcome_direction && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-none border border-rule text-ink bg-transparent">
                      {member.outcome_direction}
                    </span>
                  )}
                </div>
              </div>

              {/* Right side: similarity + link icon */}
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                <span className={`text-xs font-mono tabular-nums ${similarityTone}`}>
                  {similarityPct}%
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Compact card for a related reasoning line (M6) */
function RelatedLineCard({ related }: { related: RelatedLine }) {
  const { t } = useTranslation();
  const relatednessPct = Math.round(related.relatedness_score * 100);
  const relatednessTone =
    relatednessPct >= 70
      ? 'text-ink'
      : relatednessPct >= 50
        ? 'text-gold'
        : 'text-oxblood';

  return (
    <Link
      href={`/reasoning-lines/${related.id}`}
      className="block group"
    >
      <div className="flex items-start justify-between gap-3 p-3 rounded-none bg-parchment border border-rule hover:-translate-y-px transition-transform">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Label */}
          <p className="text-sm font-semibold text-ink group-hover:text-oxblood transition-colors truncate">
            {related.label}
          </p>

          {/* Legal question */}
          {related.legal_question && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {related.legal_question}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {t('reasoningLines.caseCount', { count: related.case_count })}
            </span>
          </div>

          {/* Shared legal bases */}
          {related.shared_legal_bases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {related.shared_legal_bases.map((base) => (
                <Badge
                  key={base}
                  variant="outline"
                  className="text-xs font-mono border-rule text-ink bg-transparent"
                >
                  {base}
                </Badge>
              ))}
            </div>
          )}

          {/* Shared keywords */}
          {related.shared_keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {related.shared_keywords.map((kw) => (
                <Badge
                  key={kw}
                  variant="outline"
                  className="text-xs font-mono border-rule text-ink bg-transparent"
                >
                  {kw}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Right side: relatedness score + arrow */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-none text-xs font-mono border border-rule tabular-nums ${relatednessTone}`}
          >
            {relatednessPct}%
          </span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
}
