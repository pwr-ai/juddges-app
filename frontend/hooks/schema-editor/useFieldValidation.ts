/**
 * Field validation hook for Schema Editor.
 *
 * This hook provides comprehensive validation for schema fields including:
 * - Client-side Zod schema validation
 * - Backend Pydantic validation integration
 * - Real-time error display
 * - Field name uniqueness checks
 * - JSON Schema compatibility validation
 *
 * Features:
 * - Multi-layer validation (client + backend)
 * - Async validation with debouncing
 * - Field-level and schema-level validation
 * - Detailed error messages with field paths
 * - Validation caching for performance
 *
 * @example
 * ```typescript
 * import { useFieldValidation } from '@/hooks/schema-editor/useFieldValidation';
 *
 * function FieldEditor({ field }) {
 *   const { validateField, validateSchema, errors, isValidating } = useFieldValidation();
 *
 *   const handleSave = async () => {
 *     const isValid = await validateField(field);
 *     if (isValid) {
 *       await saveField(field);
 *     }
 *   };
 *
 *   // Render field editor with validation errors
 * }
 * ```
 */

import { useCallback, useState, useRef } from 'react';
import { z } from 'zod';
import { useSchemaEditorStore } from './useSchemaEditorStore';
import logger from '@/lib/logger';
import type {
  SchemaField,
  ValidationError,
  ValidationRules,
  BackendValidationResponse,
} from './types';

const validationLogger = logger.child('fieldValidation');

/**
 * Zod schema for field name validation
 *
 * Field names must:
 * - Start with a letter or underscore
 * - Contain only letters, numbers, and underscores
 * - Be 1-100 characters long
 */
const fieldNameSchema = z
  .string()
  .min(1, 'Field name is required')
  .max(100, 'Field name must be at most 100 characters')
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    'Field name must start with a letter or underscore and contain only letters, numbers, and underscores'
  );

/**
 * Zod schema for field description
 */
const descriptionSchema = z
  .string()
  .max(1000, 'Description must be at most 1000 characters')
  .optional()
  .nullable();

/**
 * Zod schema for validation rules
 */
