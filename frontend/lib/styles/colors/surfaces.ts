/**
 * Surface color definitions
 * Editorial Jurisprudence design system tokens for containers, cards, inputs, and surfaces.
 */

/**
 * Filter toggle group container colors
 * Container that wraps toggle buttons
 */
export const filterToggleContainerColors = {
  background: {
    light: 'bg-parchment',
  },
  border: {
    light: 'border-rule',
  },
  shadow: 'shadow-none',
  backdropBlur: '',
} as const;

/**
 * Filter toggle group label colors
 * Label text before the toggle group
 */
export const filterToggleLabelColors = {
  text: 'text-xs font-mono uppercase tracking-wider text-ink-soft',
} as const;

/**
 * Search input colors
 * Input fields in Editorial styling
 */
export const searchInputColors = {
  background: {
    light: 'bg-parchment',
  },
  backgroundTransparent: {
    light: 'bg-transparent',
  },
  border: {
    light: 'border-rule',
  },
  borderTransparent: {
    light: 'border-rule',
  },
  focusBorder: {
    light: 'focus:border-ink',
  },
  hoverBorder: {
    light: 'hover:border-ink',
  },
  shadow: 'shadow-none',
  shadowTransparent: 'shadow-none',
  backdropBlur: '',
} as const;
