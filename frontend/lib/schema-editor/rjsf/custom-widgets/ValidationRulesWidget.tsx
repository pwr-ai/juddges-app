/**
 * Validation Rules Builder Widget
 *
 * A custom RJSF widget for building validation rules with
 * dynamic form fields based on the selected field type.
 */

'use client';

import * as React from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronDown, Plus, X, Info } from 'lucide-react';
import type { ValidationRules, PydanticFieldType } from '../types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/lib/styles/components/tooltip';

export interface ValidationRulesWidgetProps extends WidgetProps {
  value: ValidationRules;
  onChange: (value: ValidationRules) => void;
  fieldType?: PydanticFieldType;
}

/**
 * Validation rule categories by field type
 */
const validationRulesByType: Record<PydanticFieldType, string[]> = {
  string: ['pattern', 'minLength', 'maxLength', 'format'],
  integer: ['minimum', 'maximum', 'multipleOf'],
  number: ['minimum', 'maximum', 'multipleOf'],
  boolean: [],
  array: ['minItems', 'maxItems', 'uniqueItems'],
  object: ['minProperties', 'maxProperties'],
  date: ['minimum', 'maximum'],
  datetime: ['minimum', 'maximum'],
  time: ['minimum', 'maximum'],
  email: ['pattern', 'minLength', 'maxLength'],
  url: ['pattern', 'minLength', 'maxLength'],
  uuid: ['pattern'],
  enum: ['enum'],
};

/**
 * Validation rule descriptions
 */
const ruleDescriptions: Record<string, string> = {
  pattern: 'Regular expression pattern for validation',
  minLength: 'Minimum number of characters',
  maxLength: 'Maximum number of characters',
  minimum: 'Minimum allowed value',
  maximum: 'Maximum allowed value',
  multipleOf: 'Value must be a multiple of this number',
  minItems: 'Minimum number of items in array',
  maxItems: 'Maximum number of items in array',
  uniqueItems: 'All items in array must be unique',
  minProperties: 'Minimum number of properties in object',
  maxProperties: 'Maximum number of properties in object',
  enum: 'List of allowed values',
  format: 'Specific format validation (email, uri, uuid, etc.)',
};

/**
 * ValidationRulesWidget Component
 */
