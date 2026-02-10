/**
 * Zustand store for Schema Editor state management.
 *
 * This store manages the complete state of the visual schema editor including:
 * - Schema fields collection
 * - Selected field tracking
 * - Edit mode state
 * - Optimistic updates queue
 * - Validation errors
 * - Metadata
 *
 * @example
 * ```typescript
 * import { useSchemaEditorStore } from '@/hooks/schema-editor/useSchemaEditorStore';
 *
 * function MyComponent() {
 *   const { fields, addField, updateField } = useSchemaEditorStore();
 *
 *   const handleAddField = () => {
 *     addField({
 *       field_name: 'new_field',
 *       field_type: 'string',
 *       is_required: false,
 *       // ... other properties
 *     });
 *   };
 *
 *   // Render fields
 * }
 * ```
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';
import type {
  SchemaField,
  OptimisticUpdate,
  ValidationError,
  SchemaMetadata,
} from './types';

const storeLogger = logger.child('schemaEditorStore');

/**
 * Schema Editor Store State
 */
interface SchemaEditorState {
  // ============================================================================
  // State Properties
  // ============================================================================

  /** Current session identifier */
  sessionId: string | null;

  /** Current schema identifier (null for unsaved schemas) */
  schemaId: string | null;

  /** Collection of schema fields */
  fields: SchemaField[];

  /** Currently selected field for editing */
  selectedField: SchemaField | null;

  /** Whether store has unsaved changes */
  isDirty: boolean;

  /** Whether save operation is in progress */
  isSaving: boolean;

  /** Whether fields are being loaded from database */
  isLoading: boolean;

  /** Queue of pending optimistic updates */
  optimisticUpdates: OptimisticUpdate[];

  /** Current validation errors */
  validationErrors: ValidationError[];

  /** Schema metadata */
  metadata: SchemaMetadata;

  /** Last error message */
  lastError: string | null;

  // ============================================================================
  // Session Management Actions
  // ============================================================================

  /**
   * Initialize a new editing session
   *
   * @param sessionId - Unique session identifier
   * @param schemaId - Optional existing schema ID
   */
  initializeSession: (sessionId: string, schemaId?: string | null) => void;

  /**
   * Clear all session data and reset to initial state
   */
  clearSession: () => void;

  // ============================================================================
  // Field Management Actions
  // ============================================================================

  /**
   * Set the entire fields collection
   *
   * Used when loading fields from database or receiving real-time updates.
   *
   * @param fields - Complete fields array
   * @param markClean - Whether to mark store as clean (no unsaved changes)
   */
  setFields: (fields: SchemaField[], markClean?: boolean) => void;

  /**
   * Add a new field to the schema
   *
   * Creates a new field with generated ID and adds it to the collection.
   * Automatically updates positions and marks store as dirty.
   *
   * @param fieldData - Partial field data (ID, timestamps, position auto-generated)
   * @returns The created field
   */
  addField: (
    fieldData: Omit<SchemaField, 'id' | 'created_at' | 'updated_at' | 'position'>
  ) => SchemaField;

  /**
   * Update an existing field
   *
   * Performs optimistic update and marks store as dirty.
   *
   * @param fieldId - ID of field to update
   * @param updates - Partial field updates
   * @returns Updated field or null if not found
   */
  updateField: (fieldId: string, updates: Partial<SchemaField>) => SchemaField | null;

  /**
   * Delete a field from the schema
   *
   * Also deletes all child fields (nested properties).
   *
   * @param fieldId - ID of field to delete
   * @returns Deleted field(s) or null if not found
   */
  deleteField: (fieldId: string) => SchemaField[] | null;

  /**
   * Reorder fields by drag-and-drop
   *
   * Updates position values for all affected fields.
   *
   * @param startIndex - Original index
   * @param endIndex - New index
   */
  reorderFields: (startIndex: number, endIndex: number) => void;

  /**
   * Get field by ID
   *
   * @param fieldId - Field identifier
   * @returns Field or null if not found
   */
  getFieldById: (fieldId: string) => SchemaField | null;

  /**
   * Get child fields for a parent field
   *
   * @param parentId - Parent field ID
   * @returns Array of child fields
   */
  getChildFields: (parentId: string) => SchemaField[];

