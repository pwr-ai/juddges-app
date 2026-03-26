/**
 * TypeScript types for RJSF v5 Integration
 *
 * Provides comprehensive type definitions for React JSON Schema Form (RJSF) v5
 * with custom extensions for Pydantic compatibility and schema field editing.
 */

import type { RJSFSchema, UiSchema, FieldProps, WidgetProps } from '@rjsf/utils';
// import type { FormValidation } from '@rjsf/core'; // Not available in this version

/**
 * Pydantic field types supported by the schema editor
 */
export type PydanticFieldType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'date'
  | 'datetime'
  | 'time'
  | 'email'
  | 'url'
  | 'uuid'
  | 'enum';

/**
 * Validation rules for schema fields
 */
export interface ValidationRules {
  // String validation
  pattern?: string;
  format?: 'email' | 'uri' | 'uuid' | 'date' | 'date-time' | 'time';
  minLength?: number;
  maxLength?: number;

  // Numeric validation
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array validation
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Object validation
  minProperties?: number;
  maxProperties?: number;

  // Enum validation
  enum?: Array<string | number | boolean>;

  // Custom validation
  const?: unknown;

  // Additional properties
  [key: string]: unknown;
}

/**
 * Visual metadata for field cards
 */
export interface VisualMetadata {
  color?: string;
  icon?: string;
  collapsed?: boolean;
  displayOrder?: number;
  group?: string;
  helpText?: string;
}

/**
 * Schema field structure matching database schema
 */
export interface SchemaField {
  id: string;
  schema_id?: string;
  session_id: string;

  // Field identity
  field_path: string;
  field_name: string;
  parent_field_id?: string;

  // Field definition
  field_type: PydanticFieldType;
  description?: string;
  is_required: boolean;

  // Validation
  validation_rules: ValidationRules;
  default_value?: string | number | boolean | null;

  // Positioning & Display
  position: number;
  visual_metadata: VisualMetadata;

  // Metadata
  created_by: 'ai' | 'user' | 'template';
  created_at?: string;
  updated_at?: string;
}

/**
 * Field editor form data (what gets edited in RJSF)
 */
export interface FieldEditorFormData {
  field_name: string;
  field_type: PydanticFieldType;
  description?: string;
  is_required: boolean;
  default_value?: string | number | boolean | null;
  validation_rules: ValidationRules;
  visual_metadata?: VisualMetadata;
}

/**
 * Custom widget props for Pydantic type selector
 */
export interface PydanticTypeWidgetProps extends WidgetProps {
  value: PydanticFieldType;
  onChange: (value: PydanticFieldType) => void;
}

/**
 * Custom widget props for validation rule builder
 */
export interface ValidationRulesWidgetProps extends WidgetProps {
  value: ValidationRules;
  onChange: (value: ValidationRules) => void;
  fieldType?: PydanticFieldType;
}

/**
 * Custom widget props for default value editor
 */
export interface DefaultValueWidgetProps extends WidgetProps {
  value: string | number | boolean | null | undefined;
  onChange: (value: string | number | boolean | null | undefined) => void;
  fieldType?: PydanticFieldType;
}

/**
 * Custom field template props
 */
export interface CustomFieldTemplateProps extends FieldProps {
  displayLabel: boolean;
  classNames: string;
  rawErrors?: string[];
  rawHelp?: string;
  rawDescription?: string;
}

/**
 * Error list template props
 */
export interface ErrorListTemplateProps {
  errors: Array<{
    stack: string;
    message?: string;
  }>;
  errorSchema?: any; // FormValidation type not available in this RJSF version
  schema?: RJSFSchema;
  uiSchema?: UiSchema;
}

/**
 * RJSF Theme configuration
 */
export interface RJSFThemeConfig {
  // Color mappings to shadcn/ui CSS variables
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    destructive: string;
    muted: string;
    background: string;
    foreground: string;
    border: string;
  };

  // Spacing system (matching Tailwind)
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };

  // Typography
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
    };
  };

  // Border radius
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
}

/**
 * Widget registry mapping Pydantic types to custom widgets
 */
export interface WidgetRegistry {
  PydanticTypeWidget: React.ComponentType<PydanticTypeWidgetProps>;
  ValidationRulesWidget: React.ComponentType<ValidationRulesWidgetProps>;
  DefaultValueWidget: React.ComponentType<DefaultValueWidgetProps>;
  DescriptionWidget: React.ComponentType<WidgetProps>;
}

/**
 * Field editor validation result
 */
export interface FieldEditorValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
  warnings?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Schema compilation result
 */
export interface SchemaCompilationResult {
  success: boolean;
  schema?: RJSFSchema;
  errors?: string[];
  warnings?: string[];
}

/**
 * Type guard for PydanticFieldType
 */
export function isPydanticFieldType(value: unknown): value is PydanticFieldType {
  const validTypes: PydanticFieldType[] = [
    'string', 'integer', 'number', 'boolean', 'array', 'object',
    'date', 'datetime', 'time', 'email', 'url', 'uuid', 'enum'
  ];
  return typeof value === 'string' && validTypes.includes(value as PydanticFieldType);
}

/**
 * Type guard for SchemaField
 */
export function isSchemaField(value: unknown): value is SchemaField {
  if (!value || typeof value !== 'object') return false;

  const field = value as Partial<SchemaField>;
  return (
    typeof field.id === 'string' &&
    typeof field.session_id === 'string' &&
    typeof field.field_name === 'string' &&
    typeof field.field_path === 'string' &&
    isPydanticFieldType(field.field_type) &&
    typeof field.is_required === 'boolean' &&
    typeof field.position === 'number'
  );
}

/**
 * Type-safe validation rules builder
 */
export class ValidationRulesBuilder {
  private rules: ValidationRules = {};

  // String validation
  pattern(regex: string): this {
    this.rules.pattern = regex;
    return this;
  }

  format(format: 'email' | 'uri' | 'uuid' | 'date' | 'date-time' | 'time'): this {
    this.rules.format = format;
    return this;
  }

  minLength(length: number): this {
    this.rules.minLength = length;
    return this;
  }

  maxLength(length: number): this {
    this.rules.maxLength = length;
    return this;
  }

  // Numeric validation
  minimum(value: number): this {
    this.rules.minimum = value;
    return this;
  }

  maximum(value: number): this {
    this.rules.maximum = value;
    return this;
  }

  multipleOf(value: number): this {
    this.rules.multipleOf = value;
    return this;
  }

  // Array validation
  minItems(count: number): this {
    this.rules.minItems = count;
    return this;
  }

  maxItems(count: number): this {
    this.rules.maxItems = count;
    return this;
  }

  uniqueItems(): this {
    this.rules.uniqueItems = true;
    return this;
  }

  // Enum validation
  enum(values: Array<string | number | boolean>): this {
    this.rules.enum = values;
    return this;
  }

  build(): ValidationRules {
    return { ...this.rules };
  }
}

/**
 * Export all types
 */
export type {
  RJSFSchema,
  UiSchema,
  FieldProps,
  WidgetProps,
  // FormValidation, // Not available in this RJSF version
};
