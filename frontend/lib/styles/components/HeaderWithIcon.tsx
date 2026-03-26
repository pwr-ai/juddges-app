/**
 * Header Component
 * Unified header component that supports optional icons and descriptions
 * Replaces both getHeaderGradientStyle utility and separate HeaderWithIcon component
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { getHeaderGradientStyle, HeaderSize } from './headers';
import { getHeaderDescriptionStyle } from './descriptions';
import { cn } from '@/lib/utils';

interface HeaderProps {
 title: string;
 icon?: LucideIcon;
 size?: HeaderSize;
 description?: string | React.ReactNode;
 className?: string;
 children?: React.ReactNode;
 as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
 center?: boolean;
 /** Optional action button to display next to the title */
 action?: React.ReactNode;
}

/**
 * Unified header component with optional icon
 * Defaults to h1 for main page headers (SEO and accessibility)
 * Can be used with or without icon - reduces code bloat
 *
 * @example
 * // With icon (defaults to h1)
 * <Header icon={Search} title="Legal Judgment Search"/>
 *
 * @example
 * // Without icon (defaults to h1)
 * <Header title="Settings"/>
 *
 * @example
 * // Override to h2 for section headers
 * <Header title="Section Title"as="h2"/>
 */
export function Header({
 title,
 icon: Icon,
 size = '4xl',
 description,
 className,
 children,
 as: Component = 'h1', // Default to h1 for main page headers
 center = false,
 action,
}: HeaderProps): React.JSX.Element {
 const headerElement = (
 <div className="flex items-center gap-2 overflow-visible pb-1">
 <Component className={getHeaderGradientStyle(size)}>{title}</Component>
 {action && (
 <div className="shrink-0">
 {action}
 </div>
 )}
 </div>
 );

 if (!Icon && !description && !children) {
 // Simple case: just return the styled header
 return <div className={cn(className, center &&"text-center")}>{headerElement}</div>;
 }

 // Complex case: with icon, description, or children
 // Use center alignment when there's a description or children for better visual balance
 // Use start alignment when it's just icon + title for cleaner top alignment
 const hasAdditionalContent = !!description || !!children;
 const iconAlignment = hasAdditionalContent ? "items-center": "items-start";

 return (
 <div className={cn("mb-6", className)}>
 <div className={cn(
"flex gap-3",
 iconAlignment,
 center &&"justify-center"
 )}>
 {Icon && (
 <div className={cn(
"relative flex-shrink-0",
 !hasAdditionalContent &&"mt-1"// Only add top margin when no description/children
 )}>
 <div className="absolute inset-0 bg-gradient-to-br from-blue-400/15 via-indigo-400/15 to-purple-400/15 rounded-full blur-lg"/>
 <div className="relative bg-gradient-to-br from-blue-400/50 via-indigo-400/30 to-purple-400/50 rounded-full p-2.5">
 <Icon className="h-5 w-5 text-primary"/>
 </div>
 </div>
 )}
 <div className={cn(
 center ? "text-center": "flex-1",
"flex flex-col gap-0",
"overflow-visible"// Prevent clipping of header text
 )}>
 <div className="overflow-visible pb-1">
 {headerElement}
 </div>
 {description && (
 <div className={cn(getHeaderDescriptionStyle())}>
 {description}
 </div>
 )}
 {children}
 </div>
 </div>
 </div>
 );
}
