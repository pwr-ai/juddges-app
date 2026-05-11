import { cn } from "@/lib/utils";

/**
 * Semantic width sizes for page layouts
 * Following 2024/2025 design token best practices
 */
export type PageWidth = 'narrow' | 'compact' | 'medium' | 'standard' | 'wide' | 'full' | 'xl' | 'screen';

export interface PageContainerProps {
  children: React.ReactNode;
  /**
   * Semantic width token
   * - narrow: 768px (chat, forms, focused content)
   * - compact: 960px (profiles, narrow content)
   * - medium: 1200px (search pages, medium content)
   * - standard: 1600px (default - most pages)
   * - wide: 1800px (data tables, statistics)
   * - full: 2000px (search results, wide layouts)
   * - xl: 1920px (document visualizations)
   * - screen: edge-to-edge, no max-width (document viewer, full-bleed layouts)
   */
  width?: PageWidth;
  /** If true, ensures the container fills at least the viewport height minus navbar. The container can grow beyond this to accommodate full page components. */
  fillViewport?: boolean;
  /** Additional CSS classes for custom styling */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

/**
 * PageContainer Component (2024/2025 Standards)
 *
 * A reusable container for page content with semantic width tokens and consistent spacing.
 * Provides responsive padding and optional viewport-height filling.
 *
 * @example
 * ```tsx
 * // Standard width (1600px)
 * <PageContainer>Content</PageContainer>
 *
 * // Wide layout (1800px)
 * <PageContainer width="wide">Data Tables</PageContainer>
 *
 * // Fill viewport height
 * <PageContainer fillViewport>Loading State</PageContainer>
 * ```
 */
export function PageContainer({
  children,
  width = 'standard',
  fillViewport = false,
  className,
  style
}: PageContainerProps): React.JSX.Element {
  // Map semantic width tokens to Tailwind classes
  const widthClasses: Record<PageWidth, string> = {
    narrow: 'max-w-page-narrow',       // 768px
    compact: 'max-w-page-compact',     // 960px
    medium: 'max-w-page-medium',       // 1200px
    standard: 'max-w-page',            // 1600px
    wide: 'max-w-page-wide',           // 1800px
    full: 'max-w-page-full',           // 2000px
    xl: 'max-w-page-xl',               // 1920px
    screen: 'max-w-none',              // Edge-to-edge, no cap
  };

  const isScreen = width === 'screen';

  return (
    <div
      className={cn(
        // Full width container with glass background
        "w-full glass-page-background",
        // Optional viewport filling - allows growth beyond viewport for full page components
        // Uses min-height to ensure at least viewport height, but allows natural growth beyond
        fillViewport && "min-h-[calc(100vh-4rem)]",
        // Custom classes
        className
      )}
      style={{
        // Ensure no max-height restriction to allow growth beyond viewport
        maxHeight: 'none',
        ...style,
      }}
    >
      <div
        className={cn(
          // Edge-to-edge mode skips the Tailwind `container` cap so layout fills the viewport.
          isScreen
            ? "w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8"
            : "container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8",
          widthClasses[width]
        )}
      >
        {children}
      </div>
    </div>
  );
}
