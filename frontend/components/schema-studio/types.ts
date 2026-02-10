/**
 * Type definitions for the Schema Studio visual editor
 *
 * These types define the core data structures used throughout the visual schema editor,
 * including field definitions, validation rules, and component props.
 */

/**
 * Supported field types in the schema editor
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * Who created the field
 */
export type FieldCreator = 'ai' | 'user' | 'template';

/**
 * Visual metadata for field cards
 */
export interface FieldVisualMetadata {
  /** Custom color for the field card (overrides type-based color) */
  color?: string;
  /** Icon name to display with the field */
  icon?: string;
  /** Whether the field (if object/array) is collapsed in the UI */
  collapsed?: boolean;
}

/**
 * Validation rules for a schema field
 *
 * These rules are stored as JSONB and can include any JSON Schema validation
 */
export interface ValidationRules {
  /** Regex pattern for string validation */
  pattern?: string;
  /** Minimum length for strings */
  minLength?: number;
  /** Maximum length for strings */
  maxLength?: number;
  /** Minimum value for numbers */
  minimum?: number;
  /** Maximum value for numbers */
  maximum?: number;
  /** Enum values for dropdown selection */
  enum?: string[];
  /** Additional JSON Schema properties */
  [key: string]: unknown;
}

/**
 * Core schema field definition
 *
 * Represents a single field in the extraction schema, stored in the `schema_fields` table
 */
export interface SchemaField {
  /** Unique identifier */
  id: string;
  /** Reference to parent schema (if saved) */
  schema_id?: string;
  /** Session identifier for draft/unsaved fields */
  session_id: string;

  /** Dot-notation path for nested fields (e.g., "root.party.name") */
  field_path: string;
  /** Display name of the field */
  field_name: string;
  /** Reference to parent field for nested structures */
  parent_field_id?: string;

  /** Type of the field */
  field_type: FieldType;
  /** Human-readable description */
  description?: string;
  /** Whether the field is required in the schema */
  is_required: boolean;

  /** Validation rules as JSON */
  validation_rules: ValidationRules;
  /** Default value for the field */
  default_value?: string;

  /** Position/order in the field list */
  position: number;
  /** Visual display metadata */
  visual_metadata: FieldVisualMetadata;

  /** Who created this field */
  created_by: FieldCreator;
  /** Creation timestamp */
  created_at?: string;
  /** Last update timestamp */
  updated_at?: string;
}

/**
 * Type color mappings for visual representation
 */
export const TYPE_COLORS: Record<FieldType, string> = {
  string: '#3b82f6',   // blue
  number: '#10b981',   // green
  boolean: '#8b5cf6',  // purple
  array: '#f59e0b',    // orange
  object: '#14b8a6'    // teal
} as const;

/**
 * Chat message in the schema conversation
 */
export interface SchemaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Schema changes made in this message */
  schema?: Record<string, unknown>;
  /** Field IDs affected by this message */
  affected_fields?: string[];
}

/**
 * Schema validation result from backend
 */
export interface SchemaValidationResult {
  /** Whether the schema is valid */
  valid: boolean;
  /** Validation error messages */
  errors: string[];
  /** Warning messages (non-blocking) */
  warnings: string[];
  /** Compiled schema if valid */
  compiled_schema?: Record<string, unknown>;
}

/**
 * Schema metadata (from extraction_schemas table)
 */
export interface SchemaMetadata {
  id?: string;
  name: string;
  description?: string;
  collection_id?: string;
  schema_version: number;
  field_count: number;
  last_edited_mode: 'ai' | 'visual' | 'code';
  created_at?: string;
  updated_at?: string;
}
