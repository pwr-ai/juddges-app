/**
 * Base Card Component
 * General-purpose card component for displaying content, examples, or clickable items
 * Supports icon, description, and click handler
 */

import React, { memo } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardBackgroundGradients, baseCardLightOverlay } from '@/lib/styles/colors/surfaces';

export interface BaseCardProps {
 /**
 * Description or content text
 */
 description?: string;
 /**
 * Optional title to display above the description
 */
 title?: string | React.ReactNode;
 /**
 * Optional icon to display in the card
 */
 icon?: LucideIcon;
 /**
 * Click handler function
 */
 onClick?: () => void;
 /**
 * Optional className for the card
 */
 className?: string;
 /**
 * Optional inline styles for the card
 */
 style?: React.CSSProperties;
 /**
 * Whether the card is clickable
 * @default true
 */
 clickable?: boolean;
 /**
 * Optional children to render instead of description
 */
 children?: React.ReactNode;
 /**
 * Whether to show skeleton loading state
 * @default false
 */
 skeleton?: boolean;
 /**
 * Visual variant of the card
 * @default"default"
 */
 variant?: 'default' | 'light';
 /**
 * Whether to use vibrant gradient for light variant (for highlighted cards)
 * @default false
 */
 highlighted?: boolean;
}

/**
 * Base Card Component
 * General-purpose card for displaying content, examples, or clickable items
 *
 * @example
 * <BaseCard
 * description="What are the key requirements for IP Box in Poland? "
 * onClick={() => handleClick()}
 * />
 *
 * @example
 * <BaseCard
 * description="Feature description"
 * icon={Lightbulb}
 * clickable={false}
 * />
 */
