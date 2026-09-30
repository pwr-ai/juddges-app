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
 * <VariantButton intent="icon" icon={Info} />
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
"bg-parchment text-ink font-mono text-xs",
"border border-rule shadow-sm",
"rounded-none px-2.5 py-1.5",
"animate-in fade-in-0 duration-150",
"data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
"data-[side=bottom]:slide-in-from-top-1",
"data-[side=left]:slide-in-from-right-1",
"data-[side=right]:slide-in-from-left-1",
"data-[side=top]:slide-in-from-bottom-1",
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

 {/* Arrow */}
 <TooltipPrimitive.Arrow
 className={cn(
"z-50 size-2.5",
"fill-parchment stroke-rule stroke-[1]",
"translate-y-[calc(-50%_-_1px)]"
 )}
 />
 </TooltipPrimitive.Content>
 </TooltipPrimitive.Portal>
 )
}