export function ValidationRulesWidget(props: ValidationRulesWidgetProps): React.JSX.Element {
  const {
    id,
    value = {},
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
  const [isOpen, setIsOpen] = React.useState(false);
  const [enumValues, setEnumValues] = React.useState<string[]>(value.enum as string[] || []);
  const [newEnumValue, setNewEnumValue] = React.useState('');

  const hasError = rawErrors.length > 0;
  const availableRules = validationRulesByType[fieldType] || [];
  const activeRulesCount = Object.keys(value).filter(key => value[key] !== undefined && value[key] !== null).length;

  const updateRule = (ruleName: string, ruleValue: unknown): void => {
    const newRules = { ...value };
    if (ruleValue === undefined || ruleValue === null || ruleValue === '') {
      delete newRules[ruleName];
    } else {
      newRules[ruleName] = ruleValue;
    }
    onChange(newRules);
  };

  const handleEnumAdd = (): void => {
    if (newEnumValue.trim()) {
      const newValues = [...enumValues, newEnumValue.trim()];
      setEnumValues(newValues);
      updateRule('enum', newValues);
      setNewEnumValue('');
    }
  };

  const handleEnumRemove = (index: number): void => {
    const newValues = enumValues.filter((_, i) => i !== index);
    setEnumValues(newValues);
    updateRule('enum', newValues.length > 0 ? newValues : undefined);
  };

  // Update enum values when value prop changes
  React.useEffect(() => {
    if (value.enum && Array.isArray(value.enum)) {
      setEnumValues(value.enum as string[]);
    }
  }, [value.enum]);

  if (availableRules.length === 0) {
    return (
      <div className="space-y-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md border border-border">
          No validation rules available for {fieldType} type.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled || readonly}
          >
            <div className="flex items-center gap-2">
              <span>Validation Rules</span>
              {activeRulesCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeRulesCount} active
                </Badge>
              )}
            </div>
            <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2">
          <div className="space-y-4 p-4 border border-border rounded-md bg-muted/20">
            {/* String validation */}
            {availableRules.includes('pattern') && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${id}-pattern`} className="text-sm">
                    Pattern (Regex)
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{ruleDescriptions.pattern}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id={`${id}-pattern`}
                  type="text"
                  placeholder="^[A-Z]{2}-\d{4}$"
                  value={(value.pattern as string) || ''}
                  onChange={(e) => updateRule('pattern', e.target.value)}
                  disabled={disabled || readonly}
                  className="font-mono text-sm"
                />
              </div>
            )}

            {availableRules.includes('minLength') && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-minLength`} className="text-sm">
                  Minimum Length
                </Label>
                <Input
                  id={`${id}-minLength`}
                  type="number"
                  min={0}
                  placeholder="1"
                  value={(value.minLength as number) ?? ''}
                  onChange={(e) => updateRule('minLength', e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={disabled || readonly}
                />
              </div>
            )}

            {availableRules.includes('maxLength') && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-maxLength`} className="text-sm">
                  Maximum Length
                </Label>
                <Input
                  id={`${id}-maxLength`}
                  type="number"
                  min={1}
                  placeholder="255"
                  value={(value.maxLength as number) ?? ''}
                  onChange={(e) => updateRule('maxLength', e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={disabled || readonly}
                />
              </div>
            )}

            {/* Numeric validation */}
            {availableRules.includes('minimum') && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-minimum`} className="text-sm">
                  Minimum Value
                </Label>
                <Input
                  id={`${id}-minimum`}
                  type="number"
                  step="any"
                  placeholder="0"
                  value={(value.minimum as number) ?? ''}
                  onChange={(e) => updateRule('minimum', e.target.value ? parseFloat(e.target.value) : undefined)}
                  disabled={disabled || readonly}
                />
              </div>
            )}

            {availableRules.includes('maximum') && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-maximum`} className="text-sm">
                  Maximum Value
                </Label>
                <Input
                  id={`${id}-maximum`}
                  type="number"
                  step="any"
                  placeholder="100"
                  value={(value.maximum as number) ?? ''}
                  onChange={(e) => updateRule('maximum', e.target.value ? parseFloat(e.target.value) : undefined)}
                  disabled={disabled || readonly}
                />
              </div>
            )}

            {availableRules.includes('multipleOf') && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-multipleOf`} className="text-sm">
                  Multiple Of
                </Label>
                <Input
                  id={`${id}-multipleOf`}
                  type="number"
                  step="any"
                  placeholder="0.01"
                  value={(value.multipleOf as number) ?? ''}
                  onChange={(e) => updateRule('multipleOf', e.target.value ? parseFloat(e.target.value) : undefined)}
                  disabled={disabled || readonly}
                />
              </div>
            )}

            {/* Array validation */}
            {availableRules.includes('minItems') && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-minItems`} className="text-sm">
                  Minimum Items
                </Label>
                <Input
                  id={`${id}-minItems`}
                  type="number"
                  min={0}
                  placeholder="1"
                  value={(value.minItems as number) ?? ''}
                  onChange={(e) => updateRule('minItems', e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={disabled || readonly}
                />
              </div>
            )}

            {availableRules.includes('maxItems') && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-maxItems`} className="text-sm">
                  Maximum Items
                </Label>
                <Input
                  id={`${id}-maxItems`}
                  type="number"
                  min={1}
                  placeholder="10"
                  value={(value.maxItems as number) ?? ''}
                  onChange={(e) => updateRule('maxItems', e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={disabled || readonly}
                />
              </div>
            )}

            {availableRules.includes('uniqueItems') && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`${id}-uniqueItems`}
                  checked={(value.uniqueItems as boolean) || false}
                  onCheckedChange={(checked) => updateRule('uniqueItems', checked)}
                  disabled={disabled || readonly}
                />
                <Label htmlFor={`${id}-uniqueItems`} className="text-sm font-normal cursor-pointer">
                  Require unique items
                </Label>
              </div>
            )}

            {/* Enum validation */}
            {availableRules.includes('enum') && (
              <div className="space-y-2">
                <Label className="text-sm">Allowed Values</Label>
                <div className="space-y-2">
                  {enumValues.map((enumValue, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={enumValue}
                        disabled
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEnumRemove(index)}
                        disabled={disabled || readonly}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Add new value..."
                      value={newEnumValue}
                      onChange={(e) => setNewEnumValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleEnumAdd();
                        }
                      }}
                      disabled={disabled || readonly}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleEnumAdd}
                      disabled={disabled || readonly || !newEnumValue.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

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

export default ValidationRulesWidget;
