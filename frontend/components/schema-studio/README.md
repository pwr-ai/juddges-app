# Schema Studio - Visual Schema Editor

A comprehensive visual editing system for extraction schemas, combining AI-driven chat with manual field editing capabilities.

## Architecture Overview

The Schema Studio implements a **split-pane layout** (40% chat / 60% canvas) that allows users to:

1. **Chat with AI** to generate schemas conversationally
2. **Manually edit fields** using a visual card-based interface
3. **Real-time synchronization** between AI changes and manual edits

## Component Structure

```
schema-studio/
├── types.ts                      # TypeScript type definitions
├── SchemaStudioLayout.tsx        # Main split-pane container
├── ChatPane.tsx                  # Left pane - AI chat interface
├── CanvasPane.tsx                # Right pane - Visual editor
├── SchemaCanvas.tsx              # Field list container
├── FieldCard.tsx                 # Individual field card
├── FieldEditor.tsx               # Modal for editing fields
├── SchemaMetadataPanel.tsx       # Schema name/description
├── SaveActions.tsx               # Save/export/discard buttons
└── index.ts                      # Public exports
```

## Core Components

### SchemaStudioLayout

**Main container** with resizable split panes.

```tsx
<SchemaStudioLayout
  sessionId="session-123"
  collectionId="collection-456"
  collectionName="Tax Documents"
/>
```

**Features:**
- 40/60 default split (chat/canvas)
- Resizable divider (min 30%, max 70%)
- localStorage persistence for user preferences
- Responsive layout handling

### ChatPane

**Left pane** for AI-driven schema generation.

```tsx
<ChatPane
  sessionId="session-123"
  collectionId="collection-456"
  collectionName="Tax Documents"
/>
```

**Features:**
- Message history with user/assistant bubbles
- Suggested prompts for new users
- Real-time streaming responses
- Schema change indicators
- Auto-scroll to latest message

### CanvasPane

**Right pane** for visual field editing.

```tsx
<CanvasPane
  sessionId="session-123"
  collectionId="collection-456"
/>
```

**Features:**
- Schema metadata panel (name, description)
- Field list with visual cards
- Validation feedback display
- Save/export/discard actions
- Status indicators

### FieldCard

**Visual card** representing a schema field.

```tsx
<FieldCard
  field={field}
  onEdit={handleEdit}
  onDelete={handleDelete}
  isHighlighted={field.created_by === 'ai'}
/>
```

**Features:**
- Type color-coding (string=blue, number=green, etc.)
- Required/optional badge
- Validation rule indicators
- Drag handle for reordering
- Edit/delete actions (shown on hover)
- AI-created indicator (sparkles icon)
- Pulse animation for new fields

### FieldEditor

**Modal dialog** for advanced field editing.

```tsx
<FieldEditor
  field={selectedField}
  open={isEditorOpen}
  onSave={handleSave}
  onCancel={handleCancel}
/>
```

**Features:**
- Field name with pattern validation
- Field type selector (string, number, boolean, array, object)
- Description textarea
- Required/optional checkbox
- Default value input
- Collapsible validation rules section:
  - Pattern (regex)
  - String length constraints (min/max)
  - Number range constraints (min/max)
  - Enum values

### SchemaCanvas

**Container** for the field list.

```tsx
<SchemaCanvas sessionId="session-123" />
```

**Features:**
- Scrollable field list
- Empty state with call-to-action
- Add field button
- Integration with FieldEditor
- Drag-and-drop reordering (TODO)

### SchemaMetadataPanel

**Inline editing** for schema name and description.

```tsx
<SchemaMetadataPanel sessionId="session-123" />
```

**Features:**
- Click-to-edit name
- Click-to-edit description
- Auto-save on blur
- Keyboard shortcuts (Enter to save, Escape to cancel)

### SaveActions

**Action buttons** for save/export/discard.

```tsx
<SaveActions
  onSave={handleSave}
  onExport={handleExport}
  onDiscard={handleDiscard}
  isDirty={true}
  isSaving={false}
/>
```

**Features:**
- Save button (disabled when clean)
- Export dropdown (JSON/YAML)
- Discard with confirmation
- Loading states

## Type Definitions

### SchemaField

Core field definition stored in `schema_fields` table:

```typescript
interface SchemaField {
  id: string;
  schema_id?: string;
  session_id: string;
  field_path: string;
  field_name: string;
  parent_field_id?: string;
  field_type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  is_required: boolean;
  validation_rules: ValidationRules;
  default_value?: string;
  position: number;
  visual_metadata: FieldVisualMetadata;
  created_by: 'ai' | 'user' | 'template';
  created_at?: string;
  updated_at?: string;
}
```

### ValidationRules

JSON Schema-compatible validation rules:

```typescript
interface ValidationRules {
  pattern?: string;           // Regex pattern
  minLength?: number;         // Min string length
  maxLength?: number;         // Max string length
  minimum?: number;           // Min number value
  maximum?: number;           // Max number value
  enum?: string[];            // Allowed values
  [key: string]: unknown;     // Additional rules
}
```

### TYPE_COLORS

Color mappings for field types:

```typescript
const TYPE_COLORS = {
  string: '#3b82f6',   // blue
  number: '#10b981',   // green
  boolean: '#8b5cf6',  // purple
  array: '#f59e0b',    // orange
  object: '#14b8a6'    // teal
};
```

## Usage Example

```tsx
import { SchemaStudioLayout } from '@/components/schema-studio';

export default function SchemaEditorPage() {
  const sessionId = useSessionId();
  const collectionId = useParams().collectionId;

  return (
    <div className="h-screen">
      <SchemaStudioLayout
        sessionId={sessionId}
        collectionId={collectionId}
        collectionName="Tax Documents"
      />
    </div>
  );
}
```

