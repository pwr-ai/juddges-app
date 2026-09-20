/**
 * Dropdown Button Component
 * Reusable dropdown button with modern hover effects
 * Used in chat input and other components
 */

'use client';

import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface DropdownButtonOption {
 value: string;
 label: string;
}

export interface DropdownButtonProps {
 icon: React.ReactNode;
 label: string;
 value?: string;
 options: DropdownButtonOption[];
 onChange?: (value: string) => void;
 disabled?: boolean;
 className?: string;
 align?: 'start' | 'end' | 'center';
 /** Accessible name that remains available when the visual label is hidden on mobile. */
 ariaLabel?: string;
}

/**
 * Dropdown Button
 * A modern dropdown button with hover effects and animations
 *
 * @example
 * <DropdownButton
 * icon={<FileText size={16} />}
 * label="Response Format"
 * value="adaptive"
 * options={[
 * { value: "adaptive", label: "Adaptive (AI decides)"},
 * { value: "short", label: "Short Answer"},
 * ]}
 * onChange={(value) => {
 * // eslint-disable-next-line no-console
 * console.log(value);
 * }}
 * />
 */
export function DropdownButton({
 icon,
 label,
 value,
 options,
 onChange,
 disabled = false,
 className,
 align = 'start',
 ariaLabel,
}: DropdownButtonProps): React.JSX.Element {
 const selectedOption = options.find((opt) => opt.value === value);
 const displayLabel = selectedOption?.label || label;
 const [isOpen, setIsOpen] = React.useState(false);

 return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          aria-label={ariaLabel ?? displayLabel}
          variant="ghost"
          size="sm"
          className={cn(
            'group relative h-8 text-xs font-mono uppercase tracking-wider gap-2 px-3 rounded-none',
            'flex items-center justify-start',
            'transition-colors duration-150',
            'cursor-pointer',
            'bg-parchment',
            'border border-rule',
            'text-ink',
            'shadow-none',
            'hover:bg-parchment-deep',
            'hover:border-ink',
            'hover:text-ink',
            isOpen && 'bg-parchment-deep border-ink text-ink',
            className
          )}
        >
          {/* Content */}
          <span className="relative z-10 flex items-center gap-2">
            <span
              className={cn(
                'transition-colors duration-150 text-ink-soft group-hover:text-ink',
                isOpen && 'text-ink'
              )}
            >
              {icon}
            </span>
            <span className="hidden sm:inline">{displayLabel}</span>
            <ChevronDown
              size={12}
              className={cn(
                'transition-transform duration-150 text-ink-soft group-hover:text-ink',
                isOpen && 'rotate-180 text-ink'
              )}
            />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={4}
        className={cn(
          'min-w-[200px] rounded-none p-1',
          'bg-parchment border border-rule shadow-md z-50'
        )}
      >
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              className={cn(
                'group relative text-xs font-mono cursor-pointer rounded-none px-3 py-2 mb-0.5 last:mb-0',
                'border-0 outline-none',
                'overflow-hidden flex items-center justify-between',
                'text-ink hover:bg-parchment-deep focus:bg-parchment-deep data-[highlighted]:bg-parchment-deep transition-colors',
                isSelected && 'text-oxblood font-semibold bg-parchment-deep'
              )}
              onSelect={(e) => {
                e.preventDefault();
                onChange?.(option.value);
              }}
            >
              <span className="relative z-10 flex-1">
                {option.label}
              </span>

              {isSelected && (
                <Check
                  size={14}
                  className="relative z-10 ml-2 flex-shrink-0 text-oxblood stroke-[2]"
                />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
 );
}
