# Schema Editor Hooks

State management hooks for the visual schema editor with real-time Supabase synchronization.

## Overview

This module provides a complete state management solution for the Schema Studio visual editor, implementing:

- **Zustand Store**: Centralized state management with optimistic updates
- **Real-Time Sync**: Bidirectional Supabase synchronization with conflict resolution
- **Validation**: Multi-layer validation (client-side Zod + backend Pydantic)
- **TypeScript**: Full type safety with comprehensive type definitions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Schema Editor UI                        │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┼───────────┐
                │           │           │
        ┌───────▼─────┐ ┌──▼──────┐ ┌─▼────────┐
        │  Zustand    │ │ Supabase│ │Validation│
        │   Store     │ │  Sync   │ │  Hook    │
        └───────┬─────┘ └──┬──────┘ └─┬────────┘
                │           │           │
                │           │           │
        ┌───────▼───────────▼───────────▼─────────┐
        │         Supabase Database               │
        │  ┌──────────────┐  ┌─────────────────┐ │
        │  │schema_fields │  │schema_versions  │ │
        │  └──────────────┘  └─────────────────┘ │
        └─────────────────────────────────────────┘
```

## Hooks

### useSchemaEditorStore

Main Zustand store for schema editor state.

**Features:**
- Field CRUD operations
- Selection management
- Optimistic updates queue
- Validation error tracking
- Metadata management

**Example:**
```tsx
import { useSchemaEditorStore } from '@/hooks/schema-editor';

function FieldList() {
  const { fields, addField, updateField, deleteField } = useSchemaEditorStore();

  const handleAdd = () => {
    addField({
      field_name: 'new_field',
      field_type: 'string',
      field_path: 'root.new_field',
      session_id: sessionId,
      is_required: false,
      validation_rules: {},
      visual_metadata: {},
      created_by: 'user',
    });
  };

  return (
    <div>
      {fields.map(field => (
        <FieldCard key={field.id} field={field} />
      ))}
      <button onClick={handleAdd}>Add Field</button>
    </div>
  );
}
```

### useSupabaseSync

Real-time synchronization with Supabase database.

**Features:**
- Real-time subscriptions (INSERT, UPDATE, DELETE)
- Optimistic updates with rollback
- Conflict resolution (last-write-wins)
- Connection state monitoring
- Automatic reconnection
- Batch operations

**Example:**
```tsx
import { useSupabaseSync } from '@/hooks/schema-editor';

function SchemaEditor({ sessionId, schemaId }) {
  const {
    connectionState,
    isInitialLoadComplete,
    syncField,
    syncAllFields,
  } = useSupabaseSync({
    sessionId,
    schemaId,
    enabled: true,
    onSyncError: (error) => {
      toast.error(`Sync error: ${error.message}`);
    },
    onConnectionStateChange: (state) => {
      console.log('Connection state:', state);
    },
  });

  return (
    <div>
      <ConnectionIndicator state={connectionState} />
      {!isInitialLoadComplete && <LoadingSpinner />}
      {/* ... rest of UI */}
    </div>
  );
}
```

### useFieldValidation

Multi-layer field validation with Zod and backend integration.

**Features:**
- Client-side Zod validation
- Backend Pydantic validation
- Type-specific rule validation
- Field name uniqueness checks
- Real-time error display
- Validation caching

**Example:**
```tsx
import { useFieldValidation } from '@/hooks/schema-editor';

function FieldEditor({ field }) {
  const {
    validateField,
    validateSchema,
    getFieldErrors,
    isValidating,
  } = useFieldValidation();

  const handleSave = async () => {
    const isValid = await validateField(field);
    if (isValid) {
      await saveField(field);
    }
  };

  const errors = getFieldErrors(field.id);

  return (
    <div>
      <input
        value={field.field_name}
        onChange={(e) => updateField(field.id, { field_name: e.target.value })}
      />
      {errors.map(error => (
        <ErrorMessage key={error.fieldPath}>{error.message}</ErrorMessage>
      ))}
      <button onClick={handleSave} disabled={isValidating}>
        Save
      </button>
    </div>
  );
}
```

## Data Flow

### Adding a Field

```
User clicks "Add Field"
  ↓
useSchemaEditorStore.addField()
  ↓
Optimistic update → Store updated immediately
  ↓
useSupabaseSync.syncField()
  ↓
Supabase INSERT
  ↓
Success: Remove from optimistic queue
Failure: Rollback optimistic update
  ↓
Real-time event received
  ↓
Store synced with database
```

### Editing a Field

```
User edits field in modal
  ↓
useFieldValidation.validateField() (debounced)
  ↓
Validation passes
  ↓
useSchemaEditorStore.updateField()
  ↓
Optimistic update → Store updated
  ↓
