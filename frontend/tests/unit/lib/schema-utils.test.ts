import {
  parseSchemaToFields,
  schemaToYamlString,
  truncateText,
  formatFieldPath,
  getTypeLabel,
  hasNestedProperties,
  countTotalFields,
  flattenSchemaFields,
  parseSchemaText,
  getFieldTypeLabel,
  formatSchemaFieldName,
  type ParsedField,
} from '@/lib/schema-utils';

describe('parseSchemaToFields', () => {
  it('parses a flat schema with required and optional fields', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name' },
        age: { type: 'integer' },
      },
      required: ['name'],
    };
    const fields = parseSchemaToFields(schema);
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      name: 'name',
      type: 'string',
      required: true,
      description: 'Full name',
    });
    expect(fields[1]).toMatchObject({ name: 'age', type: 'integer', required: false });
  });

  it('returns empty array for empty schema properties', () => {
    expect(parseSchemaToFields({ properties: {} })).toEqual([]);
  });

  it('treats string fields with format=date as date type', () => {
    const schema = { properties: { dob: { type: 'string', format: 'date' } } };
    const [field] = parseSchemaToFields(schema);
    expect(field.type).toBe('date');
  });

  it('parses nested object properties recursively', () => {
    const schema = {
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    };
    const [field] = parseSchemaToFields(schema);
    expect(field.properties).toHaveLength(1);
    expect(field.properties?.[0]).toMatchObject({ name: 'city', required: true });
  });

  it('parses array items with enum values and validation rules', () => {
    const schema = {
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string', enum: ['a', 'b'] },
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
        },
      },
    };
    const [field] = parseSchemaToFields(schema);
    expect(field.arrayItemType).toBe('string');
    expect(field.enumValues).toEqual(['a', 'b']);
    const ruleNames = field.validationRules?.map(r => r.name) ?? [];
    expect(ruleNames).toEqual(
      expect.arrayContaining(['minItems', 'maxItems', 'uniqueItems', 'enum_items'])
    );
  });

  it('extracts string validation rules', () => {
    const schema = {
      properties: {
        username: {
          type: 'string',
          minLength: 3,
          maxLength: 20,
          pattern: '^[a-z]+$',
          format: 'email',
        },
      },
    };
    const [field] = parseSchemaToFields(schema);
    const ruleNames = field.validationRules?.map(r => r.name) ?? [];
    expect(ruleNames).toEqual(
      expect.arrayContaining(['minLength', 'maxLength', 'pattern', 'format'])
    );
  });

  it('captures default values and enum at field level', () => {
    const schema = {
      properties: {
        status: { type: 'string', enum: ['draft', 'published'], default: 'draft' },
      },
    };
    const [field] = parseSchemaToFields(schema);
    expect(field.enumValues).toEqual(['draft', 'published']);
    expect(field.defaultValue).toBe('draft');
  });

  it('falls back to passed-in required list when schema has none', () => {
    const schema = { properties: { x: { type: 'string' } } };
    const [field] = parseSchemaToFields(schema, ['x']);
    expect(field.required).toBe(true);
  });
});

describe('schemaToYamlString', () => {
  it('produces a string representation without JSON quotes/braces', () => {
    const out = schemaToYamlString({ a: 1, b: 'x' });
    expect(out).not.toContain('"');
    expect(out).not.toContain('{');
    expect(out).not.toContain('}');
    expect(out).toContain('a: 1');
  });

  it('handles empty object', () => {
    expect(schemaToYamlString({})).toBe('');
  });
});

describe('truncateText', () => {
  it('returns original text under max length', () => {
    expect(truncateText('short', 100)).toBe('short');
  });

  it('truncates and appends ellipsis when over max length', () => {
    const long = 'a'.repeat(160);
    const result = truncateText(long);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBe(153);
  });

  it('respects custom maxLength parameter', () => {
    expect(truncateText('hello world', 5)).toBe('hello...');
  });

  it('handles empty string', () => {
    expect(truncateText('')).toBe('');
  });
});

describe('formatFieldPath', () => {
  it('strips leading "root." prefix', () => {
    expect(formatFieldPath('root.party.name')).toBe('party.name');
  });

  it('returns path unchanged when no root prefix', () => {
    expect(formatFieldPath('party.name')).toBe('party.name');
  });

  it('handles empty string', () => {
    expect(formatFieldPath('')).toBe('');
  });
});

describe('getTypeLabel', () => {
  it('returns human-readable labels for known types', () => {
    expect(getTypeLabel('string')).toBe('Text');
    expect(getTypeLabel('integer')).toBe('Integer');
    expect(getTypeLabel('boolean')).toBe('Boolean');
    expect(getTypeLabel('array')).toBe('Array');
    expect(getTypeLabel('object')).toBe('Object');
  });

  it('returns input unchanged for unknown types', () => {
    expect(getTypeLabel('custom')).toBe('custom');
  });

  it('handles empty string', () => {
    expect(getTypeLabel('')).toBe('');
  });
});

