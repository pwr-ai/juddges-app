/**
 * Schema Compiler - Converts SchemaField[] to JSON Schema format
 *
 * This module compiles the visual schema editor's field structure into
 * a valid JSON Schema that can be used for extraction and validation.
 */

import type { SchemaField } from '@/hooks/schema-editor/types';
import logger from '@/lib/logger';

const compilerLogger = logger.child('schema-compiler');

/**
 * JSON Schema property definition
 */
interface JSONSchemaProperty {
  type: string;
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  items?: JSONSchemaProperty;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  enum?: Array<string | number | boolean>;
  [key: string]: unknown;
}

/**
 * Compiled JSON Schema
 */
export interface CompiledJSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
  additionalProperties: boolean;
  $schema?: string;
  title?: string;
  description?: string;
}

/**
 * Compilation result with metadata
 */
export interface CompilationResult {
  success: boolean;
  schema?: CompiledJSONSchema;
  errors: string[];
  warnings: string[];
  fieldCount: number;
  requiredFieldCount: number;
}

/**
 * Compile SchemaField array to JSON Schema
 *
 * Converts the visual editor's field structure into a valid JSON Schema
 * that can be used for document extraction and validation.
 *
 * @param fields - Array of schema fields from the editor
 * @param metadata - Optional schema metadata (name, description)
 * @returns Compilation result with schema or errors
 *
 * @example
 * ```typescript
 * const fields = [
 *   { field_name: 'name', field_type: 'string', is_required: true, ... },
 *   { field_name: 'age', field_type: 'number', is_required: false, ... }
 * ];
 *
 * const result = compileSchemaFieldsToJSONSchema(fields, {
 *   name: 'Person Schema',
 *   description: 'Schema for extracting person information'
 * });
 *
 * if (result.success) {
 *   console.log(result.schema);
 * }
 * ```
 */
export function compileSchemaFieldsToJSONSchema(
  fields: SchemaField[],
  metadata?: { name?: string; description?: string }
): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  compilerLogger.debug('Starting schema compilation', {
    fieldCount: fields.length,
    metadata,
  });

  // Validate input
  if (!fields || fields.length === 0) {
    errors.push('No fields provided for compilation');
    return {
      success: false,
      errors,
      warnings,
      fieldCount: 0,
      requiredFieldCount: 0,
    };
  }

  // Get root-level fields only (no parent_field_id)
  const rootFields = fields.filter((f) => !f.parent_field_id);

  if (rootFields.length === 0) {
    errors.push('No root-level fields found');
    return {
      success: false,
      errors,
      warnings,
      fieldCount: fields.length,
      requiredFieldCount: 0,
    };
  }

  // Build JSON Schema properties
  const properties: Record<string, JSONSchemaProperty> = {};
  const required: string[] = [];

  for (const field of rootFields) {
    try {
      const property = compileField(field, fields, warnings);
      properties[field.field_name] = property;

      if (field.is_required) {
        required.push(field.field_name);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown compilation error';
      errors.push(`Failed to compile field '${field.field_name}': ${errorMessage}`);
      compilerLogger.error('Field compilation failed', error, {
        fieldName: field.field_name,
      });
    }
  }

  // If we have errors, return failure
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      warnings,
      fieldCount: fields.length,
      requiredFieldCount: required.length,
    };
  }

  // Build final JSON Schema
  const schema: CompiledJSONSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };

  // Add metadata if provided
  if (metadata?.name) {
    schema.title = metadata.name;
  }
  if (metadata?.description) {
    schema.description = metadata.description;
  }

  compilerLogger.info('Schema compilation successful', {
    propertyCount: Object.keys(properties).length,
    requiredCount: required.length,
    warningCount: warnings.length,
  });

  return {
    success: true,
    schema,
    errors,
    warnings,
    fieldCount: fields.length,
    requiredFieldCount: required.length,
  };
}

/**
 * Compile a single field to JSON Schema property
 *
 * @param field - Field to compile
 * @param allFields - All fields (for resolving nested fields)
 * @param warnings - Array to collect warnings
 * @returns JSON Schema property definition
 */
