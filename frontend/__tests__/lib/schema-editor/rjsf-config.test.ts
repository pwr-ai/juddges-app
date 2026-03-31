/**
 * Tests for schema-editor/rjsf/rjsf-config.ts
 *
 * Covers: transformValidationError, type mapping constants, default data.
 */

import {
  transformValidationError,
  pydanticToJsonSchemaType,
  pydanticToJsonSchemaFormat,
  widgetMapping,
  fieldTypeColors,
  fieldTypeIcons,
  defaultFieldEditorData,
  rjsfTheme,
  fieldEditorSchema,
  validationMessages,
} from '@/lib/schema-editor/rjsf/rjsf-config';

// -- transformValidationError -------------------------------------------------

describe('transformValidationError', () => {
  it('returns template message for known error', () => {
    const msg = transformValidationError({ name: 'required' });
    expect(msg).toBe('This field is required');
  });

  it('substitutes parameters in template', () => {
    const msg = transformValidationError({
      name: 'minLength',
      params: { limit: 5 },
    });
    expect(msg).toBe('Value is too short (minimum: 5 characters)');
  });

  it('handles multiple params', () => {
    const msg = transformValidationError({
      name: 'enum',
      params: { allowedValues: 'a, b, c' },
    });
    expect(msg).toContain('a, b, c');
  });

  it('returns fallback for unknown error name', () => {
    const msg = transformValidationError({ name: 'customValidator' });
    expect(msg).toBe('Validation error: customValidator');
  });

  it('handles missing params gracefully', () => {
    const msg = transformValidationError({ name: 'minimum' });
    // Should still return the template even with unresolved placeholder
    expect(msg).toContain('{limit}');
  });
});

// -- pydanticToJsonSchemaType -------------------------------------------------

describe('pydanticToJsonSchemaType', () => {
  it('maps all pydantic types', () => {
    expect(pydanticToJsonSchemaType.string).toBe('string');
    expect(pydanticToJsonSchemaType.integer).toBe('integer');
    expect(pydanticToJsonSchemaType.number).toBe('number');
    expect(pydanticToJsonSchemaType.boolean).toBe('boolean');
    expect(pydanticToJsonSchemaType.array).toBe('array');
    expect(pydanticToJsonSchemaType.object).toBe('object');
  });

  it('maps specialized string types to "string"', () => {
    expect(pydanticToJsonSchemaType.date).toBe('string');
    expect(pydanticToJsonSchemaType.datetime).toBe('string');
    expect(pydanticToJsonSchemaType.time).toBe('string');
    expect(pydanticToJsonSchemaType.email).toBe('string');
    expect(pydanticToJsonSchemaType.url).toBe('string');
    expect(pydanticToJsonSchemaType.uuid).toBe('string');
    expect(pydanticToJsonSchemaType.enum).toBe('string');
  });
});

// -- pydanticToJsonSchemaFormat -----------------------------------------------

describe('pydanticToJsonSchemaFormat', () => {
  it('maps date to "date"', () => {
    expect(pydanticToJsonSchemaFormat.date).toBe('date');
  });

  it('maps datetime to "date-time"', () => {
    expect(pydanticToJsonSchemaFormat.datetime).toBe('date-time');
  });

  it('maps email to "email"', () => {
    expect(pydanticToJsonSchemaFormat.email).toBe('email');
  });

  it('maps url to "uri"', () => {
    expect(pydanticToJsonSchemaFormat.url).toBe('uri');
  });

  it('maps uuid to "uuid"', () => {
    expect(pydanticToJsonSchemaFormat.uuid).toBe('uuid');
  });

  it('does not have mapping for string type', () => {
    expect(pydanticToJsonSchemaFormat.string).toBeUndefined();
  });
});

// -- widgetMapping ------------------------------------------------------------

