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
 aria-expanded={isExpanded}
 className={cn(
 "group relative",
 // Editorial control: sharp edges, hairline rule, mono label (DESIGN.md 5a)
 "h-9 px-4 rounded-none",
 "inline-flex items-center justify-center gap-2 whitespace-nowrap",
 "cursor-pointer",
 "font-mono text-xs uppercase tracking-wider",
 // Idle
 "bg-parchment text-ink-soft border border-rule",
 // Hover
 "hover:bg-parchment-deep hover:text-ink",
 // Open: inverted, so the state reads without a colour change
 isExpanded && "bg-parchment-deep text-ink border-ink",
 // Focus
 "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
 "transition-colors duration-150",
 disabled && "opacity-50 cursor-not-allowed",
 className
 )}
 >
 {/* Content */}
 <span className="relative z-10 flex items-center gap-2 w-full min-w-0 overflow-hidden">
 {/* Leading icon - optional */}
 {LeadingIcon && (
 <LeadingIcon className="h-4 w-4 shrink-0" />
 )}

 {/* Button content */}
 <span className="min-w-0 flex-1 overflow-hidden flex items-center justify-between gap-2">{children}</span>

 {/* Trailing icon - conditional rendering */}
 {isLoading ? (
 <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-rule border-t-ink" />
 ) : isExpanded ? (
 <ChevronUp className="h-4 w-4 shrink-0" />
 ) : (
 <ChevronDown className="h-4 w-4 shrink-0" />
 )}
 </span>
 </Button>
 );
}
