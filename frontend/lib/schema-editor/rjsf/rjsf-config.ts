/**
 * RJSF v5 Configuration and Theme Customization
 *
 * Configures React JSON Schema Form with:
 * - Custom widget mapping for Pydantic types
 * - Field templates matching shadcn/ui design
 * - Error list template
 * - Theme customization for consistent styling
 */

import type {
  RJSFSchema,
  UiSchema,
  RegistryWidgetsType,
  TemplatesType,
} from '@rjsf/utils';
import type { RJSFThemeConfig, PydanticFieldType, FieldEditorFormData } from './types';

/**
 * Theme configuration matching shadcn/ui design system
 */
export const rjsfTheme: RJSFThemeConfig = {
  colors: {
    primary: 'hsl(var(--primary))',
    secondary: 'hsl(var(--secondary))',
    accent: 'hsl(var(--accent))',
    destructive: 'hsl(var(--destructive))',
    muted: 'hsl(var(--muted))',
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    border: 'hsl(var(--border))',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  typography: {
    fontFamily: 'var(--font-sans)',
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
    },
  },
  borderRadius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
  },
};

/**
 * Pydantic type to JSON Schema type mapping
 */
export const pydanticToJsonSchemaType: Record<PydanticFieldType, string> = {
  string: 'string',
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
  date: 'string',
  datetime: 'string',
  time: 'string',
  email: 'string',
  url: 'string',
  uuid: 'string',
  enum: 'string',
};

/**
 * Pydantic type to JSON Schema format mapping
 */
export const pydanticToJsonSchemaFormat: Partial<Record<PydanticFieldType, string>> = {
  date: 'date',
  datetime: 'date-time',
  time: 'time',
  email: 'email',
  url: 'uri',
  uuid: 'uuid',
};

/**
 * JSON Schema for the field editor form
 *
 * This schema defines the structure of the form used to edit schema fields.
 * It uses RJSF to provide a rich editing experience.
 */
export const fieldEditorSchema: RJSFSchema = {
  type: 'object',
  required: ['field_name', 'field_type', 'is_required'],
  properties: {
    field_name: {
      type: 'string',
      title: 'Field Name',
      description: 'The name of the field (use snake_case)',
      pattern: '^[a-z][a-z0-9_]*$',
      minLength: 1,
      maxLength: 100,
    },
    field_type: {
      type: 'string',
      title: 'Field Type',
      description: 'The data type for this field',
      enum: [
        'string',
        'integer',
        'number',
        'boolean',
        'array',
        'object',
        'date',
        'datetime',
        'time',
        'email',
        'url',
        'uuid',
        'enum',
      ],
    },
    description: {
      type: 'string',
      title: 'Description',
      description: 'A clear description of what this field represents',
      maxLength: 500,
    },
    is_required: {
      type: 'boolean',
      title: 'Required Field',
      description: 'Whether this field must be present',
      default: false,
    },
    default_value: {
      title: 'Default Value',
      description: 'Optional default value for this field',
      // Type is dynamic based on field_type, handled by custom widget
    },
    validation_rules: {
      type: 'object',
      title: 'Validation Rules',
      description: 'Advanced validation constraints',
      properties: {
        // String validation
        pattern: {
          type: 'string',
          title: 'Pattern (Regex)',
          description: 'Regular expression pattern for validation',
        },
        minLength: {
          type: 'integer',
          title: 'Minimum Length',
          minimum: 0,
        },
        maxLength: {
          type: 'integer',
          title: 'Maximum Length',
          minimum: 1,
        },
        // Numeric validation
        minimum: {
          type: 'number',
          title: 'Minimum Value',
        },
        maximum: {
          type: 'number',
          title: 'Maximum Value',
        },
        multipleOf: {
          type: 'number',
          title: 'Multiple Of',
          exclusiveMinimum: 0,
        },
        // Array validation
        minItems: {
          type: 'integer',
          title: 'Minimum Items',
          minimum: 0,
        },
        maxItems: {
          type: 'integer',
          title: 'Maximum Items',
          minimum: 1,
        },
        uniqueItems: {
          type: 'boolean',
          title: 'Unique Items',
          default: false,
        },
        // Enum validation
        enum: {
          type: 'array',
          title: 'Allowed Values',
          description: 'List of allowed values (for enum types)',
          items: {
            type: 'string',
          },
        },
      },
    },
    visual_metadata: {
      type: 'object',
      title: 'Display Options',
      description: 'Visual customization options',
      properties: {
        helpText: {
          type: 'string',
          title: 'Help Text',
          description: 'Additional help text shown to users',
          maxLength: 200,
        },
        group: {
          type: 'string',
          title: 'Field Group',
          description: 'Group this field belongs to',
          maxLength: 50,
        },
      },
    },
  },
};