const validationRulesSchema = z
  .object({
    // String validation
    pattern: z.string().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),

    // Number validation
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    exclusiveMinimum: z.number().optional(),
    exclusiveMaximum: z.number().optional(),
    multipleOf: z.number().positive().optional(),

    // Array validation
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().nonnegative().optional(),
    uniqueItems: z.boolean().optional(),

    // Object validation
    minProperties: z.number().int().nonnegative().optional(),
    maxProperties: z.number().int().nonnegative().optional(),

    // Enum validation
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .passthrough() // Allow additional properties
  .refine(
    (data) => {
      // Validate that min < max
      if (data.minLength !== undefined && data.maxLength !== undefined) {
        return data.minLength <= data.maxLength;
      }
      if (data.minimum !== undefined && data.maximum !== undefined) {
        return data.minimum <= data.maximum;
      }
      if (data.minItems !== undefined && data.maxItems !== undefined) {
        return data.minItems <= data.maxItems;
      }
      if (data.minProperties !== undefined && data.maxProperties !== undefined) {
        return data.minProperties <= data.maxProperties;
      }
      return true;
    },
    {
      message: 'Minimum value must be less than or equal to maximum value',
    }
  );

/**
 * Zod schema for complete field validation
 */
const fieldSchema = z.object({
  field_name: fieldNameSchema,
  field_type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: descriptionSchema,
  is_required: z.boolean(),
  validation_rules: validationRulesSchema,
});

function validateTypeSpecificRules(field: SchemaField): ValidationError[] {
  const errors: ValidationError[] = [];
  const rules = field.validation_rules;

  switch (field.field_type) {
    case 'string':
      if (rules.minimum !== undefined || rules.maximum !== undefined) {
        errors.push({
          fieldId: field.id,
          fieldPath: field.field_path,
          message: 'Minimum/maximum are not valid for string fields (use minLength/maxLength)',
          severity: 'warning',
          source: 'zod',
        });
      }
      break;
    case 'number':
      if (rules.minLength !== undefined || rules.maxLength !== undefined) {
        errors.push({
          fieldId: field.id,
          fieldPath: field.field_path,
          message: 'minLength/maxLength are not valid for number fields (use minimum/maximum)',
          severity: 'warning',
          source: 'zod',
        });
      }
      if (rules.pattern !== undefined) {
        errors.push({
          fieldId: field.id,
          fieldPath: field.field_path,
          message: 'Pattern is not valid for number fields',
          severity: 'warning',
          source: 'zod',
        });
      }
      break;
    case 'boolean':
      if (
        rules.minLength !== undefined ||
        rules.maxLength !== undefined ||
        rules.minimum !== undefined ||
        rules.maximum !== undefined ||
        rules.pattern !== undefined
      ) {
        errors.push({
          fieldId: field.id,
          fieldPath: field.field_path,
          message: 'Boolean fields do not support length or range validation',
          severity: 'warning',
          source: 'zod',
        });
      }
      break;
    case 'array':
      if (rules.minLength !== undefined || rules.maxLength !== undefined) {
        errors.push({
          fieldId: field.id,
          fieldPath: field.field_path,
          message: 'Use minItems/maxItems for array fields instead of minLength/maxLength',
          severity: 'warning',
          source: 'zod',
        });
      }
      break;
    case 'object':
      if (rules.minLength !== undefined || rules.maxLength !== undefined) {
        errors.push({
          fieldId: field.id,
          fieldPath: field.field_path,
          message: 'Use minProperties/maxProperties for object fields',
          severity: 'warning',
          source: 'zod',
        });
      }
      break;
  }

  return errors;
}

function compileFieldsToJsonSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  const rootFields = fields.filter((f) => !f.parent_field_id);

  rootFields.forEach((field) => {
    const fieldSchema: Record<string, unknown> = {
      type: field.field_type,
      description: field.description || undefined,
      ...field.validation_rules,
    };

    if (field.field_type === 'object') {
      const childFields = fields.filter((f) => f.parent_field_id === field.id);
      if (childFields.length > 0) {
        const nested = compileFieldsToJsonSchema(childFields);
        fieldSchema.properties = nested.properties;
        if (nested.required && (nested.required as string[]).length > 0) {
          fieldSchema.required = nested.required;
        }
      }
    }

    properties[field.field_name] = fieldSchema;

    if (field.is_required) {
      required.push(field.field_name);
    }
  });

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Hook return value
 */
export interface UseFieldValidationReturn {
  /** Validate a single field */
  validateField: (field: SchemaField) => Promise<boolean>;

  /** Validate field name uniqueness */
  validateFieldName: (
    fieldName: string,
    parentId?: string | null,
    excludeFieldId?: string
  ) => boolean;

  /** Validate entire schema against backend */
  validateSchema: () => Promise<boolean>;

  /** Clear validation errors for a field */
  clearFieldErrors: (fieldId: string) => void;

  /** Clear all validation errors */
  clearAllErrors: () => void;

  /** Get validation errors for a field */
  getFieldErrors: (fieldId: string) => ValidationError[];

  /** Whether validation is in progress */
  isValidating: boolean;

  /** Map of field IDs to validation errors */
  validationErrorsMap: Record<string, ValidationError[]>;
}

/**
 * Custom hook for field validation
 */
export function useFieldValidation(): UseFieldValidationReturn {
  // Zustand store
  const {
    fields,
    validationErrors,
    setValidationErrors,
    addValidationError,
    clearFieldValidationErrors,
    clearAllValidationErrors,
    getFieldValidationErrors,
    isFieldNameUnique,
  } = useSchemaEditorStore();

  // Local state
  const [isValidating, setIsValidating] = useState(false);

  // Validation cache (to prevent duplicate validation calls)
  const validationCacheRef = useRef<Map<string, { timestamp: number; result: boolean }>>(
    new Map()
  );

  /**
   * Convert Zod errors to ValidationError format
   */
  const convertZodErrors = useCallback(
    (fieldId: string, fieldPath: string, zodError: z.ZodError): ValidationError[] => {
      return zodError.issues.map((err) => ({
        fieldId,
        fieldPath: `${fieldPath}.${err.path.join('.')}`,
        message: err.message,
        severity: 'error' as const,
        source: 'zod' as const,
      }));
    },
    []
  );

  /**
   * Validate field name uniqueness
   */
  const validateFieldName = useCallback(
    (
      fieldName: string,
      parentId?: string | null,
      excludeFieldId?: string
    ): boolean => {
      // Validate format first
      const formatResult = fieldNameSchema.safeParse(fieldName);
      if (!formatResult.success) {
        return false;
      }

      // Check uniqueness
      return isFieldNameUnique(fieldName, parentId, excludeFieldId);
    },
    [isFieldNameUnique]
  );

  /**
   * Validate a single field
   *
   * Performs client-side Zod validation and checks field name uniqueness.
   */
  const validateField = useCallback(
    async (field: SchemaField): Promise<boolean> => {
      validationLogger.debug('Validating field', {
        fieldId: field.id,
        fieldName: field.field_name,
      });

      // Clear existing errors for this field
      clearFieldValidationErrors(field.id);

      // Check cache (valid for 5 seconds)
      const cached = validationCacheRef.current.get(field.id);
      if (cached && Date.now() - cached.timestamp < 5000) {
        validationLogger.debug('Using cached validation result', { fieldId: field.id });
        return cached.result;
      }

      let isValid = true;

      // 1. Validate field structure with Zod
      const fieldValidation = fieldSchema.safeParse({
        field_name: field.field_name,
        field_type: field.field_type,
        description: field.description,
        is_required: field.is_required,
        validation_rules: field.validation_rules,
      });

      if (!fieldValidation.success) {
        const errors = convertZodErrors(
          field.id,
          field.field_path,
          fieldValidation.error
        );
        errors.forEach((err) => addValidationError(err));
        isValid = false;

        validationLogger.debug('Zod validation failed', {
          fieldId: field.id,
          errors: errors.length,
        });
      }

      // 2. Validate field name uniqueness
      if (!isFieldNameUnique(field.field_name, field.parent_field_id, field.id)) {
        const error: ValidationError = {
          fieldId: field.id,
          fieldPath: field.field_path,
          message: `Field name "${field.field_name}" already exists at this level`,
          severity: 'error',
          source: 'zod',
        };
        addValidationError(error);
        isValid = false;

        validationLogger.debug('Field name uniqueness validation failed', {
          fieldId: field.id,
          fieldName: field.field_name,
        });
      }

      // 3. Validate type-specific rules
      const typeValidationErrors = validateTypeSpecificRules(field);
      if (typeValidationErrors.length > 0) {
        typeValidationErrors.forEach((err) => addValidationError(err));
        isValid = false;

        validationLogger.debug('Type-specific validation failed', {
          fieldId: field.id,
          errors: typeValidationErrors.length,
        });
      }

      // Cache result
      validationCacheRef.current.set(field.id, {
        timestamp: Date.now(),
        result: isValid,
      });

      validationLogger.debug('Field validation complete', {
        fieldId: field.id,
        isValid,
      });

      return isValid;
    },
    [
      clearFieldValidationErrors,
      addValidationError,
      isFieldNameUnique,
      convertZodErrors,
    ]
  );

  /**
   * Validate entire schema against backend
   *
   * Compiles all fields to JSON Schema and validates with backend Pydantic validation.
   */
  const validateSchema = useCallback(async (): Promise<boolean> => {
    if (fields.length === 0) {
      validationLogger.debug('No fields to validate');
      return true;
    }

    setIsValidating(true);
    validationLogger.debug('Validating schema with backend', { fieldCount: fields.length });

    try {
      // 1. Validate all fields individually first
      const fieldValidations = await Promise.all(
        fields.map((field) => validateField(field))
      );

      if (fieldValidations.some((valid) => !valid)) {
        validationLogger.debug('Client-side validation failed');
        setIsValidating(false);
        return false;
      }

      // 2. Compile fields to JSON Schema
      const jsonSchema = compileFieldsToJsonSchema(fields);

      // 3. Call backend validation endpoint
      const response = await fetch('/api/schemas/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schema: jsonSchema }),
      });

      if (!response.ok) {
        throw new Error(`Backend validation failed: ${response.statusText}`);
      }

      const result: BackendValidationResponse = await response.json();

      // 4. Process backend errors
      if (!result.valid) {
        validationLogger.debug('Backend validation failed', {
          errors: result.errors.length,
        });

        // Convert backend errors to ValidationError format
        result.errors.forEach((errorMsg, index) => {
          const error: ValidationError = {
            fieldId: 'schema', // Global error
            fieldPath: 'schema',
            message: errorMsg,
            severity: 'error',
            source: 'backend',
          };
          addValidationError(error);
        });

        setIsValidating(false);
        return false;
      }

      // 5. Process backend warnings
      if (result.warnings && result.warnings.length > 0) {
        validationLogger.debug('Backend validation warnings', {
          warnings: result.warnings.length,
        });

        result.warnings.forEach((warningMsg) => {
          const warning: ValidationError = {
            fieldId: 'schema',
            fieldPath: 'schema',
            message: warningMsg,
            severity: 'warning',
            source: 'backend',
          };
          addValidationError(warning);
        });
      }

      validationLogger.debug('Schema validation successful');
      setIsValidating(false);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Schema validation failed';
      validationLogger.error('Schema validation error', { error });

      const validationError: ValidationError = {
        fieldId: 'schema',
        fieldPath: 'schema',
        message,
        severity: 'error',
        source: 'backend',
      };
      addValidationError(validationError);

      setIsValidating(false);
      return false;
    }
  }, [fields, validateField, addValidationError]);

  /**
   * Clear validation errors for a field
   */
  const clearFieldErrors = useCallback(
    (fieldId: string) => {
      clearFieldValidationErrors(fieldId);
      validationCacheRef.current.delete(fieldId);
    },
    [clearFieldValidationErrors]
  );

  /**
   * Clear all validation errors
   */
  const clearAllErrors = useCallback(() => {
    clearAllValidationErrors();
    validationCacheRef.current.clear();
  }, [clearAllValidationErrors]);

  /**
   * Get validation errors for a field
   */
  const getFieldErrors = useCallback(
    (fieldId: string) => {
      return getFieldValidationErrors(fieldId);
    },
    [getFieldValidationErrors]
  );

  /**
   * Create validation errors map
   */
  const validationErrorsMap = validationErrors.reduce((map, error) => {
    if (!map[error.fieldId]) {
      map[error.fieldId] = [];
    }
    map[error.fieldId].push(error);
    return map;
  }, {} as Record<string, ValidationError[]>);

  return {
    validateField,
    validateFieldName,
    validateSchema,
    clearFieldErrors,
    clearAllErrors,
    getFieldErrors,
    isValidating,
    validationErrorsMap,
  };
}

/**
 * Debounced validation helper
 *
 * Use this to debounce validation calls for better UX (e.g., on input change).
 *
 * @example
 * ```typescript
 * const { debouncedValidate } = useDebouncedValidation(300);
 *
 * const handleNameChange = (name: string) => {
 *   updateField(field.id, { field_name: name });
 *   debouncedValidate(field);
 * };
 * ```
 */
export function useDebouncedValidation(delay = 300) {
  const { validateField } = useFieldValidation();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedValidate = useCallback(
    (field: SchemaField) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        validateField(field);
      }, delay);
    },
    [validateField, delay]
  );

  return { debouncedValidate };
}