  // ============================================================================
  // Selection Actions
  // ============================================================================

  /**
   * Set currently selected field
   *
   * @param field - Field to select (or null to deselect)
   */
  setSelectedField: (field: SchemaField | null) => void;

  /**
   * Select field by ID
   *
   * @param fieldId - Field identifier
   */
  selectFieldById: (fieldId: string) => void;

  /**
   * Clear field selection
   */
  clearSelection: () => void;

  // ============================================================================
  // State Management Actions
  // ============================================================================

  /**
   * Mark store as having unsaved changes
   */
  markDirty: () => void;

  /**
   * Mark store as clean (all changes saved)
   */
  markClean: () => void;

  /**
   * Set saving state
   *
   * @param saving - Whether save is in progress
   */
  setIsSaving: (saving: boolean) => void;

  /**
   * Set loading state
   *
   * @param loading - Whether data is loading
   */
  setIsLoading: (loading: boolean) => void;

  /**
   * Set last error message
   *
   * @param error - Error message (or null to clear)
   */
  setError: (error: string | null) => void;

  // ============================================================================
  // Optimistic Updates Management
  // ============================================================================

  /**
   * Add optimistic update to queue
   *
   * @param update - Optimistic update operation
   */
  addOptimisticUpdate: (update: OptimisticUpdate) => void;

  /**
   * Remove optimistic update from queue (on success)
   *
   * @param updateId - Update identifier
   */
  removeOptimisticUpdate: (updateId: string) => void;

  /**
   * Rollback an optimistic update (on failure)
   *
   * Reverts state to previousState stored in the update.
   *
   * @param updateId - Update identifier
   */
  rollbackOptimisticUpdate: (updateId: string) => void;

  /**
   * Clear all optimistic updates
   */
  clearOptimisticUpdates: () => void;

  // ============================================================================
  // Validation Management
  // ============================================================================

  /**
   * Set validation errors
   *
   * @param errors - Array of validation errors
   */
  setValidationErrors: (errors: ValidationError[]) => void;

  /**
   * Add validation error
   *
   * @param error - Validation error to add
   */
  addValidationError: (error: ValidationError) => void;

  /**
   * Clear validation errors for a specific field
   *
   * @param fieldId - Field identifier
   */
  clearFieldValidationErrors: (fieldId: string) => void;

  /**
   * Clear all validation errors
   */
  clearAllValidationErrors: () => void;

  /**
   * Get validation errors for a specific field
   *
   * @param fieldId - Field identifier
   * @returns Array of errors for the field
   */
  getFieldValidationErrors: (fieldId: string) => ValidationError[];

  // ============================================================================
  // Metadata Management
  // ============================================================================

  /**
   * Update schema metadata
   *
   * @param updates - Partial metadata updates
   */
  updateMetadata: (updates: Partial<SchemaMetadata>) => void;

  /**
   * Recalculate field count from current fields
   */
  recalculateFieldCount: () => void;

  // ============================================================================
  // Utility Actions
  // ============================================================================

  /**
   * Generate unique field path for nested fields
   *
   * @param fieldName - Field name
   * @param parentId - Parent field ID (optional)
   * @returns Generated field path
   */
  generateFieldPath: (fieldName: string, parentId?: string | null) => string;

  /**
   * Check if field name is unique at the same level
   *
   * @param fieldName - Field name to check
   * @param parentId - Parent field ID (optional)
   * @param excludeFieldId - Field ID to exclude from check (for updates)
   * @returns Whether name is unique
   */
  isFieldNameUnique: (
    fieldName: string,
    parentId?: string | null,
    excludeFieldId?: string
  ) => boolean;
}

/**
 * Initial metadata state
 */
const initialMetadata: SchemaMetadata = {
  field_count: 0,
  name: undefined,
  description: undefined,
  last_saved: undefined,
  version: undefined,
};

/**
 * State that should be tracked for undo/redo
 * Only tracks fields - other state like selection, loading, etc. should not be undone
 */
interface TemporalState {
  fields: SchemaField[];
}

/**
 * Create Schema Editor Store
 *
 * Implements Zustand store with devtools and temporal (undo/redo) middleware.
 * The temporal middleware tracks only `fields` changes for undo/redo functionality.
 */
