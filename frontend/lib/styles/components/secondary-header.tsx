/**
 * Secondary Header Component
 * Reusable 2nd-level header component with icon and title
 * Used for section headers like"Suggested Questions","Suggested Queries", etc.
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SecondaryHeaderProps {
 /**
 * Icon to display next to the title (optional)
 */
 icon?: LucideIcon;
 /**
 * Header title text
 */
 title: string;
 /**
 * Optional className for the container
 */
 className?: string;
 /**
 * Optional inline style for the container
 */
 style?: React.CSSProperties;
 /**
 * Whether to show the top border separator
 * @default true
 */
 showBorder?: boolean;
}

/**
 * Secondary Header Component
 * 2nd-level header with icon and title, typically used for section headers
 *
 * @example
 * <SecondaryHeader
 * icon={Lightbulb}
 * title="Suggested Questions"
 * />
 *
 * @example
 * <SecondaryHeader
 * icon={Search}
 * title="Suggested Queries"
 * showBorder={false}
 * />
 */
export function SecondaryHeader({
 icon: Icon,
 title,
 className,
 style,
 showBorder = true,
}: SecondaryHeaderProps): React.JSX.Element {
 return (
 <div
 className={cn(
 showBorder &&"pt-3 border-t border-rule",
 className
 )}
 style={style}
 >
 <div className="flex items-center gap-2.5">
 {Icon && (
 <div className="shrink-0 flex items-center justify-center">
 <Icon className="h-4 w-4 text-oxblood"/>
 </div>
 )}
 <h2 className="text-xl font-serif font-medium leading-tight text-ink">
 {title}
 </h2>
 </div>
 </div>
 );
}
