"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader } from "@/components/ui/loader";
import { LucideIcon } from "lucide-react";

export type LoadingIndicatorVariant ="inline"|"centered"|"fullscreen";
export type LoadingIndicatorSize ="sm"|"md"|"lg";

export interface LoadingIndicatorProps {
 /**
 * Main loading message text
 */
 message: string;
 /**
 * Optional subtitle text (shown below main message)
 */
 subtitle?: string;
 /**
 * Optional icon to display next to subtitle
 */
 subtitleIcon?: LucideIcon;
 /**
 * Optional logo element to display above the loader (for centered/fullscreen variants)
 */
 logo?: React.ReactNode;
 /**
 * Whether to show the loading spinner/circle
 * @default true
 */
 showLoader?: boolean;
 /**
 * Variant of the loading indicator
 * -"inline": Horizontal layout, fits inline with content
 * -"centered": Vertical layout, centered in container
 * -"fullscreen": Full screen overlay with glow effect
 * @default"inline"
 */
 variant?: LoadingIndicatorVariant;
 /**
 * Size of the loader
 * @default"sm"
 */
 size?: LoadingIndicatorSize;
 /**
 * Additional className for the container
 */
 className?: string;
 /**
 * Additional className for the container card
 */
 containerClassName?: string;
 /**
 * If true, makes the background transparent (removes card's default background)
 * Useful for inline usage where the background should blend with the parent
 * @default false
 */
 transparentBackground?: boolean;
}

/**
 * Loading Indicator
 *
 * Universal loading indicator component with multiple variants.
 * Uses Legal Glassmorphism 2.0 card styling for consistent appearance.
 *
 * @example
 * // Inline variant (default)
 * <LoadingIndicator
 * message="Thinking and generating a response for you"
 * variant="inline"
 * size="sm"
 * />
 *
 * @example
 * // Centered variant
 * <LoadingIndicator
 * message="Loading conversation..."
 * subtitle="Preparing your chat"
 * subtitleIcon={MessageSquare}
 * variant="centered"
 * size="lg"
 * />
 *
 * @example
 * // Fullscreen variant
 * <LoadingIndicator
 * message="Loading..."
 * variant="fullscreen"
 * size="lg"
 * />
 */
