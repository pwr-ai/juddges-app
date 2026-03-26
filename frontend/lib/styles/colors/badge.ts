/**
 * Badge color definitions
 * Colors used for AI disclaimer badge and similar badge components
 */

/**
 * Badge background colors
 * Uses slate colors for light/dark mode gradients
 */
export const badgeBackgroundColors = {
 /**
 * Light mode: slate-50 gradient with opacity
 */
 light: {
 from: 'slate-50/80',
 via: 'slate-50/50',
 to: 'slate-50/80',
 },
} as const;

/**
 * Badge border colors
 * Uses slate colors with opacity for subtle borders
 */
export const badgeBorderColors = {
 /**
 * Light mode: slate-200 with 50% opacity
 */
 light: 'slate-200/50',
 /**
 * Dark mode: slate-800 with 50% opacity
 */
} as const;

/**
 * Badge shadow colors
 * Uses primary color for interactive shadows
 */
export const badgeShadowColors = {
 /**
 * Base shadow: small shadow
 */
 base: 'shadow-sm',
 /**
 * Hover shadow: medium shadow with primary color tint (5% opacity)
 */
 hover: 'shadow-md shadow-primary/10',
} as const;

/**
 * Badge text colors
 */
export const badgeTextColors = {
 /**
 * Main text color
 */
 main: {
 light: 'slate-700',
 },
 /**
 * Link color (uses primary)
 */
 link: {
 base: 'primary',
 hover: 'primary/80',
 },
} as const;

/**
 * Badge icon colors
 * Uses amber for warning/alert icons
 */
export const badgeIconColors = {
 /**
 * Light mode: amber-600
 */
 light: 'amber-600',
 /**
 * Dark mode: amber-400
 */
} as const;

/**
 * All badge colors
 */
export const badgeColors = {
 background: badgeBackgroundColors,
 border: badgeBorderColors,
 shadow: badgeShadowColors,
 text: badgeTextColors,
 icon: badgeIconColors,
} as const;
