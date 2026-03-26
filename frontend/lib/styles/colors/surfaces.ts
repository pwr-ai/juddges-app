/**
 * Surface color definitions
 * Colors used for containers, cards, inputs, and other surface elements
 */

/**
 * Filter toggle group container colors
 * Used for the backdrop blur container that wraps toggle buttons
 */
export const filterToggleContainerColors = {
 /**
 * Background colors with backdrop blur
 */
 background: {
 light: 'bg-white/50',
 },
 /**
 * Border colors
 */
 border: {
 light: 'border-slate-200/30',
 },
 /**
 * Shadow
 */
 shadow: 'shadow-sm',
 /**
 * Backdrop blur intensity
 */
 backdropBlur: 'backdrop-blur-md',
} as const;

/**
 * Filter toggle group label colors
 * Used for the label text before the toggle group
 */
export const filterToggleLabelColors = {
 /**
 * Label text styling
 */
 text: 'text-xs font-semibold text-foreground/80',
} as const;

/**
 * Card background gradients
 * Used for BaseCard and active toggle buttons to maintain visual consistency
 */
export const cardBackgroundGradients = {
 /**
 * Base card background gradient
 * Extremely subtle multi-color gradient matching BaseCard design - no purple
 */
 base: {
 light: 'bg-gradient-to-br from-blue-400/1 via-indigo-400/0.5 to-blue-400/0.5',
 },
 /**
 * Light variant for BaseCard
 * Much lighter, subtle gradient similar to ConfigCard
 * Uses muted colors for less visual weight, no purple
 * Enhanced with glass effect (backdrop-blur applied in component)
 */
 light: {
 light: 'bg-gradient-to-br from-white/80 via-slate-50/70 to-slate-100/60',
 },
 /**
 * Toggle button active state gradient
 * Modern gradient - uses primary and indigo only, no purple
 */
 toggleActive: {
 light: 'bg-gradient-to-br from-primary/3 via-indigo-50/10 to-primary/3',
 },
} as const;

/**
 * Light variant overlay for BaseCard
 * Lighter overlay gradient similar to ConfigCard
 * Following color guidelines: opacity scale (/5, /8, /10, /15)
 */
export const baseCardLightOverlay = {
 /**
 * Subtle gradient overlay for light variant
 * No purple - uses only primary and indigo/blue tones
 */
 gradient: {
 light: 'bg-gradient-to-br from-primary/3 via-blue-400/2 via-transparent to-blue-400/3',
 },
} as const;

/**
 * Search input colors
 * Used for search input fields with glow effects
 */
export const searchInputColors = {
 /**
 * Background colors with backdrop blur
 */
 background: {
 light: 'bg-white/80',
 },
 /**
 * Transparent background variant for use within ConfigCard
 * No background - fully transparent to blend with parent
 */
 backgroundTransparent: {
 light: 'bg-transparent',
 },
 /**
 * Border colors
 */
 border: {
 light: 'border-slate-200/50',
 },
 /**
 * Lighter border for transparent variant
 */
 borderTransparent: {
 light: 'border-border/50',
 },
 /**
 * Focus border colors
 */
 focusBorder: {
 light: 'focus:border-primary/30',
 },
 /**
 * Hover border colors
 */
 hoverBorder: {
 light: 'hover:border-primary/20',
 },
 /**
 * Shadow
 */
 shadow: 'shadow-lg hover:shadow-xl',
 /**
 * Lighter shadow for transparent variant
 */
 shadowTransparent: 'shadow-sm hover:shadow-md',
 /**
 * Backdrop blur intensity
 */
 backdropBlur: 'backdrop-blur-md',
} as const;

/**
 * Search input config background colors
 * Used for search inputs within LightCard to match the lighter muted background
 * Matches LightCard's background gradient and overlay for visual consistency
 */
export const searchInputConfigBackground = {
 /**
 * Background colors matching LightCard's muted gradient
 * Uses same opacity scale as LightCard: /50, /30, /40
 */
 background: {
 light: 'bg-gradient-to-br from-muted/50 via-muted/30 to-muted/40',
 },
 /**
 * Backdrop blur to match LightCard
 */
 backdropBlur: 'backdrop-blur-sm',
 /**
 * Overlay gradient matching LightCard's overlay
 * Following color guidelines: opacity scale (/5, /8, /10, /15)
 * Light mode: 400 shades, Dark mode: 500 shades
 */
 overlay: {
 container: 'absolute inset-0 -z-10 pointer-events-none rounded-2xl',
 gradient: {
 light: 'bg-gradient-to-br from-primary/5 via-indigo-400/3 via-transparent to-blue-400/3',
 },
 },
} as const;

/**
 * Search input glow effect colors
 * Used for the glow effect on focus
 */
