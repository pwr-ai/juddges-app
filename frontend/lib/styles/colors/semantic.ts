/**
 * Semantic color tokens
 * Base color definitions that reference CSS variables from globals.css
 */

/**
 * Primary color tokens
 * Uses CSS variable --primary which is defined in globals.css
 */
export const primaryColors = {
  base: 'primary',
  foreground: 'primary-foreground',
} as const;

/**
 * Foreground color tokens
 * Uses CSS variable --foreground which is defined in globals.css
 */
export const foregroundColors = {
  base: 'foreground',
} as const;

/**
 * Semantic color system
 * All colors reference CSS variables that support light/dark mode
 */
export const semanticColors = {
  primary: primaryColors,
  foreground: foregroundColors,
} as const;
