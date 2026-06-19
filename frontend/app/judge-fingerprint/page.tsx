'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Fingerprint, Users } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  PageContainer,
  BaseCard,
  AIDisclaimerBadge,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
} from '@/lib/styles/components';
import { getJudgeProfile } from '@/lib/api/judge-fingerprint';
import { JudgeSearch } from '@/components/judge-fingerprint/JudgeSearch';
import { JudgeRadarChart } from '@/components/judge-fingerprint/JudgeRadarChart';
import { JudgeProfileCard } from '@/components/judge-fingerprint/JudgeProfileCard';
import { useTranslation } from '@/contexts/LanguageContext';
import type { JudgeProfile } from '@/types/judge-fingerprint';

export default function JudgeFingerprintPage() {
  const { t } = useTranslation();
  const [selectedJudges, setSelectedJudges] = useState<string[]>([]);

  const handleSelectJudge = useCallback((name: string) => {
    setSelectedJudges((prev) => {
      if (prev.length >= 3 || prev.includes(name)) return prev;
      return [...prev, name];
    });
  }, []);

  const handleRemoveJudge = useCallback((name: string) => {
    setSelectedJudges((prev) => prev.filter((j) => j !== name));
  }, []);

  // Fetch profiles for all selected judges in parallel
  const profileQueries = useQueries({
    queries: selectedJudges.map((name) => ({
      queryKey: ['judge-profile', name],
      queryFn: () => getJudgeProfile(name),
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const isLoading = profileQueries.some((q) => q.isLoading);
  const hasError = profileQueries.some((q) => q.isError);
  const errorMessages = profileQueries
    .filter((q) => q.isError)
    .map((q) => q.error?.message ?? 'Unknown error');

  // Surface fetch failures via toast. Track which judge names have already
  // been reported so re-renders during a single failure don't spam toasts.
  const toastedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    profileQueries.forEach((q, idx) => {
      const name = selectedJudges[idx];
      if (!name) return;
      if (q.isError && !toastedRef.current.has(name)) {
        toastedRef.current.add(name);
        toast.error(t('judgeFingerprint.errorToastTitle'), {
          description: `${name}: ${q.error?.message ?? 'Unknown error'}`,
        });
      }
      if (!q.isError) {
        toastedRef.current.delete(name);
      }
    });
  }, [profileQueries, selectedJudges, t]);

  // Collect successfully loaded profiles, preserving selection order
  const loadedProfiles: JudgeProfile[] = profileQueries
    .map((q) => q.data)
    .filter((d): d is JudgeProfile => d !== undefined);

  const showComparison = loadedProfiles.length >= 2;

  return (
    <PageContainer width="medium" fillViewport>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Fingerprint className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {t('judgeFingerprint.pageTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('judgeFingerprint.pageSubtitle')}
            </p>
          </div>
        </div>
        <AIDisclaimerBadge />
      </div>

      {/* Search section */}
      <BaseCard clickable={false} variant="light" className="rounded-[16px]">
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('judgeFingerprint.searchLabel')}
          </label>
          <JudgeSearch
            selectedJudges={selectedJudges}
            onSelectJudge={handleSelectJudge}
            onRemoveJudge={handleRemoveJudge}
            maxSelections={3}
          />
        </div>
      </BaseCard>

      {/* Loading state */}
      {isLoading && (
        <LoadingIndicator
          variant="centered"
          size="lg"
          message={t('judgeFingerprint.loadingProfile')}
          subtitle={t('judgeFingerprint.loadingSubtitle')}
        />
      )}

      {/* Error state */}
      {hasError && !isLoading && (
        <ErrorCard
          title={t('judgeFingerprint.errorLoadingTitle')}
          message={errorMessages.join('; ')}
        />
      )}

      {/* Comparison radar chart (shown when 2+ profiles loaded) */}
      {showComparison && !isLoading && (
        <BaseCard clickable={false} variant="light" className="rounded-[16px]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-base text-foreground">
                {t('judgeFingerprint.comparisonHeading')}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('judgeFingerprint.comparisonDescription')}
            </p>
            <JudgeRadarChart profiles={loadedProfiles} height={400} />
          </div>
        </BaseCard>
      )}

      {/* Individual profile cards */}
      {loadedProfiles.length > 0 && !isLoading && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t('judgeFingerprint.profilesHeading')} ({loadedProfiles.length})
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {loadedProfiles.map((profile) => (
              <JudgeProfileCard key={profile.judge_name} profile={profile} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {selectedJudges.length === 0 && !isLoading && (
        <div className="space-y-6">
          <EmptyState
            title={t('judgeFingerprint.emptyTitle')}
            description={t('judgeFingerprint.emptyDescription')}
            icon={Fingerprint}
          />

          {/* How it works */}
          <BaseCard clickable={false} variant="light" className="rounded-[16px]">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                {t('judgeFingerprint.howItWorks')}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">
                    {t('judgeFingerprint.reasoningTextual')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('judgeFingerprint.reasoningTextualDescription')}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">
                    {t('judgeFingerprint.reasoningDeductive')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('judgeFingerprint.reasoningDeductiveDescription')}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">
                    {t('judgeFingerprint.reasoningAnalogical')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('judgeFingerprint.reasoningAnalogicalDescription')}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">
                    {t('judgeFingerprint.reasoningPurposive')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('judgeFingerprint.reasoningPurposiveDescription')}
                  </p>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <div className="text-xs font-medium text-primary">
                    {t('judgeFingerprint.reasoningTeleological')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('judgeFingerprint.reasoningTeleologicalDescription')}
                  </p>
                </div>
              </div>
            </div>
          </BaseCard>
        </div>
      )}
    </PageContainer>
  );
}
