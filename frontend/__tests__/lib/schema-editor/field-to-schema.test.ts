/**
 * Tests for schema-editor/rjsf/field-to-schema.ts
 *
 * Covers pure functions: fieldToJsonSchemaProperty, fieldsToJsonSchema,
 * jsonSchemaPropertyToField, jsonSchemaToFields, validateJsonSchema,
 * mergeValidationRules, generateFieldPath, validateFieldName,
 * checkDuplicateFieldName.
 */

import {
  fieldToJsonSchemaProperty,
  fieldsToJsonSchema,
  jsonSchemaPropertyToField,
  jsonSchemaToFields,
  validateJsonSchema,
  mergeValidationRules,
  generateFieldPath,
  validateFieldName,
  checkDuplicateFieldName,
} from '@/lib/schema-editor/rjsf/field-to-schema';
import type { SchemaField, ValidationRules, PydanticFieldType } from '@/lib/schema-editor/rjsf/types';

function makeField(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    id: 'f-1',
    session_id: 'sess-1',
    field_path: 'root.name',
    field_name: 'name',
    field_type: 'string',
    description: 'A name',
    is_required: true,
    parent_field_id: undefined,
    position: 0,
    validation_rules: {},
    visual_metadata: {},
    created_by: 'user',
    ...overrides,
  };
}

// -- fieldToJsonSchemaProperty ------------------------------------------------

describe('fieldToJsonSchemaProperty', () => {
  it('converts a string field', () => {
    const { schema, required } = fieldToJsonSchemaProperty(makeField());
    expect(schema.type).toBe('string');
    expect(schema.title).toBe('Name');
    expect(schema.description).toBe('A name');
    expect(required).toBe(true);
  });

  it('converts field_name to title case', () => {
    const { schema } = fieldToJsonSchemaProperty(
      makeField({ field_name: 'invoice_number' })
    );
    expect(schema.title).toBe('Invoice Number');
  });

  it('adds format for specialized types', () => {
    const dateField = makeField({ field_type: 'date' });
    const { schema } = fieldToJsonSchemaProperty(dateField);
    expect(schema.format).toBe('date');
  });

  it('adds format for email type', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField({ field_type: 'email' }));
    expect(schema.format).toBe('email');
  });

  it('adds format for datetime type', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField({ field_type: 'datetime' }));
    expect(schema.format).toBe('date-time');
  });

  it('adds format for uuid type', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField({ field_type: 'uuid' }));
    expect(schema.format).toBe('uuid');
  });

  it('applies validation rules', () => {
    const { schema } = fieldToJsonSchemaProperty(
      makeField({ validation_rules: { minLength: 1, maxLength: 100 } })
    );
    expect(schema.minLength).toBe(1);
    expect(schema.maxLength).toBe(100);
  });

  it('skips undefined/null validation rules', () => {
    const { schema } = fieldToJsonSchemaProperty(
      makeField({ validation_rules: { minLength: undefined as any, maxLength: null as any } })
    );
    expect(schema.minLength).toBeUndefined();
    expect(schema.maxLength).toBeUndefined();
  });

  it('adds default value when provided', () => {
    const { schema } = fieldToJsonSchemaProperty(
      makeField({ default_value: 'default' })
    );
    expect(schema.default).toBe('default');
  });

  it('does not add default when null/undefined', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField());
    expect(schema.default).toBeUndefined();
  });

  it('adds items for array type', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField({ field_type: 'array' }));
    expect(schema.items).toEqual({ type: 'string' });
  });

  it('adds empty properties for object type', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField({ field_type: 'object' }));
    expect(schema.properties).toEqual({});
    expect(schema.additionalProperties).toBe(false);
  });

  it('maps integer type correctly', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField({ field_type: 'integer' }));
    expect(schema.type).toBe('integer');
  });

  it('maps boolean type correctly', () => {
    const { schema } = fieldToJsonSchemaProperty(makeField({ field_type: 'boolean' }));
    expect(schema.type).toBe('boolean');
  });
});

// -- fieldsToJsonSchema -------------------------------------------------------

describe('fieldsToJsonSchema', () => {
  it('compiles root fields into JSON Schema', () => {
    const fields = [
      makeField({ id: 'f-1', field_name: 'title', position: 0, is_required: true }),
      makeField({ id: 'f-2', field_name: 'count', field_type: 'integer', position: 1, is_required: false }),
    ];
    const result = fieldsToJsonSchema(fields, 'TestSchema');
    expect(result.success).toBe(true);
    expect(result.schema).toBeDefined();
    expect(result.schema!.title).toBe('TestSchema');
    expect(result.schema!.required).toContain('title');
    expect(result.schema!.required).not.toContain('count');
  });

  it('handles nested object fields', () => {
    const fields = [
      makeField({ id: 'f-parent', field_name: 'address', field_type: 'object', position: 0 }),
      makeField({ id: 'f-child', field_name: 'city', position: 1, parent_field_id: 'f-parent', is_required: true }),
    ];
    const result = fieldsToJsonSchema(fields);
    expect(result.success).toBe(true);
    const addressProp = result.schema!.properties!.address as Record<string, unknown>;
    const children = addressProp.properties as Record<string, unknown>;
    expect(children.city).toBeDefined();
  });

  it('sorts fields by position', () => {
    const fields = [
      makeField({ id: 'f-2', field_name: 'b_field', position: 1 }),
      makeField({ id: 'f-1', field_name: 'a_field', position: 0 }),
    ];
    const result = fieldsToJsonSchema(fields);
    expect(result.success).toBe(true);
    const keys = Object.keys(result.schema!.properties!);
    expect(keys[0]).toBe('a_field');
  });

  it('returns error for empty fields', () => {
    const result = fieldsToJsonSchema([]);
    expect(result.success).toBe(false);
  });

  it('adds description to schema', () => {
    const result = fieldsToJsonSchema(
      [makeField()],
      'Title',
      'Description here'
    );
    expect(result.schema!.description).toBe('Description here');
  });
});

