/**
 * Default Value Editor Widget
 *
 * A custom RJSF widget for editing default values with
 * dynamic input types based on the field type.
 */

'use client';

import * as React from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { X, Calendar, Clock } from 'lucide-react';
import type { PydanticFieldType } from '../types';

export interface DefaultValueWidgetProps extends WidgetProps {
  value: string | number | boolean | null | undefined;
  onChange: (value: string | number | boolean | null | undefined) => void;
  fieldType?: PydanticFieldType;
}

/**
 * Get appropriate input type and attributes for field type
 */
function getInputConfig(fieldType: PydanticFieldType): {
  type: string;
  step?: string;
  pattern?: string;
  placeholder: string;
} {
  switch (fieldType) {
    case 'integer':
      return { type: 'number', step: '1', placeholder: 'e.g., 0' };
    case 'number':
      return { type: 'number', step: 'any', placeholder: 'e.g., 0.0' };
    case 'email':
      return { type: 'email', placeholder: 'e.g., user@example.com' };
    case 'url':
      return { type: 'url', placeholder: 'e.g., https://example.com' };
    case 'date':
      return { type: 'date', placeholder: 'YYYY-MM-DD' };
    case 'datetime':
      return { type: 'datetime-local', placeholder: 'YYYY-MM-DDTHH:MM' };
    case 'time':
      return { type: 'time', placeholder: 'HH:MM' };
    case 'uuid':
      return {
        type: 'text',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        placeholder: 'e.g., 550e8400-e29b-41d4-a716-446655440000',
      };
    default:
      return { type: 'text', placeholder: 'Enter default value...' };
  }
}

/**
 * Parse value from input based on field type
 */
function parseValue(
  inputValue: string,
  fieldType: PydanticFieldType
): string | number | boolean | null {
  if (!inputValue) return null;

  switch (fieldType) {
    case 'integer':
      const intValue = parseInt(inputValue, 10);
      return isNaN(intValue) ? null : intValue;
    case 'number':
      const numValue = parseFloat(inputValue);
      return isNaN(numValue) ? null : numValue;
    case 'boolean':
      return inputValue === 'true';
    default:
      return inputValue;
  }
}

/**
 * Format value for display in input
 */
function formatValue(
  value: string | number | boolean | null | undefined,
  fieldType: PydanticFieldType
): string {
  if (value === null || value === undefined) return '';

  switch (fieldType) {
    case 'boolean':
      return String(value);
    case 'integer':
    case 'number':
      return String(value);
    default:
      return String(value);
  }
}

/**
 * DefaultValueWidget Component
 */
export function DefaultValueWidget(props: DefaultValueWidgetProps) {
  const {
    id,
    value,
    required,
    disabled,
    readonly,
    label,
    onChange,
    options,
    rawErrors = [],
    formContext,
  } = props;

  // Get field type from form context or formData
  const fieldType = (formContext?.fieldType || 'string') as PydanticFieldType;
  const hasError = rawErrors.length > 0;
  const hasValue = value !== null && value !== undefined && value !== '';

  const inputConfig = getInputConfig(fieldType);
  const displayValue = formatValue(value, fieldType);

  const handleChange = (newValue: string) => {
    const parsedValue = parseValue(newValue, fieldType);
    onChange(parsedValue);
  };

  const handleClear = () => {
    onChange(null);
  };

  // Special handling for boolean type
  if (fieldType === 'boolean') {
    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={id} className={cn(required && 'after:content-["*"] after:ml-0.5 after:text-destructive')}>
            {label}
          </Label>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${id}-true`}
              checked={value === true}
              onCheckedChange={(checked) => onChange(checked ? true : null)}
              disabled={disabled || readonly}
            />
            <Label htmlFor={`${id}-true`} className="text-sm font-normal cursor-pointer">
              True
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${id}-false`}
              checked={value === false}
              onCheckedChange={(checked) => onChange(checked ? false : null)}
              disabled={disabled || readonly}
            />
            <Label htmlFor={`${id}-false`} className="text-sm font-normal cursor-pointer">
              False
            </Label>
          </div>

          {hasValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={disabled || readonly}
              className="h-8 px-2"
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {options.help && (
          <p className="text-xs text-muted-foreground">{options.help as string}</p>
        )}

        {hasError && (
          <p className="text-sm text-destructive">
            {rawErrors.join(', ')}
          </p>
        )}
      </div>
    );
  }

  // For array and object types, show info message
  if (fieldType === 'array' || fieldType === 'object') {
    return (
      <div className="space-y-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="p-3 bg-muted/50 rounded-md border border-border text-sm text-muted-foreground">
          Default values for {fieldType} types are not supported in the visual editor.
          Use the code editor for complex default values.
        </div>
      </div>
    );
  }

  // For enum type, suggest using validation rules
  if (fieldType === 'enum') {
    return (
      <div className="space-y-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="p-3 bg-muted/50 rounded-md border border-border text-sm text-muted-foreground">
          For enum fields, set allowed values in the Validation Rules section.
          The first value will be used as the default.
        </div>
      </div>
    );
  }

  // Standard input for other types
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <Label
            htmlFor={id}
            className={cn(
              required && 'after:content-["*"] after:ml-0.5 after:text-destructive'
            )}
          >
            {label}
          </Label>
          {hasValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={disabled || readonly}
              className="h-6 px-2"
            >
              <X className="h-3 w-3 mr-1" />
              <span className="text-xs">Clear</span>
            </Button>
          )}
        </div>
      )}

      <div className="relative">
        <Input
          id={id}
          type={inputConfig.type}
          step={inputConfig.step}
          pattern={inputConfig.pattern}
          placeholder={inputConfig.placeholder}
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          readOnly={readonly}
          className={cn(
            hasError && 'border-destructive focus-visible:ring-destructive',
            (fieldType === 'date' || fieldType === 'datetime' || fieldType === 'time') && 'pr-8'
          )}
        />

        {/* Icon for date/time inputs */}
        {fieldType === 'date' || fieldType === 'datetime' ? (
          <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        ) : fieldType === 'time' ? (
          <Clock className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        ) : null}
      </div>

      {/* Type indicator */}
      {hasValue && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Type: {fieldType}
          </Badge>
          {typeof value === 'number' && (
            <Badge variant="secondary" className="text-xs">
              Value: {value}
            </Badge>
          )}
        </div>
      )}

      {/* Help text */}
      {options.help && (
        <p className="text-xs text-muted-foreground">{options.help as string}</p>
      )}

      {/* Error messages */}
      {hasError && (
        <p className="text-sm text-destructive">
          {rawErrors.join(', ')}
        </p>
      )}

      {/* Format hints for special types */}
      {!hasValue && !hasError && (
        <>
          {fieldType === 'uuid' && (
            <p className="text-xs text-muted-foreground">
              Format: 8-4-4-4-12 hexadecimal digits
            </p>
          )}
          {fieldType === 'email' && (
            <p className="text-xs text-muted-foreground">
              Must be a valid email address
            </p>
          )}
          {fieldType === 'url' && (
            <p className="text-xs text-muted-foreground">
              Must start with http:// or https://
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default DefaultValueWidget;