export function LoadingIndicator({
 message,
 subtitle,
 subtitleIcon: SubtitleIcon,
 logo,
 showLoader = true,
 variant ="inline",
 size ="sm",
 className,
 containerClassName,
 transparentBackground = false,
}: LoadingIndicatorProps): React.JSX.Element {
 const isInline = variant === "inline";
 const isCentered = variant === "centered";
 const isFullscreen = variant === "fullscreen";

 // Map size to loader size
 const loaderSize = size === "lg"? "lg": size === "md"? "md": "sm";

 // Container wrapper classes based on variant
 const wrapperClasses = cn(
"relative",
 isInline &&"w-fit mx-auto",
 isCentered &&"w-full flex items-center justify-center",
 isFullscreen &&"fixed inset-0 flex items-center justify-center z-50",
 className
 );

 // ChatContainer padding based on variant
 const containerPadding = cn(
 isInline &&"px-6 py-4",
 isCentered &&"p-8",
 isFullscreen &&"p-8"
 );

 // Layout direction based on variant
 const layoutDirection = cn(
"flex items-center gap-3",
 isInline &&"flex-row",
 (isCentered || isFullscreen) &&"flex-col gap-4"
 );

 return (
 <div className={wrapperClasses}>
 {/* Enhanced background glow effect for fullscreen variant */}
 {isFullscreen && (
 <>
 {/* Animated gradient glow layers - Blue only, no purple/indigo */}
 <div className="absolute inset-0 bg-gradient-to-r from-blue-400/25 via-blue-400/25 to-blue-400/25 rounded-full blur-3xl opacity-60 animate-pulse -z-10"/>
 <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/10 rounded-full blur-2xl opacity-40 animate-pulse -z-10"style={{ animationDelay: '1s' }} />
 {/* Enhanced backdrop layer with better blur */}
 <div className="absolute inset-0 bg-gradient-to-br from-background/90 via-background/70 to-background/90 backdrop-blur-md backdrop-saturate-150 -z-20"/>
 </>
 )}

 <div className={cn("relative", isFullscreen &&"z-10")}>
 <div className={cn(
"relative overflow-hidden",
 // Legal Glassmorphism 2.0 - Heavy Glass Card (Light Mode)
 // High Opacity: 90% White (rgba(255,255,255,0.9))
 // Heavy Blur: 32px
 // Rim Light: 1px Solid White Border (#FFFFFF) at 100% Opacity
 // Corner Radius: 24px
 // Colored Shadow: Blue-Grey (rgba(148, 163, 184, 0.15)), spread 30px, y: 8px
 // Legal Glass Night Mode - Dark Mode: Slate 800 with transparency, crisp white border, no shadows
 transparentBackground ? "": "bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] shadow-[0_8px_30px_rgba(148,163,184,0.15)]",
"rounded-[24px]",
 containerPadding,
 transparentBackground && [
"!bg-transparent",
"!border-0",
"!shadow-none",
"!backdrop-blur-none",
"!rounded-none",
"!overflow-visible",
 ],
 containerClassName
 )}>

 {/* Content wrapper with relative positioning */}
 <div className="relative z-10">
 <div className={layoutDirection}>
 {/* Logo - shown above loader for centered/fullscreen variants */}
 {logo && (isCentered || isFullscreen) && (
 <div className="flex items-center justify-center">
 {logo}
 </div>
 )}

 {/* Enhanced Loader with improved glassmorphism effects */}
 {showLoader && (
 <div className="relative flex items-center justify-center">
 {/* Enhanced outer glow ring with better glass effect - Blue only, no purple/indigo */}
 <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/40 via-primary/35 to-primary/35 blur-xl animate-pulse scale-125 backdrop-blur-sm"/>

 {/* Middle pulse ring with glass effect - Blue only, no purple/indigo */}
 <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/25 via-primary/25 to-primary/25 blur-md animate-ping scale-110 backdrop-blur-sm"/>

 {/* Glass effect container for loader - Removed indigo shadow, using blue/primary only */}
 <div className="relative backdrop-blur-md backdrop-saturate-150 bg-white/15 border border-white/20 rounded-full p-2 shadow-[0_4px_16px_0_rgba(37,99,235,0.2),inset_0_1px_0_0_rgba(255,255,255,0.3)]">
 {/* Main loader */}
 <div className="relative">
 <Loader className="text-primary drop-shadow-lg"size={loaderSize} />
 {/* Enhanced inner glow with glass effect */}
 <div className="absolute inset-0 bg-primary/15 rounded-full blur-md animate-pulse backdrop-blur-sm"/>
 </div>
 </div>

 {/* Enhanced rotating gradient ring for larger sizes with glass effect */}
 {(isCentered || isFullscreen) && (
 <div
 className="absolute inset-0 rounded-full opacity-40 animate-spin backdrop-blur-sm"
 style={{
 animationDuration: '3s',
 background: 'conic-gradient(from 0deg, transparent, hsl(var(--primary)), hsl(var(--primary)), transparent)',
 WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))',
 mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))'
 }}
 />
 )}
 </div>
 )}

 {/* Message and subtitle */}
 <div className={cn(
 isInline ? "": "space-y-2 text-center"
 )}>
 {isInline ? (
 <span className={cn(
"font-medium text-sm text-foreground animate-fade-in"
 )}>
 {message}
 </span>
 ) : (
 <p className={cn(
"font-medium text-base text-foreground animate-fade-in"
 )}>
 <span className="inline-block animate-[pulse_2s_ease-in-out_infinite]">
 {message}
 </span>
 </p>
 )}

 {/* Optional subtitle with icon - enhanced with glass effect */}
 {subtitle && (
 <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground animate-fade-in">
 {SubtitleIcon && (
 <div className="relative">
 <div className="absolute inset-0 rounded-full blur-sm bg-primary/20 animate-pulse"/>
 <SubtitleIcon className="relative h-3.5 w-3.5 animate-pulse drop-shadow-sm"/>
 </div>
 )}
 <span className="drop-shadow-sm">{subtitle}</span>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}
