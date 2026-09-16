/**
 * Canonical semantic status map for Editorial Jurisprudence (#640).
 *
 * Statuses map to one of three semantic tones:
 * - ink: ok / active / completed / success / published
 * - gold: warn / pending / processing / in-progress / draft
 * - oxblood: error / failed / deleted / rejected / archived
 *
 * Rendered as text + border-rule pill, no tinted background.
 */

export type StatusTone = 'ink' | 'gold' | 'oxblood';

export const STATUS_TONE: Record<string, StatusTone> = {
  // Ok / Active / Completed (ink)
  ok: 'ink',
  active: 'ink',
  completed: 'ink',
  success: 'ink',
  healthy: 'ink',
  ready: 'ink',
  published: 'ink',
  verified: 'ink',
  enabled: 'ink',
  passed: 'ink',
  done: 'ink',
  operational: 'ink',

  // Warn / Pending / Processing (gold)
  warn: 'gold',
  warning: 'gold',
  pending: 'gold',
  processing: 'gold',
  in_progress: 'gold',
  running: 'gold',
  queued: 'gold',
  degraded: 'gold',
  draft: 'gold',
  paused: 'gold',
  loading: 'gold',
  review: 'gold',
  partial: 'gold',
  partially_degraded: 'gold',

  // Error / Failed / Deleted (oxblood)
  error: 'oxblood',
  failed: 'oxblood',
  unhealthy: 'oxblood',
  deleted: 'oxblood',
  cancelled: 'oxblood',
  canceled: 'oxblood',
  rejected: 'oxblood',
  disabled: 'oxblood',
  archived: 'oxblood',
  critical: 'oxblood',
  major_outage: 'oxblood',
  down: 'oxblood',
};

export function getStatusTone(status?: string | null): StatusTone {
  if (!status) return 'ink';
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_TONE[normalized] ?? 'ink';
}

export const STATUS_TONE_STYLES: Record<StatusTone, { text: string; dot: string; border: string }> = {
  ink: {
    text: 'text-ink',
    dot: 'bg-ink',
    border: 'border-rule',
  },
  gold: {
    text: 'text-gold',
    dot: 'bg-gold',
    border: 'border-rule',
  },
  oxblood: {
    text: 'text-oxblood',
    dot: 'bg-oxblood',
    border: 'border-rule',
  },
};