function compileField(
  field: SchemaField,
  allFields: SchemaField[],
  warnings: string[]
): JSONSchemaProperty {
  const property: JSONSchemaProperty = {
    type: field.field_type,
  };

  // Add description
  if (field.description) {
    property.description = field.description;
  }

  // Handle object type with nested properties
  if (field.field_type === 'object') {
    const childFields = allFields.filter((f) => f.parent_field_id === field.id);

    if (childFields.length === 0) {
      warnings.push(
        `Object field '${field.field_name}' has no properties. Consider adding nested fields or changing the type.`
      );
      property.properties = {};
    } else {
      property.properties = {};
      const requiredChildren: string[] = [];

      for (const child of childFields) {
        try {
          property.properties[child.field_name] = compileField(
            child,
            allFields,
            warnings
          );

          if (child.is_required) {
            requiredChildren.push(child.field_name);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          warnings.push(
            `Failed to compile nested field '${child.field_name}' in '${field.field_name}': ${errorMessage}`
          );
        }
      }

      if (requiredChildren.length > 0) {
        property.required = requiredChildren;
      }
    }
  }

  // Handle array type with items schema
  if (field.field_type === 'array') {
    // Check if there's a nested field defining the array items
    const itemField = allFields.find((f) => f.parent_field_id === field.id);

    if (itemField) {
      property.items = compileField(itemField, allFields, warnings);
    } else {
      // Default to string array if no items schema defined
      warnings.push(
        `Array field '${field.field_name}' has no items schema defined. Defaulting to string[].`
      );
      property.items = { type: 'string' };
    }
  }

  // Apply validation rules
  if (field.validation_rules) {
    const rules = field.validation_rules;

    // String validations
    if (rules.pattern) property.pattern = rules.pattern;
    if (rules.minLength !== undefined) property.minLength = rules.minLength;
    if (rules.maxLength !== undefined) property.maxLength = rules.maxLength;

    // Number validations
    if (rules.minimum !== undefined) property.minimum = rules.minimum;
    if (rules.maximum !== undefined) property.maximum = rules.maximum;
    if (rules.exclusiveMinimum !== undefined)
      property.exclusiveMinimum = rules.exclusiveMinimum;
    if (rules.exclusiveMaximum !== undefined)
      property.exclusiveMaximum = rules.exclusiveMaximum;
    if (rules.multipleOf !== undefined) property.multipleOf = rules.multipleOf;

    // Array validations
    if (rules.minItems !== undefined) property.minItems = rules.minItems;
    if (rules.maxItems !== undefined) property.maxItems = rules.maxItems;
    if (rules.uniqueItems !== undefined) property.uniqueItems = rules.uniqueItems;

    // Object validations
    if (rules.minProperties !== undefined)
      property.minProperties = rules.minProperties;
    if (rules.maxProperties !== undefined)
      property.maxProperties = rules.maxProperties;

    // Enum validation
    if (rules.enum && Array.isArray(rules.enum) && rules.enum.length > 0) {
      property.enum = rules.enum;
    }

    // Format validation (for string types)
    if (rules.format && field.field_type === 'string') {
      property.format = rules.format;
    }
  }

  return property;
}

/**
 * Validate a compiled JSON Schema
 *
 * Performs basic structural validation on the compiled schema.
 *
 * @param schema - Compiled JSON Schema
 * @returns Array of validation errors (empty if valid)
 */
export function validateCompiledSchema(schema: CompiledJSONSchema): string[] {
  const errors: string[] = [];

  if (!schema.type || schema.type !== 'object') {
    errors.push('Schema root must be of type "object"');
  }

  if (!schema.properties || typeof schema.properties !== 'object') {
    errors.push('Schema must have a properties object');
  }

  if (Object.keys(schema.properties || {}).length === 0) {
    errors.push('Schema must have at least one property');
  }

  if (!Array.isArray(schema.required)) {
    errors.push('Schema required field must be an array');
  }

  return errors;
}

/**
 * Export schema as formatted JSON string
 *
 * @param schema - Compiled JSON Schema
 * @param pretty - Whether to format with indentation
 * @returns JSON string
 */
export function exportSchemaAsJSON(
  schema: CompiledJSONSchema,
  pretty = true
): string {
  return pretty ? JSON.stringify(schema, null, 2) : JSON.stringify(schema);
}

/**
 * Export schema as YAML string
 *
 * Note: This is a simple implementation. For production use,
 * consider using a proper YAML library like 'js-yaml'.
 *
 * @param schema - Compiled JSON Schema
 * @returns YAML string (simplified)
 */
export function exportSchemaAsYAML(schema: CompiledJSONSchema): string {
  // Simple YAML export (for production, use js-yaml library)
  return `# JSON Schema
$schema: ${schema.$schema || 'http://json-schema.org/draft-07/schema#'}
${schema.title ? `title: ${schema.title}` : ''}
${schema.description ? `description: ${schema.description}` : ''}
type: object
properties:
${Object.entries(schema.properties)
  .map(([key, prop]) => `  ${key}:\n    type: ${prop.type}`)
  .join('\n')}
required:
${schema.required.map((r) => `  - ${r}`).join('\n')}
additionalProperties: false
`;
}
