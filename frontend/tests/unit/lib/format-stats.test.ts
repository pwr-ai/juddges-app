import { formatStatNumber } from '@/lib/format-stats';

describe('formatStatNumber', () => {
  it('returns "0" for null', () => {
    expect(formatStatNumber(null)).toBe('0');
  });

  it('returns "0" for undefined', () => {
    expect(formatStatNumber(undefined)).toBe('0');
  });

  it('formats numbers under 1000 with locale separators', () => {
    expect(formatStatNumber(0)).toBe('0');
    expect(formatStatNumber(42)).toBe('42');
    expect(formatStatNumber(999)).toBe('999');
  });

  it('formats thousands with K suffix rounded down', () => {
    expect(formatStatNumber(1000)).toBe('1K');
    expect(formatStatNumber(1500)).toBe('1K');
    expect(formatStatNumber(9999)).toBe('9K');
  });

  it('formats ten-thousands rounded to nearest 10K', () => {
    expect(formatStatNumber(10_000)).toBe('10K');
    expect(formatStatNumber(15_000)).toBe('10K');
    expect(formatStatNumber(99_999)).toBe('90K');
  });

  it('formats hundred-thousands rounded to nearest 50K', () => {
    expect(formatStatNumber(100_000)).toBe('100K');
    expect(formatStatNumber(164_202)).toBe('150K');
    expect(formatStatNumber(479_209)).toBe('450K');
    expect(formatStatNumber(999_999)).toBe('950K');
  });

  it('formats millions with M suffix and 0.5 step', () => {
    expect(formatStatNumber(1_000_000)).toBe('1M');
    expect(formatStatNumber(2_691_279)).toBe('2.5M');
    expect(formatStatNumber(3_233_134)).toBe('3M');
  });

  it('handles boundary at 1,000,000 cleanly', () => {
    expect(formatStatNumber(1_000_000)).toBe('1M');
    expect(formatStatNumber(999_999)).toBe('950K');
  });

  it('handles very large numbers', () => {
    expect(formatStatNumber(1_500_000_000)).toBe('1500M');
  });
});
