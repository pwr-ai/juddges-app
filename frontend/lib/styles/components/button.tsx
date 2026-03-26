/**
 * Styled Button Component
 * Wraps base UI button component with design system styling
 * Used for actions throughout the application
 */

"use client";

import React from 'react';
import { Button as BaseButton, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type VariantProps } from 'class-variance-authority';

/**
 * Props for Button component
 */
export interface ButtonProps extends React.ComponentProps<typeof BaseButton> {
  /** Button variant */
  variant?: VariantProps<typeof buttonVariants>['variant'];
  /** Button size */
  size?: VariantProps<typeof buttonVariants>['size'];
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Styled Button Component
 *
 * A styled button component that follows the design system patterns.
 * Wraps the base UI button while maintaining full compatibility with all variants and sizes.
 * Supports custom className for additional styling.
 *
 * @example
 * ```tsx
 * <Button variant="outline" size="sm" onClick={handleClick}>
 *   Click me
 * </Button>
 * ```
 *
 * @example
 * ```tsx
 * <Button
 *   variant="outline"
 *   size="sm"
 *   className="bg-gradient-to-r from-primary/10 to-purple-500/10"
 * >
 *   <Icon className="mr-1.5 h-3.5 w-3.5" /> Action
 * </Button>
 * ```
 */
export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <BaseButton
      variant={variant}
      size={size}
      className={cn(
        // Design system base enhancements
        "transition-all duration-300",
        // Enhanced focus state for accessibility
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  );
}
