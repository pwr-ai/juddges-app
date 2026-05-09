/**
 * Filter Toggle Group Component
 * Reusable component for filter/toggle button groups with label
 * Used for document type selection, mode selection, and other filter options
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getActiveButtonStyle, getInactiveButtonStyle } from './buttons';
import { filterToggleContainerColors, filterToggleLabelColors } from '@/lib/styles/colors/surfaces';

/**
 * Option for filter toggle group
 */
export interface FilterToggleOption<T = string> {
 /** Value of the option */
 value: T;
 /** Display label (can be string or ReactNode for custom content) */
 label: string | React.ReactNode;
 /** Optional icon component */
 icon?: React.ComponentType<{ className?: string }>;
 /** Optional tooltip text */
 tooltip?: string;
 /** Optional badge component */
 badge?: React.ReactNode;
 /** Optional disabled state for this specific option */
 disabled?: boolean;
 /** Optional custom onClick handler (overrides default onChange) */
 onClick?: () => void;
 /** Optional custom tooltip content renderer */
 tooltipContent?: React.ReactNode;
}

/**
 * Props for FilterToggleGroup component
 */
export interface FilterToggleGroupProps<T = string> {
 /** Label text displayed before the toggle group */
 label: string;
 /** Array of options to display */
 options: FilterToggleOption<T>[];
 /** Currently selected value(s) - can be single value or array for multi-select */
 value: T | T[] | Set<T>;
 /** Callback when option is selected */
 onChange: (value: T) => void;
 /** Whether multiple selections are allowed */
 multiple?: boolean;
 /** Optional className for the root container */
 className?: string;
 /** Optional className for the label */
 labelClassName?: string;
 /** Optional className for the button container */
 containerClassName?: string;
 /** Optional size for buttons */
 buttonSize?: string;
 /** Optional disabled state */
 disabled?: boolean;
 /** Optional tooltip component (e.g., Tooltip from @/lib/styles/components/tooltip) */
 Tooltip?: React.ComponentType<{ children: React.ReactNode }>;
 /** Optional tooltip trigger component */
 TooltipTrigger?: React.ComponentType<{ asChild?: boolean; children: React.ReactNode }>;
 /** Optional tooltip content component */
 TooltipContent?: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * Filter Toggle Group Component
 *
 * A reusable component for displaying filter/toggle button groups with a label.
 * Supports single and multi-select modes, icons, tooltips, and badges.
 *
 * @example
 * ```tsx
 * <FilterToggleGroup
 * label="Mode: "
 * options={[
 * { value: 'rabbit', label: 'Fast' },
 * { value: 'thinking', label: 'Deep' }
 * ]}
 * value={selectedMode}
 * onChange={setSelectedMode}
 * />
 * ```
 */
export function FilterToggleGroup<T = string>({
 label,
 options,
 value,
 onChange,
 multiple = false,
 className,
 labelClassName,
 containerClassName,
 buttonSize ="h-8",
 disabled = false,
 Tooltip,
 TooltipTrigger,
 TooltipContent,
}: FilterToggleGroupProps<T>): React.JSX.Element {
 const isSelected = (optionValue: T): boolean => {
 if (multiple) {
 // Support both arrays and Sets
 if (Array.isArray(value)) {
 return value.includes(optionValue);
 }
 if (value instanceof Set) {
 return value.has(optionValue);
 }
 return false;
 }
 return value === optionValue;
 };

 const handleOptionClick = (option: FilterToggleOption<T>, e?: React.MouseEvent): void => {
 if (e) {
 e.stopPropagation();
 e.preventDefault();
 }
 if (disabled || option.disabled) return;

 // Prevent rapid double-clicks by disabling pointer events briefly
 const target = e?.currentTarget as HTMLButtonElement;
 if (target) {
 target.style.pointerEvents = 'none';
 setTimeout(() => {
 target.style.pointerEvents = 'auto';
 }, 300);
 }

 if (option.onClick) {
 option.onClick();
 } else {
 onChange(option.value);
 }
 };

 const renderButton = (option: FilterToggleOption<T>): React.JSX.Element => {
 const selected = isSelected(option.value);
 const isOptionDisabled = disabled || option.disabled;
 const button = (
 <Button
 variant={selected ? "default": "ghost"}
 size="sm"
 onClick={(e) => handleOptionClick(option, e)}
 type="button"
 disabled={isOptionDisabled}
 className={cn(
"px-2.5 rounded-md text-xs relative group",
 isOptionDisabled &&"opacity-50 cursor-not-allowed pointer-events-none",
 !isOptionDisabled && selected
 ? getActiveButtonStyle(buttonSize)
 : !isOptionDisabled && getInactiveButtonStyle(buttonSize),
 // Minimalist styling - subtle and clean
 !isOptionDisabled && !selected &&"!text-foreground/70 hover:!text-foreground hover:bg-slate-100/50",
 // Active state for tactile feedback
 !isOptionDisabled &&"active:scale-[0.98] active:opacity-90",
 // Focus state for accessibility
 !isOptionDisabled &&"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
 // Minimalist border - subtle ring only when selected
 !isOptionDisabled && selected &&"ring-1 ring-primary/20",
 !isOptionDisabled && !selected &&"ring-0 border border-slate-200/50"
 )}
 title={!Tooltip && option.tooltip ? option.tooltip : undefined}
 >
 {option.icon && (
 <option.icon className="h-3 w-3 transition-colors duration-300 shrink-0"/>
 )}
 {option.label}
 {option.badge && option.badge}
 </Button>
 );

 // Wrap in tooltip if tooltip components are provided
 if (Tooltip && TooltipTrigger && TooltipContent && (option.tooltip || option.tooltipContent)) {
 return (
 <Tooltip key={String(option.value)}>
 <TooltipTrigger asChild>
 {button}
 </TooltipTrigger>
 <TooltipContent>
 {option.tooltipContent || <p>{option.tooltip}</p>}
 </TooltipContent>
 </Tooltip>
 );
 }

 return <React.Fragment key={String(option.value)}>{button}</React.Fragment>;
 };

 const content = (
 <div className={cn("flex items-center gap-2", className)}>
 {label && (
 <span className={cn(
 filterToggleLabelColors.text,
 labelClassName
 )}>
 {label}
 </span>
 )}
 <div className={cn(
"flex items-center gap-0.5 p-0.5 rounded-lg",
 filterToggleContainerColors.background.light,
 filterToggleContainerColors.backdropBlur,
"border",
 filterToggleContainerColors.border.light,
 filterToggleContainerColors.shadow,
 containerClassName
 )}>
 {options.map(renderButton)}
 </div>
 </div>
 );

 return content;
}
