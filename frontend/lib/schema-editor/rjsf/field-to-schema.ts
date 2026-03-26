/**
 * Field to Schema Conversion Utilities
 *
 * Provides bidirectional conversion between:
 * - SchemaField (database representation) ↔ JSON Schema (RJSF format)
 * - Validation rule parsing and generation
 * - Pydantic type compatibility
 */

import type { RJSFSchema } from '@rjsf/utils';
import type {
  SchemaField,
  PydanticFieldType,
  ValidationRules,
  SchemaCompilationResult,
} from './types';
import {
  pydanticToJsonSchemaType,
  pydanticToJsonSchemaFormat,
} from './rjsf-config';

/**
 * Convert a SchemaField to JSON Schema property definition
 */
export function fieldToJsonSchemaProperty(field: SchemaField): {
  schema: Record<string, unknown>;
  required: boolean;
} {
  const { field_type, description, validation_rules, default_value } = field;

  // Base schema with type
  const schema: Record<string, unknown> = {
    type: pydanticToJsonSchemaType[field_type],
  };

  // Add title (use field_name converted to title case)
  schema.title = fieldNameToTitle(field.field_name);

  // Add description if present
  if (description) {
    schema.description = description;
  }

  // Add format for specialized types
  const format = pydanticToJsonSchemaFormat[field_type];
  if (format) {
    schema.format = format;
  }

  // Add validation rules
  if (validation_rules) {
    Object.entries(validation_rules).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        schema[key] = value;
      }
    });
  }

  // Add default value if present
  if (default_value !== undefined && default_value !== null) {
    schema.default = default_value;
  }

  // Special handling for array types
  if (field_type === 'array') {
    schema.items = {
      type: 'string', // Default to string items, can be customized
    };
  }

  // Special handling for object types
  if (field_type === 'object') {
    schema.properties = {};
    schema.additionalProperties = false;
  }

  return {
    schema,
    required: field.is_required,
  };
}

/**
 * Convert field name to title case
 * e.g., "invoice_number" → "Invoice Number"
 */