export const searchInputGlowColors = {
 /**
 * Glow gradient colors - no purple
 */
 gradient: 'from-primary/10 via-indigo-500/10 to-primary/10',
} as const;

/**
 * Empty state colors
 * Used for empty state components (no results, no data, etc.)
 */
export const emptyStateColors = {
 /**
 * Icon glow effect colors
 */
 iconGlow: {
 search: {
 light: 'from-primary/15 via-indigo-400/15 to-primary/15',
 },
 default: {
 light: 'from-primary/10 via-indigo-400/10 to-primary/10',
 },
 },
 /**
 * Icon container colors
 */
 iconContainer: {
 search: {
 light: 'from-primary/8 via-indigo-400/8 to-primary/8',
 },
 default: {
 light: 'from-primary/5 via-indigo-400/5 to-primary/5',
 },
 },
 /**
 * Icon border colors
 */
 iconBorder: {
 search: {
 light: 'border-primary/15',
 },
 default: {
 light: 'border-primary/10',
 },
 },
 /**
 * Query badge colors
 */
 queryBadge: {
 background: {
 light: 'from-slate-100/80 via-blue-50/50 to-indigo-50/50',
 },
 border: {
 light: 'border-slate-200/50',
 },
 },
} as const;

/**
 * Document card colors
 * Used for DocumentCard component
 * SPECIFICATION B: THE SUGGESTION CARD (The Interactive Tile)
 * Legal Glass 2.0 aesthetic - Clinical, High-Contrast, Premium
 */