/**
 * UI Schema for the field editor form
 *
 * Defines the UI/UX customization for the field editor,
 * including widget selection and layout.
 */
export const fieldEditorUiSchema: UiSchema = {
  'ui:submitButtonOptions': {
    submitText: 'Save Field',
    norender: false,
    props: {
      className: 'btn-primary',
    },
  },
  field_name: {
    'ui:autofocus': true,
    'ui:placeholder': 'e.g., invoice_number, company_name',
    'ui:help': 'Use lowercase with underscores (snake_case)',
  },
  field_type: {
    'ui:widget': 'PydanticTypeWidget',
    'ui:help': 'Select the appropriate data type for this field',
  },
  description: {
    'ui:widget': 'DescriptionWidget',
    'ui:placeholder': 'Describe what information this field should contain...',
  },
  is_required: {
    'ui:widget': 'checkbox',
    'ui:help': 'Required fields must always have a value',
  },
  default_value: {
    'ui:widget': 'DefaultValueWidget',
    'ui:help': 'Optional: Specify a default value if the field is empty',
  },
  validation_rules: {
    'ui:widget': 'ValidationRulesWidget',
    'ui:options': {
      collapsible: true,
      collapsed: true,
    },
    'ui:help': 'Add additional validation constraints',
    pattern: {
      'ui:placeholder': '^[A-Z]{2}-\\d{4}$',
      'ui:help': 'Use JavaScript regex syntax',
    },
    minLength: {
      'ui:placeholder': '1',
    },
    maxLength: {
      'ui:placeholder': '255',
    },
    minimum: {
      'ui:placeholder': '0',
    },
    maximum: {
      'ui:placeholder': '100',
    },
    multipleOf: {
      'ui:placeholder': '0.01',
    },
    minItems: {
      'ui:placeholder': '1',
    },
    maxItems: {
      'ui:placeholder': '10',
    },
    enum: {
      'ui:options': {
        addable: true,
        orderable: true,
        removable: true,
      },
      'ui:help': 'Add possible values for this field',
    },
  },
  visual_metadata: {
    'ui:options': {
      collapsible: true,
      collapsed: true,
    },
    helpText: {
      'ui:widget': 'textarea',
      'ui:placeholder': 'Additional guidance for users filling this field...',
    },
    group: {
      'ui:placeholder': 'e.g., Personal Info, Financial Details',
    },
  },
};

/**
 * Custom class names for RJSF components
 *
 * Maps RJSF class names to Tailwind/shadcn classes
 */
export const rjsfClassNames = {
  // Form root
  form: 'space-y-6',

  // Field wrapper
  fieldWrapper: 'space-y-2',

  // Label
  label: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',

  // Description
  description: 'text-sm text-muted-foreground',

  // Input fields
  input: 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',

  // Textarea
  textarea: 'flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',

  // Select
  select: 'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',

  // Checkbox
  checkbox: 'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',

  // Error
  error: 'text-sm font-medium text-destructive',
  errorList: 'rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2',

  // Help text
  help: 'text-xs text-muted-foreground mt-1',

  // Button
  button: 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
  buttonPrimary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2',
  buttonSecondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 h-9 px-4 py-2',

  // Object/array containers
  object: 'space-y-4 p-4 border border-border rounded-md bg-background',
  array: 'space-y-3',
  arrayItem: 'flex gap-2 items-start p-3 border border-border rounded-md bg-muted/50',
  arrayItemControl: 'flex gap-1',

  // Collapsible sections
  collapsible: 'border border-border rounded-md',
  collapsibleTrigger: 'flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer',
  collapsibleContent: 'p-3 pt-0',
};

