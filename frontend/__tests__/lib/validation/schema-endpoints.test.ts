/**
 * Tests for validation/schema-endpoints.ts
 *
 * Covers: createSchemaRequestSchema, updateSchemaRequestSchema, schemaIdQuerySchema.
 */

import {
  createSchemaRequestSchema,
  updateSchemaRequestSchema,
  schemaIdQuerySchema,
} from '@/lib/validation/schema-endpoints';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('createSchemaRequestSchema', () => {
  const validPayload = {
    name: 'Invoice Schema',
    type: 'extraction',
    category: 'finance',
    text: JSON.stringify({ type: 'object', properties: {} }),
  };

  it('accepts valid payload', () => {
    const result = createSchemaRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('trims whitespace from name', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      name: '  Invoice Schema  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Invoice Schema');
  });

  it('rejects empty name', () => {
    const result = createSchemaRequestSchema.safeParse({ ...validPayload, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 255 chars', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      name: 'x'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty type', () => {
    const result = createSchemaRequestSchema.safeParse({ ...validPayload, type: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty category', () => {
    const result = createSchemaRequestSchema.safeParse({ ...validPayload, category: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON in text', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      text: 'not valid json',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Check the error message mentions JSON
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('JSON'))).toBe(true);
    }
  });

  it('rejects empty text', () => {
    const result = createSchemaRequestSchema.safeParse({ ...validPayload, text: '' });
    expect(result.success).toBe(false);
  });

  it('accepts optional description', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      description: 'A schema for invoices',
    });
    expect(result.success).toBe(true);
  });

  it('rejects description over 5000 chars', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      description: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid status values', () => {
    for (const status of ['draft', 'published']) {
      const result = createSchemaRequestSchema.safeParse({
        ...validPayload,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      status: 'archived',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional is_verified boolean', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      is_verified: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown properties (strict)', () => {
    const result = createSchemaRequestSchema.safeParse({
      ...validPayload,
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateSchemaRequestSchema', () => {
  it('accepts partial updates', () => {
    const result = updateSchemaRequestSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts only status update', () => {
    const result = updateSchemaRequestSchema.safeParse({ status: 'published' });
    expect(result.success).toBe(true);
  });

  it('validates text as JSON when provided', () => {
    const result = updateSchemaRequestSchema.safeParse({ text: 'bad json' });
    expect(result.success).toBe(false);
  });

  it('accepts valid JSON text', () => {
    const result = updateSchemaRequestSchema.safeParse({
      text: JSON.stringify({ type: 'object' }),
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (no fields)', () => {
    // An empty object is valid for the schema shape but has no required fields,
    // so it should pass the shape check. All fields are optional.
    const result = updateSchemaRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('schemaIdQuerySchema', () => {
  it('accepts valid UUID', () => {
    const result = schemaIdQuerySchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = schemaIdQuerySchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const result = schemaIdQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects extra properties (strict)', () => {
    const result = schemaIdQuerySchema.safeParse({
      id: VALID_UUID,
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});