useSupabaseSync.syncField() (debounced 500ms)
  ↓
Supabase UPDATE
  ↓
Real-time event → Conflict resolution
  ↓
Store synced (last-write-wins)
```

### Real-Time Sync from AI

```
AI chat creates/modifies schema
  ↓
Backend writes to schema_fields
  ↓
Supabase real-time event fires
  ↓
useSupabaseSync.handleInsert/Update()
  ↓
Check if local operation (skip if true)
  ↓
Merge with local state (conflict resolution)
  ↓
useSchemaEditorStore.setFields()
  ↓
UI updates with animation
```

## Type Definitions

All types are fully documented in `types.ts`:

- `SchemaField`: Complete field structure
- `ValidationRules`: JSON Schema validation rules
- `OptimisticUpdate`: Pending operation tracking
- `ValidationError`: Error structure
- `BackendValidationResponse`: Backend API response

## Best Practices

### 1. Always Validate Before Saving

```tsx
const handleSave = async () => {
  const isValid = await validateField(field);
  if (!isValid) {
    toast.error('Please fix validation errors');
    return;
  }

  await syncField(field);
};
```

### 2. Use Debounced Sync for Frequent Updates

```tsx
import { useDebouncedSync } from '@/hooks/schema-editor';

const debouncedSync = useDebouncedSync(500);

const handleChange = (updates: Partial<SchemaField>) => {
  const updated = updateField(field.id, updates);
  if (updated) {
    debouncedSync(updated);
  }
};
```

### 3. Handle Connection State

```tsx
const { connectionState } = useSupabaseSync({ sessionId, schemaId });

if (connectionState === 'disconnected') {
  return <ConnectionLostMessage onRetry={reconnect} />;
}
```

### 4. Show Validation Errors

```tsx
const { validationErrorsMap } = useFieldValidation();

{fields.map(field => (
  <FieldCard
    field={field}
    errors={validationErrorsMap[field.id] || []}
  />
))}
```

### 5. Clean Up on Unmount

```tsx
useEffect(() => {
  return () => {
    // Hooks handle cleanup automatically
    // But you can manually disconnect if needed
    disconnect();
  };
}, [disconnect]);
```

## Testing

### Unit Tests

```tsx
import { renderHook, act } from '@testing-library/react';
import { useSchemaEditorStore } from '@/hooks/schema-editor';

describe('useSchemaEditorStore', () => {
  it('should add field', () => {
    const { result } = renderHook(() => useSchemaEditorStore());

    act(() => {
      result.current.addField({
        field_name: 'test',
        field_type: 'string',
        // ... other required fields
      });
    });

    expect(result.current.fields).toHaveLength(1);
    expect(result.current.isDirty).toBe(true);
  });
});
```

### Integration Tests

Test with actual Supabase connection (use test database):

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useSupabaseSync } from '@/hooks/schema-editor';

describe('useSupabaseSync', () => {
  it('should sync field to database', async () => {
    const { result } = renderHook(() =>
      useSupabaseSync({ sessionId: 'test-session' })
    );

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    // Test sync operations...
  });
});
```

## Performance Optimization

1. **Debouncing**: Sync operations are debounced (500ms default)
2. **Batching**: Use `syncAllFields()` for bulk operations
3. **Caching**: Validation results cached for 5 seconds
4. **Memoization**: Components should memoize field cards
5. **Selective Updates**: Only affected fields re-render

## Error Handling

All hooks provide comprehensive error handling:

```tsx
const { syncField } = useSupabaseSync({
  sessionId,
  onSyncError: (error) => {
    // Custom error handling
    console.error('Sync error:', error);
    toast.error(error.message);

    // Optional: Report to error tracking
    Sentry.captureException(error);
  },
});
```

## Migration from Existing Code

If migrating from existing schema chat implementation:

1. Initialize store with session ID
2. Load existing fields with `loadFields()`
3. Replace direct Supabase calls with store actions
4. Add validation before saves
5. Enable real-time sync

```tsx
// Before
const saveField = async (field) => {
  await supabase.from('schema_fields').insert(field);
};

// After
const saveField = async (field) => {
  const isValid = await validateField(field);
  if (isValid) {
    addField(field); // Optimistic update
    await syncField(field); // Persist to DB
  }
};
```

## Related Documentation

- **Implementation Plan**: `/docs/reference/unified-schema-editor-implementation-plan.md`
- **Database Schema**: See migrations in `supabase/migrations/`
- **API Endpoints**: `/backend/app/api/schema_generator.py`
- **Frontend Components**: To be created in `/frontend/components/schema-chat/`

## Support

For issues or questions:
1. Check JSDoc comments in source files
2. Review example usage in this README
3. Check implementation plan for architecture details
4. Review Zustand and Supabase documentation
