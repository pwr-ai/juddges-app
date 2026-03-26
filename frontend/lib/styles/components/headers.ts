/**
 * Header style utilities
 * Provides consistent header styling across the application
 */

import { cn } from '@/lib/utils';
import { gradients } from '@/lib/styles/colors/gradients';

/**
 * Header size variants
 */
export type HeaderSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

/**
 * Header size class mappings
 */
const headerSizeClasses: Record<HeaderSize, string> = {
 sm: 'text-sm',
 md: 'text-base',
 lg: 'text-lg',
 xl: 'text-xl',
 '2xl': 'text-2xl',
 '3xl': 'text-3xl',
 '4xl': 'text-4xl md:text-4xl lg:text-5xl',
 '5xl': 'text-3xl md:text-4xl lg:text-5xl',
};

/**
 * Get header gradient text style
 * Creates a gradient text effect using bg-clip-text
 *
 * @param size - Header size variant (default: '5xl')
 * @param hover - Whether to include hover gradient effect (default: false)
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <h1 className={getHeaderGradientStyle()}>
 * Welcome
 * </h1>
 *
 * @example
 * <h2 className={getHeaderGradientStyle('3xl', true)}>
 * Interactive Header
 * </h2>
 */
export const getHeaderGradientStyle = (
 size: HeaderSize = '5xl',
 hover: boolean = false,
 additionalClasses?: string
): string => {
 return cn(
 'font-bold',
 'bg-gradient-to-br',
 gradients.header.base,
 'bg-clip-text',
 'text-transparent',
 // Fix for descenders (g, y, p, q) being cut off
 // Use leading-normal for better spacing, and add padding for descenders
 'leading-normal',
 'pb-1', // Padding-bottom to prevent descender clipping
 'overflow-visible', // Ensure text isn't clipped by container
 headerSizeClasses[size],
 hover && [
 'group-hover:from-primary',
 'group-hover:via-indigo-400',
 'group-hover:to-purple-400',
 '',
 '',
 'transition-all',
 'duration-300',
 ],
 additionalClasses
 );
};

/**
 * Responsive size class mappings
 * Maps size strings to Tailwind classes (must be full class names for JIT compiler)
 */
const responsiveSizeMap: Record<string, string> = {
 'sm': 'text-sm',
 'md': 'text-base',
 'lg': 'text-lg',
 'xl': 'text-xl',
 '2xl': 'text-2xl',
 '3xl': 'text-3xl',
 '4xl': 'text-4xl',
 '5xl': 'text-5xl',
};

/**
 * Responsive breakpoint class mappings
 * Complete mapping for md: and lg: breakpoints to ensure Tailwind JIT detection
 */
const responsiveBreakpointMap: Record<string, Record<string, string>> = {
 'md': {
 'sm': 'md:text-sm',
 'md': 'md:text-base',
 'lg': 'md:text-lg',
 'xl': 'md:text-xl',
 '2xl': 'md:text-2xl',
 '3xl': 'md:text-3xl',
 '4xl': 'md:text-4xl',
 '5xl': 'md:text-5xl',
 },
 'lg': {
 'sm': 'lg:text-sm',
 'md': 'lg:text-base',
 'lg': 'lg:text-lg',
 'xl': 'lg:text-xl',
 '2xl': 'lg:text-2xl',
 '3xl': 'lg:text-3xl',
 '4xl': 'lg:text-4xl',
 '5xl': 'lg:text-5xl',
 },
};

/**
 * Get header gradient style with responsive sizing
 * Similar to getHeaderGradientStyle but with explicit responsive classes
 *
 * Note: This function uses complete mappings to ensure Tailwind JIT compiler can detect all classes.
 *
 * @param baseSize - Base text size (e.g., '3xl')
 * @param mdSize - Medium breakpoint size (e.g., '4xl')
 * @param lgSize - Large breakpoint size (e.g., '5xl')
 * @param hover - Whether to include hover gradient effect (default: false)
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <h1 className={getHeaderGradientStyleResponsive('3xl', '4xl', '5xl')}>
 * Welcome
 * </h1>
 */
export const getHeaderGradientStyleResponsive = (
 baseSize: string,
 mdSize?: string,
 lgSize?: string,
 hover: boolean = false,
 additionalClasses?: string
): string => {
 const responsiveClasses = [
 responsiveSizeMap[baseSize],
 mdSize && responsiveBreakpointMap.md[mdSize],
 lgSize && responsiveBreakpointMap.lg[lgSize],
 ].filter(Boolean);

 return cn(
 'font-bold',
 'bg-gradient-to-br',
 gradients.header.base,
 'bg-clip-text',
 'text-transparent',
 // Fix for descenders (g, y, p, q) being cut off
 // Use leading-normal for better spacing, and add padding for descenders
 'leading-normal',
 'pb-1', // Padding-bottom to prevent descender clipping
 'overflow-visible', // Ensure text isn't clipped by container
 ...responsiveClasses,
 hover && [
 'group-hover:from-primary',
 'group-hover:via-indigo-400',
 'group-hover:to-purple-400',
 '',
 '',
 'transition-all',
 'duration-300',
 ],
 additionalClasses
 );
};
