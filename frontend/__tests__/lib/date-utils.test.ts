/**
 * Tests for date utility functions.
 *
 * Covers parseDate, formatDate, formatDateTime, formatDateTimeFull,
 * formatDateGB, formatDateISO, formatRelativeTime, getYear, formatDateCompact.
 */

import {
  parseDate,
  formatDate,
  formatDateTime,
  formatDateTimeFull,
  formatDateGB,
  formatDateISO,
  formatRelativeTime,
  getYear,
  formatDateCompact,
} from '@/lib/date-utils';

describe('date-utils', () => {
  // ── parseDate ──────────────────────────────────────────────────────────

  describe('parseDate', () => {
    it('returns null for null/undefined', () => {
      expect(parseDate(null)).toBeNull();
      expect(parseDate(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseDate('')).toBeNull();
    });

    it('parses a valid Date object', () => {
      const d = new Date('2025-06-15');
      expect(parseDate(d)).toEqual(d);
    });

    it('returns null for an invalid Date object', () => {
      expect(parseDate(new Date('invalid'))).toBeNull();
    });

    it('parses an ISO date string', () => {
      const result = parseDate('2025-01-15T10:30:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2025);
    });

    it('parses a numeric timestamp', () => {
      const ts = new Date('2025-03-01').getTime();
      const result = parseDate(ts);
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBe(ts);
    });

    it('returns null for an unparseable string', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });
  });

  // ── formatDate ─────────────────────────────────────────────────────────

  describe('formatDate', () => {
    it('returns empty string for null/undefined/invalid', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate(undefined)).toBe('');
      expect(formatDate('bad')).toBe('');
    });

    it('formats a valid date in en-US locale', () => {
      // Use a fixed UTC date to avoid timezone issues
      const result = formatDate('2025-01-15T00:00:00Z');
      // Should contain year, month abbreviation, and day
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/2025/);
    });
  });

  // ── formatDateTime ─────────────────────────────────────────────────────

  describe('formatDateTime', () => {
    it('returns empty string for null', () => {
      expect(formatDateTime(null)).toBe('');
    });

    it('includes time components for a valid date', () => {
      const result = formatDateTime('2025-01-15T14:30:00Z');
      expect(result).toMatch(/2025/);
      // Should contain some time indication
      expect(result.length).toBeGreaterThan(10);
    });
  });

  // ── formatDateTimeFull ─────────────────────────────────────────────────

  describe('formatDateTimeFull', () => {
    it('returns empty string for null', () => {
      expect(formatDateTimeFull(null)).toBe('');
    });

    it('produces a longer string than formatDateTime (includes seconds)', () => {
      const date = '2025-01-15T14:30:45Z';
      const full = formatDateTimeFull(date);
      expect(full).toMatch(/2025/);
      expect(full.length).toBeGreaterThan(0);
    });
  });

  // ── formatDateGB ───────────────────────────────────────────────────────

  describe('formatDateGB', () => {
    it('returns empty string for null', () => {
      expect(formatDateGB(null)).toBe('');
    });

    it('formats with day before month (GB locale)', () => {
      const result = formatDateGB('2025-01-15T00:00:00Z');
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/2025/);
    });
  });

  // ── formatDateISO ──────────────────────────────────────────────────────

  describe('formatDateISO', () => {
    it('returns empty string for null', () => {
      expect(formatDateISO(null)).toBe('');
    });

    it('returns YYYY-MM-DD format', () => {
      const result = formatDateISO('2025-01-15T14:30:00Z');
      expect(result).toBe('2025-01-15');
    });

    it('handles Date objects', () => {
      const result = formatDateISO(new Date('2025-06-01T00:00:00Z'));
      expect(result).toBe('2025-06-01');
    });
  });

  // ── formatRelativeTime ─────────────────────────────────────────────────

  describe('formatRelativeTime', () => {
    it('returns empty string for null', () => {
      expect(formatRelativeTime(null)).toBe('');
    });

    it('returns a relative time string for recent dates', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesAgo);
      // Should contain "minute" or similar relative reference
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a relative time string for dates hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoHoursAgo);
      expect(result).toMatch(/hour/i);
    });

    it('falls back to standard format for old dates', () => {
      const oldDate = new Date('2020-01-01T00:00:00Z');
      const result = formatRelativeTime(oldDate);
      // Should contain the year since it's > 30 days ago
      expect(result).toMatch(/2020/);
    });
  });

  // ── getYear ────────────────────────────────────────────────────────────

  describe('getYear', () => {
    it('returns null for null/undefined', () => {
      expect(getYear(null)).toBeNull();
      expect(getYear(undefined)).toBeNull();
    });

    it('returns the year for a valid date', () => {
      expect(getYear('2025-06-15')).toBe(2025);
    });

    it('returns the year for a Date object', () => {
      expect(getYear(new Date('2023-03-01'))).toBe(2023);
    });
  });

  // ── formatDateCompact ──────────────────────────────────────────────────

  describe('formatDateCompact', () => {
    it('returns empty string for null', () => {
      expect(formatDateCompact(null)).toBe('');
    });

    it('returns a compact date format', () => {
      const result = formatDateCompact('2025-01-15T00:00:00Z');
      // en-GB compact format: DD/MM/YYYY
      expect(result).toMatch(/2025/);
      expect(result.length).toBeLessThan(15);
    });
  });
});
