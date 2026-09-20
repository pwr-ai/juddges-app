/**
 * Button style utilities
 * Provides consistent button styles across the application
 *
 * Editorial Jurisprudence (#676): selection reads as a solid ink block, the
 * unselected state as a hairline outline. No gradients, glass, or hover scale —
 * feedback is carried by border and fill weight only.
 */

import { cn } from '@/lib/utils';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-parchment';

/**
 * Get standardized active/selected button style
 * Use for toggle buttons, selected states, etc.
 *
 * @param size - Button size class (default: "h-8")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <Button className={getActiveButtonStyle()}>
 *   Selected
 * </Button>
 */
export const getActiveButtonStyle = (
  size: string = 'h-8',
  additionalClasses?: string
): string => {
  return cn(
    size,
    'group relative',
    'border border-ink bg-ink text-parchment',
    'font-medium',
    'hover:bg-ink-soft hover:border-ink-soft',
    'active:opacity-90',
    'transition-colors duration-150',
    FOCUS_RING,
    additionalClasses
  );
};

/**
 * Get standardized ghost button style for inactive states
 * Use for toggle buttons when not selected
 *
 * @param size - Button size class (default: "h-8")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <Button variant="ghost" className={getInactiveButtonStyle()}>
 *   Not Selected
 * </Button>
 */
export const getInactiveButtonStyle = (
  size: string = 'h-8',
  additionalClasses?: string
): string => {
  return cn(
    size,
    'group relative',
    // `!` overrides the ghost variant's transparent background and hover fill.
    'border !bg-transparent border-rule text-ink-soft',
    '!hover:bg-transparent hover:border-ink hover:!text-ink',
    'transition-colors duration-150',
    FOCUS_RING,
    additionalClasses
  );
};
