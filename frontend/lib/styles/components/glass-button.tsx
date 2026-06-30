/**
 * Glass Button Component
 * Primary action button following Legal Glass 2.0 design
 *"Sapphire Lens"- Translucent crystal button with inner highlights and colored glow
 */

"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';
import { glassButtonClassName } from './button-variants';

export interface GlassButtonProps {
 /** Button text */
 children: React.ReactNode;
 /** Click handler */
 onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
 /** Disabled state */
 disabled?: boolean;
 /** Loading state */
 isLoading?: boolean;
 /** Optional className */
 className?: string;
 /** Button type */
 type?: "button"|"submit"|"reset";
 /** Color variant */
 variant?: "blue"|"white";
}

/**
 * Glass Button Component
 *
 * Primary action button. Features"Sapphire Lens"design - a translucent
 * crystal button with gradient background, inner highlights, and colored glow.
 * Perfect for Glassmorphism 2.0 aesthetic.
 *
 * @example
 * ```tsx
 * <GlassButton onClick={handleSave} isLoading={saving}>
 * Save
 * </GlassButton>
 * ```
 */
export function GlassButton({
 children,
 onClick,
 disabled = false,
 isLoading = false,
 className,
 type ="button",
 variant ="blue",
}: GlassButtonProps): React.JSX.Element {
 const isWhite = variant === "white";

 return (
 <button
 type={type}
 onClick={onClick}
 disabled={disabled || isLoading}
 className={glassButtonClassName(isWhite, className)}
 >
 {isLoading ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin"/>
 {children}
 </>
 ) : (
 children
 )}
 </button>
 );
}
