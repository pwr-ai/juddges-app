/**
 * Header style utilities
 * Provides consistent header styling across the application
 */

import { cn } from '@/lib/utils';

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
 * Get header text style following Editorial Jurisprudence
 *
 * @param size - Header size variant (default: '5xl')
 * @param _hover - Kept for compatibility
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getHeaderGradientStyle = (
  size: HeaderSize = '5xl',
  _hover: boolean = false,
  additionalClasses?: string
): string => {
  return cn(
    'font-serif font-medium text-ink',
    'leading-tight',
    'overflow-visible',
    headerSizeClasses[size],
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
 * Get header style with responsive sizing
 */
export const getHeaderGradientStyleResponsive = (
  baseSize: string,
  mdSize?: string,
  lgSize?: string,
  _hover: boolean = false,
  additionalClasses?: string
): string => {
  const responsiveClasses = [
    responsiveSizeMap[baseSize],
    mdSize && responsiveBreakpointMap.md[mdSize],
    lgSize && responsiveBreakpointMap.lg[lgSize],
  ].filter(Boolean);

  return cn(
    'font-serif font-medium text-ink',
    'leading-tight',
    'overflow-visible',
    ...responsiveClasses,
    additionalClasses
  );
};