describe('widgetMapping', () => {
  it('maps string to text widget', () => {
    expect(widgetMapping.string).toBe('text');
  });

  it('maps boolean to checkbox', () => {
    expect(widgetMapping.boolean).toBe('checkbox');
  });

  it('maps enum to select', () => {
    expect(widgetMapping.enum).toBe('select');
  });

  it('maps date types to appropriate widgets', () => {
    expect(widgetMapping.date).toBe('date');
    expect(widgetMapping.datetime).toBe('datetime-local');
    expect(widgetMapping.time).toBe('time');
  });

  it('covers all pydantic types', () => {
    const expectedTypes = [
      'string', 'integer', 'number', 'boolean', 'array', 'object',
      'date', 'datetime', 'time', 'email', 'url', 'uuid', 'enum',
    ];
    for (const type of expectedTypes) {
      expect(widgetMapping[type as keyof typeof widgetMapping]).toBeDefined();
    }
  });
});

// -- fieldTypeColors & fieldTypeIcons -----------------------------------------

describe('fieldTypeColors', () => {
  it('has a color for every pydantic type', () => {
    const types = Object.keys(pydanticToJsonSchemaType);
    for (const type of types) {
      expect(fieldTypeColors[type as keyof typeof fieldTypeColors]).toBeDefined();
    }
  });

  it('returns HSL color strings', () => {
    for (const color of Object.values(fieldTypeColors)) {
      expect(color).toMatch(/^hsl\(/);
    }
  });
});

describe('fieldTypeIcons', () => {
  it('has an icon for every pydantic type', () => {
    const types = Object.keys(pydanticToJsonSchemaType);
    for (const type of types) {
      expect(fieldTypeIcons[type as keyof typeof fieldTypeIcons]).toBeDefined();
    }
  });

  it('returns non-empty strings', () => {
    for (const icon of Object.values(fieldTypeIcons)) {
      expect(icon.length).toBeGreaterThan(0);
    }
  });
});

// -- defaultFieldEditorData ---------------------------------------------------

describe('defaultFieldEditorData', () => {
  it('has empty field_name', () => {
    expect(defaultFieldEditorData.field_name).toBe('');
  });

  it('defaults to string type', () => {
    expect(defaultFieldEditorData.field_type).toBe('string');
  });

  it('defaults to not required', () => {
    expect(defaultFieldEditorData.is_required).toBe(false);
  });

  it('has empty validation_rules', () => {
    expect(defaultFieldEditorData.validation_rules).toEqual({});
  });
});

// -- rjsfTheme ----------------------------------------------------------------

describe('rjsfTheme', () => {
  it('has color definitions', () => {
    expect(rjsfTheme.colors.primary).toBeDefined();
    expect(rjsfTheme.colors.secondary).toBeDefined();
  });

  it('has spacing definitions', () => {
    expect(rjsfTheme.spacing.xs).toBeDefined();
    expect(rjsfTheme.spacing.xl).toBeDefined();
  });

  it('has typography definitions', () => {
    expect(rjsfTheme.typography.fontFamily).toBeDefined();
    expect(rjsfTheme.typography.fontSize.base).toBe('1rem');
  });

  it('has border radius definitions', () => {
    expect(rjsfTheme.borderRadius.sm).toBeDefined();
    expect(rjsfTheme.borderRadius.md).toBeDefined();
  });
});

// -- fieldEditorSchema --------------------------------------------------------

describe('fieldEditorSchema', () => {
  it('is an object type', () => {
    expect(fieldEditorSchema.type).toBe('object');
  });

  it('requires field_name, field_type, is_required', () => {
    expect(fieldEditorSchema.required).toContain('field_name');
    expect(fieldEditorSchema.required).toContain('field_type');
    expect(fieldEditorSchema.required).toContain('is_required');
  });

  it('has field_type enum with all pydantic types', () => {
    const fieldType = (fieldEditorSchema.properties as any).field_type;
    expect(fieldType.enum).toContain('string');
    expect(fieldType.enum).toContain('enum');
    expect(fieldType.enum).toHaveLength(13);
  });
});

// -- validationMessages -------------------------------------------------------

describe('validationMessages', () => {
  it('has a message for required', () => {
    expect(validationMessages.required).toBeDefined();
  });

  it('has parameterized messages', () => {
    expect(validationMessages.minLength).toContain('{limit}');
    expect(validationMessages.maximum).toContain('{limit}');
  });
});
