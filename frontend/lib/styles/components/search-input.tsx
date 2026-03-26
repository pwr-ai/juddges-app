/**
 * Search Input Component
 * Reusable search input component with icon, glow effect, and consistent styling
 * Used for main search bars and search functionality
 */

"use client";

import React from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchInputColors } from '@/lib/styles/colors/surfaces';

/**
 * Props for SearchInput component
 */
export interface SearchInputProps extends Omit<React.ComponentProps<typeof Input>, 'className' | 'size'> {
 /** Optional className for additional styling */
 className?: string;
 /** Optional icon component (defaults to Search) */
 icon?: React.ComponentType<{ className?: string }>;
 /** Optional icon position (defaults to 'left') */
 iconPosition?: 'left' | 'right';
 /** Optional size variant */
 size?: 'sm' | 'md' | 'lg' | 'xl';
 /** Background variant - 'default' for standard white background, 'transparent' for transparent background within ConfigCard */
 variant?: 'default' | 'transparent';
 /** Whether to show glow effect on focus */
 showGlow?: boolean;
 /** Optional container className */
 containerClassName?: string;
}

/**
 * Search Input Component
 *
 * A reusable search input component with icon, glow effect, and consistent styling.
 * Supports different sizes and optional glow effect on focus.
 *
 * @example
 * ```tsx
 * <SearchInput
 * value={query}
 * onChange={(e) => setQuery(e.target.value)}
 * placeholder="Enter your search query..."
 * />
 * ```
 *
 * @example
 * ```tsx
 * <SearchInput
 * value={query}
 * onChange={(e) => setQuery(e.target.value)}
 * size="xl"
 * showGlow={true}
 * />
 * ```
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
 (
 {
 className,
 icon: Icon = Search,
 iconPosition = 'left',
 size = 'md',
 variant = 'default',
 showGlow = true,
 containerClassName,
 ...props
 },
 ref
 ) => {
 const sizeClasses = {
 sm: {
 input: "h-10 text-sm pl-10 pr-4",
 iconSize: "h-4 w-4",
 iconLeft: "left-3",
 iconRight: "right-3",
 container: "gap-2"
 },
 md: {
 input: "h-12 text-base pl-12 pr-4",
 iconSize: "h-5 w-5",
 iconLeft: "left-5",
 iconRight: "right-5",
 container: "gap-4"
 },
 lg: {
 input: "h-14 text-base pl-12 pr-4",
 iconSize: "h-5 w-5",
 iconLeft: "left-5",
 iconRight: "right-5",
 container: "gap-4"
 },
 xl: {
 input: "h-16 text-base pl-12 pr-4",
 iconSize: "h-5 w-5",
 iconLeft: "left-5",
 iconRight: "right-5",
 container: "gap-4"
 },
 };

 const sizeConfig = sizeClasses[size];
 const isIconLeft = iconPosition === 'left';
 const iconPositionClass = isIconLeft ? sizeConfig.iconLeft : sizeConfig.iconRight;

 return (
 <div className={cn("relative flex-1 group", containerClassName)}>
 {/* Glow effect on focus - only for default variant */}
 {showGlow && variant === 'default' && (
 <>
 <div className={cn(
"absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-md -z-10",
"bg-gradient-to-r from-primary/20 via-indigo-400/20 to-purple-400/20",
""
 )} />
 <div className={cn(
"absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-50 transition-opacity duration-300 blur-xl -z-20",
"bg-gradient-to-r from-primary/15 via-indigo-400/15 to-purple-400/15",
""
 )} />
 </>
 )}

 {/* Search icon */}
 <Icon className={cn(
"absolute top-1/2 -translate-y-1/2 z-10 transition-colors",
 sizeConfig.iconSize,
 iconPositionClass,
"text-muted-foreground group-focus-within:text-primary"
 )} />

 <Input
 ref={ref}
 className={cn(
 sizeConfig.input,
 // Border colors - based on variant
 variant === 'transparent' ? (
 cn(
 searchInputColors.borderTransparent.light,
 searchInputColors.focusBorder.light,
 searchInputColors.hoverBorder.light,
 )
 ) : (
 cn(
 searchInputColors.border.light,
 searchInputColors.focusBorder.light,
 searchInputColors.hoverBorder.light,
 )
 ),
 // Focus states - add ring for subtle emphasis
"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-offset-1",
 // Background and blur - based on variant
 variant === 'transparent' ? (
 cn(
"!bg-transparent", // Force transparent to override Input's default
 searchInputColors.backdropBlur
 )
 ) : (
 cn(
 searchInputColors.background.light,
 searchInputColors.backdropBlur
 )
 ),
 // Shadow - based on variant
 variant === 'transparent' ? searchInputColors.shadowTransparent : searchInputColors.shadow,
 // Border radius
"rounded-2xl",
 // Transitions
"transition-all duration-300",
 className
 )}
 {...props}
 />
 </div>
 );
 }
);

SearchInput.displayName ="SearchInput";
