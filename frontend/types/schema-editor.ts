/**
 * Comprehensive TypeScript type definitions for the Schema Editor system.
 *
 * This file provides:
 * - Database types matching Supabase schema_fields and schema_versions tables
 * - UI state types for visual editor components
 * - JSON Schema type definitions
 * - Zod schemas for runtime validation
 * - Type guards and utility types
 *
 * @module types/schema-editor
 */

import { z } from 'zod';
import { Database, Json } from '../database.types';

// ============================================================================
// DATABASE TYPES
// ============================================================================

/**
 * Field type enum matching JSON Schema primitive types
 */
export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

/**
 * Editor mode enum
 */
export type EditorMode = 'ai' | 'visual' | 'code';

/**
 * Field creation source
 */
export type FieldCreatedBy = 'ai' | 'user' | 'template' | 'existing';

/**
 * Schema change type for version tracking
 */
export type SchemaChangeType = 'create' | 'ai_update' | 'visual_edit' | 'code_edit' | 'import';

/**
 * Schema field from schema_fields table.
 * Represents a single field in the extraction schema with all metadata.
 */
export interface SchemaField {
  /** Unique identifier for the field */
  id: string;

  /** Reference to extraction_schemas.id (null for draft/unsaved schemas) */
  schema_id: string | null;

  /** Session identifier for draft schemas */
  session_id: string;

  /** Dot-notation path (e.g., "root.party.name" for nested fields) */
  field_path: string;

  /** Display name of the field */
  field_name: string;

  /** Reference to parent field for nested structures */
  parent_field_id: string | null;

  /** JSON Schema type */
  field_type: FieldType;

  /** Field description for documentation and AI context */
  description: string | null;

  /** Whether this field is required in the schema */
  is_required: boolean;

  /** JSON object containing validation rules (pattern, minLength, enum, etc.) */
  validation_rules: ValidationRules;

  /** Default value for the field (stored as string, parsed based on type) */
  default_value: string | null;

  /** Display order (0-based index) */
  position: number;

  /** Visual metadata for editor UI (color, icon, collapsed state) */
  visual_metadata: VisualMetadata;

  /** Indicates how the field was created */
  created_by: FieldCreatedBy;

  /** Timestamp when field was created */
  created_at: string;

  /** Timestamp when field was last updated */
  updated_at: string;
}

/**
 * Insert type for creating new schema fields
 */
export interface SchemaFieldInsert extends Omit<SchemaField, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Update type for modifying existing schema fields
 */
export type SchemaFieldUpdate = Partial<Omit<SchemaField, 'id' | 'schema_id' | 'session_id' | 'created_at'>>;

/**
 * Schema version from schema_versions table.
 * Tracks change history and enables rollback functionality.
 */
export interface SchemaVersion {
  /** Unique identifier for the version */
  id: string;

  /** Reference to extraction_schemas.id */
  schema_id: string;

  /** Incremental version number */
  version_number: number;

  /** Complete JSON Schema snapshot at this version */
  schema_snapshot: Json;

  /** Complete array of all schema_fields at this version */
  field_snapshot: Json;

  /** Type of change that created this version */
  change_type: SchemaChangeType;

  /** Human-readable summary of what changed */
  change_summary: string | null;

  /** Array of field paths that were modified */
  changed_fields: string[];

  /** User who made the change (if authenticated) */
  user_id: string | null;

  /** Session identifier for tracking */
  session_id: string | null;

  /** Timestamp when version was created */
  created_at: string;
}

/**
 * Insert type for creating new schema versions
 */
export interface SchemaVersionInsert extends Omit<SchemaVersion, 'id' | 'created_at'> {
  id?: string;
  created_at?: string;
}

/**
 * Enhanced extraction schema type with visual editor metadata.
 * Extends the base extraction_schemas table with new fields.
 */
export interface ExtractionSchema {
  /** Unique identifier */
  id: string;

  /** Schema name */
  name: string;

  /** Schema description */
  description: string | null;

  /** Schema type */
  type: string;

  /** Schema category */
  category: string;

  /** JSON Schema definition (stored in 'text' column as JSONB) */
  text: Json;

  /** Date-related metadata */
  dates: Json;

  /** User who created the schema */
  userId: string | null;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;

  // New fields for visual editor (to be added via migration)

  /** Current schema version number */
  schema_version?: number;

