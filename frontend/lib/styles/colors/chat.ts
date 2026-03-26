/**
 * Chat container color definitions
 * Colors used for chat input containers in chat and schema studio pages
 */

/**
 * Chat container background colors
 * Uses slate colors for light/dark mode gradients
 */
export const chatBackgroundColors = {
 /**
 * Light mode: white to slate-50 gradient
 */
 light: {
 from: 'white',
 via: 'slate-50/50',
 to: 'white',
 },
} as const;

/**
 * Chat container border colors
 * Uses slate colors with opacity for subtle borders
 */
export const chatBorderColors = {
 /**
 * Light mode: slate-200 with 60% opacity
 */
 light: 'slate-200/50',
 /**
 * Dark mode: slate-800 with 50% opacity
 */
 /**
 * Focus state: primary color with 50% opacity
 */
 focus: 'primary/50',
} as const;

/**
 * Chat container shadow colors
 * Uses primary color for interactive shadows
 */
export const chatShadowColors = {
 /**
 * Base shadow: small shadow
 */
 base: 'shadow-sm',
 /**
 * Hover shadow: large shadow with primary color tint (5% opacity)
 */
 hover: 'shadow-lg shadow-primary/10',
 /**
 * Focus shadow: large shadow with primary color tint (10% opacity)
 */
 focus: 'shadow-lg shadow-primary/10',
} as const;

/**
 * Chat container internal element colors
 * Colors for elements inside the chat container (toolbar, overlays, etc.)
 */
export const chatInternalColors = {
 /**
 * Gradient overlay colors (for focus state)
 */
 overlay: {
 light: {
 from: 'primary/10',
 via: 'transparent',
 to: 'primary/10',
 },
 },
 /**
 * Toolbar border colors
 */
 toolbarBorder: {
 light: 'slate-200/50',
 },
 /**
 * Toolbar background gradient
 */
 toolbarBackground: {
 light: {
 from: 'slate-50/80',
 via: 'transparent',
 to: 'transparent',
 },
 },
 /**
 * Text colors
 */
 text: {
 light: 'slate-900',
 },
} as const;

/**
 * All chat container colors
 */
export const chatColors = {
 background: chatBackgroundColors,
 border: chatBorderColors,
 shadow: chatShadowColors,
 internal: chatInternalColors,
} as const;
