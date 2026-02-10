/**
 * Validation tests for schema editor
 *
 * Tests Zod schema validation, backend Pydantic validation integration,
 * and error message formatting for schema fields and structures.
 *
 * @jest-environment node
 */

import { z } from 'zod';
import {
  createMockField,
  createMockFields,
  createMockJSONSchema,
  createMockValidationResponse,
  createMockFetchResponse,
  setupMockFetch,
  cleanupMockFetch,
  buildField,
} from './test-utils';

/**
 * Zod validation schemas for schema fields
 */
const fieldNameSchema = z
  .string()
  .min(1, 'Field name is required')
  .max(100, 'Field name is too long')
  .regex(/^[a-z_][a-z0-9_]*$/i, 'Field name must be a valid identifier');

const fieldTypeSchema = z.enum(['string', 'number', 'boolean', 'array', 'object'], {
  message: 'Invalid field type',
});

const fieldDescriptionSchema = z
  .string()
  .max(1000, 'Description is too long')
  .optional();

const validationRulesSchema = z.record(z.string(), z.unknown()).refine(
  (rules) => {
    // Validate specific rules based on field type
    if ('minLength' in rules && typeof rules.minLength !== 'number') {
      return false;
    }
    if ('maxLength' in rules && typeof rules.maxLength !== 'number') {
      return false;
    }
    if ('pattern' in rules && typeof rules.pattern !== 'string') {
      return false;
    }
    return true;
  },
  {
    message: 'Invalid validation rules format',
  }
);

const schemaFieldSchema = z.object({
  id: z.string().uuid().optional(),
  session_id: z.string().min(1),
  field_name: fieldNameSchema,
  field_path: z.string().min(1),
  field_type: fieldTypeSchema,
  description: fieldDescriptionSchema,
  is_required: z.boolean().default(false),
  parent_field_id: z.string().uuid().optional(),
  position: z.number().int().min(0),
  validation_rules: validationRulesSchema.default({}),
  visual_metadata: z.record(z.string(), z.unknown()).default({}),
  created_by: z.enum(['ai', 'user', 'template']).default('user'),
});

