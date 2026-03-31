/**
 * Tests for validation/schemas.ts
 *
 * Covers: extractionRequestSchema, jobIdQuerySchema, schemaCreationRequestSchema,
 * collectionCreationRequestSchema, searchQuerySchema, chatMessageSchema,
 * paginationSchema, documentSampleQuerySchema, similarDocumentsQuerySchema,
 * similarityGraphQuerySchema, validateRequestBody, validateQueryParams.
 */

import {
  extractionRequestSchema,
  jobIdQuerySchema,
  schemaCreationRequestSchema,
  collectionCreationRequestSchema,
  searchQuerySchema,
  chatMessageSchema,
  paginationSchema,
  documentSampleQuerySchema,
  similarDocumentsQuerySchema,
  similarityGraphQuerySchema,
  validateRequestBody,
  validateQueryParams,
} from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('extractionRequestSchema', () => {
  const validPayload = {
    collection_id: VALID_UUID,
    schema_id: VALID_UUID,
    extraction_context: 'Extract key clauses from contracts',
  };

  it('accepts valid payload with required fields', () => {
    const result = extractionRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('applies default language "pl"', () => {
    const result = extractionRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.language).toBe('pl');
  });

  it('accepts optional document_ids', () => {
    const result = extractionRequestSchema.safeParse({
      ...validPayload,
      document_ids: ['doc-1', 'doc-2'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty extraction_context', () => {
    const result = extractionRequestSchema.safeParse({
      ...validPayload,
      extraction_context: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects extraction_context over 5000 chars', () => {
    const result = extractionRequestSchema.safeParse({
      ...validPayload,
      extraction_context: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty document_ids array', () => {
    const result = extractionRequestSchema.safeParse({
      ...validPayload,
      document_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown properties (strict mode)', () => {
    const result = extractionRequestSchema.safeParse({
      ...validPayload,
      unknown_field: 'foo',
    });
    expect(result.success).toBe(false);
  });
});

describe('jobIdQuerySchema', () => {
  it('accepts valid job_id', () => {
    const result = jobIdQuerySchema.safeParse({ job_id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects missing job_id', () => {
    const result = jobIdQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID', () => {
    const result = jobIdQuerySchema.safeParse({ job_id: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('schemaCreationRequestSchema', () => {
  it('accepts valid creation request', () => {
    const result = schemaCreationRequestSchema.safeParse({
      name: 'My Schema',
      schema: { type: 'object' },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_public).toBe(false);
  });

  it('rejects empty name', () => {
    const result = schemaCreationRequestSchema.safeParse({
      name: '',
      schema: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects name over 255 chars', () => {
    const result = schemaCreationRequestSchema.safeParse({
      name: 'x'.repeat(256),
      schema: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('collectionCreationRequestSchema', () => {
  it('accepts valid creation request', () => {
    const result = collectionCreationRequestSchema.safeParse({
      name: 'My Collection',
      document_ids: [VALID_UUID],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty document_ids', () => {
    const result = collectionCreationRequestSchema.safeParse({
      name: 'Test',
      document_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = collectionCreationRequestSchema.safeParse({
      document_ids: [VALID_UUID],
    });
    expect(result.success).toBe(false);
  });
});

describe('searchQuerySchema', () => {
  it('accepts minimal query', () => {
    const result = searchQuerySchema.safeParse({ query: 'contract law' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(0);
    }
  });

  it('rejects empty query', () => {
    const result = searchQuerySchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('rejects query over 1000 chars', () => {
    const result = searchQuerySchema.safeParse({ query: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('rejects limit over 100', () => {
    const result = searchQuerySchema.safeParse({ query: 'test', limit: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects negative offset', () => {
    const result = searchQuerySchema.safeParse({ query: 'test', offset: -1 });
    expect(result.success).toBe(false);
  });
});

describe('chatMessageSchema (from schemas.ts)', () => {
  it('accepts valid message', () => {
    const result = chatMessageSchema.safeParse({ message: 'Hello' });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = chatMessageSchema.safeParse({ message: '' });
    expect(result.success).toBe(false);
  });

  it('rejects message over 10000 chars', () => {
    const result = chatMessageSchema.safeParse({ message: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('accepts optional session_id', () => {
    const result = chatMessageSchema.safeParse({
      message: 'Hi',
      session_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe('paginationSchema', () => {
  it('applies defaults', () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.per_page).toBe(20);
    }
  });

  it('coerces string numbers', () => {
    const result = paginationSchema.safeParse({ page: '3', per_page: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.per_page).toBe(50);
    }
  });

  it('rejects page 0', () => {
    const result = paginationSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects per_page over 100', () => {
    const result = paginationSchema.safeParse({ per_page: 101 });
    expect(result.success).toBe(false);
  });
});

describe('documentSampleQuerySchema', () => {
  it('applies defaults', () => {
    const result = documentSampleQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sample_size).toBe(20);
      expect(result.data.only_with_coordinates).toBe(true);
    }
  });

  it('coerces string sample_size', () => {
    const result = documentSampleQuerySchema.safeParse({ sample_size: '50' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sample_size).toBe(50);
  });

  it('transforms "false" to boolean false', () => {
    const result = documentSampleQuerySchema.safeParse({ only_with_coordinates: 'false' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.only_with_coordinates).toBe(false);
  });

  it('transforms "0" to boolean false', () => {
    const result = documentSampleQuerySchema.safeParse({ only_with_coordinates: '0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.only_with_coordinates).toBe(false);
  });

  it('rejects sample_size over 100', () => {
    const result = documentSampleQuerySchema.safeParse({ sample_size: 101 });
    expect(result.success).toBe(false);
  });
});

describe('similarDocumentsQuerySchema', () => {
  it('defaults top_k to 10', () => {
    const result = similarDocumentsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.top_k).toBe(10);
  });

  it('rejects top_k over 100', () => {
    const result = similarDocumentsQuerySchema.safeParse({ top_k: 101 });
    expect(result.success).toBe(false);
  });
});

describe('similarityGraphQuerySchema', () => {
  it('applies all defaults', () => {
    const result = similarityGraphQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sample_size).toBe(50);
      expect(result.data.similarity_threshold).toBe(0.7);
      expect(result.data.include_clusters).toBe(false);
    }
  });

  it('rejects similarity_threshold over 1', () => {
    const result = similarityGraphQuerySchema.safeParse({ similarity_threshold: 1.1 });
    expect(result.success).toBe(false);
  });

  it('rejects similarity_threshold below 0', () => {
    const result = similarityGraphQuerySchema.safeParse({ similarity_threshold: -0.1 });
    expect(result.success).toBe(false);
  });

  it('rejects sample_size over 500', () => {
    const result = similarityGraphQuerySchema.safeParse({ sample_size: 501 });
    expect(result.success).toBe(false);
  });
});

// -- Helper functions ---------------------------------------------------------

describe('validateRequestBody', () => {
  it('returns validated data on success', () => {
    const result = validateRequestBody(jobIdQuerySchema, { job_id: VALID_UUID });
    expect(result.job_id).toBe(VALID_UUID);
  });

  it('throws ValidationError on failure', () => {
    expect(() => validateRequestBody(jobIdQuerySchema, {})).toThrow(ValidationError);
  });

  it('ValidationError contains structured issues', () => {
    try {
      validateRequestBody(jobIdQuerySchema, {});
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const ve = error as ValidationError;
      expect(ve.details?.issues).toBeDefined();
      expect(Array.isArray(ve.details?.issues)).toBe(true);
    }
  });
});

describe('validateQueryParams', () => {
  it('strips null values before validation', () => {
    // paginationSchema has defaults, so passing all nulls should still work
    const result = validateQueryParams(paginationSchema, {
      page: null,
      per_page: null,
    });
    expect(result.page).toBe(1);
    expect(result.per_page).toBe(20);
  });

  it('passes non-null values through', () => {
    const result = validateQueryParams(paginationSchema, {
      page: '5',
      per_page: '25',
    });
    expect(result.page).toBe(5);
    expect(result.per_page).toBe(25);
  });

  it('throws ValidationError on invalid params', () => {
    expect(() =>
      validateQueryParams(jobIdQuerySchema, { id: 'not-valid' })
    ).toThrow(ValidationError);
  });
});
