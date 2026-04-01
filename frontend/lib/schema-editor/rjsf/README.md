# RJSF Integration for Schema Editor

React JSON Schema Form (RJSF) v5 integration for visual schema field editing with Pydantic compatibility.

## Overview

This module provides a complete RJSF v5 integration for editing schema fields in the Juddges application. It includes:

- **Custom widgets** for Pydantic field types
- **Field templates** matching shadcn/ui design
- **Error handling** with comprehensive validation
- **Type conversion** utilities for bidirectional schema transformation
- **Theme customization** for consistent styling with shadcn/ui

## Directory Structure

```
lib/schema-editor/rjsf/
├── types.ts                     # TypeScript type definitions
├── rjsf-config.ts              # RJSF configuration and theme
├── field-to-schema.ts          # Conversion utilities
├── index.ts                    # Main export file
├── README.md                   # This file
└── custom-widgets/
    ├── PydanticTypeWidget.tsx  # Type selector with visual indicators
    ├── ValidationRulesWidget.tsx # Validation rule builder
    ├── DescriptionWidget.tsx   # Rich text description editor
    ├── DefaultValueWidget.tsx  # Default value editor
    └── index.ts                # Widget exports
```

## Installation

The required dependencies should already be installed. If not, run:

```bash
npm install @rjsf/core@5.20.0 \
            @rjsf/utils@5.20.0 \
            @rjsf/validator-ajv8@5.20.0 \
            @rjsf/mui@5.20.0
```

## Usage

### Basic Field Editor

```tsx
import { Form } from '@rjsf/mui';
import validator from '@rjsf/validator-ajv8';
import {
  fieldEditorSchema,
  fieldEditorUiSchema,
  PydanticTypeWidget,
  ValidationRulesWidget,
  DescriptionWidget,
  DefaultValueWidget,
  type FieldEditorFormData,
} from '@/lib/schema-editor/rjsf';

const widgets = {
  PydanticTypeWidget,
  ValidationRulesWidget,
  DescriptionWidget,
  DefaultValueWidget,
};

export function FieldEditorModal({
  field,
  onSave,
  onCancel
}: {
  field: FieldEditorFormData | null;
  onSave: (data: FieldEditorFormData) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={!!field} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {field?.field_name ? 'Edit Field' : 'New Field'}
          </DialogTitle>
        </DialogHeader>

        <Form
          schema={fieldEditorSchema}
          uiSchema={fieldEditorUiSchema}
          validator={validator}
          widgets={widgets}
          formData={field || defaultFieldEditorData}
          onSubmit={({ formData }) => onSave(formData)}
          onError={(errors) => console.error('Validation errors:', errors)}
        />
      </DialogContent>
    </Dialog>
  );
}
```

### Converting Fields to JSON Schema

```tsx
import { fieldsToJsonSchema } from '@/lib/schema-editor/rjsf';
import type { SchemaField } from '@/lib/schema-editor/rjsf';

function compileSchema(fields: SchemaField[]) {
  const result = fieldsToJsonSchema(
    fields,
    'Tax Extraction Schema',
    'Schema for extracting tax information from documents'
  );

  if (result.success) {
    console.log('Compiled schema:', result.schema);

    if (result.warnings && result.warnings.length > 0) {
      console.warn('Warnings:', result.warnings);
    }
  } else {
    console.error('Compilation errors:', result.errors);
  }
}
```

### Converting JSON Schema to Fields

```tsx
import { jsonSchemaToFields } from '@/lib/schema-editor/rjsf';
import type { RJSFSchema } from '@/lib/schema-editor/rjsf';

function parseExistingSchema(schema: RJSFSchema, sessionId: string) {
  const fields = jsonSchemaToFields(schema, sessionId);
  console.log('Parsed fields:', fields);
  return fields;
}
```

### Validating Field Names

```tsx
import { validateFieldName, checkDuplicateFieldName } from '@/lib/schema-editor/rjsf';

function validateNewField(
  fieldName: string,
  existingFields: SchemaField[]
) {
  // Check format
  const formatValidation = validateFieldName(fieldName);
  if (!formatValidation.valid) {
    return { valid: false, error: formatValidation.error };
  }

  // Check duplicates
  const isDuplicate = checkDuplicateFieldName(
    fieldName,
    undefined, // parent field ID
    existingFields
  );

  if (isDuplicate) {
    return { valid: false, error: 'A field with this name already exists' };
  }

  return { valid: true };
}
```