  /** Visual editor metadata (canvas state, zoom level, etc.) */
  visual_metadata?: VisualMetadata;

  /** Last mode used to edit ('ai', 'visual', 'code') */
  last_edited_mode?: EditorMode;

  /** Cached count of top-level fields */
  field_count?: number;
}

// ============================================================================
// VALIDATION RULES
// ============================================================================

/**
 * Validation rules for schema fields.
 * Matches JSON Schema validation keywords.
 */
export interface ValidationRules {
  // String validation
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  format?: 'email' | 'uri' | 'date' | 'date-time' | 'uuid' | 'ipv4' | 'ipv6';

  // Number validation
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array validation
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  items?: JSONSchemaProperty;

  // Object validation
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  minProperties?: number;
  maxProperties?: number;

  // Enum validation
  enum?: (string | number | boolean)[];

  // Const value
  const?: string | number | boolean | null;

  // Conditional validation
  if?: JSONSchemaProperty;
  then?: JSONSchemaProperty;
  else?: JSONSchemaProperty;

  // Custom extensions
  [key: string]: unknown;
}

/**
 * Zod schema for validation rules
 */
export const validationRulesSchema = z.object({
  // String
  pattern: z.string(),
  minLength: z.number().int().nonnegative(),
  maxLength: z.number().int().nonnegative(),
  format: z.enum(['email', 'uri', 'date', 'date-time', 'uuid', 'ipv4', 'ipv6']),

  // Number
  minimum: z.number(),
  maximum: z.number(),
  exclusiveMinimum: z.number(),
  exclusiveMaximum: z.number(),
  multipleOf: z.number().positive(),

  // Array
  minItems: z.number().int().nonnegative(),
  maxItems: z.number().int().nonnegative(),
  uniqueItems: z.boolean(),
  items: z.record(z.string(), z.unknown()),

  // Object
  properties: z.record(z.string(), z.record(z.string(), z.unknown())),
  required: z.array(z.string()),
  additionalProperties: z.boolean(),
  minProperties: z.number().int().nonnegative(),
  maxProperties: z.number().int().nonnegative(),

  // Enum
  enum: z.array(z.union([z.string(), z.number(), z.boolean()])),

  // Const
  const: z.union([z.string(), z.number(), z.boolean(), z.null()]),

  // Allow custom extensions
}).partial().passthrough();

// ============================================================================
// VISUAL METADATA
// ============================================================================

/**
 * Visual metadata for UI display and editor state
 */
export interface VisualMetadata {
  /** Color coding for field type (hex color) */
  color?: string;

  /** Icon identifier (e.g., 'text', 'hash', 'calendar') */
  icon?: string;

  /** Whether the field is collapsed in nested view */
  collapsed?: boolean;

  /** Custom user notes about the field */
  notes?: string;

  /** Canvas position (for future graph view) */
  x?: number;
  y?: number;

  /** Visual grouping */
  group?: string;

  /** Custom tags */
  tags?: string[];

  /** Allow custom properties */
  [key: string]: unknown;
}

/**
 * Zod schema for visual metadata
 */
export const visualMetadataSchema = z.object({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string(),
  collapsed: z.boolean(),
  notes: z.string().max(1000),
  x: z.number(),
  y: z.number(),
  group: z.string(),
  tags: z.array(z.string()),
}).partial().passthrough();

// ============================================================================
// JSON SCHEMA TYPES
// ============================================================================

/**
 * JSON Schema property definition
 */
export interface JSONSchemaProperty {
  type?: FieldType | FieldType[];
  title?: string;
  description?: string;
  default?: unknown;

  // Validation
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  enum?: (string | number | boolean)[];
  const?: string | number | boolean | null;

  // Array-specific
  items?: JSONSchemaProperty;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Object-specific
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProperty;
  minProperties?: number;
  maxProperties?: number;

  // Conditional
  if?: JSONSchemaProperty;
  then?: JSONSchemaProperty;
  else?: JSONSchemaProperty;
  allOf?: JSONSchemaProperty[];
  anyOf?: JSONSchemaProperty[];
  oneOf?: JSONSchemaProperty[];
  not?: JSONSchemaProperty;

  // Custom extensions
  [key: string]: unknown;
}

/**
 * Complete JSON Schema document
 */
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  definitions?: Record<string, JSONSchemaProperty>;
  $defs?: Record<string, JSONSchemaProperty>;

  [key: string]: unknown;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Props for FieldCard component
 */