## State Management

The Schema Studio uses **Zustand** for state management (to be implemented):

```typescript
// frontend/hooks/schema-chat/useSchemaStore.ts
interface SchemaStore {
  sessionId: string | null;
  schemaId: string | null;
  fields: SchemaField[];
  selectedField: SchemaField | null;
  isDirty: boolean;
  isSaving: boolean;

  setSessionId: (id: string) => void;
  setFields: (fields: SchemaField[]) => void;
  addField: (field: SchemaField) => void;
  updateField: (id: string, updates: Partial<SchemaField>) => void;
  deleteField: (id: string) => void;
  reorderFields: (startIndex: number, endIndex: number) => void;
  setSelectedField: (field: SchemaField | null) => void;
  markDirty: () => void;
  markClean: () => void;
  setIsSaving: (saving: boolean) => void;
}
```

## Real-Time Synchronization

The Schema Studio implements **bidirectional sync** between AI and visual editor:

### AI → Visual Flow

1. User sends chat message
2. AI responds with schema changes
3. Parse response to extract field definitions
4. Diff against current fields (added, modified, deleted)
5. Batch insert to `schema_fields` (Supabase)
6. Real-time subscription fires
7. `useSchemaSync` receives new fields
8. Store updates via `addField()`
9. FieldCard renders with slide-in animation
10. Highlight new fields for 3 seconds (pulse)

### Visual → AI Flow

1. User edits field in FieldEditor
2. Optimistic update to store
3. Debounced save to Supabase (500ms)
4. Include current schema in next chat payload
5. AI uses updated schema as context

## Animations

The Schema Studio uses **framer-motion** for smooth animations:

### Field Card Animations

```typescript
// Slide in from top
const cardVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -100, transition: { duration: 0.2 } }
};

// Pulse for AI-created fields
const pulseVariants = {
  pulse: {
    scale: [1, 1.02, 1],
    borderColor: [typeColor, `${typeColor}80`, typeColor],
    transition: { duration: 3, ease: 'easeInOut' }
  }
};
```

## Styling

The Schema Studio follows **shadcn/ui** design patterns:

- Uses CSS variables for theming
- Responsive design with Tailwind CSS
- Dark mode support via theme provider
- Consistent spacing with Tailwind spacing scale
- Accessible color contrasts

## TODO: Implementation Checklist

### Phase 1: Foundation (Weeks 1-2)
- [x] Create base component structure
- [x] Implement split-pane layout
- [x] Build ChatPane with message display
- [x] Build CanvasPane with field list
- [x] Create FieldCard with visual design
- [x] Create FieldEditor modal
- [ ] Implement Zustand store
- [ ] Add Supabase integration
- [ ] Implement basic CRUD operations

### Phase 2: Advanced Features (Weeks 3-4)
- [ ] Integrate RJSF for advanced widgets
- [ ] Implement real-time Supabase subscriptions
- [ ] Build AI → Visual sync pipeline
- [ ] Add debounced auto-save
- [ ] Implement validation endpoint
- [ ] Add optimistic updates with rollback
- [ ] Create version history tracking

### Phase 3: Polish (Weeks 5-6)
- [ ] Integrate dnd-kit for drag-and-drop
- [ ] Add framer-motion animations
- [ ] Implement nested object support
- [ ] Add test panel slide-out
- [ ] Add keyboard shortcuts
- [ ] Write unit tests
- [ ] Performance optimization

## Dependencies

### Installed
- `react-resizable-panels` - For split panes
- `@radix-ui/react-dialog` - For modals
- `@radix-ui/react-alert-dialog` - For confirmations
- `framer-motion` - For animations
- `zustand` - For state management
- `zod` - For validation

### To Install (Phase 1)
```bash
npm install @rjsf/core@5.20.0 \
            @rjsf/utils@5.20.0 \
            @rjsf/validator-ajv8@5.20.0 \
            @dnd-kit/core@6.1.0 \
            @dnd-kit/sortable@8.0.0 \
            use-debounce@10.0.0
```

## Database Schema

The Schema Studio requires these Supabase tables:

```sql
-- schema_fields: Individual field definitions
CREATE TABLE schema_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID REFERENCES extraction_schemas(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  field_name TEXT NOT NULL,
  parent_field_id UUID REFERENCES schema_fields(id) ON DELETE CASCADE,
  field_type TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB DEFAULT '{}',
  default_value TEXT,
  position INTEGER NOT NULL,
  visual_metadata JSONB DEFAULT '{}',
  created_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(schema_id, field_path),
  UNIQUE(session_id, field_path)
);

-- schema_versions: Version history
CREATE TABLE schema_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID REFERENCES extraction_schemas(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  schema_snapshot JSONB NOT NULL,
  field_snapshot JSONB NOT NULL,
  change_type TEXT NOT NULL,
  change_summary TEXT,
  changed_fields TEXT[],
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

### Validation Endpoint

```typescript
// POST /api/schemas/validate
{
  "schema": { /* JSON Schema object */ }
}

// Response
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "compiled_schema": { /* OpenAI-compatible schema */ }
}
```

All other operations use **direct Supabase client** access with RLS policies.

## Contributing

When adding new features:

1. Follow existing TypeScript patterns
2. Add JSDoc comments to all components
3. Include TODO comments for incomplete features
4. Use shadcn/ui components when possible
5. Maintain accessibility (ARIA labels, keyboard nav)
6. Write unit tests for utility functions
7. Update this README with new features

## License

Part of the AI-Tax project.
