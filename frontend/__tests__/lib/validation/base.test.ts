/**
 * Tests for validation/base.ts
 *
 * Covers uuidSchema and languageSchema validators.
 */

import { uuidSchema, languageSchema } from '@/lib/validation/base';

describe('uuidSchema', () => {
  it('accepts a valid UUID v4', () => {
    const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = uuidSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID string', () => {
    const result = uuidSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  it('rejects a number', () => {
    const result = uuidSchema.safeParse(12345);
    expect(result.success).toBe(false);
  });

  it('rejects null', () => {
    const result = uuidSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('provides custom error message', () => {
    const result = uuidSchema.safeParse('bad');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid UUID format');
    }
  });
});

describe('languageSchema', () => {
  it('accepts "pl"', () => {
    const result = languageSchema.safeParse('pl');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('pl');
  });

  it('accepts "en"', () => {
    const result = languageSchema.safeParse('en');
    expect(result.success).toBe(true);
  });

  it('accepts "uk"', () => {
    const result = languageSchema.safeParse('uk');
    expect(result.success).toBe(true);
  });

  it('defaults to "pl" when undefined', () => {
    const result = languageSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('pl');
  });

  it('rejects unsupported language codes', () => {
    const result = languageSchema.safeParse('de');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = languageSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});
