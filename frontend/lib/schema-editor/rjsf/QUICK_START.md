# RJSF Integration - Quick Start Guide

## What Was Created

A complete RJSF v5 integration for visual schema field editing, with **2,783 lines** of TypeScript/React code.

### Files Created

```
/frontend/lib/schema-editor/rjsf/
├── types.ts (360 lines)
│   └── Comprehensive TypeScript types for RJSF v5 and Pydantic compatibility
├── rjsf-config.ts (500 lines)
│   └── RJSF configuration, theme, and shadcn/ui integration
├── field-to-schema.ts (559 lines)
│   └── Bidirectional conversion utilities (Field ↔ JSON Schema)
├── index.ts (120 lines)
│   └── Main export file with all public APIs
├── README.md (13,901 chars)
│   └── Comprehensive documentation with examples
├── QUICK_START.md (this file)
└── custom-widgets/ (1,244 lines total)
    ├── PydanticTypeWidget.tsx (266 lines)
    ├── ValidationRulesWidget.tsx (403 lines)
    ├── DescriptionWidget.tsx (228 lines)
    ├── DefaultValueWidget.tsx (332 lines)
    └── index.ts (15 lines)
```

## Installation Steps

### 1. Install RJSF Dependencies

```bash
cd /home/laugustyniak/github/legal-ai/AI-Tax/frontend

npm install @rjsf/core@5.20.0 \
            @rjsf/utils@5.20.0 \
            @rjsf/validator-ajv8@5.20.0 \
            @rjsf/mui@5.20.0
```

### 2. Verify Installation

```bash
npm list @rjsf/core @rjsf/utils @rjsf/validator-ajv8 @rjsf/mui
```

## Quick Integration

### Basic Field Editor Component

Create a new file: `/frontend/components/schema-chat/FieldEditorModal.tsx`

```tsx
'use client';

import * as React from 'react';
import { Form } from '@rjsf/mui';
import validator from '@rjsf/validator-ajv8';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  fieldEditorSchema,
  fieldEditorUiSchema,
  PydanticTypeWidget,
  ValidationRulesWidget,
  DescriptionWidget,
  DefaultValueWidget,
  defaultFieldEditorData,
  type FieldEditorFormData,
  type SchemaField,
} from '@/lib/schema-editor/rjsf';

// Register custom widgets
const widgets = {
  PydanticTypeWidget,
  ValidationRulesWidget,
  DescriptionWidget,
  DefaultValueWidget,
};

interface FieldEditorModalProps {
  field: SchemaField | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: FieldEditorFormData) => void;
}

export function FieldEditorModal({
  field,
  open,
  onClose,
  onSave,
}: FieldEditorModalProps) {
  const formData: FieldEditorFormData = field
    ? {
        field_name: field.field_name,
        field_type: field.field_type,
        description: field.description,
        is_required: field.is_required,
        default_value: field.default_value,
        validation_rules: field.validation_rules,
        visual_metadata: field.visual_metadata,
      }
    : defaultFieldEditorData;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {field ? 'Edit Field' : 'New Field'}
          </DialogTitle>
        </DialogHeader>

        <Form
          schema={fieldEditorSchema}
          uiSchema={fieldEditorUiSchema}
          validator={validator}
          widgets={widgets}
          formData={formData}
          onSubmit={({ formData }) => {
            onSave(formData as FieldEditorFormData);
            onClose();
          }}
          onError={(errors) => {
            console.error('Form validation errors:', errors);
          }}
        >
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {field ? 'Save Changes' : 'Create Field'}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

### Using the Field Editor

```tsx
'use client';

import { useState } from 'react';
import { FieldEditorModal } from './FieldEditorModal';
import { Button } from '@/components/ui/button';
import type { SchemaField, FieldEditorFormData } from '@/lib/schema-editor/rjsf';

export function SchemaCanvas() {
  const [editingField, setEditingField] = useState<SchemaField | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateField = () => {
    setEditingField(null);
    setIsModalOpen(true);
  };

  const handleEditField = (field: SchemaField) => {
    setEditingField(field);
    setIsModalOpen(true);
  };

  const handleSaveField = async (data: FieldEditorFormData) => {
    // TODO: Save to Supabase
    console.log('Saving field:', data);

    // If editing existing field
    if (editingField) {
      // Update field in database
      // await updateField(editingField.id, data);
    } else {
      // Create new field in database
      // await createField(data);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleCreateField}>
        Add Field
      </Button>

      {/* Your field list here */}

      <FieldEditorModal
        field={editingField}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveField}
      />
    </div>
  );
}
```

## Key Features

### 1. Custom Widgets

#### PydanticTypeWidget
- Visual type selector with icons and colors
- Categorized by Basic, Complex, and Specialized types
- Includes descriptions and examples for each type

#### ValidationRulesWidget
- Dynamic validation rules based on field type
- Collapsible UI to save space
- Support for string, numeric, array, and enum validation
- Active rule counter badge

#### DescriptionWidget
- Rich text editor with character counter
- Example description generator
- Writing tips and quality indicators
- Auto-resize textarea

#### DefaultValueWidget
- Type-specific input controls
- Date/time pickers for temporal types
- Boolean checkbox toggles
- Format validation for email, URL, UUID

### 2. Conversion Utilities

Convert between SchemaField and JSON Schema:

```tsx
import {
  fieldsToJsonSchema,
  jsonSchemaToFields,
} from '@/lib/schema-editor/rjsf';

