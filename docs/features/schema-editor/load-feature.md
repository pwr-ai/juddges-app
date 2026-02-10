# Schema Load Feature

## Overview

This document describes the implementation of loading existing schemas from the database into the Schema Studio editor.

## Implementation Date

2025-10-29

## Feature Description

Users can now load previously saved schemas from the `extraction_schemas` table into the Schema Studio for editing, viewing, or testing.

## What Was Implemented

### 1. Service Layer Extensions (`lib/schema-editor/service.ts`)

Added three new methods to `SchemaService`:

#### `listSchemas()`
Fetches all schemas for the current user from `/api/schemas`.

**Returns:**
```typescript
{
  success: boolean;
  schemas?: SchemaSaveResponse[];
  error?: string;
}
```

#### `loadSchema(schemaId: string)`
Loads a specific schema by ID and parses it into `SchemaField[]` format.

**Returns:**
```typescript
{
  success: boolean;
  schema?: SchemaSaveResponse;
  fields?: SchemaField[];
  error?: string;
}
```

#### `parseJsonSchemaToFields(jsonSchema: CompiledJSONSchema)`
Private method that converts JSON Schema format back into the visual editor's field structure.

**Features:**
- Parses root-level properties
- Handles nested objects recursively
- Handles array item schemas
- Extracts validation rules
- Preserves field metadata
- Assigns proper field paths and relationships

### 2. UI Integration (`app/schema-chat/page.tsx`)

Added schema loading UI to the Settings dialog:

**New State:**
- `savedSchemas` - List of available schemas
- `isLoadingSchemas` - Loading indicator
- `selectedSchemaId` - Currently selected/loaded schema

**New Functions:**
- `fetchSavedSchemas()` - Fetches list of schemas
- `handleLoadSchema(schemaId)` - Loads and applies a schema

**UI Components:**
- Schema selector dropdown
- Refresh button
- Current schema indicator
- Loading states
- Empty state message

### 3. Store Integration

The load feature integrates with Zustand store:

1. **Initialize Session**: Updates session with loaded schema ID
2. **Set Fields**: Populates store with parsed fields
3. **Update Metadata**: Sets schema name, description, field count
4. **Mark Clean**: Indicates no unsaved changes after load

## User Flow

```
User Opens Settings Dialog
         ↓
System Fetches Saved Schemas
         ↓
User Selects Schema from Dropdown
         ↓
System Loads Schema
    - Parse JSON Schema
    - Convert to SchemaField[]
    - Update store
    - Update metadata
         ↓
Fields Appear in Canvas
Schema Ready for Editing
```

## Usage

### Loading a Schema

1. **Open Settings:**
   - Click the "Settings" button in Schema Studio header

2. **View Available Schemas:**
   - Schemas are listed with name, category, and last updated date
   - Click "Refresh" to reload the list

3. **Select a Schema:**
   - Choose a schema from the dropdown
   - System automatically loads it

4. **Edit or View:**
   - Fields appear in the visual canvas
   - Make changes as needed
   - Save updates with "Save" button

### Creating New vs Loading Existing

- **New Schema**: Click "Start New Schema Session" in settings
- **Load Existing**: Select from "Load Existing Schema" dropdown
- **Current Schema**: Shown at bottom of load section

## Code Example

### Loading a Schema Programmatically

```typescript
import { schemaService } from '@/lib/schema-editor/service';
import { useSchemaEditorStore } from '@/hooks/schema-editor/useSchemaEditorStore';

const loadSchemaById = async (schemaId: string, sessionId: string) => {
  // Load from database
  const result = await schemaService.loadSchema(schemaId);

  if (result.success && result.fields && result.schema) {
    const { setFields, updateMetadata, initializeSession } = useSchemaEditorStore.getState();

    // Initialize with schema ID
    initializeSession(sessionId, result.schema.id);

    // Set session IDs on fields
    result.fields.forEach(field => {
      field.session_id = sessionId;
    });

    // Load into store
    setFields(result.fields, true); // true = mark as clean

    // Update metadata
    updateMetadata({
      name: result.schema.name,
      description: result.schema.description,
      field_count: result.fields.length,
      last_saved: result.schema.updatedAt,
    });
  }
};
```

### Listing All Schemas

```typescript
const listAvailableSchemas = async () => {
  const result = await schemaService.listSchemas();

  if (result.success && result.schemas) {
    console.log('Available schemas:', result.schemas);
    // result.schemas is SchemaSaveResponse[]
  }
};
```

## JSON Schema to Field Conversion

