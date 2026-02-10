"use client";

import { useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useExperimentStore } from "@/lib/store/experimentStore";
import type { ExperimentVariant } from "@/types/experiments";

/**
 * Deterministic hash function for variant assignment.
 * Uses a simple string hash to map userId + experimentId to a number 0-99.
 */
function hashAssignment(userId: string, experimentId: string): number {
  const str = `${userId}:${experimentId}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash) % 100;
}

/**
 * Select a variant based on deterministic hash and weights.
 */
function selectVariant(
  variants: ExperimentVariant[],
  hashValue: number
): ExperimentVariant | null {
  if (variants.length === 0) return null;

  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let cumulative = 0;

  for (const variant of variants) {
    cumulative += (variant.weight / totalWeight) * 100;
    if (hashValue < cumulative) {
      return variant;
    }
  }

  return variants[variants.length - 1];
}

interface UseExperimentResult {
  variant: ExperimentVariant | null;
  variantName: string | null;
  isControl: boolean;
  config: Record<string, unknown>;
  isLoading: boolean;
  trackConversion: (value?: number, metadata?: Record<string, unknown>) => void;
  trackEvent: (eventType: string, value?: number, metadata?: Record<string, unknown>) => void;
}

/**
 * Hook to get the current user's variant for an experiment.
 *
 * Usage:
 *   const { variant, variantName, isControl, config, trackConversion } = useExperiment("my-experiment-id");
 *
 *   if (variantName === "variant-b") {
 *     return <NewSearchUI />;
 *   }
 *   return <OriginalSearchUI />;
 */
export function useExperiment(experimentId: string): UseExperimentResult {
  const { user } = useAuth();
  const {
    activeExperiments,
    assignments,
    fetchActiveExperiments,
    assignVariant,
    trackEvent: storeTrackEvent,
  } = useExperimentStore();

  // Fetch active experiments on mount if not already loaded
  useEffect(() => {
    if (activeExperiments.length === 0 && user) {
      fetchActiveExperiments();
    }
  }, [user, activeExperiments.length, fetchActiveExperiments]);

  // Find the experiment
  const experiment = useMemo(
    () => activeExperiments.find((e) => e.id === experimentId),
    [activeExperiments, experimentId]
  );

  // Determine variant
  const variant = useMemo(() => {
    if (!experiment || !user) return null;

    const variants = experiment.experiment_variants || [];
    if (variants.length === 0) return null;

    // Check if already assigned
    const existingAssignment = assignments[experimentId];
    if (existingAssignment) {
      return variants.find((v) => v.id === existingAssignment) || null;
    }

    // Deterministic assignment
    const hash = hashAssignment(user.id, experimentId);
    return selectVariant(variants, hash);
  }, [experiment, user, assignments, experimentId]);

  // Persist assignment
  useEffect(() => {
    if (variant && user && !assignments[experimentId]) {
      assignVariant(experimentId, variant.id);
    }
  }, [variant, user, experimentId, assignments, assignVariant]);

  const trackConversion = useCallback(
    (value?: number, metadata?: Record<string, unknown>) => {
      if (variant) {
        storeTrackEvent(experimentId, variant.id, "conversion", value, metadata);
      }
    },
    [experimentId, variant, storeTrackEvent]
  );

  const trackEvent = useCallback(
    (eventType: string, value?: number, metadata?: Record<string, unknown>) => {
      if (variant) {
        storeTrackEvent(experimentId, variant.id, eventType, value, metadata);
      }
    },
    [experimentId, variant, storeTrackEvent]
  );

  return {
    variant,
    variantName: variant?.name || null,
    isControl: variant?.is_control || false,
    config: (variant?.config as Record<string, unknown>) || {},
    isLoading: !experiment && activeExperiments.length === 0,
    trackConversion,
    trackEvent,
  };
}
