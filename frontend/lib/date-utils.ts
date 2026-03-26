/**
 * Centralized date formatting utilities.
 *
 * These utilities consolidate date formatting patterns used across the application
 * to ensure consistency and reduce duplication.
 */

export type DateLike = Date | string | number;

/**
 * Safely parse a date value to a Date object.
 * Returns null if the value is invalid.
 */
export function parseDate(value: DateLike | null | undefined): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format date for display in UI components.
 * Default format: "Jan 15, 2025"
 *
 * @example
 * formatDate(new Date()) // "Jan 15, 2025"
 * formatDate("2025-01-15") // "Jan 15, 2025"
 */
export function formatDate(
  value: DateLike | null | undefined,
  locale: string = 'en-US'
): string {
  const date = parseDate(value);
  if (!date) return '';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Format date with time for detailed display.
 * Default format: "Jan 15, 2025, 14:30"
 *
 * @example
 * formatDateTime(new Date()) // "Jan 15, 2025, 14:30"
 */
export function formatDateTime(
  value: DateLike | null | undefined,
  locale: string = 'en-US'
): string {
  const date = parseDate(value);
  if (!date) return '';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format date with seconds for precise timestamps.
 * Default format: "Jan 15, 2025, 14:30:45"
 *
 * @example
 * formatDateTimeFull(new Date()) // "Jan 15, 2025, 14:30:45"
 */
export function formatDateTimeFull(
  value: DateLike | null | undefined,
  locale: string = 'en-US'
): string {
  const date = parseDate(value);
  if (!date) return '';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/**
 * Format date in GB locale (day first).
 * Default format: "15 Jan 2025"
 *
 * @example
 * formatDateGB(new Date()) // "15 Jan 2025"
 */
export function formatDateGB(value: DateLike | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Format date in ISO format (YYYY-MM-DD).
 * Useful for API calls and data storage.
 *
 * @example
 * formatDateISO(new Date()) // "2025-01-15"
 */
export function formatDateISO(value: DateLike | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';

  return date.toISOString().split('T')[0];
}

/**
 * Format date as relative time (e.g., "2 hours ago", "yesterday").
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 3600000)) // "1 hour ago"
 */
export function formatRelativeTime(
  value: DateLike | null | undefined,
  locale: string = 'en-US'
): string {
  const date = parseDate(value);
  if (!date) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffSeconds < 60) {
    return rtf.format(-diffSeconds, 'second');
  }
  if (diffMinutes < 60) {
    return rtf.format(-diffMinutes, 'minute');
  }
  if (diffHours < 24) {
    return rtf.format(-diffHours, 'hour');
  }
  if (diffDays < 30) {
    return rtf.format(-diffDays, 'day');
  }

  // For older dates, fall back to standard format
  return formatDate(date, locale);
}

/**
 * Get year from a date value.
 *
 * @example
 * getYear(new Date()) // 2025
 */
export function getYear(value: DateLike | null | undefined): number | null {
  const date = parseDate(value);
  return date ? date.getFullYear() : null;
}

/**
 * Format date for table display (compact format).
 * Default format: "15/01/2025"
 *
 * @example
 * formatDateCompact(new Date()) // "15/01/2025"
 */
export function formatDateCompact(
  value: DateLike | null | undefined,
  locale: string = 'en-GB'
): string {
  const date = parseDate(value);
  if (!date) return '';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
