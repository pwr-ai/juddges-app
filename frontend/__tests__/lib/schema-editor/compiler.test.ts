/**
 * Tests for schema-editor/compiler.ts
 *
 * Covers: compileSchemaFieldsToJSONSchema, validateCompiledSchema,
 * exportSchemaAsJSON, exportSchemaAsYAML.
 */

import {
  compileSchemaFieldsToJSONSchema,
  validateCompiledSchema,
  exportSchemaAsJSON,
  exportSchemaAsYAML,
} from '@/lib/schema-editor/compiler';
import type { CompiledJSONSchema } from '@/lib/schema-editor/compiler';

// Helper: create a minimal SchemaField matching hooks/schema-editor/types
function makeField(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    session_id: 'sess-1',
    field_path: 'root.name',
    field_name: 'name',
    field_type: 'string' as const,
    description: 'A name field',
    is_required: true,
    parent_field_id: undefined as string | undefined,
    position: 0,
    validation_rules: {},
    visual_metadata: {},
    created_by: 'user' as const,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('compileSchemaFieldsToJSONSchema', () => {
  it('returns failure for empty fields', () => {
    const result = compileSchemaFieldsToJSONSchema([]);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('No fields provided for compilation');
    expect(result.fieldCount).toBe(0);
  });

  it('throws on null input (accesses length before null check)', () => {
    // The compiler accesses fields.length in the debug log before the null guard,
    // so null input throws rather than returning a failure result.
    expect(() => compileSchemaFieldsToJSONSchema(null as any)).toThrow();
  });

  it('returns failure when only child fields exist (no root-level)', () => {
    const childField = makeField({ parent_field_id: 'some-parent' });
    const result = compileSchemaFieldsToJSONSchema([childField]);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('No root-level fields found');
  });

  it('compiles a single string field', () => {
    const result = compileSchemaFieldsToJSONSchema([makeField()]);
    expect(result.success).toBe(true);
    expect(result.schema).toBeDefined();
    expect(result.schema!.properties.name.type).toBe('string');
    expect(result.schema!.required).toContain('name');
  });

  it('does not include non-required fields in required array', () => {
    const field = makeField({ is_required: false, field_name: 'optional_field' });
    const result = compileSchemaFieldsToJSONSchema([field]);
    expect(result.success).toBe(true);
    expect(result.schema!.required).not.toContain('optional_field');
  });

  it('includes description in property', () => {
    const result = compileSchemaFieldsToJSONSchema([makeField()]);
    expect(result.schema!.properties.name.description).toBe('A name field');
  });

  it('adds metadata title and description', () => {
    const result = compileSchemaFieldsToJSONSchema([makeField()], {
      name: 'Person',
      description: 'A person schema',
    });
    expect(result.schema!.title).toBe('Person');
    expect(result.schema!.description).toBe('A person schema');
  });

  it('omits title/description when metadata is empty', () => {
    const result = compileSchemaFieldsToJSONSchema([makeField()]);
    expect(result.schema!.title).toBeUndefined();
    expect(result.schema!.description).toBeUndefined();
  });

  it('includes $schema and additionalProperties', () => {
    const result = compileSchemaFieldsToJSONSchema([makeField()]);
    expect(result.schema!.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(result.schema!.additionalProperties).toBe(false);
  });

  // -- Nested object fields ---------------------------------------------------

  it('compiles object fields with children', () => {
    const parent = makeField({
      id: 'f-parent',
      field_name: 'address',
      field_type: 'object',
    });
    const child = makeField({
      id: 'f-child',
      field_name: 'street',
      field_type: 'string',
      parent_field_id: 'f-parent',
      is_required: true,
    });

    const result = compileSchemaFieldsToJSONSchema([parent, child]);
    expect(result.success).toBe(true);

    const addressProp = result.schema!.properties.address;
    expect(addressProp.type).toBe('object');
    expect(addressProp.properties!.street.type).toBe('string');
    expect((addressProp as any).required).toContain('street');
  });

  it('warns when object has no children', () => {
    const field = makeField({ field_name: 'empty_obj', field_type: 'object' });
    const result = compileSchemaFieldsToJSONSchema([field]);
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('empty_obj');
  });

  // -- Array fields -----------------------------------------------------------

  it('compiles array fields with item schema', () => {
    const parent = makeField({
      id: 'f-arr',
      field_name: 'tags',
      field_type: 'array',
    });
    const item = makeField({
      id: 'f-item',
      field_name: 'item',
      field_type: 'string',
      parent_field_id: 'f-arr',
    });

    const result = compileSchemaFieldsToJSONSchema([parent, item]);
    expect(result.success).toBe(true);
    expect(result.schema!.properties.tags.items!.type).toBe('string');
  });

  it('defaults array items to string when no child defined', () => {
    const field = makeField({ field_name: 'list', field_type: 'array' });
    const result = compileSchemaFieldsToJSONSchema([field]);
    expect(result.success).toBe(true);
    expect(result.schema!.properties.list.items!.type).toBe('string');
    expect(result.warnings.some((w) => w.includes('list'))).toBe(true);
  });

  // -- Validation rules -------------------------------------------------------

  it('applies string validation rules', () => {
    const field = makeField({
      validation_rules: { pattern: '^[A-Z]+$', minLength: 1, maxLength: 50 },
    });
    const result = compileSchemaFieldsToJSONSchema([field]);
    const prop = result.schema!.properties.name;
    expect(prop.pattern).toBe('^[A-Z]+$');
    expect(prop.minLength).toBe(1);
    expect(prop.maxLength).toBe(50);
  });

  it('applies number validation rules', () => {
    const field = makeField({
      field_name: 'age',
      field_type: 'number',
      validation_rules: { minimum: 0, maximum: 150, multipleOf: 1 },
    });
    const result = compileSchemaFieldsToJSONSchema([field]);
    const prop = result.schema!.properties.age;
    expect(prop.minimum).toBe(0);
    expect(prop.maximum).toBe(150);
    expect(prop.multipleOf).toBe(1);
  });

  it('applies exclusive min/max', () => {
    const field = makeField({
      field_name: 'score',
      field_type: 'number',
      validation_rules: { exclusiveMinimum: 0, exclusiveMaximum: 100 },
    });
    const result = compileSchemaFieldsToJSONSchema([field]);
    const prop = result.schema!.properties.score;
    expect(prop.exclusiveMinimum).toBe(0);
    expect(prop.exclusiveMaximum).toBe(100);
  });

  it('applies array validation rules', () => {
    const field = makeField({
      field_name: 'items',
      field_type: 'array',
      validation_rules: { minItems: 1, maxItems: 10, uniqueItems: true },
    });
    const result = compileSchemaFieldsToJSONSchema([field]);
    const prop = result.schema!.properties.items;
    expect(prop.minItems).toBe(1);
    expect(prop.maxItems).toBe(10);
    expect(prop.uniqueItems).toBe(true);
  });

  it('applies enum validation', () => {
    const field = makeField({
      field_name: 'status',
      validation_rules: { enum: ['active', 'inactive'] },
    });
    const result = compileSchemaFieldsToJSONSchema([field]);
    expect(result.schema!.properties.status.enum).toEqual(['active', 'inactive']);
  });

  it('applies format for string types', () => {
    const field = makeField({
      field_name: 'email',
      field_type: 'string',
      validation_rules: { format: 'email' },
    });
    const result = compileSchemaFieldsToJSONSchema([field]);
    expect(result.schema!.properties.email.format).toBe('email');
  });

  it('ignores format for non-string types', () => {
    const field = makeField({
      field_name: 'count',
      field_type: 'number',
      validation_rules: { format: 'email' },
    });
    const result = compileSchemaFieldsToJSONSchema([field]);
    expect(result.schema!.properties.count.format).toBeUndefined();
  });

  // -- Multiple fields --------------------------------------------------------

  it('compiles multiple root fields', () => {
    const fields = [
      makeField({ id: 'f1', field_name: 'first_name', is_required: true }),
      makeField({ id: 'f2', field_name: 'last_name', is_required: true }),
      makeField({ id: 'f3', field_name: 'age', field_type: 'number', is_required: false }),
    ];
    const result = compileSchemaFieldsToJSONSchema(fields);
    expect(result.success).toBe(true);
    expect(Object.keys(result.schema!.properties)).toHaveLength(3);
    expect(result.schema!.required).toEqual(['first_name', 'last_name']);
    expect(result.fieldCount).toBe(3);
    expect(result.requiredFieldCount).toBe(2);
  });
});

// -- validateCompiledSchema ---------------------------------------------------

describe('validateCompiledSchema', () => {
  function makeSchema(overrides: Partial<CompiledJSONSchema> = {}): CompiledJSONSchema {
    return {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
      ...overrides,
    };
  }

  it('returns no errors for valid schema', () => {
    expect(validateCompiledSchema(makeSchema())).toEqual([]);
  });

  it('reports error for non-object type', () => {
    const errors = validateCompiledSchema(makeSchema({ type: 'array' as any }));
    expect(errors.some((e) => e.includes('object'))).toBe(true);
  });

  it('reports error for missing properties', () => {
    const errors = validateCompiledSchema(makeSchema({ properties: undefined as any }));
    expect(errors.some((e) => e.includes('properties'))).toBe(true);
  });

  it('reports error for empty properties', () => {
    const errors = validateCompiledSchema(makeSchema({ properties: {} }));
    expect(errors.some((e) => e.includes('at least one'))).toBe(true);
  });

  it('reports error for non-array required', () => {
    const errors = validateCompiledSchema(makeSchema({ required: 'name' as any }));
    expect(errors.some((e) => e.includes('array'))).toBe(true);
  });
});

// -- Export functions ---------------------------------------------------------

describe('exportSchemaAsJSON', () => {
  const schema: CompiledJSONSchema = {
    type: 'object',
    properties: { x: { type: 'string' } },
    required: [],
    additionalProperties: false,
  };

  it('returns pretty JSON by default', () => {
    const json = exportSchemaAsJSON(schema);
    expect(json).toContain('\n');
    expect(JSON.parse(json)).toEqual(schema);
  });

  it('returns compact JSON when pretty=false', () => {
    const json = exportSchemaAsJSON(schema, false);
    expect(json).not.toContain('\n');
    expect(JSON.parse(json)).toEqual(schema);
  });
});

describe('exportSchemaAsYAML', () => {
  it('produces YAML-like output with property types', () => {
    const schema: CompiledJSONSchema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name'],
      additionalProperties: false,
      title: 'Person',
      description: 'A person',
    };
    const yaml = exportSchemaAsYAML(schema);
    expect(yaml).toContain('title: Person');
    expect(yaml).toContain('description: A person');
    expect(yaml).toContain('name:');
    expect(yaml).toContain('type: string');
    expect(yaml).toContain('- name');
    expect(yaml).toContain('additionalProperties: false');
  });

  it('does not produce blank lines when title/description are undefined', () => {
    const schema: CompiledJSONSchema = {
      type: 'object',
      properties: { x: { type: 'string' } },
      required: [],
      additionalProperties: false,
    };
    const yaml = exportSchemaAsYAML(schema);
    // Should not have consecutive newlines (blank lines)
    expect(yaml).not.toMatch(/\n\n/);
    expect(yaml).not.toContain('title:');
    expect(yaml).not.toContain('description:');
  });

  it('escapes YAML special characters in values', () => {
    const schema: CompiledJSONSchema = {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'value: with colon and #hash' },
      },
      required: [],
      additionalProperties: false,
      title: 'Schema: special',
      description: "It's a #test",
    };
    const yaml = exportSchemaAsYAML(schema);
    // Title and description with special chars should be quoted
    expect(yaml).toContain('"Schema: special"');
    expect(yaml).toContain('"It\'s a #test"');
    // Property description should also be quoted
    expect(yaml).toContain('"value: with colon and #hash"');
  });

  it('includes description, required status, and validation rules for properties', () => {
    const schema: CompiledJSONSchema = {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
          format: 'email',
          minLength: 5,
          maxLength: 255,
        },
      },
      required: ['email'],
      additionalProperties: false,
    };
    const yaml = exportSchemaAsYAML(schema);
    expect(yaml).toContain('description: User email address');
    expect(yaml).toContain('required: true');
    expect(yaml).toContain('format: email');
    expect(yaml).toContain('minLength: 5');
    expect(yaml).toContain('maxLength: 255');
  });

  it('outputs items for array properties', () => {
    const schema: CompiledJSONSchema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
      },
      required: [],
      additionalProperties: false,
    };
    const yaml = exportSchemaAsYAML(schema);
    expect(yaml).toContain('items:');
    expect(yaml).toContain('type: string');
    expect(yaml).toContain('minItems: 1');
  });

  it('outputs nested properties for object types', () => {
    const schema: CompiledJSONSchema = {
      type: 'object',
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
    const yaml = exportSchemaAsYAML(schema);
    expect(yaml).toContain('properties:');
    expect(yaml).toContain('street:');
    expect(yaml).toContain('city:');
  });
});
