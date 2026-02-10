# Schema Save Implementation

## Overview

This document describes the implementation of automatic schema persistence from the Schema Studio to the Supabase `extraction_schemas` table.

## Implementation Date

2025-10-29

## What Was Implemented

### 1. Schema Compilation Logic (`lib/schema-editor/compiler.ts`)

A comprehensive compiler that converts the visual editor's field structure (`SchemaField[]`) into valid JSON Schema format.

**Key Features:**
- Converts `SchemaField` objects to JSON Schema properties
- Handles nested objects and arrays
- Applies validation rules (min/max length, patterns, enums, etc.)
- Provides compilation warnings and errors
- Exports schemas as JSON or YAML

**Main Functions:**
- `compileSchemaFieldsToJSONSchema()` - Main compilation function
- `validateCompiledSchema()` - Structural validation
- `exportSchemaAsJSON()` - Export to JSON format
- `exportSchemaAsYAML()` - Export to YAML format

### 2. Schema Service Layer (`lib/schema-editor/service.ts`)

A service class that provides a clean API for schema operations.

**Key Features:**
- Prepares schemas (compiles and validates)
- Creates new schemas via POST /api/schemas
- Updates existing schemas via PUT /api/schemas
- Handles API communication and error handling

**Main Class:**
- `SchemaService` - Service class with methods:
  - `prepareSchema()` - Compile and validate
  - `createSchema()` - Create new schema
  - `updateSchema()` - Update existing schema
  - `saveSchema()` - Smart save (create or update)

### 3. Canvas Pane Integration (`components/schema-studio/CanvasPane.tsx`)

Updated the Canvas Pane component to implement full save functionality.

**Key Features:**
- Connected to Zustand store for state management
- Implemented `handleSave()` with validation and error handling
- Implemented `handleExport()` for downloading schemas
- Implemented `handleDiscard()` for resetting changes
- Real-time validation feedback with success/error alerts
- Toast notifications for user feedback

**Save Flow:**
1. Validate metadata (name is required)
2. Validate field count (at least one field)
3. Compile fields to JSON Schema
4. Validate compiled schema
5. Send to API (create or update)
6. Update store state on success
7. Show success/error feedback

### 4. API Route Fixes (`app/api/schemas/route.ts`)

Fixed the API routes to use correct database column names.

**Changes:**
- Updated POST endpoint to use camelCase column names (`userId`, `createdAt`, `updatedAt`)
- Updated PUT endpoint to use camelCase and handle partial updates
- Updated DELETE endpoint to use camelCase (`userId`)
- Removed snake_case references (`user_id`, `created_at`, `updated_at`)

### 5. Validation Schema Updates (`lib/validation/schema-endpoints.ts`)

Updated Zod validation schemas to match database expectations.

**Changes:**
- Changed `text` field from object to string (JSON-stringified)
- Made `description` optional
- Added `dates` field as optional
- Added JSON validation for `text` field

## Database Table: `extraction_schemas`

**Columns:**
- `id` (UUID) - Primary key
- `name` (string) - Schema name
- `description` (string, nullable) - Description
- `category` (string) - Schema category
- `type` (string) - Schema type (e.g., "json_schema")
- `text` (string) - JSON-stringified schema content
- `dates` (JSON) - Date metadata
- `userId` (string, nullable) - User who created the schema
- `createdAt` (timestamp) - Creation timestamp
- `updatedAt` (timestamp) - Last update timestamp

## Flow Diagram

```
User Edits Schema in Canvas
         ↓
User Clicks "Save"
         ↓
CanvasPane.handleSave()
         ↓
SchemaService.saveSchema()
         ↓
SchemaService.prepareSchema()
    - Compile fields to JSON Schema
    - Validate structure
         ↓
SchemaService.createSchema() or updateSchema()
    - Build API payload
    - POST/PUT to /api/schemas
         ↓
API Route (/api/schemas)
    - Validate request
    - Insert/Update in extraction_schemas
    - Return saved schema
         ↓
Update Zustand Store
    - Mark as clean
    - Update metadata
         ↓
Show Success Notification
```

