/**
 * Glass Button Component
 * Primary action button following Legal Glass 2.0 design
 *"Sapphire Lens"- Translucent crystal button with inner highlights and colored glow
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

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
 className={cn(
"w-full h-12 flex items-center justify-center gap-2",
"rounded-[0.75rem] px-3 py-2.5 text-left outline-hidden transition-all duration-200 ease-out font-[600]",
 // Blue variant (default)
 !isWhite && [
"bg-[rgba(37,99,235,0.15)]",
"text-[#1E3A8A]",
"border border-[rgba(37,99,235,0.40)]",
"shadow-[0_0_0_1px_rgba(37,99,235,0.20)]",
"[&>svg]:text-[#1E3A8A] [&>svg]:stroke-[2.5]",
"hover:bg-[rgba(37,99,235,0.25)] hover: ",
"hover:scale-[1.02] hover:shadow-[0_0_0_1px_rgba(37,99,235,0.30)] hover: ",
 ],
 // White variant
 isWhite && [
"bg-[rgba(255,255,255,0.80)]",
"text-[#475569]",
"border border-white",
"shadow-[0_1px_3px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]",
"[&>svg]:text-[#475569] [&>svg]:stroke-[2.5]",
"hover:bg-white hover: ",
"hover:text-[#0F172A] hover: ",
"hover:border-white hover: ",
"hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.1)] hover: ",
"[&>svg]:hover:text-[#0F172A]",
 ],
"focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
"disabled:pointer-events-none disabled:opacity-50",
"aria-disabled:pointer-events-none aria-disabled:opacity-50",
 className
 )}
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