describe('hasNestedProperties', () => {
  const baseField: ParsedField = { name: 'x', type: 'object', required: false };

  it('returns true when properties array has entries', () => {
    expect(
      hasNestedProperties({
        ...baseField,
        properties: [{ name: 'a', type: 'string', required: false }],
      })
    ).toBe(true);
  });

  it('returns false when properties is empty array', () => {
    expect(hasNestedProperties({ ...baseField, properties: [] })).toBe(false);
  });

  it('returns false when properties is undefined', () => {
    expect(hasNestedProperties(baseField)).toBe(false);
  });
});

describe('countTotalFields', () => {
  it('returns 0 for empty array', () => {
    expect(countTotalFields([])).toBe(0);
  });

  it('counts top-level fields', () => {
    const fields: ParsedField[] = [
      { name: 'a', type: 'string', required: false },
      { name: 'b', type: 'string', required: false },
    ];
    expect(countTotalFields(fields)).toBe(2);
  });

  it('counts nested fields recursively', () => {
    const fields: ParsedField[] = [
      {
        name: 'parent',
        type: 'object',
        required: false,
        properties: [
          { name: 'child1', type: 'string', required: false },
          {
            name: 'child2',
            type: 'object',
            required: false,
            properties: [{ name: 'grandchild', type: 'string', required: false }],
          },
        ],
      },
    ];
    expect(countTotalFields(fields)).toBe(4);
  });
});

describe('flattenSchemaFields', () => {
  it('returns empty list for no fields', () => {
    expect(flattenSchemaFields([])).toEqual([]);
  });

  it('builds dot-notation paths for nested fields', () => {
    const fields: ParsedField[] = [
      {
        name: 'address',
        type: 'object',
        required: false,
        properties: [{ name: 'city', type: 'string', required: false }],
      },
    ];
    const flat = flattenSchemaFields(fields);
    expect(flat.map(f => f.path)).toEqual(['address', 'address.city']);
    expect(flat[0].level).toBe(0);
    expect(flat[1].level).toBe(1);
  });

  it('serializes default values as JSON strings', () => {
    const fields: ParsedField[] = [
      { name: 'flag', type: 'boolean', required: false, defaultValue: true },
    ];
    expect(flattenSchemaFields(fields)[0].defaultValue).toBe('true');
  });

  it('joins validation rule labels into a comma-separated string', () => {
    const fields: ParsedField[] = [
      {
        name: 'x',
        type: 'string',
        required: false,
        validationRules: [
          { name: 'minLength', value: 1, label: 'Min length: 1' },
          { name: 'maxLength', value: 5, label: 'Max length: 5' },
        ],
      },
    ];
    expect(flattenSchemaFields(fields)[0].validation).toBe('Min length: 1, Max length: 5');
  });

  it('uses dash placeholder when no validation rules', () => {
    const fields: ParsedField[] = [{ name: 'x', type: 'string', required: false }];
    expect(flattenSchemaFields(fields)[0].validation).toBe('-');
  });
});

describe('parseSchemaText', () => {
  it('returns object input as-is', () => {
    const obj = { type: 'object' };
    expect(parseSchemaText(obj)).toBe(obj);
  });

  it('parses valid JSON string', () => {
    expect(parseSchemaText('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(parseSchemaText('not json')).toBeNull();
  });
});

describe('getFieldTypeLabel', () => {
  it('returns "unknown" for missing type', () => {
    expect(getFieldTypeLabel(undefined)).toBe('unknown');
  });

  it('maps known technical types to lawyer-friendly labels', () => {
    expect(getFieldTypeLabel('string')).toBe('text');
    expect(getFieldTypeLabel('array')).toBe('list');
    expect(getFieldTypeLabel('boolean')).toBe('yes/no');
    expect(getFieldTypeLabel('object')).toBe('nested');
    expect(getFieldTypeLabel('email')).toBe('email');
  });

  it('returns the input for unknown types', () => {
    expect(getFieldTypeLabel('custom')).toBe('custom');
  });

  it('is case-insensitive on input', () => {
    expect(getFieldTypeLabel('STRING')).toBe('text');
  });
});

describe('formatSchemaFieldName', () => {
  it('converts snake_case to title-cased phrase', () => {
    expect(formatSchemaFieldName('first_name')).toBe('First name');
  });

  it('converts camelCase to spaced phrase', () => {
    expect(formatSchemaFieldName('firstName')).toBe('First name');
  });

  it('handles single word', () => {
    expect(formatSchemaFieldName('name')).toBe('Name');
  });

  it('handles empty string', () => {
    expect(formatSchemaFieldName('')).toBe('');
  });

  it('handles mixed snake_case and camelCase', () => {
    expect(formatSchemaFieldName('user_firstName')).toBe('User first name');
  });
});