/**
 * Widget configuration for different field types
 *
 * Maps field types to appropriate RJSF widgets
 */
export const widgetMapping: Record<PydanticFieldType, string> = {
  string: 'text',
  integer: 'updown',
  number: 'updown',
  boolean: 'checkbox',
  array: 'array',
  object: 'object',
  date: 'date',
  datetime: 'datetime-local',
  time: 'time',
  email: 'email',
  url: 'url',
  uuid: 'text',
  enum: 'select',
};

/**
 * Validation error messages
 */
export const validationMessages = {
  required: 'This field is required',
  pattern: 'Value does not match the required pattern',
  minLength: 'Value is too short (minimum: {limit} characters)',
  maxLength: 'Value is too long (maximum: {limit} characters)',
  minimum: 'Value is too small (minimum: {limit})',
  maximum: 'Value is too large (maximum: {limit})',
  minItems: 'Too few items (minimum: {limit})',
  maxItems: 'Too many items (maximum: {limit})',
  uniqueItems: 'Items must be unique',
  enum: 'Value must be one of: {allowedValues}',
  type: 'Invalid type (expected: {expectedType})',
  format: 'Invalid format (expected: {format})',
};

/**
 * Transform validation error to user-friendly message
 */
export function transformValidationError(error: {
  name: string;
  params?: Record<string, unknown>;
}): string {
  const template = validationMessages[error.name as keyof typeof validationMessages];

  if (!template) {
    return `Validation error: ${error.name}`;
  }

  let message = template;

  if (error.params) {
    Object.entries(error.params).forEach(([key, value]) => {
      message = message.replace(`{${key}}`, String(value));
    });
  }

  return message;
}

/**
 * Default form data for new fields
 */
export const defaultFieldEditorData: FieldEditorFormData = {
  field_name: '',
  field_type: 'string',
  description: '',
  is_required: false,
  validation_rules: {},
};

/**
 * Field type color mapping for visual consistency
 */
export const fieldTypeColors: Record<PydanticFieldType, string> = {
  string: 'hsl(221, 83%, 53%)', // blue
  integer: 'hsl(142, 71%, 45%)', // green
  number: 'hsl(142, 71%, 45%)', // green
  boolean: 'hsl(262, 83%, 58%)', // purple
  array: 'hsl(38, 92%, 50%)', // orange
  object: 'hsl(174, 72%, 46%)', // teal
  date: 'hsl(199, 89%, 48%)', // cyan
  datetime: 'hsl(199, 89%, 48%)', // cyan
  time: 'hsl(199, 89%, 48%)', // cyan
  email: 'hsl(221, 83%, 53%)', // blue
  url: 'hsl(221, 83%, 53%)', // blue
  uuid: 'hsl(280, 67%, 60%)', // violet
  enum: 'hsl(262, 83%, 58%)', // purple
};

/**
 * Field type icons (lucide-react icon names)
 */
export const fieldTypeIcons: Record<PydanticFieldType, string> = {
  string: 'Type',
  integer: 'Hash',
  number: 'Binary',
  boolean: 'ToggleLeft',
  array: 'List',
  object: 'Box',
  date: 'Calendar',
  datetime: 'CalendarClock',
  time: 'Clock',
  email: 'Mail',
  url: 'Link',
  uuid: 'Fingerprint',
  enum: 'ListChecks',
};

/**
 * Export configuration object
 */
export const rjsfConfig = {
  theme: rjsfTheme,
  schema: fieldEditorSchema,
  uiSchema: fieldEditorUiSchema,
  classNames: rjsfClassNames,
  widgetMapping,
  validationMessages,
  defaultData: defaultFieldEditorData,
  typeColors: fieldTypeColors,
  typeIcons: fieldTypeIcons,
  pydanticToJsonSchemaType,
  pydanticToJsonSchemaFormat,
};
