/**
 * Error Card Component
 * Reusable error display component with Legal Glassmorphism 2.0 styling
 * Uses error-themed gradients (red/rose) to clearly indicate error state
 */

import React, { memo } from 'react';
import { GlassButton } from './glass-button';
import { SecondaryButton } from './secondary-button';
import { IconButton } from './icon-button';
import { RefreshCw, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ErrorCardProps {
 /**
 * Error title/heading
 */
 title?: string;
 /**
 * Error message or description
 */
 message: string;
 /**
 * Optional retry action handler
 */
 onRetry?: () => void;
 /**
 * Retry button label
 * @default"Retry"
 */
 retryLabel?: string;
 /**
 * Whether to show the retry button
 * @default true
 */
 showRetry?: boolean;
 /**
 * Optional dismiss action handler
 */
 onDismiss?: () => void;
 /**
 * Dismiss button label
 * @default"Dismiss"
 */
 dismissLabel?: string;
 /**
 * Whether to show dismiss button in header
 * @default false
 */
 showDismissIcon?: boolean;
 /**
 * Optional secondary action button
 */
 secondaryAction?: {
 label: string;
 onClick: () => void;
 icon?: React.ComponentType<{ className?: string }>;
 };
 /**
 * Optional className for the card
 */
 className?: string;
 /**
 * Optional children to render additional content
 */
 children?: React.ReactNode;
 /**
 * Color variant for the error card gradient
 * @default"red-rose"
 */
 variant?: 'red-rose' | 'red-blue';
}

/**
 * Error Card Component
 *
 * A reusable error display component with Legal Glassmorphism 2.0 styling.
 * Supports red-rose (default) or red-blue gradient variants.
 *
 * @example
 * <ErrorCard
 * title="Error Loading Data"
 * message="Failed to fetch data from the server"
 * onRetry={() => refetch()}
 * variant="red-rose"
 * />
 *
 * @example
 * <ErrorCard
 * message="Something went wrong"
 * showRetry={false}
 * variant="red-blue"
 * />
 */
export const ErrorCard = memo(function ErrorCard({
 title = 'Error',
 message,
 onRetry,
 retryLabel = 'Retry',
 showRetry = true,
 onDismiss,
 dismissLabel = 'Dismiss',
 showDismissIcon = false,
 secondaryAction,
 className,
 children,
 variant = 'red-rose',
}: ErrorCardProps) {
 const isRedBlue = variant === 'red-blue';

 return (
 <div
 className={cn(
"group relative overflow-hidden",
 // Legal Glassmorphism 2.0 - Heavy Glass Card (Light Mode)
"bg-[rgba(255,255,255,0.9)]",
"backdrop-blur-[32px] backdrop-saturate-[200%]",
 // Rim Light: 1px Solid White Border (#FFFFFF) at 100% Opacity
"border-[1px] border-solid border-[#FFFFFF]",
 // Corner Radius: 24px (standardized)
"rounded-[24px]",
 // Colored Shadow: Blue-Grey (rgba(148, 163, 184, 0.15)) with subtle red tint for error theme
"shadow-[0_8px_30px_rgba(148,163,184,0.15),0_4px_16px_rgba(239,68,68,0.08)]",
 // Legal Glass Night Mode - Dark Mode Card
"", /* Slate 800 with transparency */
"", /* 10% White - Crisp edge */
"", /* Remove shadows - they look cheap */
 // Legal Glassmorphism 2.0 - Hover effects
"hover:border-white group-hover:border-white",
"hover:bg-[rgba(255,255,255,0.98)] group-hover:bg-[rgba(255,255,255,0.98)]",
"hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),0_6px_20px_rgba(239,68,68,0.12),inset_0_1px_0_rgba(255,255,255,1)] group-hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),0_6px_20px_rgba(239,68,68,0.12),inset_0_1px_0_rgba(255,255,255,1)]",
"transition-[transform,shadow,border-color,background-color] duration-300 ease-out",
"active:scale-[0.99]",
 className
 )}
 >
 {/* Subtle error-themed gradient overlay - extremely subtle per Legal Glassmorphism 2.0 */}
 <div className={cn(
"absolute inset-0 pointer-events-none rounded-[24px]",
"bg-gradient-to-br",
 isRedBlue
 ? "from-red-400/3 via-rose-400/2 via-blue-400/1 to-blue-400/1"
 : "from-red-400/3 via-rose-400/2 to-rose-400/1"
 )} />

 {/* Secondary subtle gradient overlay for depth */}
 <div className={cn(
"absolute inset-0 pointer-events-none rounded-[24px]",
"bg-gradient-to-tl",
 isRedBlue
 ? "from-red-400/1 via-transparent to-blue-400/1"
 : "from-red-400/1 via-transparent to-rose-400/1"
 )} />

 {/* Content layer - positioned above glass effects */}
 <div className="relative z-10 p-6">
 <div className="flex items-start gap-4 mb-4">
 {/* Error icon with Legal Glassmorphism 2.0 styling */}
 <div className="relative flex-shrink-0">
 {/* Icon glow effect - subtle per Legal Glassmorphism 2.0 */}
 <div className={cn(
"absolute inset-0 rounded-lg blur-sm opacity-40",
 isRedBlue
 ? "bg-gradient-to-br from-red-500/15 via-rose-500/10 to-blue-500/10"
 : "bg-gradient-to-br from-red-500/15 via-rose-500/10 to-rose-500/8"
 )} />
 <div className="relative rounded-lg p-2 overflow-hidden">
 {/* Legal Glassmorphism 2.0 - Subtle glass effect for icon container */}
 <div className="absolute inset-0 bg-[rgba(255,255,255,0.5)] backdrop-blur-sm backdrop-saturate-[150%] border border-white/60 rounded-lg"/>
 {/* Subtle error-themed gradient overlay */}
 <div className={cn(
"absolute inset-0 rounded-lg",
 isRedBlue
 ? "bg-gradient-to-br from-red-500/8 via-rose-500/5 to-blue-500/5"
 : "bg-gradient-to-br from-red-500/8 via-rose-500/5 to-rose-500/3"
 )} />
 <AlertCircle className="relative h-5 w-5 text-red-600"/>
 </div>
 </div>

 <div className="flex-1 space-y-2">
 {title && (
 <h3 className="font-semibold text-base text-[#0F172A]">
 {title}
 </h3>
 )}
 <p className="text-sm leading-relaxed text-muted-foreground">
 {message}
 </p>
 </div>

 {showDismissIcon && onDismiss && (
 <IconButton
 icon={X}
 onClick={onDismiss}
 variant="error"
 aria-label="Dismiss error"
 />
 )}
 </div>

 {children && (
 <div className="mt-4">
 {children}
 </div>
 )}

 {(showRetry && onRetry) || secondaryAction || (onDismiss && !showDismissIcon) ? (
 <div className="flex items-center gap-3 justify-center mt-6">
 {showRetry && onRetry && (
 <GlassButton
 onClick={onRetry}
 className="w-auto"
 variant="white"
 >
 <RefreshCw className="h-4 w-4"/>
 {retryLabel}
 </GlassButton>
 )}
 {secondaryAction && (
 <SecondaryButton
 onClick={secondaryAction.onClick}
 icon={secondaryAction.icon}
 className="text-slate-700 hover:text-slate-900"
 >
 {secondaryAction.label}
 </SecondaryButton>
 )}
 {onDismiss && !showDismissIcon && (
 <SecondaryButton
 onClick={onDismiss}
 >
 {dismissLabel}
 </SecondaryButton>
 )}
 </div>
 ) : null}
 </div>
 </div>
 );
});
