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
 showBorder &&"pt-3 border-t border-slate-200/30",
 className
 )}
 style={style}
 >
 <div className="flex items-center gap-2.5">
 {Icon && (
 <div className="relative">
 <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-indigo-400/15 to-purple-400/15 rounded-full blur-md"/>
 <Icon className="relative h-4 w-4 text-primary/80"/>
 </div>
 )}
 <h2 className={cn(
"text-xl font-semibold leading-tight tracking-wide",
 // Black text in light theme
"text-black"
 )}>
 {title}
 </h2>
 </div>
 </div>
 );
}
