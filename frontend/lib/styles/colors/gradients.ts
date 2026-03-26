/**
 * Gradient definitions for text and backgrounds
 * All gradients use Tailwind classes that reference CSS variables
 */

/**
 * Header text gradient definitions
 * Used for page headers, section titles, etc.
 */
export const headerGradients = {
  /**
   * Base header gradient: from-foreground via-primary to-primary
   * Works in both light and dark mode via CSS variables
   */
  base: 'from-foreground via-primary to-primary',

  /**
   * Hover state gradient: from-primary to-primary/80
   * Used for interactive headers (e.g., in cards)
   */
  hover: 'from-primary to-primary/80',
} as const;

/**
 * Button gradient definitions
 * Used for primary, active, and secondary buttons
 */
export const buttonGradients = {
  /**
   * Primary button gradient: from-primary to-primary/90
   * Used for main action buttons (Submit, Search, Save, etc.)
   */
  primary: 'from-primary to-primary/90',

  /**
   * Primary button hover gradient: hover:from-primary/90 hover:to-primary/80
   * Used for hover state on primary buttons
   */
  primaryHover: 'hover:from-primary/90 hover:to-primary/80',

  /**
   * Active/selected button gradient: same as primary
   * Used for toggle buttons, selected states, etc.
   */
  active: 'from-primary to-primary/90',

  /**
   * Active/selected button hover gradient: same as primary hover
   * Used for hover state on active buttons
   */
  activeHover: 'hover:from-primary/90 hover:to-primary/80',
} as const;

/**
 * All gradient definitions
 */
export const gradients = {
  header: headerGradients,
  button: buttonGradients,
} as const;
