/**
 * Tests for schema-chat/import-parser.ts
 *
 * Covers: parseImportTextToSchema with various input formats.
 */

import { parseImportTextToSchema } from '@/lib/schema-chat/import-parser';

describe('parseImportTextToSchema', () => {
  // -- Standard JSON Schema format --------------------------------------------

  it('parses standard JSON Schema with properties and required', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Person name' },
        age: { type: 'integer' },
      },
      required: ['name'],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields.length).toBe(2);

    const nameField = result.fields.find((f) => f.field_name === 'name');
    expect(nameField).toBeDefined();
    expect(nameField!.field_type).toBe('string');
    expect(nameField!.is_required).toBe(true);
    expect(nameField!.description).toBe('Person name');

    const ageField = result.fields.find((f) => f.field_name === 'age');
    expect(ageField).toBeDefined();
    expect(ageField!.field_type).toBe('number'); // integer normalized to number
    expect(ageField!.is_required).toBe(false);
  });

  it('extracts name and description from envelope', () => {
    const input = JSON.stringify({
      name: 'Invoice Schema',
      description: 'For extracting invoice data',
      type: 'object',
      properties: {
        invoice_number: { type: 'string' },
      },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.name).toBe('Invoice Schema');
    expect(result.description).toBe('For extracting invoice data');
  });

  it('uses default name when not provided', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { x: { type: 'string' } },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.name).toBe('Imported Schema');
  });

  // -- Nested schema envelope format ------------------------------------------

  it('handles envelope with schema.properties', () => {
    const input = JSON.stringify({
      name: 'Wrapped Schema',
      schema: {
        properties: {
          title: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['title'],
      },
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields.length).toBe(2);
    expect(result.name).toBe('Wrapped Schema');

    const titleField = result.fields.find((f) => f.field_name === 'title');
    expect(titleField!.is_required).toBe(true);
  });

  // -- Plain properties map format --------------------------------------------

  it('handles plain properties map (no type field)', () => {
    const input = JSON.stringify({
      first_name: { type: 'string' },
      last_name: { type: 'string' },
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields.length).toBe(2);
    expect(result.name).toBe('Imported Schema');
  });

  // -- Nested object fields ---------------------------------------------------

  it('parses nested object properties', () => {
    const input = JSON.stringify({
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
    });

    const result = parseImportTextToSchema(input);
    // address + street + city = 3 fields
    expect(result.fields.length).toBe(3);

    const addressField = result.fields.find((f) => f.field_name === 'address');
    expect(addressField!.field_type).toBe('object');

    const streetField = result.fields.find((f) => f.field_name === 'street');
    expect(streetField!.parent_field_id).toBe(addressField!.id);
    expect(streetField!.is_required).toBe(true);
  });

  // -- Array fields -----------------------------------------------------------

  it('parses array fields with items', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string', description: 'A tag' },
        },
      },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    // tags + items = 2 fields
    expect(result.fields.length).toBe(2);

    const itemField = result.fields.find((f) => f.field_name === 'items');
    expect(itemField).toBeDefined();
    expect(itemField!.field_type).toBe('string');
    expect(itemField!.description).toBe('A tag');
  });

  // -- Validation rules extraction --------------------------------------------

  it('extracts validation rules', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: {
        email: {
          type: 'string',
          pattern: '^.+@.+$',
          minLength: 5,
          maxLength: 255,
        },
        score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive'],
        },
      },
      required: [],
    });

    const result = parseImportTextToSchema(input);

    const emailField = result.fields.find((f) => f.field_name === 'email');
    expect(emailField!.validation_rules.pattern).toBe('^.+@.+$');
    expect(emailField!.validation_rules.minLength).toBe(5);
    expect(emailField!.validation_rules.maxLength).toBe(255);

    const scoreField = result.fields.find((f) => f.field_name === 'score');
    expect(scoreField!.validation_rules.minimum).toBe(0);
    expect(scoreField!.validation_rules.maximum).toBe(100);

    const statusField = result.fields.find((f) => f.field_name === 'status');
    expect(statusField!.validation_rules.enum).toEqual(['active', 'inactive']);
  });

  // -- Type normalization -----------------------------------------------------

  it('normalizes integer to number', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { count: { type: 'integer' } },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].field_type).toBe('number');
  });

  it('normalizes number to number', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { price: { type: 'number' } },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].field_type).toBe('number');
  });

  it('keeps boolean as boolean', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { active: { type: 'boolean' } },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].field_type).toBe('boolean');
  });

  it('defaults unknown type to string', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { data: {} },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].field_type).toBe('string');
  });

  // -- Field metadata ---------------------------------------------------------

  it('assigns session_id as empty string', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { x: { type: 'string' } },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].session_id).toBe('');
  });

  it('sets created_by to "user"', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { x: { type: 'string' } },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].created_by).toBe('user');
  });

  it('assigns correct field paths', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: { title: { type: 'string' } },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].field_path).toBe('root.title');
  });

  it('assigns sequential positions', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'string' },
        c: { type: 'string' },
      },
      required: [],
    });

    const result = parseImportTextToSchema(input);
    expect(result.fields[0].position).toBe(0);
    expect(result.fields[1].position).toBe(1);
    expect(result.fields[2].position).toBe(2);
  });

  // -- Error cases ------------------------------------------------------------

  it('throws on invalid JSON', () => {
    expect(() => parseImportTextToSchema('not json')).toThrow();
  });

  it('throws on non-object JSON', () => {
    expect(() => parseImportTextToSchema('"just a string"')).toThrow(
      /Invalid schema format/
    );
  });

  it('throws on array JSON', () => {
    expect(() => parseImportTextToSchema('[1, 2, 3]')).toThrow();
  });

  it('throws on schema with no properties', () => {
    const input = JSON.stringify({ type: 'object' });
    expect(() => parseImportTextToSchema(input)).toThrow();
  });

  it('throws when no fields are found (empty properties)', () => {
    const input = JSON.stringify({
      type: 'object',
      properties: {},
      required: [],
    });
    expect(() => parseImportTextToSchema(input)).toThrow(/No fields found/);
  });
});