// -- jsonSchemaPropertyToField ------------------------------------------------

describe('jsonSchemaPropertyToField', () => {
  it('converts string property', () => {
    const field = jsonSchemaPropertyToField('name', { type: 'string', description: 'Name' }, true, 0, 'sess');
    expect(field.field_name).toBe('name');
    expect(field.field_type).toBe('string');
    expect(field.is_required).toBe(true);
    expect(field.description).toBe('Name');
  });

  it('detects email format', () => {
    const field = jsonSchemaPropertyToField('email', { type: 'string', format: 'email' }, false, 0, 'sess');
    expect(field.field_type).toBe('email');
  });

  it('detects url format', () => {
    const field = jsonSchemaPropertyToField('url', { type: 'string', format: 'uri' }, false, 0, 'sess');
    expect(field.field_type).toBe('url');
  });

  it('detects date-time format', () => {
    const field = jsonSchemaPropertyToField('ts', { type: 'string', format: 'date-time' }, false, 0, 'sess');
    expect(field.field_type).toBe('datetime');
  });

  it('detects integer type', () => {
    const field = jsonSchemaPropertyToField('count', { type: 'integer' }, false, 0, 'sess');
    expect(field.field_type).toBe('integer');
  });

  it('detects boolean type', () => {
    const field = jsonSchemaPropertyToField('active', { type: 'boolean' }, false, 0, 'sess');
    expect(field.field_type).toBe('boolean');
  });

  it('detects enum type', () => {
    const field = jsonSchemaPropertyToField('status', { type: 'string', enum: ['a', 'b'] }, false, 0, 'sess');
    expect(field.field_type).toBe('enum');
    expect(field.validation_rules!.enum).toEqual(['a', 'b']);
  });

  it('extracts validation rules', () => {
    const field = jsonSchemaPropertyToField('x', {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      pattern: '^[a-z]+$',
    }, false, 0, 'sess');
    expect(field.validation_rules!.minLength).toBe(1);
    expect(field.validation_rules!.maxLength).toBe(50);
    expect(field.validation_rules!.pattern).toBe('^[a-z]+$');
  });

  it('sets default value', () => {
    const field = jsonSchemaPropertyToField('x', { type: 'string', default: 'hello' }, false, 0, 'sess');
    expect(field.default_value).toBe('hello');
  });

  it('builds field path with parent', () => {
    const field = jsonSchemaPropertyToField('city', { type: 'string' }, false, 0, 'sess', 'parent-1');
    expect(field.field_path).toBe('parent-1.city');
  });

  it('builds field path without parent', () => {
    const field = jsonSchemaPropertyToField('city', { type: 'string' }, false, 0, 'sess');
    expect(field.field_path).toBe('city');
  });
});

// -- jsonSchemaToFields -------------------------------------------------------

describe('jsonSchemaToFields', () => {
  it('returns empty array for non-object schema', () => {
    const fields = jsonSchemaToFields({ type: 'array' } as any, 'sess');
    expect(fields).toEqual([]);
  });

  it('returns empty array for schema without properties', () => {
    const fields = jsonSchemaToFields({ type: 'object' } as any, 'sess');
    expect(fields).toEqual([]);
  });

  it('parses simple properties', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    };
    const fields = jsonSchemaToFields(schema, 'sess');
    expect(fields.length).toBe(2);
    expect(fields[0].field_name).toBe('name');
    expect(fields[0].is_required).toBe(true);
    expect(fields[1].field_name).toBe('age');
    expect(fields[1].is_required).toBe(false);
  });

  it('generates unique IDs', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' } },
    };
    const fields = jsonSchemaToFields(schema, 'sess');
    const ids = fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// -- validateJsonSchema -------------------------------------------------------

