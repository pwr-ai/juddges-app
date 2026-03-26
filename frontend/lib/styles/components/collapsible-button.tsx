/**
 * Collapsible Button Component
 * Reusable button component with expand/collapse functionality
 * Used for buttons that can expand/collapse content (e.g., sources, details, etc.)
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Props for CollapsibleButton component
 */
export interface CollapsibleButtonProps {
 /** Button content/text */
 children: React.ReactNode;
 /** Whether the content is expanded */
 isExpanded: boolean;
 /** Click handler */
 onClick: () => void;
 /** Optional loading state */
 isLoading?: boolean;
 /** Optional leading icon */
 leadingIcon?: React.ComponentType<{ className?: string }>;
 /** Optional className for additional styling */
 className?: string;
 /** Optional disabled state */
 disabled?: boolean;
 /** Button type */
 type?: "button"|"submit"|"reset";
}

/**
 * Expandable Button Component
 *
 * A reusable button component with expand/collapse functionality.
 * Shows leading icon (optional), content, and a trailing chevron or loading spinner.
 *
 * @example
 * ```tsx
 * <CollapsibleButton
 * isExpanded={false}
 * onClick={() => toggleExpanded()}
 * leadingIcon={BookOpen}
 * >
 * 5 sources cited
 * </CollapsibleButton>
 * ```
 *
 * @example
 * ```tsx
 * <CollapsibleButton
 * isExpanded={true}
 * isLoading={true}
 * onClick={() => handleClick()}
 * >
 * Show Details
 * </CollapsibleButton>
 * ```
 */
export function CollapsibleButton({
 children,
 isExpanded,
 onClick,
 isLoading = false,
 leadingIcon: LeadingIcon,
 className,
 disabled = false,
 type ="button",
}: CollapsibleButtonProps): React.JSX.Element {
 return (
 <Button
 type={type}
 onClick={onClick}
 disabled={disabled}
 className={cn(
"group relative overflow-hidden",
 // SPECIFICATION A: THE DROPDOWN TRIGGER (The Photonic Switch)
 // Architecture: Full Pill, 36px height, 16px padding, centered flexbox, 8px gap
"rounded-[9999px] h-9 px-4",
"inline-flex items-center justify-center gap-2 whitespace-nowrap",
"cursor-pointer",
 // IDLE STATE (The Glass Capsule): Milky glass background, white border, slate text, micro shadow
"bg-[rgba(255,255,255,0.60)]",
"border border-white",
"text-[#475569]", // Slate 600 | Light Grey
"shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
 // HOVER STATE (The Lift): Solid white, darker text, physical lift
"hover:bg-white",
"hover:text-[#0F172A]", // Midnight Navy | Pure White
"hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
"hover:-translate-y-[1px]",
 // ACTIVE/OPEN STATE (The Laser Focus): Clinical white, royal blue border, blue photonic shadow
 isExpanded &&"bg-white",
 isExpanded &&"border-[#2563EB]", // Royal Blue
 isExpanded &&"text-[#1E40AF]", // Deep Royal Blue | Light Blue
 isExpanded &&"shadow-[0_0_0_3px_rgba(37,99,235,0.15)]", // Blue Photonic Shadow
 // Active state for tactile feedback
"active:scale-[0.98] active:opacity-90",
 // Focus state (required)
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 // Transitions
"transition-[transform,shadow,border-color,background-color,color] duration-300 ease-out",
 // Disabled state
 disabled &&"opacity-50 cursor-not-allowed",
 className
 )}
 >
 {/* Content */}
 <span className="relative z-10 flex items-center gap-2 w-full min-w-0 overflow-hidden">
 {/* Leading icon - optional */}
 {LeadingIcon && (
 <LeadingIcon className={cn(
"h-4 w-4 shrink-0 transition-transform duration-200",
 // Icon color matches text color
"text-[#475569]",
"group-hover:text-[#0F172A]",
 isExpanded &&"text-[#1E40AF] rotate-180"
 )} />
 )}

 {/* Button content */}
 <span className="min-w-0 flex-1 overflow-hidden flex items-center justify-between gap-2">{children}</span>

 {/* Trailing icon - conditional rendering */}
 {isLoading ? (
 <div className="h-3.5 w-3.5 border-2 border-[#475569]/30 border-t-[#475569] rounded-full animate-spin shrink-0"/>
 ) : isExpanded ? (
 <ChevronUp className={cn(
"h-4 w-4 transition-transform duration-200 shrink-0",
"text-[#475569]",
"group-hover:text-[#0F172A]",
 isExpanded &&"text-[#1E40AF]"
 )} />
 ) : (
 <ChevronDown className={cn(
"h-4 w-4 transition-transform duration-200 shrink-0",
"text-[#475569]",
"group-hover:text-[#0F172A]"
 )} />
 )}
 </span>
 </Button>
 );
}
