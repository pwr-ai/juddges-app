'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { UserRound, Calendar, Scale, ExternalLink } from 'lucide-react';
import { Badge } from '@/lib/styles/components';
import { EditorialCard } from '@/components/editorial';
import { JudgeRadarChart } from './JudgeRadarChart';
import { useDimensionLabels } from './dimensionLabels';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import { useTranslation } from '@/contexts/LanguageContext';
import type { JudgeProfile } from '@/types/judge-fingerprint';

interface JudgeProfileCardProps {
  profile: JudgeProfile;
}

export function JudgeProfileCard({ profile }: JudgeProfileCardProps) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const styleLabels = useDimensionLabels();

  const handleViewDocument = (documentId: string) => {
    const cleanId = cleanDocumentIdForUrl(documentId);
    router.push(`/documents/${cleanId}?from=judge-fingerprint`);
  };

  /** Format a date string to a locale-friendly display */
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <EditorialCard flat className="rounded-none border border-rule bg-parchment p-6">
      <div className="space-y-4">
        {/* Header: name + stats */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-none border border-rule bg-parchment-deep flex items-center justify-center">
              <UserRound className="h-5 w-5 text-ink" />
            </div>
            <div>
              <h3 className="font-serif font-normal text-xl text-foreground leading-tight">
                {profile.judge_name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="default" className="text-xs">
                  {styleLabels[profile.dominant_style]}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {t('judgeFingerprint.dominantStyle')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-none border border-rule bg-parchment-deep">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Scale className="h-3.5 w-3.5 text-ink" />
            </div>
            <div className="text-xl font-bold text-foreground tabular-nums">{profile.total_cases}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t('judgeFingerprint.statCases')}</div>
          </div>
          <div className="text-center p-3 rounded-none border border-rule bg-parchment-deep">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Scale className="h-3.5 w-3.5 text-ink" />
            </div>
            <div className="text-xl font-bold text-foreground tabular-nums">{profile.cases_analyzed}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t('judgeFingerprint.statAnalyzed')}</div>
          </div>
          <div className="text-center p-3 rounded-none border border-rule bg-parchment-deep col-span-2 sm:col-span-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Calendar className="h-3.5 w-3.5 text-ink" />
            </div>
            <div className="text-xs font-semibold text-foreground tabular-nums">
              {formatDate(profile.period.first_case)}
            </div>
            <div className="text-xs text-muted-foreground">{t('judgeFingerprint.periodTo')}</div>
            <div className="text-xs font-semibold text-foreground tabular-nums">
              {formatDate(profile.period.last_case)}
            </div>
          </div>
        </div>

        {/* Radar chart for this single judge */}
        <JudgeRadarChart profiles={[profile]} height={280} />

        {/* Sample cases */}
        {profile.sample_cases.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">
              {t('judgeFingerprint.sampleCases')}
            </span>
            <div className="space-y-1.5">
              {profile.sample_cases.slice(0, 5).map((sc) => (
                <button
                  key={sc.document_id}
                  onClick={() => handleViewDocument(sc.document_id)}
                  className="flex items-start gap-2 w-full text-left p-2 rounded-none border border-transparent hover:border-rule hover:bg-parchment-deep transition-colors group"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-oxblood mt-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{sc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDate(sc.date)}</span>
                      <Badge variant="outline" className="text-xs">
                        {styleLabels[sc.reasoning_pattern] ?? sc.reasoning_pattern}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </EditorialCard>
  );
}