describe('validateJsonSchema', () => {
  it('passes valid schema', () => {
    const result = validateJsonSchema({
      type: 'object',
      properties: { valid_name: { type: 'string', description: 'desc' } },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for non-object root', () => {
    const result = validateJsonSchema({ type: 'array' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('object'))).toBe(true);
  });

  it('fails for empty properties', () => {
    const result = validateJsonSchema({ type: 'object', properties: {} });
    expect(result.valid).toBe(false);
  });

  it('fails for invalid property names', () => {
    const result = validateJsonSchema({
      type: 'object',
      properties: { 'Invalid-Name': { type: 'string' } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid-Name'))).toBe(true);
  });

  it('fails for required property not in properties', () => {
    const result = validateJsonSchema({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['missing_prop'],
    });
    expect(result.valid).toBe(false);
  });

  it('warns about missing descriptions', () => {
    const result = validateJsonSchema({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    expect(result.warnings.some((w) => w.includes('description'))).toBe(true);
  });

  it('warns about too many properties', () => {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < 51; i++) {
      properties[`field_${i}`] = { type: 'string', description: 'd' };
    }
    const result = validateJsonSchema({ type: 'object', properties });
    expect(result.warnings.some((w) => w.includes('51'))).toBe(true);
  });
});

// -- mergeValidationRules -----------------------------------------------------

describe('mergeValidationRules', () => {
  it('merges new rules into existing', () => {
    const existing: ValidationRules = { minLength: 1 };
    const updates: ValidationRules = { maxLength: 100 };
    const result = mergeValidationRules(existing, updates);
    expect(result).toEqual({ minLength: 1, maxLength: 100 });
  });

  it('overrides existing rules', () => {
    const existing: ValidationRules = { minLength: 1 };
    const updates: ValidationRules = { minLength: 5 };
    expect(mergeValidationRules(existing, updates).minLength).toBe(5);
  });

  it('removes rules set to undefined', () => {
    const existing: ValidationRules = { minLength: 1, maxLength: 100 };
    const updates: ValidationRules = { minLength: undefined as any };
    const result = mergeValidationRules(existing, updates);
    expect(result.minLength).toBeUndefined();
    expect(result.maxLength).toBe(100);
  });

  it('removes rules set to null', () => {
    const existing: ValidationRules = { pattern: '^a' };
    const updates: ValidationRules = { pattern: null as any };
    const result = mergeValidationRules(existing, updates);
    expect(result.pattern).toBeUndefined();
  });

  it('does not mutate original objects', () => {
    const existing: ValidationRules = { minLength: 1 };
    const updates: ValidationRules = { maxLength: 100 };
    mergeValidationRules(existing, updates);
    expect(existing).toEqual({ minLength: 1 });
    expect(updates).toEqual({ maxLength: 100 });
  });
});

// -- generateFieldPath --------------------------------------------------------

describe('generateFieldPath', () => {
  it('returns field name when no parent', () => {
    expect(generateFieldPath('name')).toBe('name');
  });

  it('returns field name when parent not found in fields', () => {
    const fields = [makeField({ id: 'other' })];
    expect(generateFieldPath('name', 'nonexistent', fields as SchemaField[])).toBe('name');
  });

  it('prepends parent path', () => {
    const parentField = makeField({ id: 'parent-1', field_path: 'root.address' });
    expect(generateFieldPath('city', 'parent-1', [parentField] as SchemaField[])).toBe(
      'root.address.city'
    );
  });
});

// -- validateFieldName --------------------------------------------------------

describe('validateFieldName', () => {
  it('accepts valid snake_case names', () => {
    expect(validateFieldName('invoice_number').valid).toBe(true);
    expect(validateFieldName('x').valid).toBe(true);
    expect(validateFieldName('field_123').valid).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateFieldName('').valid).toBe(false);
  });

  it('rejects names starting with number', () => {
    expect(validateFieldName('1field').valid).toBe(false);
  });

  it('rejects names with uppercase', () => {
    expect(validateFieldName('FieldName').valid).toBe(false);
  });

  it('rejects names with hyphens', () => {
    expect(validateFieldName('field-name').valid).toBe(false);
  });

  it('rejects names over 100 chars', () => {
    expect(validateFieldName('a'.repeat(101)).valid).toBe(false);
  });

  it('rejects reserved keywords', () => {
    const reserved = ['id', 'type', 'properties', 'required', 'default', 'enum'];
    for (const keyword of reserved) {
      const result = validateFieldName(keyword);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    }
  });
});

// -- checkDuplicateFieldName --------------------------------------------------

describe('checkDuplicateFieldName', () => {
  const fields = [
    makeField({ id: 'f-1', field_name: 'name', parent_field_id: undefined }),
    makeField({ id: 'f-2', field_name: 'email', parent_field_id: undefined }),
    makeField({ id: 'f-3', field_name: 'name', parent_field_id: 'parent-1' }),
  ] as SchemaField[];

  it('detects duplicate at same level', () => {
    expect(checkDuplicateFieldName('name', undefined, fields)).toBe(true);
  });

  it('allows same name at different level', () => {
    // 'name' exists at root level (undefined parent) and under parent-1
    // Checking at a new parent should be fine
    expect(checkDuplicateFieldName('name', 'parent-2', fields)).toBe(false);
  });

  it('excludes current field when editing', () => {
    expect(checkDuplicateFieldName('name', undefined, fields, 'f-1')).toBe(false);
  });

  it('returns false for unique names', () => {
    expect(checkDuplicateFieldName('unique_field', undefined, fields)).toBe(false);
  });
});
