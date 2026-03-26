/**
 * Chat Header Component
 * Header component specifically for chat page prompts
 * Conversational, left-aligned styling following WCAG accessibility standards
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface ChatHeaderProps {
 /**
 * Main header text
 */
 title: string;
 /**
 * Optional className for the container
 */
 className?: string;
 /**
 * Optional className for the h2 element
 */
 headerClassName?: string;
}

/**
 * Chat Header Component
 * Conversational header for chat interfaces with WCAG-compliant styling
 *
 * Features:
 * - Left-aligned for natural reading flow
 * - Uses muted foreground color for softer, conversational tone
 * - WCAG AA compliant contrast ratios
 * - Follows application styling patterns
 *
 * @example
 * <ChatHeader title="What legal question can I help you with today? "/>
 *
 * @example
 * <ChatHeader
 * title="How can I assist you? "
 * className="mb-4"
 * />
 */
export function ChatHeader({
 title,
 className,
 headerClassName,
}: ChatHeaderProps): React.JSX.Element {
 return (
 <div className={cn("w-full", className)}>
 <h2 className={cn(
 // Size and spacing
"text-xl md:text-2xl font-semibold leading-relaxed",
 // Color - black in light theme for better readability
"text-black",
 // Alignment - left-aligned for natural reading flow
"text-left",
 headerClassName
 )}>
 {title}
 </h2>
 </div>
 );
}
