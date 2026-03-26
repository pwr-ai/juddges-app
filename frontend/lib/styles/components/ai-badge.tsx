/**
 * AI Badge Component
 * Official Component Specification: "The Electric Fuse"/"Authority Token"
 *
 * Represents"Synthetic Intelligence"within the Legal Glass 2.0 system.
 * A high-fidelity, energetic status indicator with Deep Midnight Navy and Cool Grey palette.
 *
 * Design Philosophy:
 * - Micro-Pill shape (petite but authoritative)
 * - Cool Grey/Slate background (barely visible, just enough to show structure)
 * - Deep Midnight Navy text (almost black with cold blue undertone)
 * - Dark Royal Blue icon (only place allowed to be blue)
 * - Linear Shimmer animation (data flow effect)
 * - Precision, Speed, Accuracy (not"Magic")
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Zap } from 'lucide-react';

/**
 * Props for AIBadge component
 */
export interface AIBadgeProps {
 /** Badge text (default: "AI") - Will be converted to UPPERCASE */
 text?: string;
 /** Icon type: "sparkles"(✨) or"lightning"(⚡) - default: "sparkles"*/
 iconType?: "sparkles"|"lightning";
 /**
 * @deprecated Use iconType instead. Icon component (for backward compatibility).
 * If provided, will attempt to map to iconType (Zap -> lightning, Sparkles -> sparkles).
 * Other icons will default to sparkles.
 */
 icon?: React.ComponentType<{ className?: string }>;
 /**
 * @deprecated Badge is now fixed size (Micro-Pill). This prop is ignored.
 */
 size?: "sm"|"md";
 /** Optional className for additional styling */
 className?: string;
}

/**
 * AI Badge Component
 *
 * The Electric Fuse - A high-voltage component encased in glass.
 *
 * Specifications:
 * - Shape: Full Pill (border-radius: 9999px)
 * - Height: 1rem (16px) - compact
 * - Padding: 0.375rem (6px) horizontal, 0 vertical
 * - Typography: 0.625rem (10px), weight 700, UPPERCASE, 0.05em tracking
 * - Icon: 0.625rem (10px), 2px gap from text
 * - Animation: Linear shimmer (3s interval, 1.5s duration)
 *
 * Color Matrix (Authority Token):
 * Light Mode:
 * - Background: Cool Grey/Slate (#F1F5F9) - barely visible, just enough to show structure
 * - Text: Deep Midnight Navy (#0F172A) - almost black with cold blue undertone
 * - Icon: Dark Royal Blue (#1E40AF) - only place allowed to be blue
 * Dark Mode:
 * - Background: Darker slate for contrast
 * - Text: Light slate for readability
 * - Icon: Lighter royal blue for visibility
 *
 * @example
 * ```tsx
 * <AIBadge />
 * ```
 *
 * @example
 * ```tsx
 * <AIBadge
 * text="AI MODEL"
 * iconType="lightning"
 * />
 * ```
 */
export function AIBadge({
 text ="AI",
 iconType,
 icon,
 size, // Deprecated - ignored
 className,
}: AIBadgeProps): React.JSX.Element {
 // Determine icon type: prioritize iconType, fallback to icon prop mapping, default to sparkles
 let finalIconType: "sparkles"|"lightning"="sparkles";

 if (iconType) {
 finalIconType = iconType;
 } else if (icon) {
 // Map common icon components to iconType
 // Check if icon is Zap (lightning) by comparing function names
 const iconName = icon.displayName || icon.name || '';
 if (iconName === 'Zap' || iconName.includes('Zap') || icon === Zap) {
 finalIconType ="lightning";
 } else {
 finalIconType ="sparkles";
 }
 }

 const Icon = finalIconType === "lightning"? Zap : Sparkles;

 return (
 <span
 data-ai-badge
 className={cn(
 // Base Micro-Pill Architecture (Compact)
"inline-flex items-center justify-center",
"h-4", // 16px - more compact
"px-1.5", // 6px horizontal padding - tighter
"py-0", // 0 vertical padding
"rounded-[9999px]", // Full pill shape
"overflow-hidden", // Required for shimmer animation clipping
"relative", // For shimmer pseudo-element positioning

 // Typography (Smaller)
"text-[0.625rem]", // 10px font size - more compact
"font-bold", // weight 700
"uppercase", // Always uppercase
"tracking-[0.05em]", // Wide letter-spacing

 // Material: Authority Token (Light Mode)
"bg-[#F1F5F9]", // Cool Grey/Slate - barely visible, just enough to show structure
"border border-slate-200/50", // Subtle border for structure
"text-[#0F172A]", // Deep Midnight Navy - almost black with cold blue undertone

 // Material: Authority Token (Dark Mode)
"", // Darker slate for contrast
"", // Subtle border
"", // Light slate for readability

 // Animation: Linear Shimmer (Data Flow)
 // Uses ::before pseudo-element for shimmer effect
"before:absolute before:inset-0",
"before:bg-gradient-to-r",
"before:from-transparent",
"before:via-[rgba(255,255,255,0.6)]",
"before:to-transparent",
"before:translate-x-[-100%]",
"before:skew-x-[-20deg]", // Diagonal movement
"before:pointer-events-none", // Don't interfere with interactions

 className
 )}
 >
 {/* Icon: Sparkles or Lightning Bolt - Only place allowed to be blue */}
 <Icon
 className={cn(
"h-2.5 w-2.5", // 10px - more compact
"stroke-[1.5px]", // Slightly thinner stroke for smaller size
"fill-none", // Strictly stroke-based (no fill)
"mr-0.5", // 2px gap - tighter spacing
"text-[#1E40AF]", // Dark Royal Blue - only place allowed to be blue
""// Lighter blue for dark mode visibility
 )}
 strokeWidth={1.5}
 />

 {/* Text Content */}
 <span className="relative z-10">
 {text.toUpperCase()}
 </span>
 </span>
 );
}
