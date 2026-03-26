/**
 * Styled Tooltip Components
 * Wraps base UI tooltip components with design system styling
 * Used for contextual help text and hover information
 */

"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

/**
 * Props for TooltipProvider component
 */
export interface TooltipProviderProps extends React.ComponentProps<typeof TooltipPrimitive.Provider> {
 /** Delay duration before showing tooltip (in milliseconds) */
 delayDuration?: number;
}

/**
 * Styled Tooltip Provider Component
 *
 * Provides tooltip context to child components. Should wrap the root of your tooltip usage.
 *
 * @example
 * ```tsx
 * <TooltipProvider delayDuration={300}>
 * <Tooltip>
 * <TooltipTrigger asChild>
 * <Button>Hover me</Button>
 * </TooltipTrigger>
 * <TooltipContent>Helpful information</TooltipContent>
 * </Tooltip>
 * </TooltipProvider>
 * ```
 */
export function TooltipProvider({
 delayDuration = 0,
 ...props
}: TooltipProviderProps): React.JSX.Element {
 return (
 <TooltipPrimitive.Provider
 data-slot="tooltip-provider"
 delayDuration={delayDuration}
 {...props}
 />
 )
}

/**
 * Props for Tooltip component
 */
export type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root>;

/**
 * Styled Tooltip Root Component
 *
 * Root component for tooltip functionality. Automatically wraps content with TooltipProvider.
 *
 * @example
 * ```tsx
 * <Tooltip>
 * <TooltipTrigger asChild>
 * <IconButton icon={Info} />
 * </TooltipTrigger>
 * <TooltipContent>Additional information</TooltipContent>
 * </Tooltip>
 * ```
 */
export function Tooltip({
 ...props
}: TooltipProps): React.JSX.Element {
 return (
 <TooltipProvider>
 <TooltipPrimitive.Root data-slot="tooltip"{...props} />
 </TooltipProvider>
 )
}

/**
 * Props for TooltipTrigger component
 */
export type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger>;

/**
 * Styled Tooltip Trigger Component
 *
 * Element that triggers the tooltip on hover or focus. Typically wraps a button or interactive element.
 *
 * @example
 * ```tsx
 * <TooltipTrigger asChild>
 * <Button>Hover for help</Button>
 * </TooltipTrigger>
 * ```
 */
export function TooltipTrigger({
 ...props
}: TooltipTriggerProps): React.JSX.Element {
 return <TooltipPrimitive.Trigger data-slot="tooltip-trigger"{...props} />
}

/**
 * Props for TooltipContent component
 */
export interface TooltipContentProps extends React.ComponentProps<typeof TooltipPrimitive.Content> {
 /** Optional className for additional styling */
 className?: string;
 /** Offset from the trigger element (in pixels) */
 sideOffset?: number;
}

/**
 * Styled Tooltip Content Component
 *
 * The actual tooltip content that appears on hover. Features enhanced gradient styling,
 * smooth animations, and subtle shimmer effects following the design system patterns.
 *
 * Uses semantic opacity scales:
 * - Borders: /50 for default, /40 for dark mode
 * - Shadows: /30 for light, /20 for dark
 * - Glow effects: /20 opacity
 *
 * @example
 * ```tsx
 * <TooltipContent side="right"className="max-w-xs">
 * <p>This is helpful information about the element</p>
 * </TooltipContent>
 * ```
 *
 * @example
 * ```tsx
 * <TooltipContent sideOffset={8}>
 * Overview and quick actions
 * </TooltipContent>
 * ```
 */
export function TooltipContent({
 className,
 sideOffset = 0,
 children,
 onPointerDown,
 onClick,
 ...props
}: TooltipContentProps): React.JSX.Element {
 // Prevent click events from propagating to underlying elements
 const handlePointerDown = (e: React.PointerEvent<Element>): void => {
 e.stopPropagation();
 onPointerDown?.(e as React.PointerEvent<HTMLDivElement>);
 };

 const handleClick = (e: React.MouseEvent<Element>): void => {
 e.stopPropagation();
 onClick?.(e as React.MouseEvent<HTMLDivElement>);
 };

 return (
 <TooltipPrimitive.Portal>
 <TooltipPrimitive.Content
 data-slot="tooltip-content"
 sideOffset={sideOffset}
 className={cn(
"relative overflow-hidden",
 // Legal Glass 2.0: Match Sidebar Glass Material
 // Light mode: Crystal - rgba(255, 255, 255, 0.65) with 50px blur
 // Dark mode: Stealth - rgba(2, 6, 23, 0.80) with 40px blur
"bg-[rgba(255,255,255,0.65)]",
"backdrop-blur-[50px]",
 // Border - 1px Solid Line matching sidebar
 // Light mode: #FFFFFF (Solid White)
 // Dark mode: rgba(255, 255, 255, 0.08)
"border border-[#FFFFFF]",
 // Text styling - using Midnight Navy for contrast
"text-[#0F172A] font-medium text-xs text-balance",
 // Shadow - soft, colored shadow matching design system
"shadow-lg shadow-blue-200/30",
 // Rounded corners
"rounded-xl px-4 py-3",
 // Smooth animations
"animate-in fade-in-0 zoom-in-95 duration-200",
"data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150",
 // Slide animations based on side
"data-[side=bottom]:slide-in-from-top-2",
"data-[side=left]:slide-in-from-right-2",
"data-[side=right]:slide-in-from-left-2",
"data-[side=top]:slide-in-from-bottom-2",
 // Z-index and sizing
"z-50 w-fit",
"origin-(--radix-tooltip-content-transform-origin)",
 className
 )}
 onPointerDown={handlePointerDown}
 onClick={handleClick}
 {...props}
 >
 {/* Content */}
 <span>{children}</span>

 {/* Arrow matching glass material */}
 <TooltipPrimitive.Arrow
 className={cn(
"z-50 size-3",
 // Match the glass background color
"fill-[rgba(255,255,255,0.65)]",
 // Border to match tooltip border
"stroke-[#FFFFFF]",
"stroke-[1]",
"translate-y-[calc(-50%_-_2px)]"
 )}
 />
 </TooltipPrimitive.Content>
 </TooltipPrimitive.Portal>
 )
}
