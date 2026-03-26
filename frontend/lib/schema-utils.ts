/**
 * Schema parsing utilities for converting between different schema formats
 * and extracting field information for display.
 */

import { FieldType, TYPE_COLORS } from '@/types/schema-editor';

/**
 * Parsed field structure for display purposes
 */
export interface ParsedField {
  /** Field name */
  name: string;
  /** Field type (string, number, etc.) */
  type: FieldType | string;
  /** Field description */
  description?: string;
  /** Whether field is required */
  required: boolean;
  /** Validation rules as readable strings */
  validationRules?: ValidationRuleDisplay[];
  /** Nested properties (for objects) */
  properties?: ParsedField[];
  /** Array item type (for arrays) */
  arrayItemType?: string;
  /** Enum values */
  enumValues?: (string | number | boolean)[];
  /** Default value */
  defaultValue?: unknown;
  /** Type color for display */
  typeColor?: string;
}

/**
 * Validation rule display format
 */
export interface ValidationRuleDisplay {
  /** Rule name (e.g., "minLength", "pattern") */
  name: string;
  /** Rule value */
  value: string | number | boolean;
  /** Human-readable label */
  label: string;
}

/**
 * Parse a JSON Schema object into a flat list of ParsedFields
 * Handles nested objects and arrays
 */
export function parseSchemaToFields(
  schema: Record<string, unknown>,
  requiredFields: string[] = []
): ParsedField[] {
  const fields: ParsedField[] = [];

  // If schema has a properties key, use that (OpenAI JSON Schema format)
  const schemaProperties = (schema.properties as Record<string, unknown>) || schema;
  const requiredArray = Array.isArray(schema.required) ? schema.required : requiredFields;
  const required = Array.isArray(requiredArray) ? requiredArray : [];

  for (const [fieldName, fieldConfig] of Object.entries(schemaProperties)) {
    if (typeof fieldConfig !== 'object' || fieldConfig === null) continue;

    const config = fieldConfig as Record<string, unknown>;
    const field = parseFieldConfig(fieldName, config, required.includes(fieldName));
    fields.push(field);
  }

  return fields;
}

/**
 * Parse a single field configuration into ParsedField
 */
function parseFieldConfig(
  fieldName: string,
  config: Record<string, unknown>,
  isRequired: boolean
): ParsedField {
  let type = (config.type as FieldType | string) || 'string';
  const description = config.description as string | undefined;

  // If string type has format:date, display as "date"
  if (type === 'string' && config.format === 'date') {
    type = 'date';
  }

  const field: ParsedField = {
    name: fieldName,
    type,
    description,
    required: isRequired || (config.required as boolean) || false,
    typeColor: getTypeColor(type as FieldType),
  };

  // Extract validation rules
  field.validationRules = extractValidationRules(config);

  // Handle enum values
  if (config.enum && Array.isArray(config.enum)) {
    field.enumValues = config.enum as (string | number | boolean)[];
  }

  // Handle default value
  if (config.default !== undefined) {
    field.defaultValue = config.default;
  }

  // Handle nested objects
  if (type === 'object' && config.properties) {
    const nestedRequired = Array.isArray(config.required) ? config.required : [];
    field.properties = parseSchemaToFields(
      config as Record<string, unknown>,
      nestedRequired
    );
  }

  // Handle arrays
  if (type === 'array' && config.items) {
    const items = config.items as Record<string, unknown>;
    field.arrayItemType = (items.type as string) || 'unknown';
    if (items.enum && Array.isArray(items.enum)) {
      field.enumValues = items.enum as (string | number | boolean)[];
    }

    // If array items are objects, parse their properties
    if (items.type === 'object' && items.properties) {
      const itemRequired = Array.isArray(items.required) ? items.required : [];
      field.properties = parseSchemaToFields(items, itemRequired);
    }
  }

  return field;
}

/**
 * Extract validation rules from field config
 */
function extractValidationRules(config: Record<string, unknown>): ValidationRuleDisplay[] {
  const rules: ValidationRuleDisplay[] = [];

  // String validation
  if (config.minLength !== undefined) {
    rules.push({
      name: 'minLength',
      value: config.minLength as number,
      label: `Min length: ${config.minLength}`,
    });
  }
  if (config.maxLength !== undefined) {
    rules.push({
      name: 'maxLength',
      value: config.maxLength as number,
      label: `Max length: ${config.maxLength}`,
    });
  }
  if (config.pattern !== undefined) {
    rules.push({
      name: 'pattern',
      value: config.pattern as string,
      label: `Pattern: ${config.pattern}`,
    });
  }
  if (config.format !== undefined) {
    rules.push({
      name: 'format',
      value: config.format as string,
      label: `Format: ${config.format}`,
    });
  }

  // Number validation
  if (config.minimum !== undefined) {
    rules.push({
      name: 'minimum',
      value: config.minimum as number,
      label: `Min: ${config.minimum}`,
    });
  }
  if (config.maximum !== undefined) {
    rules.push({
      name: 'maximum',
      value: config.maximum as number,
      label: `Max: ${config.maximum}`,
    });
  }
  if (config.multipleOf !== undefined) {
    rules.push({
      name: 'multipleOf',
      value: config.multipleOf as number,
      label: `Multiple of: ${config.multipleOf}`,
    });
  }

  // Array validation
  if (config.minItems !== undefined) {
    rules.push({
      name: 'minItems',
      value: config.minItems as number,
      label: `Min items: ${config.minItems}`,
    });
  }
  if (config.maxItems !== undefined) {
    rules.push({
      name: 'maxItems',
      value: config.maxItems as number,
      label: `Max items: ${config.maxItems}`,
    });
  }
  if (config.uniqueItems === true) {
    rules.push({
      name: 'uniqueItems',
      value: true,
      label: 'Unique items',
    });
  }

  // Enum validation
  if (config.enum && Array.isArray(config.enum) && config.enum.length > 0) {
    const enumValues = config.enum.map(v => String(v)).join(', ');
    rules.push({
      name: 'enum',
      value: config.enum as any,
      label: `Enum: ${enumValues}`,
    });
  }
  if (config.items && typeof config.items === 'object') {
    const items = config.items as Record<string, unknown>;
    if (items.enum && Array.isArray(items.enum) && items.enum.length > 0) {
      const enumValues = items.enum.map(v => String(v)).join(', ');
      rules.push({
        name: 'enum_items',
        value: items.enum as any,
        label: `Enum items: ${enumValues}`,
      });
    }
  }

  return rules;
}