export const BaseCard = memo(function BaseCard({
 description,
 title,
 icon: Icon,
 onClick,
 className,
 style,
 clickable,
 children,
 skeleton = false,
 variant = 'default',
 highlighted = false,
}: BaseCardProps) {
 // Extract rounded class from className to match card and gradient overlay
 // Legal Glassmorphism 2.0: Standard corner radius is 24px
 const roundedClass = className?.match(/rounded-[\w-]+/)?.[0] || "rounded-[24px]";

 // Remove rounded class and any background classes from className to avoid duplication
 const cardClassName = className?.replace(/rounded-[\w-]+/g, '').replace(/bg-\S+/g, '').trim() || '';

 // Determine if card is clickable: explicitly set, or default to true if onClick is provided
 const isClickable = clickable !== undefined ? clickable : !!onClick;

 const isLightVariant = variant === 'light';
 const useVibrantGradient = isLightVariant && highlighted;

 return (
 <div
 className={cn(
"group relative overflow-hidden",
 // Legal Glassmorphism 2.0 - Heavy Glass Card (Light Mode)
 // High Opacity: 90% White (rgba(255,255,255,0.9))
 // Heavy Blur: 24px to 40px
 // Rim Light: 1px Solid White Border (#FFFFFF) at 100% Opacity, Inside stroke
 // Corner Radius: 24px
 // Colored Shadow: Blue-Grey (rgba(148, 163, 184, 0.15)), spread 30px, y: 8px
 isLightVariant && !useVibrantGradient ? "bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] shadow-[0_8px_30px_rgba(148,163,184,0.15)]": "",
 isLightVariant && useVibrantGradient ? "bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] shadow-[0_8px_30px_rgba(148,163,184,0.15),0_0_25px_rgba(59,130,246,0.15)]": "",
 !isLightVariant && highlighted ? "bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] shadow-[0_8px_30px_rgba(148,163,184,0.15),0_0_20px_rgba(59,130,246,0.12)]": "",
 !isLightVariant && !highlighted ? "bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] shadow-[0_8px_30px_rgba(148,163,184,0.15)]": "",
 // Legal Glassmorphism 2.0 - Hover effects (maintain glass integrity)
 // Use both hover: and group-hover: to ensure hover works in all contexts
 isLightVariant && !useVibrantGradient ? "hover:border-white group-hover:border-white hover:bg-[rgba(255,255,255,0.98)] group-hover:bg-[rgba(255,255,255,0.98)] hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),inset_0_1px_0_rgba(255,255,255,1)] group-hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),inset_0_1px_0_rgba(255,255,255,1)]": "",
 isLightVariant && useVibrantGradient ? "hover:border-white group-hover:border-white hover:bg-[rgba(255,255,255,0.98)] group-hover:bg-[rgba(255,255,255,0.98)] hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),0_0_50px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,1)] group-hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),0_0_50px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,1)]": "",
 !isLightVariant && highlighted ? "hover:border-white group-hover:border-white hover:bg-[rgba(255,255,255,0.98)] group-hover:bg-[rgba(255,255,255,0.98)] hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),0_0_50px_rgba(59,130,246,0.25)] group-hover:shadow-[0_12px_40px_rgba(148,163,184,0.25),0_0_50px_rgba(59,130,246,0.25)]": "",
 !isLightVariant && !highlighted ? "hover:border-white group-hover:border-white hover:bg-[rgba(255,255,255,0.98)] group-hover:bg-[rgba(255,255,255,0.98)] hover:shadow-[0_12px_40px_rgba(148,163,184,0.25)] group-hover:shadow-[0_12px_40px_rgba(148,163,184,0.25)]": "",
 roundedClass, // Use extracted rounded class
"transition-[transform,shadow,border-color,background-color] duration-300 ease-out",
 // More pronounced hover effects - individual items should lift and scale more
 isClickable && (isLightVariant ? "cursor-pointer hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2": "cursor-pointer hover:scale-[1.04] hover:-translate-y-1.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"),
 // Background gradient - for default variant or highlighted light variant
 (!isLightVariant || useVibrantGradient) && cardBackgroundGradients.base.light,
 cardClassName && cardClassName
 )}
 onClick={isClickable && onClick ? () => {
 onClick();
 } : undefined}
 role={isClickable ? "button": undefined}
 tabIndex={isClickable ? 0 : undefined}
 aria-label={isClickable && description ? description : undefined}
 onKeyDown={isClickable && onClick ? (e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 onClick();
 }
 } : undefined}
 style={{ pointerEvents: 'auto', ...style }}
 >
 {/* Gradient overlay - light variant uses subtle overlay unless highlighted, default uses vibrant */}
 {isLightVariant && !useVibrantGradient ? (
 <div className={cn(
"absolute inset-0 -z-10 pointer-events-none",
 roundedClass,
 baseCardLightOverlay.gradient.light
 )} />
 ) : (
 <>
 <div className={cn(
"absolute inset-0 -z-10 pointer-events-none",
 roundedClass,
"bg-gradient-to-br from-blue-400/1 via-indigo-400/0.5 to-blue-400/0.5"
 )} />

 {/* Additional color accent overlay */}
 <div className={cn(
"absolute inset-0 -z-10 pointer-events-none",
 roundedClass,
"bg-gradient-to-tl from-blue-400/0.5 via-transparent to-blue-400/0.5"
 )} />
 </>
 )}

 {/* Shine effect on hover - only render when needed - MUST match card border radius */}
 {isClickable && (
 <div className={cn(
"absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out -z-10 pointer-events-none",
 roundedClass // Same rounded class as card
 )} />
 )}

 <div className={cn(
"flex flex-col h-full relative",
 // Legal Glassmorphism 2.0 - Internal Padding: 24px to 32px
"p-6"
 )}>
 {skeleton ? (
 <div className="flex items-center justify-between gap-3">
 <div className="flex-1 space-y-2">
 <div className="h-4 bg-gradient-to-r from-muted/50 via-muted/50 to-muted/50 rounded animate-pulse w-full"/>
 <div className="h-4 bg-gradient-to-r from-muted/50 via-muted/50 to-muted/50 rounded animate-pulse w-3/4"/>
 </div>
 <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-r from-muted/50 via-muted/50 to-muted/50 animate-pulse"/>
 </div>
 ) : (
 <>
 {title && (
 <div className={cn(
"flex items-center gap-2 mb-3",
 typeof title !== 'string' &&"justify-between w-full"
 )}>
 {Icon && (
 <div className="relative flex-shrink-0">
 {/* Icon background gradients - uses primary CSS variable with indigo/purple accents for visual depth (purple kept for icons only, more subtle) */}
 <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-indigo-400/8 to-purple-400/8 rounded-lg blur-sm"/>
 <div className="relative bg-gradient-to-br from-primary/5 via-indigo-400/5 to-purple-400/5 rounded-lg p-1.5">
 <Icon className="h-4 w-4 text-primary"/>
 </div>
 </div>
 )}
 {typeof title === 'string' ? (
 <h3 className="font-semibold text-base leading-tight text-[#0F172A]">
 {title}
 </h3>
 ) : (
 <div className="flex-1 w-full">
 {title}
 </div>
 )}
 </div>
 )}
 {children ? (
 children
 ) : (
 <div className={cn(
"flex items-start gap-2.5"
 )}>
 {!title && Icon && (
 <div className="relative flex-shrink-0">
 {/* Icon background gradients - uses primary CSS variable with indigo/purple accents (purple kept for icons only, more subtle) */}
 <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-indigo-400/8 to-purple-400/8 rounded-lg blur-sm"/>
 <div className="relative bg-gradient-to-br from-primary/5 via-indigo-400/5 to-purple-400/5 rounded-lg p-1">
 <Icon className="h-3.5 w-3.5 text-primary"/>
 </div>
 </div>
 )}
 <p className={cn(
"text-sm leading-relaxed flex-1",
 // Light variant: black text in light theme
 isLightVariant ? "text-black": "text-muted-foreground",
 isLightVariant ? "group-hover:text-primary": "group-hover:text-foreground",
"transition-colors duration-300"
 )}>
 {description}
 </p>
 </div>
 )}
 </>
 )}
 </div>
 </div>
 );
});
