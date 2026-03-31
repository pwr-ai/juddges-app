/**
 * Tests for validation/search-query-endpoints.ts
 *
 * Covers: createSearchQuerySchema, updateSearchQuerySchema, searchQueryIdQuerySchema.
 */

import {
  createSearchQuerySchema,
  updateSearchQuerySchema,
  searchQueryIdQuerySchema,
} from '@/lib/validation/search-query-endpoints';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('createSearchQuerySchema', () => {
  const validPayload = {
    user_id: VALID_UUID,
    query: 'contractual obligations',
  };

  it('accepts valid payload', () => {
    const result = createSearchQuerySchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects invalid user_id', () => {
    const result = createSearchQuerySchema.safeParse({
      ...validPayload,
      user_id: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty query', () => {
    const result = createSearchQuerySchema.safeParse({
      ...validPayload,
      query: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects query over 10000 chars', () => {
    const result = createSearchQuerySchema.safeParse({
      ...validPayload,
      query: 'x'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('applies default max_documents', () => {
    const result = createSearchQuerySchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts optional metadata', () => {
    const result = createSearchQuerySchema.safeParse({
      ...validPayload,
      metadata: { source: 'web', tags: ['legal'] },
    });
    expect(result.success).toBe(true);
  });

  it('validates max_documents range', () => {
    expect(
      createSearchQuerySchema.safeParse({ ...validPayload, max_documents: 0 }).success
    ).toBe(false);
    expect(
      createSearchQuerySchema.safeParse({ ...validPayload, max_documents: 101 }).success
    ).toBe(false);
    expect(
      createSearchQuerySchema.safeParse({ ...validPayload, max_documents: 50 }).success
    ).toBe(true);
  });

  it('rejects unknown properties (strict)', () => {
    const result = createSearchQuerySchema.safeParse({
      ...validPayload,
      unknown_field: 'oops',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateSearchQuerySchema', () => {
  it('accepts valid update with query', () => {
    const result = updateSearchQuerySchema.safeParse({ query: 'updated query' });
    expect(result.success).toBe(true);
  });

  it('accepts valid update with max_documents', () => {
    const result = updateSearchQuerySchema.safeParse({ max_documents: 25 });
    expect(result.success).toBe(true);
  });

  it('rejects empty update (no fields)', () => {
    const result = updateSearchQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty query string', () => {
    const result = updateSearchQuerySchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('rejects query over 10000 chars', () => {
    const result = updateSearchQuerySchema.safeParse({ query: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('accepts metadata update', () => {
    const result = updateSearchQuerySchema.safeParse({
      metadata: { updated: true },
    });
    expect(result.success).toBe(true);
  });
});

describe('searchQueryIdQuerySchema', () => {
  it('accepts valid UUID', () => {
    const result = searchQueryIdQuerySchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = searchQueryIdQuerySchema.safeParse({ id: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const result = searchQueryIdQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