// Fields → JSON Schema
const result = fieldsToJsonSchema(fields, 'Schema Title', 'Description');
if (result.success) {
  console.log(result.schema);
}

// JSON Schema → Fields
const fields = jsonSchemaToFields(schema, sessionId);
```

### 3. Validation

Built-in validation for:
- Field name format (snake_case)
- Duplicate field names
- JSON Schema structure
- Validation rule compatibility

### 4. Theme Integration

Fully styled to match shadcn/ui:
- CSS variable-based theming
- Tailwind classes
- Consistent spacing and typography
- Responsive design

## Next Steps

### Phase 2: Integration (Week 3-4)

1. **Create FieldEditor Modal** ✅ (example above)
   - Use the provided `FieldEditorModal` component
   - Integrate with your existing schema-chat UI

2. **Implement useFieldCRUD Hook**
   ```tsx
   // Create: /frontend/hooks/schema-chat/useFieldCRUD.ts
   // For optimistic updates and Supabase operations
   ```

3. **Add Field Validation Hook**
   ```tsx
   // Create: /frontend/hooks/schema-chat/useSchemaValidation.ts
   // For backend validation via /api/schemas/validate
   ```

4. **Backend Validation Endpoint**
   ```python
   # Already documented in unified-schema-editor-implementation-plan.md
   # Add to: backend/app/api/schemas.py
   @router.post("/schemas/validate")
   async def validate_schema_structure(schema: dict[str, Any])
   ```

### Testing the Integration

1. **Unit Tests**
   ```bash
   # Create test file
   touch frontend/__tests__/schema-editor/rjsf/field-to-schema.test.ts

   # Run tests
   npm test -- field-to-schema
   ```

2. **Manual Testing**
   - Open schema-chat page
   - Click "Add Field"
   - Fill in field details using custom widgets
   - Verify validation works
   - Save and check Supabase

### Database Setup

Make sure you've run the migrations from the unified plan:

```sql
-- See: /docs/reference/unified-schema-editor-implementation-plan.md
-- Migrations 1-4 for schema_fields and schema_versions tables
```

## Troubleshooting

### Missing Dependencies
```bash
npm install --save-dev @types/react @types/node
```

### Widget Not Rendering
Make sure widgets are registered:
```tsx
const widgets = {
  PydanticTypeWidget,
  ValidationRulesWidget,
  DescriptionWidget,
  DefaultValueWidget,
};

<Form widgets={widgets} ... />
```

### Styles Not Working
1. Verify Tailwind CSS is configured
2. Check shadcn/ui CSS variables in globals.css
3. Ensure shadcn/ui components are installed

## Documentation

- **Complete Documentation**: See `README.md` in this directory
- **Type Definitions**: See `types.ts`
- **Configuration Options**: See `rjsf-config.ts`
- **Unified Plan**: `/docs/reference/unified-schema-editor-implementation-plan.md`

## Example Usage Patterns

### Validate Field Before Saving

```tsx
import { validateFieldName, checkDuplicateFieldName } from '@/lib/schema-editor/rjsf';

function validateBeforeSave(data: FieldEditorFormData, existingFields: SchemaField[]) {
  // Check format
  const nameValidation = validateFieldName(data.field_name);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.error);
  }

  // Check duplicates
  const isDuplicate = checkDuplicateFieldName(
    data.field_name,
    undefined,
    existingFields
  );
  if (isDuplicate) {
    throw new Error('Field name already exists');
  }
}
```

### Compile Schema for Validation

```tsx
import { fieldsToJsonSchema } from '@/lib/schema-editor/rjsf';

async function validateWithBackend(fields: SchemaField[]) {
  const result = fieldsToJsonSchema(fields);

  if (!result.success) {
    console.error('Client-side errors:', result.errors);
    return false;
  }

  // Send to backend for Pydantic validation
  const response = await fetch('/api/schemas/validate', {
    method: 'POST',
    body: JSON.stringify(result.schema),
  });

  const validation = await response.json();
  return validation.valid;
}
```

## Success Metrics

After integration, you should be able to:

✅ Create new fields visually with RJSF form
✅ Edit existing fields in a modal dialog
✅ See type-specific validation rules
✅ Convert fields to JSON Schema for extraction
✅ Parse AI-generated schemas into fields
✅ Validate schemas before saving

## Support

For issues or questions:
1. Check the comprehensive `README.md`
2. Review the unified implementation plan
3. Check RJSF v5 documentation: https://rjsf-team.github.io/react-jsonschema-form/
4. Review shadcn/ui components: https://ui.shadcn.com/

---

**Created**: 2025-10-19
**Phase**: Week 3 (RJSF Integration & Validation)
**Status**: Ready for Integration
