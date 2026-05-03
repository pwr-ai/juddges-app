'use client';

import React, { useState, useCallback } from 'react';
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
  BaseCard,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  Badge,
} from '@/lib/styles/components';
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

/** Format date string to a Polish-friendly format */
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
  });

  // Drift analysis mutation
  const driftMutation = useMutation({
    mutationFn: () => analyzeReasoningLineDrift(id),
    onSuccess: (result) => {
      setDriftData(result);
    },
  });

  const handleDelete = useCallback(() => {
    deleteMutation.mutate();
  }, [deleteMutation]);

  // Loading state
  if (detailQuery.isLoading) {
    return (
      <PageContainer width="medium" fillViewport>
        <LoadingIndicator
          variant="centered"
          size="lg"
          message="Ladowanie szczegulow linii orzeczniczej..."
        />
      </PageContainer>
    );
  }

  // Error state
  if (detailQuery.isError) {
    return (
      <PageContainer width="medium" fillViewport>
        <ErrorCard
          title="Blad ladowania"
          message={detailQuery.error?.message ?? 'Nie udalo sie pobrac szczegulow.'}
          onRetry={() => detailQuery.refetch()}
          retryLabel="Sprobuj ponownie"
        />
      </PageContainer>
    );
  }

  const line = detailQuery.data;
  if (!line) {
    return (
      <PageContainer width="medium" fillViewport>
        <EmptyState
          title="Nie znaleziono"
          description="Linia orzecznicza nie istnieje lub zostala usunieta."
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
  const coherenceColor =
    coherencePct >= 70
      ? 'bg-emerald-100 text-emerald-700'
      : coherencePct >= 50
        ? 'bg-amber-100 text-amber-700'
        : 'bg-rose-100 text-rose-700';

  const statusColorMap: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-slate-100 text-slate-700',
    deleted: 'bg-rose-100 text-rose-700',
  };
  const statusLabelMap: Record<string, string> = {
    active: 'Aktywna',
    archived: 'Zarchiwizowana',
    deleted: 'Usunieta',
  };

  return (
    <PageContainer width="medium" fillViewport>
      {/* Back button */}
      <Link
        href="/reasoning-lines"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Powrot do linii orzeczniczych
      </Link>

      {/* Header card */}
      <BaseCard clickable={false} variant="light" className="rounded-[16px]">
        <div className="space-y-4">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-xl bg-primary/10 flex-shrink-0">
                <GitBranch className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1 min-w-0">
                <h1 className="text-xl font-bold text-foreground">
                  {line.label}
                </h1>
                {line.legal_question && (
                  <p className="text-sm text-muted-foreground">
                    {line.legal_question}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  statusColorMap[line.status] ?? 'bg-slate-100 text-slate-700'
                }`}
              >
                {statusLabelMap[line.status] ?? line.status}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${coherenceColor}`}
              >
                Koherencja: {coherencePct}%
              </span>
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {line.case_count} spraw
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(line.date_range_start)} - {formatDate(line.date_range_end)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Utworzono: {formatDate(line.created_at)}
            </span>
          </div>

          {/* Keywords */}
          {line.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {line.keywords.map((keyword) => (
                <Badge
                  key={keyword}
                  variant="secondary"
                  className="text-xs bg-blue-100 text-blue-800"
                >
                  {keyword}
                </Badge>
              ))}
            </div>
          )}

          {/* Legal bases */}
          {line.legal_bases.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Scale className="h-3 w-3" />
                Podstawy prawne
              </p>
              <div className="flex flex-wrap gap-1.5">
                {line.legal_bases.map((base) => (
                  <Badge key={base} variant="outline" className="text-xs">
                    {base}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Delete button */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Usun linie
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Czy na pewno chcesz usunac te linie?
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteMutation.isPending ? 'Usuwanie...' : 'Tak, usun'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs"
                >
                  Anuluj
                </Button>
              </div>
            )}
            {deleteMutation.isError && (
              <span className="text-xs text-rose-600">
                {deleteMutation.error?.message ?? 'Blad usuwania'}
              </span>
            )}
          </div>
        </div>
      </BaseCard>

      {/* Timeline of member judgments */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Orzeczenia w linii ({sortedMembers.length})
        </h2>

        {sortedMembers.length === 0 ? (
          <EmptyState
            title="Brak orzeczen"
            description="Ta linia orzecznicza nie zawiera jeszcze zadnych orzeczen."
            icon={Scale}
          />
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[23px] top-0 bottom-0 w-px bg-slate-200" />

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
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Ewolucja orzeczen w czasie
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => classifyMutation.mutate()}
            disabled={classifyMutation.isPending}
            className="flex items-center gap-1.5 text-xs"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {classifyMutation.isPending
              ? 'Klasyfikowanie...'
              : 'Klasyfikuj orzeczenia'}
          </Button>
        </div>

        {/* Classification result feedback */}
        {classifyMutation.isSuccess && classifyMutation.data && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">
              Sklasyfikowano: {classifyMutation.data.classified}
            </span>
            {classifyMutation.data.skipped > 0 && (
              <span className="px-2 py-1 rounded bg-slate-50 text-slate-600">
                Pominieto: {classifyMutation.data.skipped}
              </span>
            )}
            {classifyMutation.data.errors > 0 && (
              <span className="px-2 py-1 rounded bg-rose-50 text-rose-600">
                Bledy: {classifyMutation.data.errors}
              </span>
            )}
          </div>
        )}
        {classifyMutation.isError && (
          <span className="text-xs text-rose-600">
            {classifyMutation.error?.message ?? 'Blad klasyfikacji orzeczen'}
          </span>
        )}

        {/* Timeline chart */}
        {timelineQuery.isLoading && (
          <LoadingIndicator
            variant="inline"
            size="sm"
            message="Ladowanie osi czasu..."
          />
        )}
        {timelineQuery.isError && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Brak danych osi czasu. Sklasyfikuj orzeczenia, aby wygenerowac os czasu.
          </div>
        )}
        {timelineQuery.data && timelineQuery.data.points.length > 0 && (
          <>
            <OutcomeTimeline data={timelineQuery.data} />
            {/* Summary stats below the chart */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                Sklasyfikowanych: {timelineQuery.data.total_classified}
              </span>
              {timelineQuery.data.total_unclassified > 0 && (
                <span className="tabular-nums">
                  Niesklasyfikowanych: {timelineQuery.data.total_unclassified}
                </span>
              )}
            </div>
          </>
        )}
        {timelineQuery.data && timelineQuery.data.points.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Brak sklasyfikowanych orzeczen. Uzyj przycisku powyzej, aby sklasyfikowac.
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Language Drift section (M3)                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Dryf jezykowy
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => driftMutation.mutate()}
            disabled={driftMutation.isPending}
            className="flex items-center gap-1.5 text-xs"
          >
            <Activity className="h-3.5 w-3.5" />
            {driftMutation.isPending ? 'Analizowanie...' : 'Analizuj dryf'}
          </Button>
        </div>

        {driftMutation.isError && (
          <span className="text-xs text-rose-600">
            {driftMutation.error?.message ?? 'Blad analizy dryfu'}
          </span>
        )}

        {driftMutation.isPending && (
          <LoadingIndicator
            variant="inline"
            size="sm"
            message="Analizowanie dryfu jezykowego..."
          />
        )}

        {driftData && <DriftChart data={driftData} />}

        {!driftData && !driftMutation.isPending && !driftMutation.isError && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Kliknij &quot;Analizuj dryf&quot;, aby zbadac zmiany w jezyku orzeczen w czasie.
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Related Lines section (M6)                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Powiazane linie orzecznicze
        </h2>

        {relatedQuery.isLoading && (
          <LoadingIndicator
            variant="inline"
            size="sm"
            message="Ladowanie powiazanych linii..."
          />
        )}

        {relatedQuery.isError && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Nie udalo sie pobrac powiazanych linii orzeczniczych.
          </div>
        )}

        {relatedQuery.data && relatedQuery.data.related.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Brak powiazanych linii orzeczniczych dla tej linii.
          </div>
        )}

        {relatedQuery.data && relatedQuery.data.related.length > 0 && (
          <BaseCard clickable={false} variant="light" className="rounded-[16px]">
            <div className="space-y-3">
              {relatedQuery.data.related.map((related) => (
                <RelatedLineCard key={related.id} related={related} />
              ))}
            </div>
          </BaseCard>
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
  const similarityColor =
    similarityPct >= 80
      ? 'text-emerald-600'
      : similarityPct >= 60
        ? 'text-amber-600'
        : 'text-rose-600';

  return (
    <Link
      href={`/documents/${member.judgment_id}`}
      className="block group"
    >
      <div className="relative flex items-start gap-4 pl-0">
        {/* Timeline dot */}
        <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[47px]">
          <div className="w-7 h-7 rounded-full bg-white border-2 border-primary/30 group-hover:border-primary flex items-center justify-center transition-colors">
            <span className="text-[10px] font-bold text-primary tabular-nums">
              {member.position_in_line || index + 1}
            </span>
          </div>
        </div>

        {/* Card content */}
        <div className="flex-1 min-w-0 pb-3">
          <div className="p-3 rounded-xl bg-white/50 border border-slate-100 group-hover:border-primary/20 group-hover:bg-white/80 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                {/* Signature */}
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                      {member.reasoning_pattern}
                    </span>
                  )}
                  {member.outcome_direction && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                      {member.outcome_direction}
                    </span>
                  )}
                </div>
              </div>

              {/* Right side: similarity + link icon */}
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                <span className={`text-xs font-medium tabular-nums ${similarityColor}`}>
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
  const relatednessPct = Math.round(related.relatedness_score * 100);
  const relatednessColor =
    relatednessPct >= 70
      ? 'bg-emerald-100 text-emerald-700'
      : relatednessPct >= 50
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600';

  return (
    <Link
      href={`/reasoning-lines/${related.id}`}
      className="block group"
    >
      <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/50 border border-slate-100 hover:border-primary/20 hover:bg-white/80 transition-all">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Label */}
          <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
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
              {related.case_count} spraw
            </span>
          </div>

          {/* Shared legal bases */}
          {related.shared_legal_bases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {related.shared_legal_bases.map((base) => (
                <Badge key={base} variant="outline" className="text-xs">
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
                  variant="secondary"
                  className="text-xs bg-blue-50 text-blue-700"
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
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${relatednessColor}`}
          >
            {relatednessPct}%
          </span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
}
