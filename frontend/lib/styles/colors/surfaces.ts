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
 * Card background definitions
 */
export const cardBackgroundGradients = {
  base: {
    light: 'bg-parchment',
  },
  light: {
    light: 'bg-parchment',
  },
  toggleActive: {
    light: 'bg-parchment-deep',
  },
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

/**
 * Search input config background colors
 */
export const searchInputConfigBackground = {
  background: {
    light: 'bg-parchment',
  },
  backdropBlur: '',
  overlay: {
    container: 'hidden',
    gradient: {
      light: '',
    },
  },
} as const;

/**
 * Search input glow effect colors
 */
export const searchInputGlowColors = {
  gradient: '',
} as const;

/**
 * Source document card colors
 * Editorial card styling for document presentation
 */
export const sourceDocumentCardColors = {
  container: {
    base: 'group relative overflow-hidden rounded-none p-6 flex flex-col min-h-[180px] cursor-pointer border border-rule bg-parchment',
    focus: 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink',
    transition: 'transition-colors duration-150',
  },
  background: {
    judgment: {
      light: 'bg-parchment',
    },
    taxInterpretation: {
      light: 'bg-parchment',
    },
    default: {
      light: 'bg-parchment',
    },
  },
  border: {
    light: 'border border-rule',
  },
  hoverBorder: {
    light: 'hover:border-ink',
    tax: 'hover:border-ink',
    judgment: 'hover:border-ink',
  },
  shadow: {
    base: 'shadow-none',
    hover: '',
    taxGlow: '',
    judgmentGlow: '',
  },
  overlay: {
    container: 'hidden',
    transition: '',
    judgment: {
      light: '',
    },
    taxInterpretation: {
      light: '',
    },
    default: {
      light: '',
    },
  },
  header: {
    container: 'pb-2 space-y-1.5 flex-shrink-0 overflow-hidden',
    inner: 'flex items-center justify-between gap-2',
  },
  typeLabel: {
    text: 'text-[10px] font-mono text-ink-soft uppercase tracking-wider',
  },
  title: {
    container: 'flex items-center gap-2 overflow-hidden',
    textContainer: 'flex-1 min-w-0 overflow-hidden',
    text: 'text-[15px] font-semibold text-ink truncate transition-colors',
  },
  iconContainer: {
    container: 'flex-shrink-0 w-10 h-10 rounded-none flex items-center justify-center border border-rule bg-parchment-deep',
    judgment: {
      light: 'bg-parchment-deep',
    },
    taxInterpretation: {
      light: 'bg-parchment-deep',
    },
    default: {
      light: 'bg-parchment-deep',
    },
    icon: {
      judgment: 'h-5 w-5 text-ink',
      taxInterpretation: 'h-5 w-5 text-ink',
      default: 'h-5 w-5 text-ink',
    },
  },
  content: {
    container: 'flex-1 flex flex-col gap-3 mb-12',
    previewText: 'text-[13px] font-normal text-ink-soft leading-relaxed',
  },
  footer: {
    container: 'absolute bottom-6 right-6',
  },
  errorWarning: {
    container: 'flex items-center gap-2 rounded-none px-3 py-2 text-xs border border-rule bg-parchment-deep text-ink',
    icon: 'h-3.5 w-3.5 shrink-0',
    border: {
      light: 'border-rule',
    },
    background: {
      light: 'bg-parchment-deep',
    },
    text: {
      light: 'text-ink',
    },
  },
} as const;

/**
 * All surface colors
 */
export const surfaceColors = {
  filterToggleContainer: filterToggleContainerColors,
  filterToggleLabel: filterToggleLabelColors,
  cardBackground: cardBackgroundGradients,
  searchInput: searchInputColors,
  searchInputConfigBackground: searchInputConfigBackground,
  searchInputGlow: searchInputGlowColors,
  sourceDocumentCard: sourceDocumentCardColors,
} as const;
