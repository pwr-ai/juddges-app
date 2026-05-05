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

describe('parseDate', () => {
  it('returns Date for ISO string input', () => {
    const result = parseDate('2025-01-15T12:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2025-01-15T12:00:00.000Z');
  });

  it('returns same Date instance when given a valid Date', () => {
    const input = new Date('2025-06-01T00:00:00Z');
    expect(parseDate(input)).toBe(input);
  });

  it('returns null for null, undefined, empty string', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('returns null for invalid Date objects', () => {
    expect(parseDate(new Date('invalid'))).toBeNull();
  });

  it('parses numeric timestamps', () => {
    const ts = Date.UTC(2024, 1, 29, 12, 0, 0);
    const result = parseDate(ts);
    expect(result?.getUTCFullYear()).toBe(2024);
    expect(result?.getUTCDate()).toBe(29);
  });
});

describe('formatDate', () => {
  it('formats ISO string in en-US locale', () => {
    expect(formatDate('2025-01-15T12:00:00Z', 'en-US')).toBe('Jan 15, 2025');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('not-a-date')).toBe('');
  });

  it('formats leap-year date correctly', () => {
    expect(formatDate('2024-02-29T12:00:00Z', 'en-US')).toBe('Feb 29, 2024');
  });
});

describe('formatDateTime', () => {
  it('includes hour and minute', () => {
    const result = formatDateTime('2025-01-15T14:30:00Z', 'en-US');
    expect(result).toContain('Jan 15, 2025');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns empty string for null', () => {
    expect(formatDateTime(null)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatDateTime('garbage')).toBe('');
  });
});

describe('formatDateTimeFull', () => {
  it('includes seconds in output', () => {
    const result = formatDateTimeFull('2025-01-15T14:30:45Z', 'en-US');
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it('returns empty string for null', () => {
    expect(formatDateTimeFull(null)).toBe('');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDateTimeFull('xx')).toBe('');
  });
});

describe('formatDateGB', () => {
  it('uses day-month-year ordering', () => {
    expect(formatDateGB('2025-01-15T12:00:00Z')).toBe('15 Jan 2025');
  });

  it('returns empty string for null', () => {
    expect(formatDateGB(null)).toBe('');
  });

  it('handles end-of-year boundary', () => {
    expect(formatDateGB('2023-12-31T12:00:00Z')).toBe('31 Dec 2023');
  });
});

describe('formatDateISO', () => {
  it('returns YYYY-MM-DD slice', () => {
    expect(formatDateISO('2025-01-15T23:59:59Z')).toBe('2025-01-15');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDateISO(null)).toBe('');
    expect(formatDateISO('xxx')).toBe('');
  });

  it('handles leap day', () => {
    expect(formatDateISO('2024-02-29T00:00:00Z')).toBe('2024-02-29');
  });
});

describe('formatRelativeTime', () => {
  it('formats seconds difference', () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    expect(formatRelativeTime(tenSecondsAgo, 'en-US')).toMatch(/second/);
  });

  it('formats minutes difference', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(fiveMinutesAgo, 'en-US')).toMatch(/minute/);
  });

  it('formats hours difference', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    expect(formatRelativeTime(twoHoursAgo, 'en-US')).toMatch(/hour/);
  });

  it('formats days difference', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    expect(formatRelativeTime(threeDaysAgo, 'en-US')).toMatch(/day|yesterday/i);
  });

  it('falls back to formatted date for older than 30 days', () => {
    const longAgo = new Date('2020-01-15T12:00:00Z');
    expect(formatRelativeTime(longAgo, 'en-US')).toBe('Jan 15, 2020');
  });

  it('returns empty string for null input', () => {
    expect(formatRelativeTime(null)).toBe('');
  });
});

describe('getYear', () => {
  it('returns 4-digit year for valid date', () => {
    expect(getYear('2025-01-15T12:00:00Z')).toBe(2025);
  });

  it('returns null for invalid date', () => {
    expect(getYear('not-a-date')).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(getYear(null)).toBeNull();
    expect(getYear(undefined)).toBeNull();
  });
});

describe('formatDateCompact', () => {
  it('formats with two-digit day/month', () => {
    expect(formatDateCompact('2025-01-05T12:00:00Z')).toBe('05/01/2025');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDateCompact('xx')).toBe('');
  });

  it('handles leap day', () => {
    expect(formatDateCompact('2024-02-29T12:00:00Z')).toBe('29/02/2024');
  });
});
