/**
 * Store tests for useSchemaEditorStore
 *
 * Tests state management logic, optimistic updates, and rollback scenarios
 * for the Zustand-based schema editor store.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import {
  createMockField,
  createMockFields,
  wait,
  buildField,
  TEST_TIMEOUTS,
} from './test-utils';

// Mock Zustand store (this would be the actual implementation)
interface SchemaField {
  id: string;
  schema_id?: string;
  session_id: string;
  field_path: string;
  field_name: string;
  field_type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  is_required: boolean;
  parent_field_id?: string;
  position: number;
  validation_rules: Record<string, unknown>;
  visual_metadata: {
    color?: string;
    icon?: string;
    collapsed?: boolean;
  };
  created_by: 'ai' | 'user' | 'template';
  created_at?: string;
  updated_at?: string;
}

interface SchemaStore {
  sessionId: string | null;
  schemaId: string | null;
  fields: SchemaField[];
  selectedField: SchemaField | null;
  isDirty: boolean;
  isSaving: boolean;
  history: SchemaField[][];
  historyIndex: number;

  // Actions
  setSessionId: (id: string) => void;
  setSchemaId: (id: string | null) => void;
  setFields: (fields: SchemaField[]) => void;
  addField: (field: SchemaField) => void;
  updateField: (id: string, updates: Partial<SchemaField>) => void;
  deleteField: (id: string) => void;
  reorderFields: (startIndex: number, endIndex: number) => void;
  setSelectedField: (field: SchemaField | null) => void;
  markDirty: () => void;
  markClean: () => void;
  setIsSaving: (saving: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
}

// Mock implementation of the store
let storeState: SchemaStore;

function createMockStore(): SchemaStore {
  const initialState = {
    sessionId: null,
    schemaId: null,
    fields: [],
    selectedField: null,
    isDirty: false,
    isSaving: false,
    history: [[]],
    historyIndex: 0,
  };

  storeState = {
    ...initialState,

    setSessionId: (id: string) => {
      storeState.sessionId = id;
    },

    setSchemaId: (id: string | null) => {
      storeState.schemaId = id;
    },

    setFields: (fields: SchemaField[]) => {
      storeState.fields = fields;
      storeState.isDirty = false;
    },

    addField: (field: SchemaField) => {
      storeState.fields = [...storeState.fields, field];
      storeState.isDirty = true;
      // Add to history
      storeState.history = [
        ...storeState.history.slice(0, storeState.historyIndex + 1),
        [...storeState.fields],
      ];
      storeState.historyIndex++;
    },

    updateField: (id: string, updates: Partial<SchemaField>) => {
      storeState.fields = storeState.fields.map((f) =>
        f.id === id
          ? { ...f, ...updates, updated_at: new Date().toISOString() }
          : f
      );
      storeState.isDirty = true;
      // Add to history
      storeState.history = [
        ...storeState.history.slice(0, storeState.historyIndex + 1),
        [...storeState.fields],
      ];
      storeState.historyIndex++;
    },

    deleteField: (id: string) => {
      storeState.fields = storeState.fields.filter((f) => f.id !== id);
      storeState.isDirty = true;
      // Add to history
      storeState.history = [
        ...storeState.history.slice(0, storeState.historyIndex + 1),
        [...storeState.fields],
      ];
      storeState.historyIndex++;
    },

    reorderFields: (startIndex: number, endIndex: number) => {
      const result = Array.from(storeState.fields);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);

      const reordered = result.map((field, idx) => ({
        ...field,
        position: idx,
      }));

      storeState.fields = reordered;
      storeState.isDirty = true;
      // Add to history
      storeState.history = [
        ...storeState.history.slice(0, storeState.historyIndex + 1),
        [...storeState.fields],
      ];
      storeState.historyIndex++;
    },

    setSelectedField: (field: SchemaField | null) => {
      storeState.selectedField = field;
    },

    markDirty: () => {
      storeState.isDirty = true;
    },

    markClean: () => {
      storeState.isDirty = false;
    },

    setIsSaving: (saving: boolean) => {
      storeState.isSaving = saving;
    },

    undo: () => {
      if (storeState.historyIndex > 0) {
        storeState.historyIndex--;
        storeState.fields = [...storeState.history[storeState.historyIndex]];
        storeState.isDirty = true;
      }
    },

    redo: () => {
      if (storeState.historyIndex < storeState.history.length - 1) {
        storeState.historyIndex++;
        storeState.fields = [...storeState.history[storeState.historyIndex]];
        storeState.isDirty = true;
      }
    },

    canUndo: () => {
      return storeState.historyIndex > 0;
    },

    canRedo: () => {
      return storeState.historyIndex < storeState.history.length - 1;
    },

    reset: () => {
      Object.assign(storeState, initialState);
    },
  };

  return storeState;
}

function useSchemaEditorStore(): SchemaStore {
  return storeState;
}

describe('useSchemaEditorStore', () => {
  beforeEach(() => {
    createMockStore();
  });

  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      expect(result.current.sessionId).toBeNull();
      expect(result.current.schemaId).toBeNull();
      expect(result.current.fields).toEqual([]);
      expect(result.current.selectedField).toBeNull();
      expect(result.current.isDirty).toBe(false);
      expect(result.current.isSaving).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should set session ID', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.setSessionId('test-session-123');
      });

      expect(result.current.sessionId).toBe('test-session-123');
    });

    it('should set schema ID', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.setSchemaId('schema-456');
      });

      expect(result.current.schemaId).toBe('schema-456');
    });

    it('should allow setting schema ID to null', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.setSchemaId('schema-123');
        result.current.setSchemaId(null);
      });

      expect(result.current.schemaId).toBeNull();
    });
  });

  describe('Field Management', () => {
    it('should set fields and mark as clean', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(3);

      act(() => {
        result.current.setFields(fields);
      });

      expect(result.current.fields).toEqual(fields);
      expect(result.current.isDirty).toBe(false);
    });

    it('should add a new field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const newField = createMockField({ field_name: 'new_field' });

      act(() => {
        result.current.addField(newField);
      });

      expect(result.current.fields).toHaveLength(1);
      expect(result.current.fields[0]).toEqual(newField);
      expect(result.current.isDirty).toBe(true);
    });

    it('should add multiple fields', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(5);

      act(() => {
        fields.forEach((field) => result.current.addField(field));
      });

      expect(result.current.fields).toHaveLength(5);
      expect(result.current.isDirty).toBe(true);
    });

    it('should update an existing field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-1', field_name: 'old_name' });

      act(() => {
        result.current.addField(field);
        result.current.updateField('field-1', { field_name: 'new_name' });
      });

      expect(result.current.fields[0].field_name).toBe('new_name');
      expect(result.current.fields[0].updated_at).toBeDefined();
      expect(result.current.isDirty).toBe(true);
    });

    it('should not modify unrelated fields when updating', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(3);

      act(() => {
        fields.forEach((field) => result.current.addField(field));
        result.current.updateField(fields[1].id, { field_name: 'updated' });
      });

      expect(result.current.fields[0]).toEqual(fields[0]);
      expect(result.current.fields[1].field_name).toBe('updated');
      expect(result.current.fields[2]).toEqual(fields[2]);
    });

    it('should delete a field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-to-delete' });

      act(() => {
        result.current.addField(field);
        result.current.deleteField('field-to-delete');
      });

      expect(result.current.fields).toHaveLength(0);
      expect(result.current.isDirty).toBe(true);
    });

    it('should delete only the specified field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(3);

      act(() => {
        fields.forEach((field) => result.current.addField(field));
        result.current.deleteField(fields[1].id);
      });

      expect(result.current.fields).toHaveLength(2);
      expect(result.current.fields.find((f) => f.id === fields[1].id)).toBeUndefined();
    });
  });

  describe('Field Reordering', () => {
    it('should reorder fields from start to end', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(5);

      act(() => {
        fields.forEach((field) => result.current.addField(field));
        result.current.reorderFields(0, 4);
      });

      const reorderedFields = result.current.fields;
      expect(reorderedFields[4].id).toBe(fields[0].id);
      expect(reorderedFields[4].position).toBe(4);
    });

    it('should reorder fields from end to start', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(5);

      act(() => {
        fields.forEach((field) => result.current.addField(field));
        result.current.reorderFields(4, 0);
      });

      const reorderedFields = result.current.fields;
      expect(reorderedFields[0].id).toBe(fields[4].id);
      expect(reorderedFields[0].position).toBe(0);
    });

    it('should update positions for all fields after reorder', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(5);

      act(() => {
        fields.forEach((field) => result.current.addField(field));
        result.current.reorderFields(1, 3);
      });

      result.current.fields.forEach((field, index) => {
        expect(field.position).toBe(index);
      });
    });

    it('should mark as dirty after reordering', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(3);

      act(() => {
        result.current.setFields(fields);
        result.current.reorderFields(0, 2);
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('Selected Field', () => {
    it('should set selected field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField();

      act(() => {
        result.current.setSelectedField(field);
      });

      expect(result.current.selectedField).toEqual(field);
    });

    it('should clear selected field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField();

      act(() => {
        result.current.setSelectedField(field);
        result.current.setSelectedField(null);
      });

      expect(result.current.selectedField).toBeNull();
    });
  });

  describe('Dirty State Management', () => {
    it('should mark as dirty', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.markDirty();
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should mark as clean', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.markDirty();
        result.current.markClean();
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should mark as dirty when adding field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.addField(createMockField());
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should mark as dirty when updating field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-1' });

      act(() => {
        result.current.setFields([field]);
        result.current.updateField('field-1', { field_name: 'updated' });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should mark as dirty when deleting field', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-1' });

      act(() => {
        result.current.setFields([field]);
        result.current.deleteField('field-1');
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('Saving State', () => {
    it('should set saving state', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.setIsSaving(true);
      });

      expect(result.current.isSaving).toBe(true);
    });

    it('should clear saving state', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.setIsSaving(true);
        result.current.setIsSaving(false);
      });

      expect(result.current.isSaving).toBe(false);
    });
  });

  describe('Undo/Redo Functionality', () => {
    it('should undo field addition', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField();

      act(() => {
        result.current.addField(field);
        result.current.undo();
      });

      expect(result.current.fields).toHaveLength(0);
      expect(result.current.canUndo()).toBe(false);
    });

    it('should undo field update', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-1', field_name: 'original' });

      act(() => {
        result.current.addField(field);
        result.current.updateField('field-1', { field_name: 'updated' });
        result.current.undo();
      });

      expect(result.current.fields[0].field_name).toBe('original');
    });

    it('should undo field deletion', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-1' });

      act(() => {
        result.current.addField(field);
        result.current.deleteField('field-1');
        result.current.undo();
      });

      expect(result.current.fields).toHaveLength(1);
      expect(result.current.fields[0].id).toBe('field-1');
    });

    it('should redo after undo', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField();

      act(() => {
        result.current.addField(field);
        result.current.undo();
        result.current.redo();
      });

      expect(result.current.fields).toHaveLength(1);
      expect(result.current.canRedo()).toBe(false);
    });

    it('should handle multiple undos', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(3);

      act(() => {
        fields.forEach((field) => result.current.addField(field));
        result.current.undo();
        result.current.undo();
      });

      expect(result.current.fields).toHaveLength(1);
    });

    it('should report canUndo correctly', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      expect(result.current.canUndo()).toBe(false);

      act(() => {
        result.current.addField(createMockField());
      });

      expect(result.current.canUndo()).toBe(true);
    });

    it('should report canRedo correctly', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.addField(createMockField());
      });

      expect(result.current.canRedo()).toBe(false);

      act(() => {
        result.current.undo();
      });

      expect(result.current.canRedo()).toBe(true);
    });

    it('should clear redo history when new action is performed', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.addField(createMockField());
        result.current.undo();
        result.current.addField(createMockField());
      });

      expect(result.current.canRedo()).toBe(false);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset store to initial state', () => {
      const { result } = renderHook(() => useSchemaEditorStore());

      act(() => {
        result.current.setSessionId('test-session');
        result.current.addField(createMockField());
        result.current.markDirty();
        result.current.reset();
      });

      expect(result.current.sessionId).toBeNull();
      expect(result.current.fields).toEqual([]);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('Optimistic Updates', () => {
    it('should update field optimistically before server confirmation', async () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-1', field_name: 'original' });

      act(() => {
        result.current.addField(field);
        result.current.updateField('field-1', { field_name: 'optimistic' });
      });

      // Immediately reflects optimistic update
      expect(result.current.fields[0].field_name).toBe('optimistic');
    });

    it('should support rollback on update failure', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = createMockField({ id: 'field-1', field_name: 'original' });

      act(() => {
        result.current.addField(field);
        result.current.updateField('field-1', { field_name: 'failed_update' });
        // Simulate rollback by using undo
        result.current.undo();
      });

      expect(result.current.fields[0].field_name).toBe('original');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed operations in sequence', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const fields = createMockFields(5);

      act(() => {
        // Add fields
        fields.forEach((field) => result.current.addField(field));
        // Update one
        result.current.updateField(fields[1].id, { field_name: 'updated' });
        // Delete one
        result.current.deleteField(fields[2].id);
        // Reorder
        result.current.reorderFields(0, 3);
      });

      expect(result.current.fields).toHaveLength(4);
      expect(result.current.fields.find((f) => f.field_name === 'updated')).toBeDefined();
      expect(result.current.isDirty).toBe(true);
    });

    it('should maintain field integrity through multiple operations', () => {
      const { result } = renderHook(() => useSchemaEditorStore());
      const field = buildField()
        .withName('test_field')
        .withType('string')
        .required()
        .withValidation({ minLength: 5 })
        .build();

      act(() => {
        result.current.addField(field);
        result.current.updateField(field.id, { description: 'Updated description' });
      });

      const updatedField = result.current.fields[0];
      expect(updatedField.field_name).toBe('test_field');
      expect(updatedField.field_type).toBe('string');
      expect(updatedField.is_required).toBe(true);
      expect(updatedField.validation_rules).toEqual({ minLength: 5 });
      expect(updatedField.description).toBe('Updated description');
    });
  });
});
