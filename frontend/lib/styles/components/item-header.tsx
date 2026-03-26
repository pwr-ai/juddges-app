/**
 * Item Header Component
 * Reusable h5/h6 header component for item/field headers (smaller than subsection headers)
 * Used for individual field labels within cards or sections
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface ItemHeaderProps {
 /**
 * Header text
 */
 title: string;
 /**
 * Optional className for the container
 */
 className?: string;
 /**
 * Optional className for the h5/h6 element
 */
 headerClassName?: string;
 /**
 * HTML element to use (defaults to h5)
 */
 as?: 'h5' | 'h6';
}

/**
 * Item Header Component
 * Small header component for individual items/fields (smaller than subsection headers)
 *
 * @example
 * <ItemHeader title="Field Name"/>
 *
 * @example
 * <ItemHeader
 * title="Custom Field"
 * className="mb-2"
 * as="h6"
 * />
 */
export function ItemHeader({
 title,
 className,
 headerClassName,
 as: Component = 'h5',
}: ItemHeaderProps): React.JSX.Element {
 return (
 <Component
 className={cn(
 'text-sm font-medium text-slate-700',
 className,
 headerClassName
 )}
 >
 {title}
 </Component>
 );
}
