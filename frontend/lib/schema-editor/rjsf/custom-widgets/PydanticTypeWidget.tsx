/**
 * Pydantic Type Selector Widget
 *
 * A custom RJSF widget for selecting Pydantic field types with
 * visual type indicators and descriptions.
 */

'use client';

import * as React from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PydanticFieldType } from '../types';
import { fieldTypeColors, fieldTypeIcons } from '../rjsf-config';
import * as Icons from 'lucide-react';

/**
 * Type descriptions for user guidance
 */
const typeDescriptions: Record<PydanticFieldType, string> = {
  string: 'Text value of any length',
  integer: 'Whole number (no decimals)',
  number: 'Numeric value (can include decimals)',
  boolean: 'True or false value',
  array: 'List of items',
  object: 'Nested structure with multiple fields',
  date: 'Date (YYYY-MM-DD)',
  datetime: 'Date and time (ISO 8601 format)',
  time: 'Time (HH:MM:SS)',
  email: 'Email address',
  url: 'Web URL',
  uuid: 'Universally unique identifier',
  enum: 'One value from a predefined list',
};

/**
 * Type examples for clarity
 */
const typeExamples: Record<PydanticFieldType, string> = {
  string: 'e.g., "Invoice #12345"',
  integer: 'e.g., 42',
  number: 'e.g., 19.99',
  boolean: 'e.g., true/false',
  array: 'e.g., ["item1", "item2"]',
  object: 'e.g., {name: "...", value: "..."}',
  date: 'e.g., 2025-10-19',
  datetime: 'e.g., 2025-10-19T14:30:00Z',
  time: 'e.g., 14:30:00',
  email: 'e.g., user@example.com',
  url: 'e.g., https://example.com',
  uuid: 'e.g., 550e8400-e29b-41d4-a716-446655440000',
  enum: 'e.g., "ACTIVE" | "PENDING" | "CLOSED"',
};

/**
 * Get icon component by name
 */
function getIconComponent(iconName: string): React.ComponentType<{ className?: string }> {
  return ((Icons as any)[iconName] as React.ComponentType<{ className?: string }>) || Icons.HelpCircle;
}

export interface PydanticTypeWidgetProps extends WidgetProps {
  value: PydanticFieldType;
  onChange: (value: PydanticFieldType) => void;
}

/**
 * PydanticTypeWidget Component
 */
export function PydanticTypeWidget(props: PydanticTypeWidgetProps) {
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
  } = props;

  const hasError = rawErrors.length > 0;
  const currentValue = (value || 'string') as PydanticFieldType;

  const handleChange = (newValue: string) => {
    onChange(newValue as PydanticFieldType);
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id} className={cn(required && 'after:content-["*"] after:ml-0.5 after:text-destructive')}>
          {label}
        </Label>
      )}

      <Select
        value={currentValue}
        onValueChange={handleChange}
        disabled={disabled || readonly}
      >
        <SelectTrigger
          id={id}
          className={cn(
            'w-full',
            hasError && 'border-destructive focus:ring-destructive'
          )}
        >
          <SelectValue>
            <div className="flex items-center gap-2">
              {React.createElement(getIconComponent(fieldTypeIcons[currentValue]), {
                className: 'h-4 w-4',
               } as any)}
              <span className="font-medium">{currentValue}</span>
              <span className="text-muted-foreground text-xs">
                {typeDescriptions[currentValue]}
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>

        <SelectContent>
          {/* Basic types */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Basic Types
          </div>
          {(['string', 'integer', 'number', 'boolean'] as const).map((type) => {
            const IconComponent = getIconComponent(fieldTypeIcons[type]);
            return (
              <SelectItem key={type} value={type} className="py-3">
                <div className="flex items-start gap-3">
                  <IconComponent
                    className="h-5 w-5 mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{type}</span>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: fieldTypeColors[type],
                          color: fieldTypeColors[type],
                        }}
                      >
                        {type === 'integer' ? 'int' : type}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {typeDescriptions[type]}
                    </div>
                    <div className="text-xs text-muted-foreground/70 font-mono">
                      {typeExamples[type]}
                    </div>
                  </div>
                </div>
              </SelectItem>
            );
          })}

          {/* Complex types */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
            Complex Types
          </div>
          {(['array', 'object', 'enum'] as const).map((type) => {
            const IconComponent = getIconComponent(fieldTypeIcons[type]);
            return (
              <SelectItem key={type} value={type} className="py-3">
                <div className="flex items-start gap-3">
                  <IconComponent
                    className="h-5 w-5 mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{type}</span>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: fieldTypeColors[type],
                          color: fieldTypeColors[type],
                        }}
                      >
                        complex
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {typeDescriptions[type]}
                    </div>
                    <div className="text-xs text-muted-foreground/70 font-mono">
                      {typeExamples[type]}
                    </div>
                  </div>
                </div>
              </SelectItem>
            );
          })}

          {/* Specialized types */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
            Specialized Types
          </div>
          {(['date', 'datetime', 'time', 'email', 'url', 'uuid'] as const).map((type) => {
            const IconComponent = getIconComponent(fieldTypeIcons[type]);
            return (
              <SelectItem key={type} value={type} className="py-3">
                <div className="flex items-start gap-3">
                  <IconComponent
                    className="h-5 w-5 mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{type}</span>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: fieldTypeColors[type],
                          color: fieldTypeColors[type],
                        }}
                      >
                        validated
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {typeDescriptions[type]}
                    </div>
                    <div className="text-xs text-muted-foreground/70 font-mono">
                      {typeExamples[type]}
                    </div>
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

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

export default PydanticTypeWidget;