export interface FieldCardProps {
  /** The field to display */
  field: SchemaField;

  /** Handler when field is clicked for editing */
  onEdit: (field: SchemaField) => void;

  /** Handler when field delete is requested */
  onDelete: (fieldId: string) => void;

  /** Whether this field should be visually highlighted (e.g., AI-created) */
  isHighlighted?: boolean;

  /** Whether the field is currently being dragged */
  isDragging?: boolean;

  /** Whether the field is selected */
  isSelected?: boolean;

  /** Depth level for nested fields (0 for root) */
  depth?: number;

  /** Whether this is a nested field view */
  isNested?: boolean;

  /** Child fields for nested objects */
  children?: SchemaField[];
}

/**
 * Props for FieldEditor modal component
 */
export interface FieldEditorProps {
  /** Field being edited (null for creating new field) */
  field: SchemaField | null;

  /** Handler when field is saved */
  onSave: (updates: SchemaFieldInsert | SchemaFieldUpdate) => Promise<void>;

  /** Handler when editing is cancelled */
  onCancel: () => void;

  /** Whether the modal is open */
  isOpen: boolean;

  /** Available parent fields for nesting */
  availableParents?: SchemaField[];

  /** Current session ID */
  sessionId: string;

  /** Read-only mode */
  readOnly?: boolean;
}

/**
 * Validation state for the schema
 */
export interface ValidationState {
  /** Whether the schema is currently valid */
  isValid: boolean;

  /** Array of validation errors */
  errors: ValidationError[];

  /** Array of validation warnings (non-blocking) */
  warnings: ValidationWarning[];

  /** Timestamp of last validation */
  lastValidated: string | null;

  /** Whether validation is in progress */
  isValidating: boolean;
}

/**
 * Validation error detail
 */
export interface ValidationError {
  /** Error identifier */
  id: string;

  /** Field path where error occurred */
  fieldPath: string | null;

  /** Error message */
  message: string;

  /** Error severity */
  severity: 'error';

  /** Error code for programmatic handling */
  code?: string;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Validation warning detail
 */
export interface ValidationWarning {
  /** Warning identifier */
  id: string;

  /** Field path where warning occurred */
  fieldPath: string | null;

  /** Warning message */
  message: string;

  /** Warning severity */
  severity: 'warning';

  /** Warning code for programmatic handling */
  code?: string;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Optimistic update state for immediate UI feedback
 */
export interface OptimisticUpdate {
  /** Unique identifier for the update operation */
  id: string;

  /** Type of operation */
  operation: 'create' | 'update' | 'delete' | 'reorder';

  /** Field ID being operated on */
  fieldId: string;

  /** Previous state for rollback */
  previousState: SchemaField | null;

  /** New state being applied */
  newState: SchemaField | null;

  /** Timestamp when update was initiated */
  timestamp: string;

  /** Whether the update succeeded */
  status: 'pending' | 'success' | 'failed';

  /** Error message if failed */
  error?: string;
}

/**
 * Field path type for type-safe field references
 * Examples: "root", "root.party", "root.party.name"
 */
export type FieldPath = string & { __brand: 'FieldPath' };

/**
 * Schema compilation result
 */
export interface SchemaCompilationResult {
  /** Whether compilation succeeded */
  success: boolean;

  /** Compiled JSON Schema (if successful) */
  schema: JSONSchema | null;

  /** Compilation errors */
  errors: ValidationError[];

  /** Compilation warnings */
  warnings: ValidationWarning[];

  /** Metadata about the compilation */
  metadata: {
    fieldCount: number;
    nestedLevels: number;
    compiledAt: string;
  };
}

/**
 * Schema diff result for tracking changes
 */
export interface SchemaDiff {
  /** Fields that were added */
  added: SchemaField[];

  /** Fields that were modified */
  modified: Array<{
    field: SchemaField;
    changes: Partial<SchemaField>;
  }>;

  /** Fields that were deleted */
  deleted: SchemaField[];

  /** Fields that were reordered */
  reordered: Array<{
    fieldId: string;
    oldPosition: number;
    newPosition: number;
  }>;
}

/**
 * Canvas pane state
 */
export interface CanvasState {
  /** Zoom level (0.5 to 2.0) */
  zoom: number;

  /** Pan offset */
  panX: number;
  panY: number;

  /** Selected field IDs */
  selectedFieldIds: string[];

