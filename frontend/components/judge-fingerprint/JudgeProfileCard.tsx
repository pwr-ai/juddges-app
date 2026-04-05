'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { UserRound, Calendar, Scale, ExternalLink } from 'lucide-react';
import { BaseCard, Badge } from '@/lib/styles/components';
import { JudgeRadarChart, DIMENSION_LABELS } from './JudgeRadarChart';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import type { JudgeProfile, StyleScores } from '@/types/judge-fingerprint';

/** Human-readable label for the dominant style */
const STYLE_LABELS: Record<keyof StyleScores, string> = DIMENSION_LABELS;

interface JudgeProfileCardProps {
  profile: JudgeProfile;
}

export function JudgeProfileCard({ profile }: JudgeProfileCardProps) {
  const router = useRouter();

  const handleViewDocument = (documentId: string) => {
    const cleanId = cleanDocumentIdForUrl(documentId);
    router.push(`/documents/${cleanId}?from=judge-fingerprint`);
  };

  /** Format a date string to a locale-friendly display */
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
      <div className="space-y-4">
        {/* Header: name + stats */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <UserRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground leading-tight">
                {profile.judge_name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="default" className="text-xs">
                  {STYLE_LABELS[profile.dominant_style]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Dominujacy styl
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-primary/5">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Scale className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="text-xl font-bold text-primary">{profile.total_cases}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Spraw</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-primary/5">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Scale className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="text-xl font-bold text-primary">{profile.cases_analyzed}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Przeanalizowanych</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-primary/5 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Calendar className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="text-xs font-semibold text-primary">
              {formatDate(profile.period.first_case)}
            </div>
            <div className="text-xs text-muted-foreground">do</div>
            <div className="text-xs font-semibold text-primary">
              {formatDate(profile.period.last_case)}
            </div>
          </div>
        </div>

        {/* Radar chart for this single judge */}
        <JudgeRadarChart profiles={[profile]} height={280} />

        {/* Sample cases */}
        {profile.sample_cases.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Przykladowe sprawy
            </span>
            <div className="space-y-1.5">
              {profile.sample_cases.slice(0, 5).map((sc) => (
                <button
                  key={sc.document_id}
                  onClick={() => handleViewDocument(sc.document_id)}
                  className="flex items-start gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{sc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{formatDate(sc.date)}</span>
                      <Badge variant="outline" className="text-xs">
                        {STYLE_LABELS[sc.reasoning_pattern] ?? sc.reasoning_pattern}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </BaseCard>
  );
}
