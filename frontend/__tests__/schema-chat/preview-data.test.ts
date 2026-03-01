import { createMockField } from '@/__tests__/schema-editor/test-utils';
import { buildSchemaPreviewData } from '@/hooks/schema-chat/useSchemaPreviewData';
import type { SchemaField } from '@/hooks/schema-editor/types';

describe('buildSchemaPreviewData', () => {
  it('builds representative preview values from schema fields', () => {
    const fields = [
      createMockField({
        id: 'field-1',
        field_name: 'party_name',
        field_type: 'string',
        is_required: true,
      }),
      createMockField({
        id: 'field-2',
        field_name: 'is_active',
        field_type: 'boolean',
      }),
      createMockField({
        id: 'field-3',
        field_name: 'keywords',
        field_type: 'array',
      }),
      createMockField({
        id: 'field-4',
        field_name: 'items',
        field_type: 'string',
        parent_field_id: 'field-3',
      }),
    ];

    const preview = buildSchemaPreviewData(
      fields as unknown as SchemaField[],
      'Test Schema',
      'desc'
    );

    expect(preview.party_name).toBe('John Doe');
    expect(preview.is_active).toBe(true);
    const keywords = preview.keywords;
    expect(Array.isArray(keywords)).toBe(true);
    expect((keywords as unknown[]).length).toBeGreaterThan(0);
  });

  it('returns empty object when no fields are provided', () => {
    expect(buildSchemaPreviewData([], 'Empty')).toEqual({});
  });
});
