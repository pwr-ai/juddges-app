/**
 * Empty State Component
 * Reusable component for displaying empty states (no results, no data, etc.)
 * Used for search results, lists, and other empty states
 */

"use client";

import React from 'react';
import { SearchX, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SecondaryButton } from './secondary-button';
import type { SecondaryButtonProps } from './secondary-button';
import { PrimaryButton } from './primary-button';
import type { PrimaryButtonProps } from './primary-button';

/**
 * Props for EmptyState component
 */
export interface EmptyStateProps {
 /** Icon to display (defaults to SearchX) */
 icon?: LucideIcon;
 /** Title text */
 title: string;
 /** Description text */
 description?: string;
 /** Optional query/search term to display in a badge */
 query?: string;
 /** Optional tip/info card content */
 tip?: React.ReactNode;
 /** Position of the tip content - 'above' or 'below' the main content (default: 'above') */
 tipPosition?: 'above' | 'below';
 /** Primary action button */
 primaryAction?: {
 label: string;
 onClick: () => void;
 icon?: LucideIcon;
 } & Omit<PrimaryButtonProps, 'children' | 'onClick' | 'icon'>;
 /** Secondary action button */
 secondaryAction?: {
 label: string;
 onClick: () => void;
 icon?: LucideIcon;
 } & Omit<SecondaryButtonProps, 'children' | 'onClick' | 'icon'>;
 /** Additional action buttons */
 actions?: React.ReactNode;
 /** Optional className for the container */
 className?: string;
 /** Variant type */
 variant?: 'search' | 'default';
}

/**
 * Empty State Component
 *
 * A reusable component for displaying empty states with icon, title, description,
 * optional query badge, tip card, and action buttons.
 *
 * @example
 * ```tsx
 * <EmptyState
 * title="No results found"
 * description="We couldn't find any documents matching your search query"
 * query="Swiss franc loans"
 * />
 * ```
 *
 * @example
 * ```tsx
 * <EmptyState
 * title="No results found"
 * description="Try adjusting your search"
 * primaryAction={{
 * label: "Switch to Thinking Mode",
 * onClick: () => handleSwitch(),
 * icon: Brain
 * }}
 * secondaryAction={{
 * label: "Back",
 * onClick: () => handleBack(),
 * icon: ArrowLeft
 * }}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <EmptyState
 * title="No Collections Yet"
 * description="Create your first collection"
 * tipPosition="below"
 * tip={<div>Helpful tips displayed below the main content</div>}
 * />
 * ```
 */
export function EmptyState({
 icon: Icon = SearchX,
 title,
 description,
 query,
 tip,
 tipPosition = 'above',
 primaryAction,
 secondaryAction,
 actions,
 className,
 variant = 'default',
}: EmptyStateProps): React.JSX.Element {
 const renderTip = (): React.JSX.Element | null => {
 if (!tip) return null;

 return (
 <div className={cn(
"w-full text-center",
 tipPosition === 'above' ? "mb-5": "mt-6"
 )}>
 {typeof tip === 'string' ? (
 <div className="inline-flex items-start gap-2 px-4 py-3 rounded-xl bg-gradient-to-br from-blue-400/50 via-indigo-400/50 to-purple-400/50 backdrop-blur-sm border border-blue-200/50 shadow-sm">
 <p className="text-sm text-muted-foreground/80 leading-relaxed text-left">
 {tip}
 </p>
 </div>
 ) : (
 tip
 )}
 </div>
 );
 };

 return (
 <div
 className={cn(
"flex flex-col items-center justify-center",
"pt-2 pb-8 px-6",
 className
 )}
 >
 <div className="flex flex-col items-center justify-center w-full">
 {/* Tip card - above content */}
 {tipPosition === 'above' && renderTip()}

 {/* Icon with glow effect */}
 <div className="relative mb-5">
 <div className={cn(
"absolute inset-0 rounded-full blur-2xl animate-pulse",
 variant === 'search'
 ? "bg-gradient-to-br from-primary/30 via-indigo-400/30 to-purple-400/30"
 : "bg-gradient-to-br from-primary/20 via-indigo-400/20 to-purple-400/20"
 )} />
 <div className={cn(
"relative rounded-full p-4 border-2 shadow-lg",
 variant === 'search'
 ? "bg-gradient-to-br from-primary/15 via-indigo-400/15 to-purple-400/15 border-primary/30 shadow-primary/20"
 : "bg-gradient-to-br from-primary/10 via-indigo-400/10 to-purple-400/10 border-primary/20 shadow-primary/10"
 )}>
 <Icon className={cn(
 variant === 'search' ? "h-7 w-7": "h-6 w-6",
"text-primary"
 )} />
 </div>
 </div>

 {/* Title */}
 <h3 className={cn(
 variant === 'search' ? "text-xl": "text-lg",
"font-bold mb-3 bg-gradient-to-br from-foreground via-primary to-purple-500 bg-clip-text text-transparent"
 )}>
 {title}
 </h3>

 {/* Description and query badge */}
 {(description || query) && (
 <div className="max-w-lg text-center mb-4">
 {description && (
 <p className="text-sm text-muted-foreground/80 leading-relaxed mb-3">
 {description}
 </p>
 )}
 {query && (
 <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-slate-100/80 via-blue-400/50 to-indigo-400/50 backdrop-blur-sm border border-slate-200/50 shadow-sm">
 <span className="text-sm font-semibold text-foreground/80">&quot;{query}&quot;</span>
 </div>
 )}
 </div>
 )}

 {/* Action buttons */}
 {(primaryAction || secondaryAction || actions) && (
 <div className="flex flex-col sm:flex-row gap-3">
 {secondaryAction && (
 <SecondaryButton
 onClick={secondaryAction.onClick}
 icon={secondaryAction.icon}
 size={secondaryAction.size || "md"}
 disabled={secondaryAction.disabled}
 className={secondaryAction.className}
 >
 {secondaryAction.label}
 </SecondaryButton>
 )}
 {primaryAction && (
 <PrimaryButton
 onClick={primaryAction.onClick}
 icon={primaryAction.icon}
 size={primaryAction.size || "md"}
 disabled={primaryAction.disabled}
 className={primaryAction.className}
 >
 {primaryAction.label}
 </PrimaryButton>
 )}
 {actions}
 </div>
 )}

 {/* Tip card - below content */}
 {tipPosition === 'below' && renderTip()}
 </div>
 </div>
 );
}
