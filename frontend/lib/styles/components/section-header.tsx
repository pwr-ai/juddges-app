/**
 * Section Header Component
 * Reusable h3 header component with gradient text support
 * Used for section headers with optional description text
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
 /**
 * Main header text (with gradient)
 */
 title: string;
 /**
 * Optional description text after the title
 */
 description?: string;
 /**
 * Optional className for the container
 */
 className?: string;
 /**
 * Optional className for the h3 element
 */
 headerClassName?: string;
 /**
 * Whether to show the top border separator
 * @default true
 */
 showBorder?: boolean;
}

/**
 * Section Header Component
 * Reusable h3 header with gradient text and optional description
 *
 * @example
 * <SectionHeader
 * title="Start Your Conversation"
 * description="Start typing anywhere or click on a suggested question above to begin"
 * />
 *
 * @example
 * <SectionHeader
 * title="Section Title"
 * showBorder={false}
 * />
 */
export function SectionHeader({
 title,
 description,
 className,
 headerClassName,
 showBorder = true,
}: SectionHeaderProps): React.JSX.Element {
 return (
 <div className={cn(
"section-header", // Added for print styling
"flex items-center",
 showBorder &&"mt-6 pt-6 border-t border-slate-200/30",
 className
 )}>
 <h3 className={cn(
"text-sm md:text-base text-muted-foreground/80 leading-relaxed text-left",
 headerClassName
 )}>
 <span className="font-semibold text-foreground">
 {title}
 </span>
 {description && (
 <span> — {description}</span>
 )}
 </h3>
 </div>
 );
}
