/**
 * Message color definitions
 * Colors used for message components (user, assistant, error)
 */

/**
 * User message colors
 */
export const userMessageColors = {
 /**
 * Background gradient
 */
 background: {
 light: {
 from: 'primary/10',
 via: 'primary/10',
 to: 'transparent',
 },
 },
 /**
 * Border color
 */
 border: {
 light: 'primary/20',
 },
 /**
 * Text color
 */
 text: {
 light: 'slate-900',
 },
 /**
 * Shadow colors
 */
 shadow: {
 base: 'shadow-md',
 hover: 'shadow-lg shadow-primary/10',
 },
} as const;

/**
 * Assistant message colors
 */
export const assistantMessageColors = {
 /**
 * Background (transparent)
 */
 background: 'transparent',
 /**
 * Text color
 */
 text: {
 light: 'slate-800',
 },
} as const;

/**
 * Error message colors
 */
export const errorMessageColors = {
 /**
 * Background gradient
 */
 background: {
 light: {
 from: 'red-50/50',
 via: 'red-50/30',
 to: 'orange-50/30',
 },
 },
 /**
 * Border color
 */
 border: {
 light: 'red-200/50',
 },
 /**
 * Text color
 */
 text: {
 light: 'red-800',
 },
 /**
 * Shadow color
 */
 shadow: 'shadow-lg shadow-red-500/10',
 /**
 * Overlay gradient
 */
 overlay: {
 from: 'red-500/10',
 via: 'transparent',
 to: 'orange-500/10',
 },
 /**
 * Error header icon colors
 */
 headerIcon: {
 background: {
 light: {
 from: 'red-500',
 to: 'red-600',
 },
 },
 glow: 'red-500/20',
 shadow: 'shadow-lg shadow-red-500/30',
 },
 /**
 * Error header text color
 */
 headerText: {
 light: 'red-700',
 },
} as const;

/**
 * All message colors
 */
export const messageColors = {
 user: userMessageColors,
 assistant: assistantMessageColors,
 error: errorMessageColors,
} as const;