### Input (JSON Schema in database)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "company_name": {
      "type": "string",
      "description": "Name of the company",
      "minLength": 1,
      "maxLength": 255
    },
    "address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" },
        "city": { "type": "string" }
      },
      "required": ["city"]
    }
  },
  "required": ["company_name"]
}
```

### Output (SchemaField[] in store)
```typescript
[
  {
    id: 'field-1234',
    field_name: 'company_name',
    field_type: 'string',
    field_path: 'root.company_name',
    description: 'Name of the company',
    is_required: true,
    validation_rules: { minLength: 1, maxLength: 255 },
    parent_field_id: null,
    // ... other properties
  },
  {
    id: 'field-5678',
    field_name: 'address',
    field_type: 'object',
    field_path: 'root.address',
    is_required: false,
    parent_field_id: null,
    // ... other properties
  },
  {
    id: 'field-9012',
    field_name: 'street',
    field_type: 'string',
    field_path: 'root.address.street',
    is_required: false,
    parent_field_id: 'field-5678',
    // ... other properties
  },
  {
    id: 'field-3456',
    field_name: 'city',
    field_type: 'string',
    field_path: 'root.address.city',
    is_required: true,
    parent_field_id: 'field-5678',
    // ... other properties
  }
]
```

## Supported Field Types

The parser handles all JSON Schema types:

- ✅ `string` - with pattern, minLength, maxLength, enum
- ✅ `number` - with minimum, maximum, multipleOf
- ✅ `boolean` - simple boolean fields
- ✅ `array` - with items schema
- ✅ `object` - with nested properties (recursive)

## Validation Rules Preserved

When loading a schema, these validation rules are preserved:

**String:**
- pattern
- minLength
- maxLength
- enum

**Number:**
- minimum
- maximum
- exclusiveMinimum
- exclusiveMaximum
- multipleOf

**Array:**
- minItems
- maxItems
- uniqueItems

**Object:**
- minProperties
- maxProperties

## Error Handling

### Schema Not Found
```typescript
{
  success: false,
  error: 'Schema with ID abc-123 not found'
}
```

### Invalid JSON
```typescript
{
  success: false,
  error: 'Schema contains invalid JSON'
}
```

### Network Error
```typescript
{
  success: false,
  error: 'Network error during fetch'
}
```

## Files Modified

### Modified:
- `frontend/lib/schema-editor/service.ts` - Added load methods
- `frontend/app/schema-chat/page.tsx` - Added UI and handlers

### Created:
- `frontend/docs/schema-load-feature.md` - This documentation

## Testing

### Manual Testing Steps:

1. **Load Empty State:**
   - Open Settings with no saved schemas
   - Verify "No saved schemas found" message

2. **Load Existing Schema:**
   - Save a schema first
   - Open Settings
   - Select schema from dropdown
   - Verify fields appear in canvas
   - Verify metadata is correct

3. **Load with Nested Fields:**
   - Create schema with nested objects
   - Save it
   - Load it back
   - Verify nested structure preserved

4. **Load with Validation Rules:**
   - Create schema with min/max constraints
   - Save and load
   - Verify validation rules preserved

5. **Edit Loaded Schema:**
   - Load a schema
   - Make changes
   - Save updates
   - Reload to verify changes persisted

## Limitations

1. **Visual Metadata**: Not stored in JSON Schema, so visual customizations (colors, icons) are not preserved
2. **Field IDs**: New IDs are generated on load (fields are recreated)
3. **Custom Validation**: Only standard JSON Schema validations are supported

## Future Enhancements

1. **Visual Metadata Persistence:**
   - Store visual_metadata separately in database
   - Restore colors, icons, collapsed states

2. **Version History:**
   - Load specific versions of schemas
   - Compare versions side-by-side

3. **Schema Preview:**
   - Show preview before loading
   - Display field count, types summary

4. **Bulk Operations:**
   - Load multiple schemas
   - Merge schemas
   - Duplicate schemas

5. **Search and Filter:**
   - Search schemas by name
   - Filter by category or date
   - Sort by various criteria

## Troubleshooting

### Schema doesn't load

**Check:**
1. Schema exists in database
2. User has permission to access it
3. JSON in `text` field is valid
4. Network connection is working

### Fields not appearing

**Check:**
1. Schema has properties defined
2. JSON Schema structure is valid
3. Browser console for errors
4. Store state using Redux DevTools

### Validation rules missing

**Check:**
1. Rules exist in original JSON Schema
2. Property names match expected format
3. Values are correct types (numbers, strings, etc.)

## Contact

For questions or issues:
- Schema Studio README: `components/schema-studio/README.md`
- Service documentation: `lib/schema-editor/service.ts`
- Type definitions: `hooks/schema-editor/types.ts`