  /** Collapsed field IDs (for nested structures) */
  collapsedFieldIds: string[];

  /** Filter criteria */
  filter: {
    searchQuery?: string;
    fieldType?: FieldType;
    createdBy?: FieldCreatedBy;
    hasValidationErrors?: boolean;
  };

  /** Sort configuration */
  sort: {
    by: 'position' | 'name' | 'type' | 'created_at';
    direction: 'asc' | 'desc';
  };
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

/**
 * Field type enum schema
 */
export const fieldTypeSchema = z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

/**
 * Editor mode schema
 */
export const editorModeSchema = z.enum(['ai', 'visual', 'code']);

/**
 * Field created by schema
 */
export const fieldCreatedBySchema = z.enum(['ai', 'user', 'template', 'existing']);

/**
 * Schema change type schema
 */
export const schemaChangeTypeSchema = z.enum(['create', 'ai_update', 'visual_edit', 'code_edit', 'import']);

/**
 * Field path schema
 */
export const fieldPathSchema = z.string()
  .min(1, 'Field path cannot be empty')
  .regex(/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/i, 'Invalid field path format')
  .transform((val) => val as FieldPath);

/**
 * Schema field validation schema
 */
export const schemaFieldSchema = z.object({
  id: z.string().uuid(),
  schema_id: z.string().uuid().nullable(),
  session_id: z.string().min(1),
  field_path: fieldPathSchema,
  field_name: z.string()
    .min(1, 'Field name is required')
    .max(255, 'Field name too long')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid field name format'),
  parent_field_id: z.string().uuid().nullable(),
  field_type: fieldTypeSchema,
  description: z.string().max(1000).nullable(),
  is_required: z.boolean(),
  validation_rules: validationRulesSchema,
  default_value: z.string().nullable(),
  position: z.number().int().nonnegative(),
  visual_metadata: visualMetadataSchema,
  created_by: fieldCreatedBySchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Schema field insert validation schema
 */
export const schemaFieldInsertSchema = schemaFieldSchema
  .omit({ id: true, created_at: true, updated_at: true })
  .extend({
    id: z.string().uuid(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }).partial({ id: true, created_at: true, updated_at: true });

/**
 * Schema field update validation schema
 */
export const schemaFieldUpdateSchema = schemaFieldSchema
  .omit({ id: true, schema_id: true, session_id: true, created_at: true })
  .partial();

/**
 * Schema version validation schema
 */
export const schemaVersionSchema = z.object({
  id: z.string().uuid(),
  schema_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  schema_snapshot: z.record(z.string(), z.unknown()),
  field_snapshot: z.array(z.record(z.string(), z.unknown())),
  change_type: schemaChangeTypeSchema,
  change_summary: z.string().max(500).nullable(),
  changed_fields: z.array(z.string()),
  user_id: z.string().uuid().nullable(),
  session_id: z.string().nullable(),
  created_at: z.string().datetime(),
});

/**
 * Validation state schema
 */
export const validationStateSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.object({
    id: z.string(),
    fieldPath: z.string().nullable(),
    message: z.string(),
    severity: z.literal('error'),
    code: z.string(),
    context: z.record(z.string(), z.unknown()),
  }).partial({ code: true, context: true })),
  warnings: z.array(z.object({
    id: z.string(),
    fieldPath: z.string().nullable(),
    message: z.string(),
    severity: z.literal('warning'),
    code: z.string(),
    context: z.record(z.string(), z.unknown()),
  }).partial({ code: true, context: true })),
  lastValidated: z.string().datetime().nullable(),
  isValidating: z.boolean(),
});

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a value is a valid field type
 */
export function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' &&
    ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'].includes(value);
}

/**
 * Type guard to check if a value is a valid editor mode
 */
export function isEditorMode(value: unknown): value is EditorMode {
  return typeof value === 'string' && ['ai', 'visual', 'code'].includes(value);
}

/**
 * Type guard to check if a field is nested (has a parent)
 */
export function isNestedField(field: SchemaField): boolean {
  return field.parent_field_id !== null;
}

/**
 * Type guard to check if a field is an object type
 */
export function isObjectField(field: SchemaField): boolean {
  return field.field_type === 'object';
}

/**
 * Type guard to check if a field is an array type
 */
export function isArrayField(field: SchemaField): boolean {
  return field.field_type === 'array';
}

/**
 * Type guard to check if a field is a primitive type
 */
export function isPrimitiveField(field: SchemaField): boolean {
  return ['string', 'number', 'integer', 'boolean', 'null'].includes(field.field_type);
}

/**
 * Type guard to check if a field has validation rules
 */
export function hasValidationRules(field: SchemaField): boolean {
  return Object.keys(field.validation_rules).length > 0;
}

/**
 * Type guard to check if a value is a SchemaField
 */
export function isSchemaField(value: unknown): value is SchemaField {
  if (typeof value !== 'object' || value === null) return false;

  const result = schemaFieldSchema.safeParse(value);
  return result.success;
}

/**
 * Type guard to check if a value is a ValidationState
 */
export function isValidationState(value: unknown): value is ValidationState {
  if (typeof value !== 'object' || value === null) return false;

  const result = validationStateSchema.safeParse(value);
  return result.success;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Deep partial type for nested updates
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract field names from a schema
 */
export type ExtractFieldNames<T extends SchemaField[]> = T[number]['field_name'];

/**
 * Readonly schema field (for display purposes)
 */
export type ReadonlySchemaField = Readonly<SchemaField>;

/**
 * Mutable schema field (for editing)
 */
export type MutableSchemaField = SchemaField;

/**
 * Field with children (for nested display)
 */
export interface FieldWithChildren extends SchemaField {
  children: FieldWithChildren[];
}

/**
 * Flat field list
 */
export type FlatFieldList = SchemaField[];

/**
 * Nested field tree
 */
export type NestedFieldTree = FieldWithChildren[];

// ============================================================================
// HELPER TYPE UTILITIES
// ============================================================================

/**
 * Branded type helper for field paths
 */
export function createFieldPath(path: string): FieldPath {
  const result = fieldPathSchema.safeParse(path);
  if (!result.success) {
    throw new Error(`Invalid field path: ${path}`);
  }
  return result.data;
}

/**
 * Parse field path into segments
 */
export function parseFieldPath(path: FieldPath): string[] {
  return path.split('.');
}

/**
 * Get parent path from field path
 */
export function getParentPath(path: FieldPath): FieldPath | null {
  const segments = parseFieldPath(path);
  if (segments.length <= 1) return null;
  return segments.slice(0, -1).join('.') as FieldPath;
}

/**
 * Get field name from path
 */
export function getFieldNameFromPath(path: FieldPath): string {
  const segments = parseFieldPath(path);
  return segments[segments.length - 1];
}

/**
 * Build field path from segments
 */
export function buildFieldPath(...segments: string[]): FieldPath {
  return createFieldPath(segments.join('.'));
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default type colors for visual editor
 */
export const TYPE_COLORS: Record<FieldType, string> = {
  string: '#3b82f6',    // blue
  number: '#10b981',    // green
  integer: '#059669',   // darker green
  boolean: '#8b5cf6',   // purple
  array: '#f59e0b',     // orange
  object: '#14b8a6',    // teal
  null: '#6b7280',      // gray
} as const;

/**
 * Default icons for field types
 */
export const TYPE_ICONS: Record<FieldType, string> = {
  string: 'text',
  number: 'hash',
  integer: 'hash',
  boolean: 'toggle',
  array: 'list',
  object: 'box',
  null: 'minus-circle',
} as const;

/**
 * Maximum nesting depth for fields
 */
export const MAX_NESTING_DEPTH = 5;

/**
 * Maximum number of fields per schema
 */
export const MAX_FIELDS_PER_SCHEMA = 100;

/**
 * Auto-save debounce time in milliseconds
 */
export const AUTO_SAVE_DEBOUNCE_MS = 500;

/**
 * Default validation rules for common field types
 */
export const DEFAULT_VALIDATION_RULES: Record<FieldType, ValidationRules> = {
  string: {},
  number: {},
  integer: {},
  boolean: {},
  array: { items: { type: 'string' } },
  object: { additionalProperties: false },
  null: {},
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

// Re-export all types for convenience
export type {
  // Database types
  Database,
  Json,

  // Core types
  SchemaField as Field,
  SchemaFieldInsert as FieldInsert,
  SchemaFieldUpdate as FieldUpdate,
  SchemaVersion as Version,
  ExtractionSchema as Schema,

  // UI types
  ValidationState as Validation,
  OptimisticUpdate as OptimisticOp,
  SchemaDiff as Diff,
};
