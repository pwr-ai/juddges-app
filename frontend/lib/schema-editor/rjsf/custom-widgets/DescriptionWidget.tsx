/**
 * Rich Text Description Widget
 *
 * A custom RJSF widget for editing field descriptions with
 * character count, formatting tips, and AI suggestions.
 */

'use client';

import * as React from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Sparkles, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/lib/styles/components/tooltip';

export interface DescriptionWidgetProps extends WidgetProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Example good descriptions for guidance
 */
const exampleDescriptions = [
  'The unique invoice number assigned by the tax authority (format: XX-YYYY-NNNN)',
  'Full legal name of the company as registered with the tax office',
  'Total tax amount in PLN, including all applicable rates',
  'Date when the tax obligation was incurred (format: YYYY-MM-DD)',
  'Tax identification number (NIP) of the entity',
];

/**
 * Get random example description
 */
function getRandomExample(): string {
  return exampleDescriptions[Math.floor(Math.random() * exampleDescriptions.length)];
}

/**
 * DescriptionWidget Component
 */
export function DescriptionWidget(props: DescriptionWidgetProps): React.JSX.Element {
  const {
    id,
    value = '',
    required,
    disabled,
    readonly,
    label,
    onChange,
    options,
    rawErrors = [],
  } = props;

  const maxLength = (options.maxLength as number) || 500;
  const minLength = (options.minLength as number) || 0;
  const hasError = rawErrors.length > 0;
  const currentLength = value.length;
  const remainingChars = maxLength - currentLength;
  const [showTips, setShowTips] = React.useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      onChange(newValue);
    }
  };

  const handleUseExample = (): void => {
    onChange(getRandomExample());
  };

  const isNearLimit = remainingChars < 50;
  const isTooShort = required && currentLength < minLength;

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
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip open={showTips} onOpenChange={setShowTips}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setShowTips(!showTips)}
                  >
                    <Info className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-sm">
                  <div className="space-y-2">
                    <p className="font-semibold text-xs">Writing good descriptions:</p>
                    <ul className="text-xs space-y-1 list-disc list-inside">
                      <li>Be specific about what data to extract</li>
                      <li>Include format requirements or patterns</li>
                      <li>Mention any validation constraints</li>
                      <li>Specify units or measurement systems</li>
                      <li>Give examples when helpful</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 gap-1"
              onClick={handleUseExample}
              disabled={disabled || readonly}
            >
              <Sparkles className="h-3 w-3" />
              <span className="text-xs">Example</span>
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <Textarea
          id={id}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readonly}
          placeholder={
            options.placeholder as string ||
            'Describe what information this field should contain...'
          }
          className={cn(
            'min-h-[80px] resize-y',
            hasError && 'border-destructive focus-visible:ring-destructive',
            isTooShort && 'border-yellow-500 focus-visible:ring-yellow-500'
          )}
          rows={3}
        />

        {/* Character counter */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {isTooShort && (
            <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
              Too short
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              isNearLimit && 'border-yellow-500 text-yellow-600',
              remainingChars < 0 && 'border-destructive text-destructive'
            )}
          >
            {currentLength} / {maxLength}
          </Badge>
        </div>
      </div>

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

      {/* Quality indicators */}
      {currentLength > 0 && !hasError && (
        <div className="flex items-center gap-2 text-xs">
          {currentLength >= 20 && currentLength <= 200 && (
            <Badge variant="secondary" className="text-xs">
              Good length
            </Badge>
          )}
          {value.includes('(') && value.includes(')') && (
            <Badge variant="secondary" className="text-xs">
              Includes format
            </Badge>
          )}
          {/\d/.test(value) && (
            <Badge variant="secondary" className="text-xs">
              Includes examples
            </Badge>
          )}
        </div>
      )}

      {/* Suggestions */}
      {currentLength === 0 && !disabled && !readonly && (
        <div className="p-3 bg-muted/50 rounded-md border border-border text-xs space-y-2">
          <p className="font-medium">Quick tips:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Start with what data this field represents</li>
            <li>• Add format or pattern details in parentheses</li>
            <li>• Include units or constraints if applicable</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default DescriptionWidget;