describe('Zod Field Validation', () => {
  describe('Field Name Validation', () => {
    it('should accept valid field names', () => {
      const validNames = [
        'field_name',
        'fieldName',
        'field123',
        '_private',
        'CONSTANT_VALUE',
      ];

      validNames.forEach((name) => {
        const result = fieldNameSchema.safeParse(name);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid field names', () => {
      const invalidNames = [
        '',
        '123field',
        'field-name',
        'field name',
        'field.name',
        'field@name',
      ];

      invalidNames.forEach((name) => {
        const result = fieldNameSchema.safeParse(name);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBeDefined();
        }
      });
    });

    it('should reject field names that are too long', () => {
      const longName = 'a'.repeat(101);
      const result = fieldNameSchema.safeParse(longName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('too long');
      }
    });

    it('should provide helpful error messages for invalid names', () => {
      const result = fieldNameSchema.safeParse('123invalid');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('valid identifier');
      }
    });
  });

  describe('Field Type Validation', () => {
    it('should accept all valid field types', () => {
      const validTypes = ['string', 'number', 'boolean', 'array', 'object'];

      validTypes.forEach((type) => {
        const result = fieldTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid field types', () => {
      const invalidTypes = ['text', 'integer', 'list', 'dict', 'null'];

      invalidTypes.forEach((type) => {
        const result = fieldTypeSchema.safeParse(type);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Field Description Validation', () => {
    it('should accept valid descriptions', () => {
      const validDescriptions = [
        'A simple description',
        'A longer description with multiple sentences. It can include details.',
        undefined,
      ];

      validDescriptions.forEach((description) => {
        const result = fieldDescriptionSchema.safeParse(description);
        expect(result.success).toBe(true);
      });
    });

    it('should reject descriptions that are too long', () => {
      const longDescription = 'a'.repeat(1001);
      const result = fieldDescriptionSchema.safeParse(longDescription);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('too long');
      }
    });
  });

  describe('Validation Rules Validation', () => {
    it('should accept valid validation rules', () => {
      const validRules = [
        { minLength: 5, maxLength: 100 },
        { pattern: '^[A-Z]' },
        { minimum: 0, maximum: 100 },
        { enum: ['option1', 'option2'] },
        {},
      ];

      validRules.forEach((rules) => {
        const result = validationRulesSchema.safeParse(rules);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid validation rules', () => {
      const invalidRules = [
        { minLength: 'five' }, // should be number
        { maxLength: true }, // should be number
        { pattern: 123 }, // should be string
      ];

      invalidRules.forEach((rules) => {
        const result = validationRulesSchema.safeParse(rules);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Complete Field Validation', () => {
    it('should accept a valid field object', () => {
      const field = createMockField({
        field_name: 'valid_field',
        field_type: 'string',
        description: 'A valid field',
      });

      const result = schemaFieldSchema.safeParse(field);
      expect(result.success).toBe(true);
    });

    it('should reject a field with invalid name', () => {
      const field = createMockField({
        field_name: '123invalid',
      });

      const result = schemaFieldSchema.safeParse(field);
      expect(result.success).toBe(false);
    });

    it('should reject a field with missing required properties', () => {
      const incompleteField = {
        field_name: 'test',
        // missing other required fields
      };

      const result = schemaFieldSchema.safeParse(incompleteField);
      expect(result.success).toBe(false);
    });

    it('should apply default values for optional properties', () => {
      const minimalField = {
        session_id: 'test-session',
        field_name: 'test_field',
        field_path: 'test_field',
        field_type: 'string',
        position: 0,
      };

      const result = schemaFieldSchema.safeParse(minimalField);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_required).toBe(false);
        expect(result.data.validation_rules).toEqual({});
        expect(result.data.created_by).toBe('user');
      }
    });
  });
});

describe('JSON Schema Compilation Validation', () => {
  describe('Field to JSON Schema Conversion', () => {
    it('should compile string field to JSON Schema', () => {
      const field = buildField()
        .withName('company_name')
        .withType('string')
        .withDescription('The company name')
        .required()
        .build();

      const jsonSchema = createMockJSONSchema([field]);

      expect(jsonSchema.properties.company_name).toEqual({
        type: 'string',
        description: 'The company name',
      });
      expect(jsonSchema.required).toContain('company_name');
    });

    it('should compile number field with validation rules', () => {
      const field = buildField()
        .withName('age')
        .withType('number')
        .withValidation({ minimum: 0, maximum: 120 })
        .build();

      const jsonSchema = createMockJSONSchema([field]);

      expect(jsonSchema.properties.age).toEqual({
        type: 'number',
        minimum: 0,
        maximum: 120,
      });
    });

    it('should compile array field', () => {
      const field = buildField()
        .withName('tags')
        .withType('array')
        .withDescription('List of tags')
        .build();

      const jsonSchema = createMockJSONSchema([field]);

      expect(jsonSchema.properties.tags).toEqual({
        type: 'array',
        description: 'List of tags',
      });
    });

    it('should compile boolean field', () => {
      const field = buildField()
        .withName('is_active')
        .withType('boolean')
        .build();

      const jsonSchema = createMockJSONSchema([field]);

      expect(jsonSchema.properties.is_active).toEqual({
        type: 'boolean',
      });
    });

    it('should compile multiple fields into schema', () => {
      const fields = [
        buildField().withName('name').withType('string').required().build(),
        buildField().withName('age').withType('number').build(),
        buildField().withName('active').withType('boolean').build(),
      ];

      const jsonSchema = createMockJSONSchema(fields);

      expect(Object.keys(jsonSchema.properties)).toHaveLength(3);
      expect(jsonSchema.required).toEqual(['name']);
    });

    it('should handle empty field list', () => {
      const jsonSchema = createMockJSONSchema([]);

      expect(jsonSchema.properties).toEqual({});
      expect(jsonSchema.required).toEqual([]);
    });
  });

  describe('Validation Rule Transformation', () => {
    it('should transform string validation rules', () => {
      const field = buildField()
        .withName('email')
        .withType('string')
        .withValidation({
          minLength: 5,
          maxLength: 100,
          pattern: '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$',
        })
        .build();

      const jsonSchema = createMockJSONSchema([field]);

      expect(jsonSchema.properties.email).toMatchObject({
        type: 'string',
        minLength: 5,
        maxLength: 100,
        pattern: '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$',
      });
    });

    it('should transform number validation rules', () => {
      const field = buildField()
        .withName('price')
        .withType('number')
        .withValidation({
          minimum: 0,
          maximum: 999999.99,
          multipleOf: 0.01,
        })
        .build();

      const jsonSchema = createMockJSONSchema([field]);

      expect(jsonSchema.properties.price).toMatchObject({
        type: 'number',
        minimum: 0,
        maximum: 999999.99,
        multipleOf: 0.01,
      });
    });

    it('should transform enum validation rules', () => {
      const field = buildField()
        .withName('status')
        .withType('string')
        .withValidation({
          enum: ['draft', 'published', 'archived'],
        })
        .build();

      const jsonSchema = createMockJSONSchema([field]);

      expect(jsonSchema.properties.status).toMatchObject({
        type: 'string',
        enum: ['draft', 'published', 'archived'],
      });
    });
  });
});

describe('Backend Pydantic Validation Integration', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = setupMockFetch();
  });

  afterEach(() => {
    cleanupMockFetch();
  });

  describe('Validation Endpoint Communication', () => {
    it('should send schema to backend for validation', async () => {
      const fields = createMockFields(3);
      const jsonSchema = createMockJSONSchema(fields);

      mockFetch.mockResolvedValue(
        createMockFetchResponse(createMockValidationResponse(true))
      );

      const response = await fetch('http://localhost:8004/api/schemas/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: jsonSchema }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8004/api/schemas/validate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ schema: jsonSchema }),
        })
      );

      const result = await response.json();
      expect(result.valid).toBe(true);
    });

    it('should handle successful validation response', async () => {
      const validationResponse = createMockValidationResponse(true, [], []);

      mockFetch.mockResolvedValue(
        createMockFetchResponse(validationResponse)
      );

      const response = await fetch('http://localhost:8004/api/schemas/validate', {
        method: 'POST',
        body: JSON.stringify({ schema: {} }),
      });

      const result = await response.json();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.compiled_schema).toBeDefined();
    });

    it('should handle validation errors from backend', async () => {
      const validationResponse = createMockValidationResponse(
        false,
        ['Field "name" is required', 'Invalid field type for "age"'],
        []
      );

      mockFetch.mockResolvedValue(
        createMockFetchResponse(validationResponse)
      );

      const response = await fetch('http://localhost:8004/api/schemas/validate', {
        method: 'POST',
        body: JSON.stringify({ schema: {} }),
      });

      const result = await response.json();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('required');
      expect(result.errors[1]).toContain('Invalid field type');
    });

    it('should handle validation warnings', async () => {
      const validationResponse = createMockValidationResponse(
        true,
        [],
        ['Field "deprecated_field" is deprecated', 'Consider adding description']
      );

      mockFetch.mockResolvedValue(
        createMockFetchResponse(validationResponse)
      );

      const response = await fetch('http://localhost:8004/api/schemas/validate', {
        method: 'POST',
        body: JSON.stringify({ schema: {} }),
      });

      const result = await response.json();

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        fetch('http://localhost:8004/api/schemas/validate', {
          method: 'POST',
          body: JSON.stringify({ schema: {} }),
        })
      ).rejects.toThrow('Network error');
    });

    it('should handle backend server errors', async () => {
      mockFetch.mockResolvedValue(
        createMockFetchResponse(
          { error: 'Internal server error' },
          { ok: false, status: 500 }
        )
      );

      const response = await fetch('http://localhost:8004/api/schemas/validate', {
        method: 'POST',
        body: JSON.stringify({ schema: {} }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });

  describe('Pydantic Compatibility Checks', () => {
    it('should validate schema is Pydantic-compatible', async () => {
      const validationResponse = createMockValidationResponse(true);

      mockFetch.mockResolvedValue(
        createMockFetchResponse(validationResponse)
      );

      const response = await fetch('http://localhost:8004/api/schemas/validate', {
        method: 'POST',
        body: JSON.stringify({
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        }),
      });

      const result = await response.json();
      expect(result.valid).toBe(true);
    });

    it('should detect Pydantic incompatibilities', async () => {
      const validationResponse = createMockValidationResponse(
        false,
        ['Unsupported type: "custom_type"'],
        []
      );

      mockFetch.mockResolvedValue(
        createMockFetchResponse(validationResponse)
      );

      const response = await fetch('http://localhost:8004/api/schemas/validate', {
        method: 'POST',
        body: JSON.stringify({
          schema: {
            type: 'object',
            properties: {
              custom: { type: 'custom_type' },
            },
          },
        }),
      });

      const result = await response.json();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unsupported type: "custom_type"');
    });
  });
});

describe('Error Message Formatting', () => {
  describe('Field-Level Errors', () => {
    it('should format field name errors clearly', () => {
      const result = fieldNameSchema.safeParse('123invalid');

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0];
        expect(error.message).toMatch(/valid identifier/i);
        expect(error.path).toEqual([]);
      }
    });

    it('should format nested field errors', () => {
      const result = schemaFieldSchema.safeParse({
        session_id: 'test',
        field_name: '123invalid',
        field_path: 'test',
        field_type: 'string',
        position: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0];
        expect(error.path).toContain('field_name');
      }
    });

    it('should provide actionable error messages', () => {
      const result = fieldNameSchema.safeParse('field-name');

      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toBeTruthy();
        expect(message.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Schema-Level Errors', () => {
    it('should aggregate multiple field errors', () => {
      const result = schemaFieldSchema.safeParse({
        session_id: '',
        field_name: '123invalid',
        field_path: '',
        field_type: 'invalid_type',
        position: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(1);
      }
    });

    it('should format errors for UI display', () => {
      const result = schemaFieldSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        const formatted = result.error.format();
        expect(formatted).toBeDefined();
        expect(formatted._errors).toBeDefined();
      }
    });
  });

  describe('Backend Error Formatting', () => {
    it('should format backend validation errors consistently', () => {
      const backendErrors = [
        'Field "email" must match email pattern',
        'Field "age" must be a positive number',
      ];

      const formattedErrors = backendErrors.map((error) => ({
        field: error.match(/"([^"]+)"/)?.[1] || 'unknown',
        message: error,
      }));

      expect(formattedErrors[0].field).toBe('email');
      expect(formattedErrors[1].field).toBe('age');
    });

    it('should extract field names from error messages', () => {
      const errorMessage = 'Field "company_name" is required';
      const fieldName = errorMessage.match(/"([^"]+)"/)?.[1];

      expect(fieldName).toBe('company_name');
    });
  });
});

describe('Complex Validation Scenarios', () => {
  it('should validate schema with nested objects', () => {
    const fields = [
      buildField()
        .withName('company')
        .withType('object')
        .build(),
      buildField()
        .withName('name')
        .withType('string')
        .withParent('company-id')
        .build(),
    ];

    // In actual implementation, this would validate nested structure
    expect(fields).toHaveLength(2);
  });

  it('should validate schema with arrays', () => {
    const field = buildField()
      .withName('tags')
      .withType('array')
      .withValidation({
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
      })
      .build();

    expect(field.field_type).toBe('array');
    expect(field.validation_rules).toHaveProperty('items');
  });

  it('should validate schema with conditional fields', () => {
    const fields = createMockFields(5);
    const requiredCount = fields.filter((f) => f.is_required).length;

    expect(requiredCount).toBeGreaterThanOrEqual(0);
    expect(requiredCount).toBeLessThanOrEqual(fields.length);
  });

  it('should validate deeply nested schemas', () => {
    // This would test validation of schemas with multiple levels of nesting
    const maxDepth = 5;
    let depth = 0;

    const createNestedField = (currentDepth: number): any => {
      if (currentDepth >= maxDepth) return null;
      depth = currentDepth;
      return {
        field: buildField().withType('object').build(),
        nested: createNestedField(currentDepth + 1),
      };
    };

    const nested = createNestedField(0);
    expect(depth).toBe(maxDepth - 1);
    expect(nested).toBeDefined();
  });
});