## Usage Example

### Creating a New Schema

```typescript
import { schemaService } from '@/lib/schema-editor/service';

const fields: SchemaField[] = [
  {
    id: 'field-1',
    field_name: 'company_name',
    field_type: 'string',
    is_required: true,
    description: 'Name of the company',
    validation_rules: { minLength: 1, maxLength: 255 },
    // ... other properties
  },
];

const metadata: SchemaMetadata = {
  name: 'Company Information',
  description: 'Schema for extracting company details',
  field_count: 1,
};

const result = await schemaService.createSchema(fields, metadata);

if (result.success) {
  console.log('Schema saved with ID:', result.schemaId);
} else {
  console.error('Save failed:', result.errors);
}
```

### Compiling Schema Manually

```typescript
import { compileSchemaFieldsToJSONSchema } from '@/lib/schema-editor/compiler';

const result = compileSchemaFieldsToJSONSchema(fields, metadata);

if (result.success && result.schema) {
  console.log('Compiled JSON Schema:', result.schema);
}
```

## Error Handling

The implementation includes comprehensive error handling at multiple levels:

1. **Client-side Validation:**
   - Schema name required
   - At least one field required
   - Field structure validation

2. **Compilation Errors:**
   - Invalid field types
   - Missing nested properties
   - Circular references

3. **API Errors:**
   - Network failures
   - Authentication errors
   - Database constraint violations

4. **User Feedback:**
   - Toast notifications
   - Alert banners
   - Validation error lists

## Testing Recommendations

To test the implementation:

1. **Create a new schema:**
   - Navigate to /schema-chat
   - Use AI chat to generate fields
   - Fill in schema name
   - Click "Save"
   - Verify in Supabase dashboard

2. **Update existing schema:**
   - Load saved schema
   - Modify fields
   - Click "Save"
   - Verify changes persisted

3. **Export functionality:**
   - Create a schema
   - Click "Export" → JSON
   - Verify downloaded file
   - Click "Export" → YAML
   - Verify downloaded file

4. **Error scenarios:**
   - Try saving without name (should show error)
   - Try saving empty schema (should show error)
   - Check network error handling

## Files Created/Modified

### Created:
- `frontend/lib/schema-editor/compiler.ts` - Schema compilation logic
- `frontend/lib/schema-editor/service.ts` - Service layer for API communication
- `frontend/lib/schema-editor/index.ts` - Export module
- `frontend/docs/schema-save-implementation.md` - This documentation

### Modified:
- `frontend/components/schema-studio/CanvasPane.tsx` - Added save functionality
- `frontend/app/api/schemas/route.ts` - Fixed column name issues
- `frontend/lib/validation/schema-endpoints.ts` - Updated validation schemas

## Future Enhancements

Potential improvements for future iterations:

1. **Auto-save:**
   - Implement debounced auto-save on field changes
   - Add "Saving..." indicator
   - Store draft versions

2. **Version History:**
   - Track schema versions in separate table
   - Allow rollback to previous versions
   - Show version diff

3. **Validation Backend:**
   - Add backend JSON Schema validation
   - Implement custom validation rules
   - Add test runner for schemas

4. **Collaboration:**
   - Real-time collaborative editing
   - Conflict resolution
   - User presence indicators

5. **Templates:**
   - Save schemas as templates
   - Template marketplace
   - Quick-start templates

## Troubleshooting

### Schema not saving

**Check:**
1. Browser console for errors
2. Network tab for API response
3. Supabase logs for database errors
4. Authentication state

### Validation errors

**Check:**
1. Schema name is not empty
2. At least one field exists
3. Field names are unique within parent
4. All required metadata is present

### API errors

**Common issues:**
- Column name mismatch (use camelCase)
- Missing authentication token
- Invalid JSON in text field
- Database constraints (unique, foreign key)

## Contact

For questions or issues, please check:
- Schema Studio README: `components/schema-studio/README.md`
- Type definitions: `hooks/schema-editor/types.ts`
- API documentation: `app/api/schemas/route.ts`
