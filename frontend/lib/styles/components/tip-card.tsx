/**
 * Tip Card Component
 * A reusable card component for displaying tips, hints, and helpful information
 * Built on LightCard for consistent styling
 */

"use client";

import React, { memo } from 'react';
import { LucideIcon, Lightbulb } from 'lucide-react';
import { LightCard } from './light-card';
import { IconButton } from './icon-button';
import { X } from 'lucide-react';

export interface TipCardProps {
 /**
 * Tip title
 */
 title: string;
 /**
 * Tip content/description
 */
 description?: string;
 /**
 * Optional icon (defaults to Lightbulb)
 */
 icon?: LucideIcon;
 /**
 * Optional children for more complex content
 */
 children?: React.ReactNode;
 /**
 * Whether the tip can be dismissed
 * @default false
 */
 dismissible?: boolean;
 /**
 * Callback when dismiss button is clicked
 */
 onDismiss?: () => void;
 /**
 * Optional className
 */
 className?: string;
}

/**
 * Tip Card Component
 *
 * A reusable component for displaying tips, hints, and helpful information.
 * Uses LightCard for consistent styling with the design system.
 *
 * @example
 * ```tsx
 * <TipCard
 * title="Pro Tip"
 * description="Use keyboard shortcuts to navigate faster"
 * dismissible
 * onDismiss={() => setTipDismissed(true)}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <TipCard title="Getting Started"icon={Info}>
 * <div className="space-y-2">
 * <p>Step 1: Create a collection</p>
 * <p>Step 2: Add documents</p>
 * </div>
 * </TipCard>
 * ```
 */
export const TipCard = memo(function TipCard({
 title,
 description,
 icon: Icon = Lightbulb,
 children,
 dismissible = false,
 onDismiss,
 className,
}: TipCardProps) {
 return (
 <div className={`relative ${className || ''}`}>
 <LightCard
 title={title}
 padding="md"
 showBorder={true}
 showShadow={false}
 >
 <div className="flex items-start gap-3">
 <div className="p-2 rounded-lg bg-primary/10 shrink-0">
 <Icon className="h-4 w-4 text-primary"/>
 </div>
 <div className="flex-1 min-w-0">
 {description && (
 <p className="text-sm text-black">{description}</p>
 )}
 {children}
 </div>
 </div>
 </LightCard>

 {dismissible && onDismiss && (
 <IconButton
 icon={X}
 onClick={onDismiss}
 variant="muted"
 size="md"
 compact={true}
 hoverStyle="color"
 aria-label="Dismiss tip"
 className="absolute top-4 right-4 z-10"
 />
 )}
 </div>
 );
});
