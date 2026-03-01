import { parseImportTextToSchema } from '@/lib/schema-chat/import-parser';

describe('parseImportTextToSchema', () => {
  it('parses full JSON schema with properties', () => {
    const input = JSON.stringify({
      name: 'Contract Schema',
      description: 'Extract contract fields',
      type: 'object',
      properties: {
        party_name: { type: 'string', description: 'Name of party' },
        amount: { type: 'number' },
      },
      required: ['party_name'],
    });

    const result = parseImportTextToSchema(input);

    expect(result.name).toBe('Contract Schema');
    expect(result.description).toBe('Extract contract fields');
    expect(result.fields.length).toBeGreaterThanOrEqual(2);
    expect(result.fields.some((f) => f.field_name === 'party_name')).toBe(true);
    expect(result.fields.some((f) => f.field_name === 'amount')).toBe(true);
  });

  it('parses schema wrapper format', () => {
    const input = JSON.stringify({
      name: 'Wrapped',
      schema: {
        properties: {
          court_name: { type: 'string' },
        },
      },
    });

    const result = parseImportTextToSchema(input);

    expect(result.name).toBe('Wrapped');
    expect(result.fields.some((f) => f.field_name === 'court_name')).toBe(true);
  });

  it('parses plain properties object', () => {
    const input = JSON.stringify({
      case_number: { type: 'string' },
      verdict: { type: 'string' },
    });

    const result = parseImportTextToSchema(input);

    expect(result.name).toBe('Imported Schema');
    expect(result.fields.some((f) => f.field_name === 'case_number')).toBe(true);
    expect(result.fields.some((f) => f.field_name === 'verdict')).toBe(true);
  });

  it('throws on invalid import format', () => {
    const input = JSON.stringify({ type: 'string' });

    expect(() => parseImportTextToSchema(input)).toThrow(
      /Invalid schema format/
    );
  });
});