export const sourceDocumentCardColors = {
 /**
 * Card container styles
 * FIX 1 & 3: Fluid Container - Auto height, min-height 180px, 24px padding, relative position
 */
 container: {
 base: 'group relative overflow-hidden rounded-2xl p-6 flex flex-col min-h-[180px] cursor-pointer',
 focus: 'focus-visible:outline-none',
 transition: 'transition-[transform,shadow,border-color,background-color] duration-300 ease-out',
 },
 /**
 * Card background - SPECIFICATION B.II: Material Logic
 * IDLE: rgba(255, 255, 255, 0.60) | rgba(30, 41, 59, 0.40)
 * HOVER: Solid White | rgba(30, 41, 59, 0.80)
 * NO TINTED BACKGROUNDS - Only Blue/Slate Tints
 */
 background: {
 /**
 * Judgment background - Blue/Slate only, no pastels
 */
 judgment: {
 light: 'bg-[rgba(255,255,255,0.60)] group-hover:bg-white group-focus:bg-white',
 },
 /**
 * Tax Interpretation background - Blue/Slate only, no pastels
 */
 taxInterpretation: {
 light: 'bg-[rgba(255,255,255,0.60)] group-hover:bg-white group-focus:bg-white',
 },
 /**
 * Default/Error background - Blue/Slate only, no pastels
 */
 default: {
 light: 'bg-[rgba(255,255,255,0.60)] group-hover:bg-white group-focus:bg-white',
 },
 },
 /**
 * Card border colors - SPECIFICATION B.II: 1px solid white border
 * Top border is 2px solid transparent initially, changes to accent color on hover
 */
 border: {
 light: 'border border-white border-t-2 border-t-transparent',
 },
 /**
 * Card hover border colors - FIX 1: The Edge (Full border changes to accent color on hover)
 * Tax: Royal Blue (#3B82F6)
 * Judgment: Judicial Teal (#06B6D4)
 */
 hoverBorder: {
 light: 'group-hover:border-white group-focus:border-white',
 // Tax Interpretation: Royal Blue border on hover/focus
 tax: 'group-hover:border-[#3B82F6] group-focus:border-[#3B82F6]',
 // Judgment: Judicial Teal border on hover/focus
 judgment: 'group-hover:border-[#06B6D4] group-focus:border-[#06B6D4]',
 },
 /**
 * Card shadow - FIX 1: The Glow (Ambient Backlight)
 * IDLE: 0 4px 6px rgba(0,0,0,0.04) | None
 * HOVER: Colored glow based on document type + lift
 * Tax: Blue Haze - 0 15px 40px -5px rgba(59, 130, 246, 0.25)
 * Judgment: Teal Haze - 0 15px 40px -5px rgba(6, 182, 212, 0.25)
 */
 shadow: {
 base: 'shadow-[0_4px_6px_rgba(0,0,0,0.05)] group-hover:shadow-none group-focus:shadow-none',
 hover: 'group-hover:-translate-y-1 group-focus:-translate-y-1', // -4px lift
 // Colored glows applied via conditional classes in component
 taxGlow: 'group-hover:shadow-[0_15px_40px_-5px_rgba(59,130,246,0.25)] group-focus:shadow-[0_15px_40px_-5px_rgba(59,130,246,0.25)]',
 judgmentGlow: 'group-hover:shadow-[0_15px_40px_-5px_rgba(6,182,212,0.25)] group-focus:shadow-[0_15px_40px_-5px_rgba(6,182,212,0.25)]',
 },
 /**
 * Gradient overlay - REMOVED per specification (no tinted backgrounds)
 */
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
 /**
 * Header section styles - FIX 1 & 3: Corner anchor strategy (top-left for icon)
 */
 header: {
 container: 'pb-2 space-y-1.5 flex-shrink-0 overflow-hidden',
 inner: 'flex items-center justify-between gap-2',
 },
 /**
 * Document type label styles
 */
 typeLabel: {
 text: 'text-[10px] font-medium text-foreground/80 uppercase tracking-wider',
 },
 /**
 * Title section styles - SPECIFICATION B.IV: Typography
 * Headline: Semi-Bold 600, 15px, Midnight Navy (#0F172A) | Pure White (#F8FAFC)
 */
 title: {
 container: 'flex items-center gap-2 overflow-hidden',
 textContainer: 'flex-1 min-w-0 overflow-hidden',
 text: 'text-[15px] font-semibold text-[#0F172A] truncate transition-colors',
 },
 /**
 * Icon container colors and styles - SPECIFICATION B.III: The Icon Container (The Jewel)
 * 40px x 40px squircle (border-radius: 10px)
 * Categorical Accents: "The File Tab System"
 * - Tax Interpretation: Royal Blue (Administrative, Corporate)
 * - Judgment: Judicial Teal (Objective, Sharp)
 */
 iconContainer: {
 container: 'flex-shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center',
 /**
 * Judgment icon - Judicial Teal (Deep Cyan)
 * Background: rgba(6, 182, 212, 0.08) | rgba(6, 182, 212, 0.15) dark
 * Icon: #0E7490 (Cyan 700 - Dark Teal) | Light Teal dark
 */
 judgment: {
 light: 'bg-[rgba(6,182,212,0.08)]',
 },
 /**
 * Tax Interpretation icon - Royal Blue (Administrative)
 * Background: rgba(59, 130, 246, 0.08) | rgba(59, 130, 246, 0.15) dark
 * Icon: #1E40AF (Deep Blue) | Light Blue dark
 */
 taxInterpretation: {
 light: 'bg-[rgba(59,130,246,0.08)]',
 },
 /**
 * Default icon - Royal Blue (matches Tax as standard)
 */
 default: {
 light: 'bg-[rgba(59,130,246,0.08)]',
 },
 /**
 * Icon colors by type
 */
 icon: {
 judgment: 'h-5 w-5 text-[#0E7490]', // Dark Teal | Light Teal
 taxInterpretation: 'h-5 w-5 text-[#1E40AF]', // Deep Blue | Light Blue
 default: 'h-5 w-5 text-[#1E40AF]', // Deep Blue | Light Blue
 },
 },
 /**
 * Content section styles - FIX 1 & 3: Full text flow (no truncation)
 * Subtext: Regular 400, 13px, Slate Grey (#64748B) | Light Grey (#94A3B8) dark
 * Margin bottom 48px (3rem) to clear action button
 */
 content: {
 container: 'flex-1 flex flex-col gap-3 mb-12',
 previewText: 'text-[13px] font-normal text-[#64748B] leading-relaxed',
 },
 /**
 * Footer styles - FIX 1 & 3: Action button positioned absolute bottom-right
 */
 footer: {
 container: 'absolute bottom-6 right-6',
 },
 /**
 * Error warning colors and styles - Updated to use Blue/Slate only (removed amber/yellow)
 */
 errorWarning: {
 container: 'flex items-center gap-2 rounded-lg px-3 py-2 text-xs border',
 icon: 'h-3.5 w-3.5 shrink-0',
 border: {
 light: 'border-slate-300/50',
 },
 background: {
 light: 'bg-slate-50/80',
 },
 text: {
 light: 'text-slate-900',
 },
 },
} as const;

/**
 * Light Card colors
 * Used for LightCard component - panels and sections with lighter appearance
 * Features much lighter background for better readability and visual hierarchy
 */