/**
 * Get color for field type
 */
function getTypeColor(type: FieldType): string {
  return TYPE_COLORS[type] || '#6b7280'; // Default gray
}

/**
 * Convert schema to YAML string (simplified version)
 * For complex YAML conversion, use the YAML library
 */
export function schemaToYamlString(schema: Record<string, unknown>): string {
  return JSON.stringify(schema, null, 2)
    .replace(/"/g, '')
    .replace(/,\n/g, '\n')
    .replace(/\{|\}/g, '');
}

/**
 * Truncate text to a maximum length
 */
export function truncateText(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Format field path for display (e.g., "root.party.name" -> "party.name")
 */
export function formatFieldPath(path: string): string {
  if (path.startsWith('root.')) {
    return path.substring(5);
  }
  return path;
}

/**
 * Get human-readable type label
 */
export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    string: 'Text',
    number: 'Number',
    integer: 'Integer',
    boolean: 'Boolean',
    array: 'Array',
    object: 'Object',
    null: 'Null',
  };
  return labels[type] || type;
}

/**
 * Check if a field has nested properties
 */
export function hasNestedProperties(field: ParsedField): boolean {
  return !!(field.properties && field.properties.length > 0);
}

/**
 * Count total fields in schema (including nested)
 */
export function countTotalFields(fields: ParsedField[]): number {
  let count = 0;
  for (const field of fields) {
    count += 1;
    if (field.properties) {
      count += countTotalFields(field.properties);
    }
  }
  return count;
}

/**
 * Flat field representation for table display
 */
export interface FlatField {
  /** Field name */
  name: string;
  /** Full path (e.g., "address.city") */
  path: string;
  /** Field type */
  type: string;
  /** Whether field is required */
  required: boolean;
  /** Description */
  description?: string;
  /** Validation rules as string */
  validation: string;
  /** Default value as string */
  defaultValue?: string;
  /** Nesting level (0 = root) */
  level: number;
  /** Type color */
  typeColor?: string;
}

/**
 * Flatten nested schema fields for table display
 * Converts hierarchical structure to flat list with paths
 */
export function flattenSchemaFields(
  fields: ParsedField[],
  parentPath: string = '',
  level: number = 0
): FlatField[] {
  const flatFields: FlatField[] = [];

  for (const field of fields) {
    const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;

    // Create validation string
    const validationStr = field.validationRules
      ?.map((rule) => rule.label)
      .join(', ') || '-';

    // Add current field
    flatFields.push({
      name: field.name,
      path: fieldPath,
      type: field.type,
      required: field.required,
      description: field.description,
      validation: validationStr,
      defaultValue: field.defaultValue !== undefined
        ? JSON.stringify(field.defaultValue)
        : undefined,
      level,
      typeColor: field.typeColor,
    });

    // Recursively add nested fields
    if (field.properties && field.properties.length > 0) {
      const nestedFields = flattenSchemaFields(
        field.properties,
        fieldPath,
        level + 1
      );
      flatFields.push(...nestedFields);
    }
  }

  return flatFields;
}

/**
 * Parse schema text (can be string or object)
 * Handles JSON parsing with error handling
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSchemaText(text: Record<string, any> | string): Record<string, any> | null {
  if (typeof text === 'object') {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Convert technical field types to lawyer-friendly terms
 */
export function getFieldTypeLabel(type: string | undefined): string {
  if (!type) return "unknown";
  const typeMap: Record<string, string> = {
    string: "text",
    array: "list",
    integer: "number",
    number: "number",
    boolean: "yes/no",
    object: "nested",
    date: "date",
    datetime: "date and time",
    time: "time",
    email: "email",
    url: "web address",
    uuid: "identifier",
    enum: "choice",
  };
  return typeMap[type.toLowerCase()] || type;
}

/**
 * Convert field names to human-readable titles
 * Handles snake_case and camelCase
 */
export function formatSchemaFieldName(fieldName: string): string {
  // Handle snake_case: replace underscores with spaces
  let formatted = fieldName.replace(/_/g, ' ');

  // Handle camelCase: insert space before capital letters
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Split into words
  const words = formatted.split(/\s+/).map(w => w.toLowerCase());

  // Capitalize only the first word
  if (words.length > 0) {
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }

  return words.join(' ');
}
