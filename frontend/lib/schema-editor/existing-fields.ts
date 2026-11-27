import type { SchemaField } from '@/hooks/schema-editor/types';
import { compileSchemaFieldsToJSONSchema } from './compiler';

/**
 * Existing editor fields as full JSON Schema property definitions
 * (`{type, description, enum, items, format, properties, ...}`), keyed by
 * field name. Sent to `/schema-generator/simple` so the backend can preserve
 * them verbatim when it merges AI-generated fields.
 *
 * Falls back to `{type, description}` per root field when compilation fails.
 */
export function buildExistingFieldProperties(
  fields: SchemaField[]
): Record<string, Record<string, unknown>> {
  const compiled = compileSchemaFieldsToJSONSchema(fields);
  if (compiled.success && compiled.schema) {
    return compiled.schema.properties as Record<string, Record<string, unknown>>;
  }

  const properties: Record<string, Record<string, unknown>> = {};
  for (const field of fields.filter((f) => !f.parent_field_id)) {
    properties[field.field_name] = {
      type: field.field_type,
      description: field.description || '',
    };
  }
  return properties;
}

/**
 * One `existing_fields` entry for the API: the full property definition plus
 * the legacy `field_name` / `field_type` / `description` keys.
 */
export function buildExistingFieldPayload(
  name: string,
  property: unknown
): Record<string, unknown> {
  const def = (property ?? {}) as Record<string, unknown>;
  return {
    ...def,
    field_name: name,
    field_type: def.type || 'string',
    description: def.description || '',
  };
}
