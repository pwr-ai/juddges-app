/**
 * Schema Editor Hooks
 *
 * Centralized export for all schema editor state management hooks.
 *
 * @module hooks/schema-editor
 */

// Core store
export { useSchemaEditorStore } from './useSchemaEditorStore';

// Real-time sync
export {
  useSupabaseSync,
  useDebouncedSync,
  type ConnectionState,
  type SyncError,
  type UseSupabaseSyncOptions,
  type UseSupabaseSyncReturn,
} from './useSupabaseSync';

// Validation
export {
  useFieldValidation,
  useDebouncedValidation,
  type UseFieldValidationReturn,
} from './useFieldValidation';

// Undo/Redo
export {
  useUndoRedo,
  useScopedUndoRedo,
} from './useUndoRedo';

// Types
export type {
  SchemaField,
  FieldType,
  FieldCreatedBy,
  ValidationRules,
  FieldVisualMetadata,
  OptimisticUpdate,
  ValidationError,
  BackendValidationResponse,
  SchemaMetadata,
  ConflictResolution,
  SyncEvent,
} from './types';
