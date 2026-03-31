/**
 * Tests for formatStatNumber utility.
 *
 * Verifies large-number formatting for dashboard statistics display.
 */

import { formatStatNumber } from '@/lib/format-stats';

describe('formatStatNumber', () => {
  // ── Null / undefined handling ──────────────────────────────────────────

  it('returns "0" for undefined', () => {
    expect(formatStatNumber(undefined)).toBe('0');
  });

  it('returns "0" for null', () => {
    expect(formatStatNumber(null)).toBe('0');
  });

  // ── Millions ───────────────────────────────────────────────────────────

  it('formats 3,233,134 as "3M"', () => {
    expect(formatStatNumber(3_233_134)).toBe('3M');
  });

  it('formats 2,691,279 as "2.5M"', () => {
    expect(formatStatNumber(2_691_279)).toBe('2.5M');
  });

  it('formats 1,000,000 as "1M"', () => {
    expect(formatStatNumber(1_000_000)).toBe('1M');
  });

  it('formats 1,500,000 as "1.5M"', () => {
    expect(formatStatNumber(1_500_000)).toBe('1.5M');
  });

  // ── Hundreds of thousands (100K-999K) ──────────────────────────────────

  it('formats 479,209 as "450K" (rounds to nearest 50K)', () => {
    expect(formatStatNumber(479_209)).toBe('450K');
  });

  it('formats 164,202 as "150K" (rounds to nearest 50K)', () => {
    expect(formatStatNumber(164_202)).toBe('150K');
  });

  it('formats 100,000 as "100K"', () => {
    expect(formatStatNumber(100_000)).toBe('100K');
  });

  // ── Tens of thousands (10K-99K) ────────────────────────────────────────

  it('formats 55,000 as "50K" (rounds to nearest 10K)', () => {
    expect(formatStatNumber(55_000)).toBe('50K');
  });

  it('formats 10,000 as "10K"', () => {
    expect(formatStatNumber(10_000)).toBe('10K');
  });

  // ── Thousands (1K-9K) ──────────────────────────────────────────────────

  it('formats 5,500 as "5K" (rounds to nearest 1K)', () => {
    expect(formatStatNumber(5_500)).toBe('5K');
  });

  it('formats 1,000 as "1K"', () => {
    expect(formatStatNumber(1_000)).toBe('1K');
  });

  // ── Small numbers (<1K) ────────────────────────────────────────────────

  it('returns locale-formatted string for numbers under 1000', () => {
    expect(formatStatNumber(999)).toBe('999');
  });

  it('returns "0" for zero', () => {
    expect(formatStatNumber(0)).toBe('0');
  });
});
