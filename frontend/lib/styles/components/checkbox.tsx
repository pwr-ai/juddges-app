/**
 * Styled Checkbox Component
 * Wraps base UI checkbox component with design system styling
 * Used for selection states and form inputs
 */

"use client";

import React from 'react';
import { Checkbox as BaseCheckbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * Props for Checkbox component
 */
export interface CheckboxProps extends React.ComponentProps<typeof BaseCheckbox> {
 /** Optional className for additional styling */
 className?: string;
}

/**
 * Styled Checkbox Component
 *
 * A styled checkbox component that follows the design system patterns.
 * Features primary color theming for checked states and consistent hover effects.
 *
 * @example
 * ```tsx
 * <Checkbox
 * checked={isSelected}
 * onCheckedChange={handleToggle}
 * className="h-6 w-6"
 * />
 * ```
 */
export function Checkbox({
 className,
 ...props
}: CheckboxProps): React.JSX.Element {
 return (
 <BaseCheckbox
 className={cn(
 // Design system base styles
"cursor-pointer rounded-lg",
"bg-white/50",
"border border-slate-400",
"data-[state=checked]:bg-primary data-[state=checked]:border-primary",
"hover:border-primary",
"transition-all duration-200",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 className
 )}
 {...props}
 />
 );
}