### Using Validation Rules Builder

```tsx
import { ValidationRulesBuilder } from '@/lib/schema-editor/rjsf';

// Build validation rules programmatically
const emailRules = new ValidationRulesBuilder()
  .format('email')
  .maxLength(255)
  .pattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
  .build();

const ageRules = new ValidationRulesBuilder()
  .minimum(0)
  .maximum(150)
  .build();

const invoiceNumberRules = new ValidationRulesBuilder()
  .pattern('^[A-Z]{2}-\\d{4}-\\d{6}$')
  .minLength(14)
  .maxLength(14)
  .build();
```

## Custom Widgets

### PydanticTypeWidget

Visual type selector with descriptions, examples, and color-coded badges.

**Features:**
- Categorized type selection (Basic, Complex, Specialized)
- Visual type indicators with icons
- Type descriptions and examples
- Color-coded badges

**Props:**
- `value: PydanticFieldType` - Current field type
- `onChange: (value: PydanticFieldType) => void` - Change handler

### ValidationRulesWidget

Collapsible validation rule builder with dynamic fields based on field type.

**Features:**
- Dynamic form fields based on selected field type
- Collapsible UI to reduce clutter
- Tooltips with rule descriptions
- Array/enum value management
- Active rule counter badge

**Props:**
- `value: ValidationRules` - Current validation rules
- `onChange: (value: ValidationRules) => void` - Change handler
- `fieldType?: PydanticFieldType` - Current field type (from context)

### DescriptionWidget

Rich text description editor with character count and writing tips.

**Features:**
- Character counter with visual warnings
- Example description generator
- Writing tips tooltip
- Quality indicators (length, format, examples)
- Auto-resize textarea

**Props:**
- `value: string` - Current description
- `onChange: (value: string) => void` - Change handler

### DefaultValueWidget

Dynamic default value editor that adapts to field type.

**Features:**
- Type-specific input controls
- Date/time pickers for temporal types
- Boolean checkbox toggles
- Format validation (email, URL, UUID)
- Clear value button
- Type indicator badges

**Props:**
- `value: string | number | boolean | null | undefined` - Current default value
- `onChange: (value: ...) => void` - Change handler
- `fieldType?: PydanticFieldType` - Current field type (from context)

## Configuration

### Theme Customization

The RJSF theme is configured to match shadcn/ui design system:

```tsx
import { rjsfTheme } from '@/lib/schema-editor/rjsf';

console.log(rjsfTheme.colors.primary); // 'hsl(var(--primary))'
console.log(rjsfTheme.spacing.md);     // '1rem'
console.log(rjsfTheme.borderRadius.md); // '0.5rem'
```

### Class Names

Custom class names are provided for all RJSF components:

```tsx
import { rjsfClassNames } from '@/lib/schema-editor/rjsf';

// Use in custom templates
<div className={rjsfClassNames.fieldWrapper}>
  <label className={rjsfClassNames.label}>Field Name</label>
  <input className={rjsfClassNames.input} />
</div>
```

### Type Colors and Icons

Visual indicators for field types:

```tsx
import { fieldTypeColors, fieldTypeIcons } from '@/lib/schema-editor/rjsf';

// Get color for a field type
const color = fieldTypeColors.string; // 'hsl(221, 83%, 53%)' (blue)

// Get icon name for a field type
const icon = fieldTypeIcons.email; // 'Mail'
```

## Type Definitions

### PydanticFieldType

Supported Pydantic field types:

```typescript
type PydanticFieldType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'date'
  | 'datetime'
  | 'time'
  | 'email'
  | 'url'
  | 'uuid'
  | 'enum';
```

### ValidationRules

Validation constraints for schema fields:

```typescript
interface ValidationRules {
  // String validation
  pattern?: string;
  format?: 'email' | 'uri' | 'uuid' | 'date' | 'date-time' | 'time';
  minLength?: number;
  maxLength?: number;

  // Numeric validation
  minimum?: number;
  maximum?: number;
  multipleOf?: number;

  // Array validation
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Enum validation
  enum?: Array<string | number | boolean>;
}
```

### SchemaField

Database representation of a schema field:

```typescript
interface SchemaField {
  id: string;
  schema_id?: string;
  session_id: string;

  field_path: string;
  field_name: string;
  parent_field_id?: string;

  field_type: PydanticFieldType;
  description?: string;
  is_required: boolean;

  validation_rules: ValidationRules;
  default_value?: string | number | boolean | null;

  position: number;
  visual_metadata: VisualMetadata;

  created_by: 'ai' | 'user' | 'template';
  created_at?: string;
  updated_at?: string;
}
```

