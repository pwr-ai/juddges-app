import type { SchemaField } from '@/hooks/schema-editor/types';
import {
  buildExistingFieldPayload,
  buildExistingFieldProperties,
} from '@/lib/schema-editor/existing-fields';

const base = {
  schema_id: null,
  session_id: 's',
  default_value: null,
  visual_metadata: {},
  created_by: 'user',
  created_at: '',
  updated_at: '',
} as const;

function field(partial: Partial<SchemaField>): SchemaField {
  return {
    ...base,
    id: partial.field_name as string,
    field_path: `root.${partial.field_name}`,
    parent_field_id: null,
    description: '',
    is_required: true,
    validation_rules: {},
    position: 0,
    ...partial,
  } as SchemaField;
}

describe('existing fields payload for schema generation', () => {
  const fields = [
    field({ field_name: 'outcome', field_type: 'string', validation_rules: { enum: ['allowed', 'dismissed'] } }),
    field({ field_name: 'grounds', field_type: 'array', id: 'grounds' }),
    field({
      field_name: 'items',
      field_type: 'string',
      id: 'grounds-items',
      parent_field_id: 'grounds',
      validation_rules: { enum: ['procedure', 'evidence'] },
    }),
    field({ field_name: 'decided_on', field_type: 'string', validation_rules: { format: 'date' } }),
  ];

  it('keeps enum, array items and format', () => {
    const props = buildExistingFieldProperties(fields);
    expect(Object.keys(props)).toEqual(['outcome', 'grounds', 'decided_on']);
    expect(props.outcome.enum).toEqual(['allowed', 'dismissed']);
    expect(props.grounds.items).toEqual({ type: 'string', enum: ['procedure', 'evidence'] });
    expect(props.decided_on.format).toBe('date');
  });

  it('adds legacy keys next to the full definition', () => {
    const props = buildExistingFieldProperties(fields);
    const payload = buildExistingFieldPayload('outcome', props.outcome);
    expect(payload).toMatchObject({
      field_name: 'outcome',
      field_type: 'string',
      type: 'string',
      enum: ['allowed', 'dismissed'],
    });
  });
});
