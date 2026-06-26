import { useTranslation } from '@/contexts/LanguageContext';
import type { StyleScores } from '@/types/judge-fingerprint';

/**
 * Locale-aware labels for the five reasoning dimensions.
 *
 * Reuses the `reasoning*` keys already defined for the page's "how it works"
 * section (`policy` maps to the "purposive" label). Kept in its own module —
 * free of the recharts import in JudgeRadarChart — so it can be unit-tested
 * and consumed without pulling the chart (and its d3 ESM deps) into scope.
 */
export function useDimensionLabels(): Record<keyof StyleScores, string> {
  const { t } = useTranslation();
  return {
    textual: t('judgeFingerprint.reasoningTextual'),
    deductive: t('judgeFingerprint.reasoningDeductive'),
    analogical: t('judgeFingerprint.reasoningAnalogical'),
    policy: t('judgeFingerprint.reasoningPurposive'),
    teleological: t('judgeFingerprint.reasoningTeleological'),
  };
}