## Validation

### Schema Validation

```tsx
import { validateJsonSchema } from '@/lib/schema-editor/rjsf';

const result = validateJsonSchema(schema);

if (!result.valid) {
  console.error('Errors:', result.errors);
}

if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

### Field Name Validation

Field names must:
- Start with a lowercase letter
- Contain only lowercase letters, numbers, and underscores
- Be 100 characters or less
- Not be a reserved keyword (`id`, `type`, `properties`, `required`, `default`, `enum`)

## Error Handling

All conversion functions include comprehensive error handling:

```tsx
import { fieldsToJsonSchema } from '@/lib/schema-editor/rjsf';

const result = fieldsToJsonSchema(fields);

if (!result.success) {
  // Handle errors
  result.errors?.forEach(error => {
    console.error('Schema compilation error:', error);
  });
} else {
  // Use compiled schema
  const schema = result.schema;

  // Check for warnings
  result.warnings?.forEach(warning => {
    console.warn('Schema warning:', warning);
  });
}
```

## Best Practices

### Field Descriptions

Write clear, specific descriptions:

✅ Good:
```
"The unique invoice number assigned by the tax authority (format: XX-YYYY-NNNN)"
```

❌ Bad:
```
"Invoice number"
```

### Validation Rules

Use appropriate validation for data types:

```tsx
// Email field
{
  field_type: 'email',
  validation_rules: {
    format: 'email',
    maxLength: 255,
  }
}

// Tax ID field
{
  field_type: 'string',
  validation_rules: {
    pattern: '^\\d{10}$',
    minLength: 10,
    maxLength: 10,
  }
}
```

### Nested Objects

Keep nesting depth to 3 levels or less for better UX:

```tsx
// Good: Shallow nesting
{
  company: {
    name: string,
    tax_id: string,
  }
}

// Avoid: Deep nesting
{
  company: {
    address: {
      location: {
        coordinates: {
          lat: number,
          lng: number,
        }
      }
    }
  }
}
```

## Integration with Unified Implementation Plan

This RJSF integration is part of Phase 2 (Weeks 3-4) of the unified schema editor implementation:

- ✅ Week 3: RJSF Integration & Validation
  - Build `FieldEditor` modal with RJSF
  - Create custom RJSF widgets for field types
  - Implement validation hooks
  - Add inline validation error display

See `/docs/reference/unified-schema-editor-implementation-plan.md` for complete details.

## Testing

Example unit tests for conversion utilities:

```tsx
import {
  fieldToJsonSchemaProperty,
  validateFieldName,
  validateJsonSchema,
} from '@/lib/schema-editor/rjsf';

describe('Field to Schema Conversion', () => {
  it('converts string field to JSON Schema property', () => {
    const field: SchemaField = {
      id: '1',
      session_id: 'test',
      field_name: 'email',
      field_path: 'email',
      field_type: 'email',
      description: 'User email address',
      is_required: true,
      validation_rules: {
        format: 'email',
        maxLength: 255,
      },
      position: 0,
      visual_metadata: {},
      created_by: 'user',
    };

    const result = fieldToJsonSchemaProperty(field);

    expect(result.schema.type).toBe('string');
    expect(result.schema.format).toBe('email');
    expect(result.schema.maxLength).toBe(255);
    expect(result.required).toBe(true);
  });
});
```

## Troubleshooting

### Widget not rendering

Make sure widgets are registered in the RJSF Form:

```tsx
const widgets = {
  PydanticTypeWidget,
  ValidationRulesWidget,
  DescriptionWidget,
  DefaultValueWidget,
};

<Form widgets={widgets} ... />
```

### Validation errors not showing

Ensure validator is passed to Form:

```tsx
import validator from '@rjsf/validator-ajv8';

<Form validator={validator} ... />
```

### Styles not matching shadcn/ui

Check that Tailwind CSS is properly configured and shadcn/ui CSS variables are defined in your globals.css.

## Contributing

When adding new widgets or modifying existing ones:

1. Follow the shadcn/ui design patterns
2. Add comprehensive TypeScript types
3. Include JSDoc comments
4. Add examples to this README
5. Update the unified implementation plan if needed

## License

Internal use only - Juddges project.