export const lightCardColors = {
 /**
 * Card container styles
 */
 container: {
 base: 'group relative overflow-hidden',
 transition: 'transition-all duration-200',
 },
 /**
 * Background colors - lighter than BaseCard but with better visual definition
 * Uses muted background with subtle gradient for depth
 * Following color guidelines: opacity scale (/5, /10, /15, /20, /30, /50, /80)
 * Light mode: 400 shades, Dark mode: 500 shades
 */
 background: {
 // Subtle gradient base - much lighter than BaseCard but more visible
 gradient: {
 light: 'bg-gradient-to-br from-muted/50 via-muted/30 to-muted/40',
 },
 },
 /**
 * Backdrop blur
 */
 backdropBlur: 'backdrop-blur-sm',
 /**
 * Border colors - more visible for better definition
 */
 border: {
 light: 'border-border',
 },
 /**
 * Shadow - subtle depth
 */
 shadow: {
 base: 'shadow-sm',
 },
 /**
 * Gradient overlay - subtle accent (lighter than BaseCard but more visible)
 * Following color guidelines: opacity scale (/5, /8, /10, /15)
 * Light mode: 400 shades, Dark mode: 500 shades
 */
 overlay: {
 container: 'absolute inset-0 -z-10 pointer-events-none',
 gradient: {
 light: 'bg-gradient-to-br from-primary/1 via-blue-400/0.5 to-primary/1',
 },
 },
 /**
 * Title styles
 */
 title: {
 text: 'text-sm font-semibold mb-4 text-foreground',
 },
 /**
 * Padding sizes
 */
 padding: {
 sm: 'p-4',
 md: 'p-6',
 lg: 'p-8',
 },
} as const;

/**
 * Error card colors
 * Used for ErrorCard component - error-themed gradients
 * Supports red-rose (default) and red-blue variants
 * Following color guidelines: opacity scale (/5, /8, /10, /15, /20, /25, /30)
 * Light mode: 400 shades, Dark mode: 500 shades
 */
export const errorCardColors = {
 /**
 * Card container styles
 */
 container: {
 base: 'group relative overflow-hidden rounded-2xl',
 transition: 'transition-[shadow,border-color] duration-300 ease-out',
 },
 /**
 * Error-themed background gradients
 */
 background: {
 /**
 * Red-purple variant (default)
 * Uses red to purple gradient to clearly indicate error state
 */
 redPurple: {
 light: 'bg-gradient-to-br from-red-400/8 via-rose-400/6 via-purple-400/5 to-purple-400/5',
 },
 /**
 * Red-blue variant
 * Uses red to blue gradient for a different visual style
 */
 redBlue: {
 light: 'bg-gradient-to-br from-red-400/25 via-rose-400/20 via-blue-400/15 to-blue-400/15',
 },
 },
 /**
 * Border colors with error theme
 */
 border: {
 light: 'border-red-200/50',
 },
 /**
 * Hover border colors
 */
 hoverBorder: {
 light: 'hover:border-red-300/50',
 },
 /**
 * Shadow with red tint
 */
 shadow: 'shadow-lg hover:shadow-2xl hover:shadow-red-500/10',
 /**
 * Gradient overlays
 * Following color guidelines: opacity scale (/10, /15, /20)
 */
 overlay: {
 /**
 * Red-purple variant overlays
 */
 redPurple: {
 primary: {
 light: 'bg-gradient-to-br from-red-400/5 via-rose-400/3 via-purple-400/3 to-purple-400/3',
 },
 secondary: {
 light: 'bg-gradient-to-tl from-red-400/3 via-transparent to-purple-400/3',
 },
 },
 /**
 * Red-blue variant overlays
 */
 redBlue: {
 primary: {
 light: 'bg-gradient-to-br from-red-400/15 via-rose-400/10 via-blue-400/10 to-blue-400/10',
 },
 secondary: {
 light: 'bg-gradient-to-tl from-red-400/8 via-transparent to-blue-400/8',
 },
 },
 },
 /**
 * Error icon colors and styles
 */
 icon: {
 /**
 * Red-purple variant icon
 */
 redPurple: {
 glow: {
 light: 'bg-gradient-to-br from-red-500/30 via-rose-500/20 to-purple-500/20',
 },
 background: {
 light: 'bg-gradient-to-br from-red-500/20 via-rose-500/15 to-purple-500/15',
 },
 },
 /**
 * Red-blue variant icon
 */
 redBlue: {
 glow: {
 light: 'bg-gradient-to-br from-red-500/30 via-rose-500/20 to-blue-500/20',
 },
 background: {
 light: 'bg-gradient-to-br from-red-500/20 via-rose-500/15 to-blue-500/15',
 },
 },
 color: {
 light: 'text-red-600',
 },
 },
 /**
 * Title gradient text colors
 */
 title: {
 /**
 * Red-purple variant title
 */
 redPurple: {
 light: 'bg-gradient-to-br from-red-700 via-rose-600 to-purple-700',
 },
 /**
 * Red-blue variant title
 */
 redBlue: {
 light: 'bg-gradient-to-br from-red-700 via-rose-600 to-blue-700',
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
 baseCardLightOverlay: baseCardLightOverlay,
 searchInput: searchInputColors,
 searchInputConfigBackground: searchInputConfigBackground,
 searchInputGlow: searchInputGlowColors,
 emptyState: emptyStateColors,
 sourceDocumentCard: sourceDocumentCardColors,
 lightCard: lightCardColors,
 errorCard: errorCardColors,
} as const;
