/**
 * Light Card Component
 * A lightweight card with a subtle, muted background for better visual hierarchy
 * Features a much lighter background compared to BaseCard
 * Ideal for panels, sections, forms, and any content that needs less visual weight
 *
 * Uses centralized color definitions from lib/styles/colors/surfaces.ts
 */

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { lightCardColors } from '@/lib/styles/colors/surfaces';

export interface LightCardProps {
 /**
 * Optional title to display at the top of the card
 * Can be a string or React element for custom title layouts
 */
 title?: string | React.ReactNode;
 /**
 * Optional className for the card
 */
 className?: string;
 /**
 * Optional children to render inside the card
 */
 children?: React.ReactNode;
 /**
 * Padding size
 * @default"md"
 */
 padding?: 'sm' | 'md' | 'lg';
 /**
 * Whether to show a subtle border
 * @default true
 */
 showBorder?: boolean;
 /**
 * Whether to show a subtle shadow
 * @default false
 */
 showShadow?: boolean;
 /**
 * Optional onClick handler - makes the card interactive
 */
 onClick?: () => void;
}

/**
 * Light Card Component
 *
 * A lightweight card component with a subtle, muted background.
 * Features a much lighter background for better readability and visual hierarchy.
 * Uses centralized color definitions following the design system.
 *
 * @example
 * <LightCard title="Settings">
 * <div>Content here</div>
 * </LightCard>
 *
 * @example
 * <LightCard padding="lg"showShadow>
 * <Slider />
 * <Checkbox />
 * </LightCard>
 */
export const LightCard = memo(function LightCard({
 title,
 className,
 children,
 padding = 'md',
 showBorder = true,
 showShadow = false,
 onClick,
}: LightCardProps) {
 // Extract rounded class from className
 // Legal Glassmorphism 2.0: Standard corner radius is 24px
 const roundedClass = className?.match(/rounded-[\w-]+/)?.[0] || "rounded-[24px]";

 // Remove rounded class and any background classes from className to avoid duplication
 const cardClassName = className?.replace(/rounded-\w+/g, '').replace(/bg-\S+/g, '').trim() || '';

 const isClickable = !!onClick;

 return (
 <div
 onClick={onClick}
 role={isClickable ? "button": undefined}
 tabIndex={isClickable ? 0 : undefined}
 onKeyDown={isClickable ? (e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 onClick?.();
 }
 } : undefined}
 className={cn(
 lightCardColors.container.base,
 lightCardColors.container.transition,
 // Legal Glassmorphism 2.0 - Heavy Glass Card (Light Mode)
 // High Opacity: 90% White (rgba(255,255,255,0.9))
 // Heavy Blur: 32px
 // Rim Light: 1px Solid White Border (#FFFFFF) at 100% Opacity
 // Corner Radius: 24px
 // Colored Shadow: Blue-Grey (rgba(148, 163, 184, 0.15)), spread 30px, y: 8px
 // Legal Glass Night Mode - Dark Mode: Slate 800 with transparency, crisp white border, no shadows
"bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%]",
 // Border - Rim Light: 1px Solid White Border (#FFFFFF) at 100% Opacity (Light), 10% White (Dark)
 showBorder &&"border-[1px] border-solid border-[#FFFFFF]",
 // Shadow - Legal Glassmorphism 2.0 colored shadow (Light), none (Dark)
 showShadow &&"shadow-[0_8px_30px_rgba(148,163,184,0.15)] hover:shadow-[0_8px_30px_rgba(148,163,184,0.2),inset_0_1px_0_rgba(255,255,255,1)] hover:border-white hover:bg-[rgba(255,255,255,0.95)]",
 !showShadow &&"shadow-[0_8px_30px_rgba(148,163,184,0.15)] hover:shadow-[0_8px_30px_rgba(148,163,184,0.2)] hover:border-white hover:bg-[rgba(255,255,255,0.95)]",
 // Interactive states
 isClickable &&"cursor-pointer hover:scale-[1.01] active:scale-[0.99]",
 // Focus state for accessibility
 isClickable &&"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 roundedClass,
 cardClassName
 )}
 >
 {/* Subtle gradient overlay - lighter than BaseCard but more visible */}
 <div className={cn(
 lightCardColors.overlay.container,
 roundedClass,
 lightCardColors.overlay.gradient.light,
 )} />

 {/* Content */}
 <div className={cn(
"flex flex-col h-full relative",
 lightCardColors.padding[padding]
 )}>
 {title && (
 typeof title === 'string' ? (
 <h3 className="text-sm font-semibold mb-4 text-[#0F172A]">
 {/* Legal Glassmorphism 2.0 - Headlines: Midnight Navy (Light), Slate 100 (Dark) */}
 {title}
 </h3>
 ) : (
 <div className="text-sm font-semibold mb-4 text-[#0F172A]">
 {title}
 </div>
 )
 )}
 {children}
 </div>
 </div>
 );
});