export const useSchemaEditorStore = create<SchemaEditorState>()(
  devtools(
    temporal(
    (set, get) => ({
      // ========================================================================
      // Initial State
      // ========================================================================

      sessionId: null,
      schemaId: null,
      fields: [],
      selectedField: null,
      isDirty: false,
      isSaving: false,
      isLoading: false,
      optimisticUpdates: [],
      validationErrors: [],
      metadata: initialMetadata,
      lastError: null,

      // ========================================================================
      // Session Management
      // ========================================================================

      initializeSession: (sessionId: string, schemaId?: string | null) => {
        const currentState = get();
        const isSameSession = currentState.sessionId === sessionId;
        
        storeLogger.debug('Initializing session', { 
          sessionId, 
          schemaId,
          isSameSession,
          existingFieldsCount: currentState.fields.length
        });

        // If it's the same session, preserve existing fields and state
        if (isSameSession) {
          // Only update schemaId if provided and different
          if (schemaId !== undefined && currentState.schemaId !== schemaId) {
            set({ schemaId: schemaId ?? null });
          }
          return;
        }

        // New session - reset everything
        set({
          sessionId,
          schemaId: schemaId ?? null,
          fields: [],
          selectedField: null,
          isDirty: false,
          isSaving: false,
          isLoading: true,
          optimisticUpdates: [],
          validationErrors: [],
          metadata: initialMetadata,
          lastError: null,
        });
      },

      clearSession: () => {
        storeLogger.debug('Clearing session');

        set({
          sessionId: null,
          schemaId: null,
          fields: [],
          selectedField: null,
          isDirty: false,
          isSaving: false,
          isLoading: false,
          optimisticUpdates: [],
          validationErrors: [],
          metadata: initialMetadata,
          lastError: null,
        });
      },

      // ========================================================================
      // Field Management
      // ========================================================================

      setFields: (fields: SchemaField[], markClean = false) => {
        storeLogger.debug('Setting fields', { count: fields.length, markClean });

        set({
          fields,
          isDirty: markClean ? false : get().isDirty,
        });

        // Recalculate field count
        get().recalculateFieldCount();
      },

      addField: (fieldData) => {
        const state = get();
        const now = new Date().toISOString();

        // Generate field path
        const fieldPath = state.generateFieldPath(
          fieldData.field_name,
          fieldData.parent_field_id
        );

        // Calculate position (append to end)
        const position = state.fields.length;

        // Create new field
        const newField: SchemaField = {
          ...fieldData,
          id: uuidv4(),
          field_path: fieldPath,
          position,
          created_at: now,
          updated_at: now,
        };

        storeLogger.debug('Adding field', {
          fieldName: newField.field_name,
          fieldPath: newField.field_path,
          position,
        });

        // Add optimistic update
        const optimisticUpdate: OptimisticUpdate = {
          id: uuidv4(),
          type: 'add',
          fieldId: newField.id,
          newState: newField,
          timestamp: Date.now(),
        };

        set({
          fields: [...state.fields, newField],
          isDirty: true,
          optimisticUpdates: [...state.optimisticUpdates, optimisticUpdate],
        });

        // Recalculate field count
        get().recalculateFieldCount();

        return newField;
      },

      updateField: (fieldId: string, updates: Partial<SchemaField>) => {
        const state = get();
        const fieldIndex = state.fields.findIndex((f) => f.id === fieldId);

        if (fieldIndex === -1) {
          storeLogger.warn('Field not found for update', { fieldId });
          return null;
        }

        const previousField = state.fields[fieldIndex];
        const now = new Date().toISOString();

        // Create updated field
        const updatedField: SchemaField = {
          ...previousField,
          ...updates,
          updated_at: now,
        };

        storeLogger.debug('Updating field', {
          fieldId,
          updates: Object.keys(updates),
        });

        // Add optimistic update
        const optimisticUpdate: OptimisticUpdate = {
          id: uuidv4(),
          type: 'update',
          fieldId,
          previousState: previousField,
          newState: updatedField,
          timestamp: Date.now(),
        };

        // Update fields array
        const newFields = [...state.fields];
        newFields[fieldIndex] = updatedField;

        set({
          fields: newFields,
          isDirty: true,
          optimisticUpdates: [...state.optimisticUpdates, optimisticUpdate],
          // Update selected field if it's the one being updated
          selectedField:
            state.selectedField?.id === fieldId ? updatedField : state.selectedField,
        });

        return updatedField;
      },

      deleteField: (fieldId: string) => {
        const state = get();
        const field = state.fields.find((f) => f.id === fieldId);

        if (!field) {
          storeLogger.warn('Field not found for deletion', { fieldId });
          return null;
        }

        // Get all child fields recursively
        const getChildFieldsRecursive = (parentId: string): SchemaField[] => {
          const children = state.fields.filter((f) => f.parent_field_id === parentId);
          const allChildren = [...children];

          children.forEach((child) => {
            allChildren.push(...getChildFieldsRecursive(child.id));
          });

          return allChildren;
        };

        const childFields = getChildFieldsRecursive(fieldId);
        const fieldsToDelete = [field, ...childFields];
        const fieldIdsToDelete = new Set(fieldsToDelete.map((f) => f.id));

        storeLogger.debug('Deleting field with children', {
          fieldId,
          childCount: childFields.length,
        });

        // Add optimistic update
        const optimisticUpdate: OptimisticUpdate = {
          id: uuidv4(),
          type: 'delete',
          fieldId,
          previousState: fieldsToDelete,
          timestamp: Date.now(),
        };

        // Filter out deleted fields and reindex positions
        const remainingFields = state.fields
          .filter((f) => !fieldIdsToDelete.has(f.id))
          .map((f, index) => ({
            ...f,
            position: index,
          }));

        set({
          fields: remainingFields,
          isDirty: true,
          optimisticUpdates: [...state.optimisticUpdates, optimisticUpdate],
          // Clear selection if selected field was deleted
          selectedField: fieldIdsToDelete.has(state.selectedField?.id ?? '')
            ? null
            : state.selectedField,
        });

        // Recalculate field count
        get().recalculateFieldCount();

        return fieldsToDelete;
      },

      reorderFields: (startIndex: number, endIndex: number) => {
        const state = get();

        if (startIndex === endIndex) {
          return;
        }

        storeLogger.debug('Reordering fields', { startIndex, endIndex });

        // Create copy and move item
        const result = Array.from(state.fields);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);

        // Update positions
        const reorderedFields = result.map((field, index) => ({
          ...field,
          position: index,
          updated_at: new Date().toISOString(),
        }));

        // Add optimistic update
        const optimisticUpdate: OptimisticUpdate = {
          id: uuidv4(),
          type: 'reorder',
          fieldId: removed.id,
          previousState: state.fields,
          newState: reorderedFields,
          timestamp: Date.now(),
        };

        set({
          fields: reorderedFields,
          isDirty: true,
          optimisticUpdates: [...state.optimisticUpdates, optimisticUpdate],
        });
      },

      getFieldById: (fieldId: string) => {
        return get().fields.find((f) => f.id === fieldId) ?? null;
      },

      getChildFields: (parentId: string) => {
        return get().fields.filter((f) => f.parent_field_id === parentId);
      },

      // ========================================================================
      // Selection
      // ========================================================================

      setSelectedField: (field: SchemaField | null) => {
        set({ selectedField: field });
      },

      selectFieldById: (fieldId: string) => {
        const field = get().getFieldById(fieldId);
        set({ selectedField: field });
      },

      clearSelection: () => {
        set({ selectedField: null });
      },

      // ========================================================================
      // State Management
      // ========================================================================

      markDirty: () => {
        set({ isDirty: true });
      },

      markClean: () => {
        set({ isDirty: false });
      },

      setIsSaving: (saving: boolean) => {
        set({ isSaving: saving });
      },

      setIsLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ lastError: error });

        if (error) {
          storeLogger.error('Store error set', { error });
        }
      },

      // ========================================================================
      // Optimistic Updates
      // ========================================================================

      addOptimisticUpdate: (update: OptimisticUpdate) => {
        set((state) => ({
          optimisticUpdates: [...state.optimisticUpdates, update],
        }));
      },

      removeOptimisticUpdate: (updateId: string) => {
        set((state) => ({
          optimisticUpdates: state.optimisticUpdates.filter((u) => u.id !== updateId),
        }));
      },

      rollbackOptimisticUpdate: (updateId: string) => {
        const state = get();
        const update = state.optimisticUpdates.find((u) => u.id === updateId);

        if (!update) {
          storeLogger.warn('Optimistic update not found for rollback', { updateId });
          return;
        }

        storeLogger.warn('Rolling back optimistic update', {
          updateId,
          type: update.type,
        });

        // Rollback based on update type
        switch (update.type) {
          case 'add':
            // Remove the added field
            set({
              fields: state.fields.filter((f) => f.id !== update.fieldId),
            });
            break;

          case 'update':
            // Restore previous field state
            if (update.previousState && !Array.isArray(update.previousState)) {
              const fieldIndex = state.fields.findIndex((f) => f.id === update.fieldId);
              if (fieldIndex !== -1) {
                const newFields = [...state.fields];
                newFields[fieldIndex] = update.previousState;
                set({ fields: newFields });
              }
            }
            break;

          case 'delete':
            // Restore deleted field(s)
            if (update.previousState && Array.isArray(update.previousState)) {
              set({
                fields: [...state.fields, ...update.previousState].sort(
                  (a, b) => a.position - b.position
                ),
              });
            }
            break;

          case 'reorder':
            // Restore previous order
            if (update.previousState && Array.isArray(update.previousState)) {
              set({ fields: update.previousState });
            }
            break;
        }

        // Remove update from queue
        get().removeOptimisticUpdate(updateId);
      },

      clearOptimisticUpdates: () => {
        set({ optimisticUpdates: [] });
      },

      // ========================================================================
      // Validation
      // ========================================================================

      setValidationErrors: (errors: ValidationError[]) => {
        set({ validationErrors: errors });
      },

      addValidationError: (error: ValidationError) => {
        set((state) => ({
          validationErrors: [...state.validationErrors, error],
        }));
      },

      clearFieldValidationErrors: (fieldId: string) => {
        set((state) => ({
          validationErrors: state.validationErrors.filter(
            (e) => e.fieldId !== fieldId
          ),
        }));
      },

      clearAllValidationErrors: () => {
        set({ validationErrors: [] });
      },

      getFieldValidationErrors: (fieldId: string) => {
        return get().validationErrors.filter((e) => e.fieldId === fieldId);
      },

      // ========================================================================
      // Metadata
      // ========================================================================

      updateMetadata: (updates: Partial<SchemaMetadata>) => {
        set((state) => ({
          metadata: {
            ...state.metadata,
            ...updates,
          },
        }));
      },

      recalculateFieldCount: () => {
        const fieldCount = get().fields.length;
        set((state) => ({
          metadata: {
            ...state.metadata,
            field_count: fieldCount,
          },
        }));
      },

      // ========================================================================
      // Utilities
      // ========================================================================

      generateFieldPath: (fieldName: string, parentId?: string | null) => {
        if (!parentId) {
          return `root.${fieldName}`;
        }

        const parent = get().getFieldById(parentId);
        if (!parent) {
          storeLogger.warn('Parent field not found for path generation', { parentId });
          return `root.${fieldName}`;
        }

        return `${parent.field_path}.${fieldName}`;
      },

      isFieldNameUnique: (
        fieldName: string,
        parentId?: string | null,
        excludeFieldId?: string
      ) => {
        const state = get();

        // Check for fields at the same level with the same name
        const duplicates = state.fields.filter(
          (f) =>
            f.field_name === fieldName &&
            f.parent_field_id === (parentId ?? null) &&
            f.id !== excludeFieldId
        );

        return duplicates.length === 0;
      },
    }),
    {
      // Only track fields for undo/redo - other state like selection, loading, etc. should not be undone
      partialize: (state): TemporalState => ({
        fields: state.fields,
      }),
      // Maximum number of undo states to keep
      limit: 100,
      // Equality function to determine if state changed
      equality: (pastState, currentState) =>
        JSON.stringify(pastState.fields) === JSON.stringify(currentState.fields),
      // Handle undo/redo side effects
      onSave: (pastState) => {
        storeLogger.debug('Temporal state saved', { fieldCount: pastState.fields.length });
      },
    }
    ),
    { name: 'SchemaEditorStore' }
  )
);
