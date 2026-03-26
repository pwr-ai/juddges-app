/**
 * RJSF Integration for Schema Editor
 *
 * Main export file for React JSON Schema Form (RJSF) v5 integration.
 * Provides all necessary components, configurations, and utilities for
 * building a visual schema editor with Pydantic compatibility.
 */

// Core types
export type {
  PydanticFieldType,
  ValidationRules,
  VisualMetadata,
  SchemaField,
  FieldEditorFormData,
  CustomFieldTemplateProps,
  ErrorListTemplateProps,
  RJSFThemeConfig,
  WidgetRegistry,
  FieldEditorValidationResult,
  SchemaCompilationResult,
  RJSFSchema,
  UiSchema,
  FieldProps,
  WidgetProps,
  // FormValidation, // Not available in this version of RJSF
} from './types';

// Type guards and builders
export {
  isPydanticFieldType,
  isSchemaField,
  ValidationRulesBuilder,
} from './types';

// Configuration
export {
  rjsfTheme,
  rjsfConfig,
  fieldEditorSchema,
  fieldEditorUiSchema,
  rjsfClassNames,
  widgetMapping,
  validationMessages,
  defaultFieldEditorData,
  fieldTypeColors,
  fieldTypeIcons,
  pydanticToJsonSchemaType,
  pydanticToJsonSchemaFormat,
  transformValidationError,
} from './rjsf-config';

// Custom widgets
export {
  PydanticTypeWidget,
  ValidationRulesWidget,
  DescriptionWidget,
  DefaultValueWidget,
} from './custom-widgets';

export type {
  PydanticTypeWidgetProps,
  ValidationRulesWidgetProps,
  DescriptionWidgetProps,
  DefaultValueWidgetProps,
} from './custom-widgets';

// Conversion utilities
export {
  fieldToJsonSchemaProperty,
  fieldsToJsonSchema,
  jsonSchemaPropertyToField,
  jsonSchemaToFields,
  validateJsonSchema,
  mergeValidationRules,
  generateFieldPath,
  validateFieldName,
  checkDuplicateFieldName,
  conversionUtils,
} from './field-to-schema';

/**
 * Quick start example:
 *
 * ```tsx
 * import { Form } from '@rjsf/mui';
 * import validator from '@rjsf/validator-ajv8';
 * import {
 *   fieldEditorSchema,
 *   fieldEditorUiSchema,
 *   PydanticTypeWidget,
 *   ValidationRulesWidget,
 *   DescriptionWidget,
 *   DefaultValueWidget,
 * } from '@/lib/schema-editor/rjsf';
 *
 * const widgets = {
 *   PydanticTypeWidget,
 *   ValidationRulesWidget,
 *   DescriptionWidget,
 *   DefaultValueWidget,
 * };
 *
 * function FieldEditor({ field, onSave }) {
 *   return (
 *     <Form
 *       schema={fieldEditorSchema}
 *       uiSchema={fieldEditorUiSchema}
 *       validator={validator}
 *       widgets={widgets}
 *       formData={field}
 *       onSubmit={({ formData }) => onSave(formData)}
 *     />
 *   );
 * }
 * ```
 */
