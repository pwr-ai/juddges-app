/**
 * Tests for schema-editor/rjsf/types.ts
 *
 * Covers: isPydanticFieldType, isSchemaField, ValidationRulesBuilder.
 */

import {
  isPydanticFieldType,
  isSchemaField,
  ValidationRulesBuilder,
} from '@/lib/schema-editor/rjsf/types';

// -- isPydanticFieldType ------------------------------------------------------

describe('isPydanticFieldType', () => {
  const validTypes = [
    'string', 'integer', 'number', 'boolean', 'array', 'object',
    'date', 'datetime', 'time', 'email', 'url', 'uuid', 'enum',
  ];

  it.each(validTypes)('returns true for "%s"', (type) => {
    expect(isPydanticFieldType(type)).toBe(true);
  });

  it('returns false for invalid string', () => {
    expect(isPydanticFieldType('float')).toBe(false);
    expect(isPydanticFieldType('')).toBe(false);
    expect(isPydanticFieldType('STRING')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isPydanticFieldType(42)).toBe(false);
    expect(isPydanticFieldType(null)).toBe(false);
    expect(isPydanticFieldType(undefined)).toBe(false);
    expect(isPydanticFieldType(true)).toBe(false);
    expect(isPydanticFieldType({})).toBe(false);
  });
});

// -- isSchemaField ------------------------------------------------------------

describe('isSchemaField', () => {
  const validField = {
    id: 'f-1',
    session_id: 'sess-1',
    field_name: 'name',
    field_path: 'root.name',
    field_type: 'string',
    is_required: true,
    position: 0,
    validation_rules: {},
    visual_metadata: {},
    created_by: 'user',
  };

  it('returns true for valid field', () => {
    expect(isSchemaField(validField)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isSchemaField(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSchemaField(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isSchemaField('string')).toBe(false);
    expect(isSchemaField(42)).toBe(false);
  });

  it('returns false when missing id', () => {
    const { id, ...rest } = validField;
    expect(isSchemaField(rest)).toBe(false);
  });

  it('returns false when missing session_id', () => {
    const { session_id, ...rest } = validField;
    expect(isSchemaField(rest)).toBe(false);
  });

  it('returns false when missing field_name', () => {
    const { field_name, ...rest } = validField;
    expect(isSchemaField(rest)).toBe(false);
  });

  it('returns false when field_type is invalid', () => {
    expect(isSchemaField({ ...validField, field_type: 'float' })).toBe(false);
  });

  it('returns false when is_required is not boolean', () => {
    expect(isSchemaField({ ...validField, is_required: 'yes' })).toBe(false);
  });

  it('returns false when position is not number', () => {
    expect(isSchemaField({ ...validField, position: '0' })).toBe(false);
  });
});

// -- ValidationRulesBuilder ---------------------------------------------------

describe('ValidationRulesBuilder', () => {
  it('builds empty rules by default', () => {
    const rules = new ValidationRulesBuilder().build();
    expect(rules).toEqual({});
  });

  it('sets pattern', () => {
    const rules = new ValidationRulesBuilder().pattern('^[A-Z]+$').build();
    expect(rules.pattern).toBe('^[A-Z]+$');
  });

  it('sets format', () => {
    const rules = new ValidationRulesBuilder().format('email').build();
    expect(rules.format).toBe('email');
  });

  it('sets string length constraints', () => {
    const rules = new ValidationRulesBuilder().minLength(1).maxLength(100).build();
    expect(rules.minLength).toBe(1);
    expect(rules.maxLength).toBe(100);
  });

  it('sets numeric constraints', () => {
    const rules = new ValidationRulesBuilder()
      .minimum(0)
      .maximum(999)
      .multipleOf(0.01)
      .build();
    expect(rules.minimum).toBe(0);
    expect(rules.maximum).toBe(999);
    expect(rules.multipleOf).toBe(0.01);
  });

  it('sets array constraints', () => {
    const rules = new ValidationRulesBuilder()
      .minItems(1)
      .maxItems(10)
      .uniqueItems()
      .build();
    expect(rules.minItems).toBe(1);
    expect(rules.maxItems).toBe(10);
    expect(rules.uniqueItems).toBe(true);
  });

  it('sets enum values', () => {
    const rules = new ValidationRulesBuilder().enum(['a', 'b', 'c']).build();
    expect(rules.enum).toEqual(['a', 'b', 'c']);
  });

  it('supports method chaining', () => {
    const builder = new ValidationRulesBuilder();
    const result = builder.minLength(1).maxLength(50).pattern('^[a-z]+$');
    expect(result).toBe(builder);
  });

  it('returns a copy on build (immutability)', () => {
    const builder = new ValidationRulesBuilder().minLength(1);
    const rules1 = builder.build();
    const rules2 = builder.build();
    expect(rules1).toEqual(rules2);
    expect(rules1).not.toBe(rules2);
  });
});
