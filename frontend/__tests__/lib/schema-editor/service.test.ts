/**
 * Tests for schema-editor/service.ts
 *
 * Covers: SchemaService class methods - prepareSchema, createSchema, updateSchema,
 * saveSchema, updateSchemaVerification, updateSchemaStatus, updateSchemaMetadata,
 * listSchemasPaginated, listSchemas, loadSchema, parseJsonSchemaToFields.
 */

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

import { SchemaService } from '@/lib/schema-editor/service';
import type { SchemaField } from '@/hooks/schema-editor/types';

// Helpers
function makeField(overrides: Record<string, unknown> = {}): SchemaField {
  return {
    id: 'f-1',
    session_id: 'sess-1',
    field_path: 'root.name',
    field_name: 'name',
    field_type: 'string',
    description: 'Name field',
    is_required: true,
    parent_field_id: undefined,
    position: 0,
    validation_rules: {},
    visual_metadata: {},
    created_by: 'user',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  } as SchemaField;
}

const metadata = { name: 'Test Schema', description: 'A test', field_count: 1 };

function okResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function errorResponse(status: number, body: Record<string, unknown> = {}): Response {
  return {
    ok: false,
    status,
    statusText: 'Bad Request',
    json: async () => body,
  } as Response;
}

function makeApiSchema(overrides: Record<string, unknown> = {}) {
  return {
    id: 'schema-1',
    name: 'Test Schema',
    description: 'A test',
    category: 'extraction',
    type: 'json_schema',
    text: JSON.stringify({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false }),
    dates: {},
    status: 'published',
    is_verified: false,
    user_id: 'u-1',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SchemaService', () => {
  let service: SchemaService;

  beforeEach(() => {
    mockFetch.mockReset();
    service = new SchemaService('/api/schemas');
  });

  // -- prepareSchema ----------------------------------------------------------

  describe('prepareSchema', () => {
    it('succeeds with valid fields', async () => {
      const result = await service.prepareSchema([makeField()], metadata);
      expect(result.success).toBe(true);
      expect(result.compiledSchema).toBeDefined();
      expect(result.compiledSchema!.properties.name.type).toBe('string');
    });

    it('fails with empty fields', async () => {
      const result = await service.prepareSchema([], metadata);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // -- createSchema -----------------------------------------------------------

  describe('createSchema', () => {
    it('sends POST and returns success', async () => {
      const apiSchema = makeApiSchema();
      mockFetch.mockResolvedValueOnce(okResponse(apiSchema));

      const result = await service.createSchema([makeField()], metadata);
      expect(result.success).toBe(true);
      expect(result.schemaId).toBe('schema-1');
      expect(result.schema).toBeDefined();

      // Verify POST was called
      expect(mockFetch).toHaveBeenCalledWith('/api/schemas', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('returns failure when compilation fails', async () => {
      const result = await service.createSchema([], metadata);
      expect(result.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns failure on API error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(400, { message: 'Invalid schema' }));

      const result = await service.createSchema([makeField()], metadata);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid schema');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await service.createSchema([makeField()], metadata);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Network failure');
    });

    it('handles error response with no JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('no body'); },
      } as unknown as Response);

      const result = await service.createSchema([makeField()], metadata);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('500');
    });
  });

  // -- updateSchema -----------------------------------------------------------

  describe('updateSchema', () => {
    it('sends PUT with schema id in query param', async () => {
      mockFetch.mockResolvedValueOnce(okResponse(makeApiSchema()));

      const result = await service.updateSchema('schema-1', [makeField()], metadata);
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/schemas?id=schema-1',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('returns failure on API error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404, { error: 'Not found' }));

      const result = await service.updateSchema('schema-1', [makeField()], metadata);
      expect(result.success).toBe(false);
    });
  });

  // -- saveSchema (dispatcher) ------------------------------------------------

  describe('saveSchema', () => {
    it('delegates to createSchema when schemaId is null', async () => {
      mockFetch.mockResolvedValueOnce(okResponse(makeApiSchema()));

      const result = await service.saveSchema(null, [makeField()], metadata);
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/schemas', expect.anything());
    });

    it('delegates to updateSchema when schemaId is provided', async () => {
      mockFetch.mockResolvedValueOnce(okResponse(makeApiSchema()));

      const result = await service.saveSchema('schema-1', [makeField()], metadata);
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/schemas?id=schema-1',
        expect.anything()
      );
    });
  });

  // -- updateSchemaVerification -----------------------------------------------

  describe('updateSchemaVerification', () => {
    it('sends PUT with is_verified flag', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      const result = await service.updateSchemaVerification('schema-1', true);
      expect(result.success).toBe(true);

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.is_verified).toBe(true);
    });

    it('returns failure on API error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(403, { message: 'Forbidden' }));

      const result = await service.updateSchemaVerification('schema-1', true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Forbidden');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Offline'));

      const result = await service.updateSchemaVerification('schema-1', true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Offline');
    });
  });

  // -- updateSchemaStatus -----------------------------------------------------

  describe('updateSchemaStatus', () => {
    it('sends PUT with status', async () => {
      mockFetch.mockResolvedValueOnce(okResponse(makeApiSchema({ status: 'archived' })));

      const result = await service.updateSchemaStatus('schema-1', 'archived');
      expect(result.success).toBe(true);
      expect(result.schema).toBeDefined();
    });

    it('returns failure on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(400));

      const result = await service.updateSchemaStatus('schema-1', 'published');
      expect(result.success).toBe(false);
    });
  });

  // -- updateSchemaMetadata ---------------------------------------------------

  describe('updateSchemaMetadata', () => {
    it('sends only provided fields', async () => {
      mockFetch.mockResolvedValueOnce(okResponse(makeApiSchema()));

      await service.updateSchemaMetadata('schema-1', { name: 'New Name' });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.name).toBe('New Name');
      expect(body.description).toBeUndefined();
    });

    it('returns failure when no updates provided', async () => {
      const result = await service.updateSchemaMetadata('schema-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('No updates provided');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -- listSchemasPaginated ---------------------------------------------------

  describe('listSchemasPaginated', () => {
    it('fetches paginated schemas', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({
        data: [makeApiSchema()],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 100,
          totalPages: 1,
          has_next: false,
          has_prev: false,
        },
      }));

      const result = await service.listSchemasPaginated(1, 100);
      expect(result.success).toBe(true);
      expect(result.schemas).toHaveLength(1);
      expect(result.pagination).toBeDefined();
    });

    it('handles array response (no pagination wrapper)', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([makeApiSchema()]));

      const result = await service.listSchemasPaginated();
      expect(result.success).toBe(true);
      expect(result.schemas).toHaveLength(1);
    });

    it('returns failure on API error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      const result = await service.listSchemasPaginated();
      expect(result.success).toBe(false);
    });
  });

  // -- listSchemas ------------------------------------------------------------

  describe('listSchemas', () => {
    it('delegates to listSchemasPaginated', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([makeApiSchema()]));

      const result = await service.listSchemas();
      expect(result.success).toBe(true);
      expect(result.schemas).toHaveLength(1);
    });
  });

  // -- loadSchema -------------------------------------------------------------

  describe('loadSchema', () => {
    it('loads and parses schema fields', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([makeApiSchema()]));

      const result = await service.loadSchema('schema-1');
      expect(result.success).toBe(true);
      expect(result.fields).toBeDefined();
      expect(result.fields!.length).toBeGreaterThan(0);
      expect(result.schema).toBeDefined();
    });

    it('returns failure when schema not found', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([]));

      const result = await service.loadSchema('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('handles invalid JSON in schema text', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([
        makeApiSchema({ text: 'not json' }),
      ]));

      const result = await service.loadSchema('schema-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid JSON');
    });

    it('handles schema text as object', async () => {
      const schemaObj = {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: [],
        additionalProperties: false,
      };
      mockFetch.mockResolvedValueOnce(okResponse([
        makeApiSchema({ text: schemaObj }),
      ]));

      const result = await service.loadSchema('schema-1');
      expect(result.success).toBe(true);
    });
  });

  // -- parseJsonSchemaToFields ------------------------------------------------

  describe('parseJsonSchemaToFields', () => {
    it('parses simple properties', () => {
      const jsonSchema = {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Title' },
          count: { type: 'number' },
        },
        required: ['title'],
        additionalProperties: false,
      };

      const fields = service.parseJsonSchemaToFields(jsonSchema);
      expect(fields.length).toBe(2);

      const titleField = fields.find((f) => f.field_name === 'title');
      expect(titleField).toBeDefined();
      expect(titleField!.is_required).toBe(true);
      expect(titleField!.description).toBe('Title');
    });

    it('parses nested object properties', () => {
      const jsonSchema = {
        type: 'object' as const,
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
            required: ['street'],
          },
        },
        required: [],
        additionalProperties: false,
      };

      const fields = service.parseJsonSchemaToFields(jsonSchema);
      // Should have: address + street + city = 3 fields
      expect(fields.length).toBe(3);

      const streetField = fields.find((f) => f.field_name === 'street');
      expect(streetField).toBeDefined();
      expect(streetField!.parent_field_id).toBeDefined();
    });

    it('parses array with items', () => {
      const jsonSchema = {
        type: 'object' as const,
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: [],
        additionalProperties: false,
      };

      const fields = service.parseJsonSchemaToFields(jsonSchema);
      // tags + items = 2 fields
      expect(fields.length).toBe(2);

      const itemField = fields.find((f) => f.field_name === 'items');
      expect(itemField).toBeDefined();
      expect(itemField!.field_type).toBe('string');
    });

    it('extracts validation rules', () => {
      const jsonSchema = {
        type: 'object' as const,
        properties: {
          email: {
            type: 'string',
            pattern: '^.+@.+$',
            minLength: 5,
          },
        },
        required: [],
        additionalProperties: false,
      };

      const fields = service.parseJsonSchemaToFields(jsonSchema);
      const emailField = fields[0];
      expect(emailField.validation_rules.pattern).toBe('^.+@.+$');
      expect(emailField.validation_rules.minLength).toBe(5);
    });

    it('detects AI-generated fields via x-ai-generated marker', () => {
      const jsonSchema = {
        type: 'object' as const,
        properties: {
          ai_field: {
            type: 'string',
            'x-ai-generated': true,
          },
        },
        required: [],
        additionalProperties: false,
      };

      const fields = service.parseJsonSchemaToFields(jsonSchema);
      expect(fields[0].created_by).toBe('ai');
      expect(fields[0].visual_metadata.needsReview).toBe(true);
    });

    it('handles empty properties gracefully', () => {
      const jsonSchema = {
        type: 'object' as const,
        properties: {},
        required: [],
        additionalProperties: false,
      };

      const fields = service.parseJsonSchemaToFields(jsonSchema);
      expect(fields).toEqual([]);
    });
  });
});
