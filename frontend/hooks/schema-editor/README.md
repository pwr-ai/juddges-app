# Schema Editor Hooks

Client-side state for Schema Studio (`components/schema-studio/`) and the
schema chat page (`app/schema-chat/`). Persistence goes through
`schemaService` in `lib/schema-editor/service.ts`; JSON Schema export goes
through `lib/schema-editor/compiler.ts`.

There is no barrel file: import each module by its path.

## Modules

| File | Export | Used by |
|---|---|---|
| `useSchemaEditorStore.ts` | `useSchemaEditorStore` — Zustand store: field CRUD, selection, optimistic-update queue, validation errors, metadata | `components/schema-studio/*`, `app/schema-chat/page.tsx` |
| `useUndoRedo.ts` | `useUndoRedo`, `useScopedUndoRedo` | `components/schema-studio/SchemaCanvas.tsx` |
| `usePlaygroundStore.ts` | `usePlaygroundStore`, `useEvaluationStore`, `useVersionStore` | `components/schema-studio/versions/VersionsTab.tsx` |
| `types.ts` | `SchemaField`, `ValidationRules`, `SchemaMetadata`, … | store, Schema Studio components, `hooks/schema-chat/*`, `lib/schema-chat/import-parser.ts` |

## Example

```tsx
import { useSchemaEditorStore } from '@/hooks/schema-editor/useSchemaEditorStore';

function FieldList() {
  const { fields, addField } = useSchemaEditorStore();

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

## History

A realtime Supabase sync hook (`useSupabaseSync`), a client-side validation
hook (`useFieldValidation`) and an RJSF-based form layer
(`lib/schema-editor/rjsf/`) used to live here. Nothing in the app imported
them, so they were removed. The comments in
`supabase/migrations/20260810000002_create_schema_domain_tables.sql` that
mention `useSupabaseSync` describe that removed client; schema persistence
from the UI now goes through `schemaService` (`/api/schemas`).
