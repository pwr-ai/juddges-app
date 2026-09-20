/**
 * Surface color definitions
 * Colors used for containers, cards, inputs, and other surface elements
 *
 * Editorial Jurisprudence (#676): surfaces are flat parchment separated by
 * hairlines. The glass/gradient/shadow token groups this file used to carry
 * (`cardBackgroundGradients`, `searchInputConfigBackground`,
 * `searchInputGlowColors`, `sourceDocumentCardColors`, `surfaceColors`) had no
 * consumers left and were deleted rather than restyled.
 */

/**
 * Filter toggle group container colors
 * Used for the container that wraps toggle buttons
 */
export const filterToggleContainerColors = {
  /**
   * Background colors
   */
  background: {
    light: 'bg-parchment',
  },
  /**
   * Border colors
   */
  border: {
    light: 'border-rule',
  },
} as const;

/**
 * Filter toggle group label colors
 * Used for the label text before the toggle group
 */
export const filterToggleLabelColors = {
  /**
   * Label text styling
   */
  text: 'text-xs font-medium uppercase tracking-wider text-ink-soft',
} as const;

/**
 * Search input colors
 * Used for search input fields
 */
export const searchInputColors = {
  /**
   * Background colors
   */
  background: {
    light: 'bg-parchment',
  },
  /**
   * Border colors
   */
  border: {
    light: 'border-rule',
  },
  /**
   * Lighter border for the transparent variant used inside cards
   */
  borderTransparent: {
    light: 'border-rule',
  },
  /**
   * Focus border colors
   */
  focusBorder: {
    light: 'focus:border-ink',
  },
  /**
   * Hover border colors
   */
  hoverBorder: {
    light: 'hover:border-rule-strong',
  },
} as const;