function fieldNameToTitle(fieldName: string): string {
  return fieldName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert array of SchemaFields to complete JSON Schema
 */
export function fieldsToJsonSchema(
  fields: SchemaField[],
  schemaTitle?: string,
  schemaDescription?: string
): SchemaCompilationResult {
  try {
    // Sort fields by position
    const sortedFields = [...fields].sort((a, b) => a.position - b.position);

    // Build properties and required array
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Group fields by parent
    const rootFields = sortedFields.filter((f) => !f.parent_field_id);
    const childFieldsMap = new Map<string, SchemaField[]>();

    sortedFields.forEach((field) => {
      if (field.parent_field_id) {
        const children = childFieldsMap.get(field.parent_field_id) || [];
        children.push(field);
        childFieldsMap.set(field.parent_field_id, children);
      }
    });

    // Process root fields
    rootFields.forEach((field) => {
      const { schema, required: isRequired } = fieldToJsonSchemaProperty(field);

      // If this field has children (is an object), recursively add them
      if (field.field_type === 'object') {
        const children = childFieldsMap.get(field.id) || [];
        if (children.length > 0) {
          const childProperties: Record<string, unknown> = {};
          const childRequired: string[] = [];

          children.forEach((child) => {
            const { schema: childSchema, required: childIsRequired } =
              fieldToJsonSchemaProperty(child);
            childProperties[child.field_name] = childSchema;
            if (childIsRequired) {
              childRequired.push(child.field_name);
            }
          });

          schema.properties = childProperties;
          if (childRequired.length > 0) {
            schema.required = childRequired;
          }
        }
      }

      properties[field.field_name] = schema;
      if (isRequired) {
        required.push(field.field_name);
      }
    });

    // Build final schema
    const jsonSchema: RJSFSchema = {
      type: 'object',
      properties: properties as any,
    };

    if (schemaTitle) {
      jsonSchema.title = schemaTitle;
    }

    if (schemaDescription) {
      jsonSchema.description = schemaDescription;
    }

    if (required.length > 0) {
      jsonSchema.required = required;
    }

    // Validate schema structure
    const validation = validateJsonSchema(jsonSchema);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    return {
      success: true,
      schema: jsonSchema,
      warnings: validation.warnings,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error during schema compilation'],
    };
  }
}

/**
 * Parse JSON Schema property to SchemaField
 */
export function jsonSchemaPropertyToField(
  propertyName: string,
  propertySchema: Record<string, unknown>,
  isRequired: boolean,
  position: number,
  sessionId: string,
  parentFieldId?: string
): Partial<SchemaField> {
  // Determine field type
  const jsonType = propertySchema.type as string;
  const format = propertySchema.format as string | undefined;

  let fieldType: PydanticFieldType = 'string';

  // Map JSON Schema type + format to Pydantic type
  if (format) {
    switch (format) {
      case 'email':
        fieldType = 'email';
        break;
      case 'uri':
      case 'url':
        fieldType = 'url';
        break;
      case 'uuid':
        fieldType = 'uuid';
        break;
      case 'date':
        fieldType = 'date';
        break;
      case 'date-time':
        fieldType = 'datetime';
        break;
      case 'time':
        fieldType = 'time';
        break;
    }
  } else {
    switch (jsonType) {
      case 'integer':
        fieldType = 'integer';
        break;
      case 'number':
        fieldType = 'number';
        break;
      case 'boolean':
        fieldType = 'boolean';
        break;
      case 'array':
        fieldType = 'array';
        break;
      case 'object':
        fieldType = 'object';
        break;
      case 'string':
      default:
        // Check if it's an enum
        if (propertySchema.enum && Array.isArray(propertySchema.enum)) {
          fieldType = 'enum';
        } else {
          fieldType = 'string';
        }
        break;
    }
  }

  // Extract validation rules
  const validationRules: ValidationRules = {};
  const validationKeys = [
    'pattern',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'enum',
  ];

  validationKeys.forEach((key) => {
    if (propertySchema[key] !== undefined) {
      validationRules[key] = propertySchema[key] as never;
    }
  });

  // Build field path
  const fieldPath = parentFieldId
    ? `${parentFieldId}.${propertyName}`
    : propertyName;

  return {
    session_id: sessionId,
    field_name: propertyName,
    field_path: fieldPath,
    field_type: fieldType,
    description: propertySchema.description as string | undefined,
    is_required: isRequired,
    validation_rules: validationRules,
    default_value: propertySchema.default as string | number | boolean | undefined,
    position,
    parent_field_id: parentFieldId,
    visual_metadata: {},
    created_by: 'user',
  };
}

/**
 * Parse complete JSON Schema to array of SchemaFields
 */
export function jsonSchemaToFields(
  schema: RJSFSchema,
  sessionId: string
): SchemaField[] {
  const fields: Partial<SchemaField>[] = [];

  if (schema.type !== 'object' || !schema.properties) {
    return [];
  }

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = Array.isArray(schema.required) ? schema.required : [];

  let position = 0;

  Object.entries(properties).forEach(([propName, propSchema]) => {
    const isRequired = required.includes(propName);
    const field = jsonSchemaPropertyToField(
      propName,
      propSchema,
      isRequired,
      position++,
      sessionId
    );

    fields.push(field);

    // If this is an object with properties, recursively add children
    if (propSchema.type === 'object' && propSchema.properties) {
      const childProperties = propSchema.properties as Record<string, Record<string, unknown>>;
      const childRequired = Array.isArray(propSchema.required) ? propSchema.required : [];

      Object.entries(childProperties).forEach(([childName, childSchema]) => {
        const childIsRequired = childRequired.includes(childName);
        const childField = jsonSchemaPropertyToField(
          childName,
          childSchema,
          childIsRequired,
          position++,
          sessionId,
          field.id // Note: This needs to be set after field ID is generated
        );
        fields.push(childField);
      });
    }
  });

  // Generate IDs and return as complete SchemaField objects
  return fields.map((field, index) => ({
    id: `field_${Date.now()}_${index}`,
    schema_id: undefined,
    session_id: field.session_id!,
    field_path: field.field_path!,
    field_name: field.field_name!,
    parent_field_id: field.parent_field_id,
    field_type: field.field_type!,
    description: field.description,
    is_required: field.is_required!,
    validation_rules: field.validation_rules!,
    default_value: field.default_value,
    position: field.position!,
    visual_metadata: field.visual_metadata!,
    created_by: field.created_by!,
  }));
}

/**
 * Validate JSON Schema structure
 */
export function validateJsonSchema(schema: RJSFSchema): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must be an object type
  if (schema.type !== 'object') {
    errors.push('Root schema must be of type "object"');
  }

  // Must have properties
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    errors.push('Schema must have at least one property');
  }

  // Check for valid property names
  if (schema.properties) {
    Object.keys(schema.properties).forEach((propName) => {
      if (!/^[a-z][a-z0-9_]*$/.test(propName)) {
        errors.push(
          `Invalid property name "${propName}". Use lowercase with underscores (snake_case)`
        );
      }
    });
  }

  // Check required array
  if (schema.required) {
    if (!Array.isArray(schema.required)) {
      errors.push('Schema "required" must be an array');
    } else {
      const properties = schema.properties as Record<string, unknown> | undefined;
      schema.required.forEach((requiredProp) => {
        if (!properties || !(requiredProp in properties)) {
          errors.push(
            `Required property "${requiredProp}" not found in schema properties`
          );
        }
      });
    }
  }

  // Warnings for best practices
  if (schema.properties) {
    const propCount = Object.keys(schema.properties).length;
    if (propCount > 50) {
      warnings.push(
        `Schema has ${propCount} properties. Consider breaking into nested objects for better organization.`
      );
    }

    Object.entries(schema.properties).forEach(([propName, propSchema]) => {
      const prop = propSchema as Record<string, unknown>;
      if (!prop.description) {
        warnings.push(`Property "${propName}" is missing a description`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Merge validation rules (for updating existing fields)
 */
export function mergeValidationRules(
  existing: ValidationRules,
  updates: ValidationRules
): ValidationRules {
  const merged = { ...existing };

  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  });

  return merged;
}

/**
 * Generate field path from parent and field name
 */
export function generateFieldPath(
  fieldName: string,
  parentFieldId?: string,
  fields?: SchemaField[]
): string {
  if (!parentFieldId || !fields) {
    return fieldName;
  }

  const parent = fields.find((f) => f.id === parentFieldId);
  if (!parent) {
    return fieldName;
  }

  return `${parent.field_path}.${fieldName}`;
}

/**
 * Validate field name format
 */
export function validateFieldName(fieldName: string): {
  valid: boolean;
  error?: string;
} {
  if (!fieldName) {
    return { valid: false, error: 'Field name is required' };
  }

  if (!/^[a-z][a-z0-9_]*$/.test(fieldName)) {
    return {
      valid: false,
      error: 'Field name must start with lowercase letter and contain only lowercase letters, numbers, and underscores',
    };
  }

  if (fieldName.length > 100) {
    return {
      valid: false,
      error: 'Field name must be 100 characters or less',
    };
  }

  // Reserved keywords
  const reserved = ['id', 'type', 'properties', 'required', 'default', 'enum'];
  if (reserved.includes(fieldName)) {
    return {
      valid: false,
      error: `"${fieldName}" is a reserved keyword. Please use a different name.`,
    };
  }

  return { valid: true };
}

/**
 * Check for duplicate field names at the same level
 */
export function checkDuplicateFieldName(
  fieldName: string,
  parentFieldId: string | undefined,
  existingFields: SchemaField[],
  excludeFieldId?: string
): boolean {
  return existingFields.some(
    (field) =>
      field.field_name === fieldName &&
      field.parent_field_id === parentFieldId &&
      field.id !== excludeFieldId
  );
}

/**
 * Export utilities
 */
export const conversionUtils = {
  fieldToJsonSchemaProperty,
  fieldsToJsonSchema,
  jsonSchemaPropertyToField,
  jsonSchemaToFields,
  validateJsonSchema,
  mergeValidationRules,
  generateFieldPath,
  validateFieldName,
  checkDuplicateFieldName,
};
