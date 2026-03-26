/**
 * View Mode Toggle Component
 * Liquid glass pill design for switching between list and grid views
 * Matches GlassTabs styling
 */

"use client";

import React from 'react';
import { List as ListIcon, Grid3x3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ViewModeToggleProps {
 /** Current view mode */
 viewMode: 'list' | 'grid';
 /** Callback when view mode changes */
 onViewModeChange: (mode: 'list' | 'grid') => void;
 /** Optional className for additional styling */
 className?: string;
}

/**
 * View Mode Toggle Component
 *
 * A liquid glass pill toggle for switching between list and grid views.
 * Uses the same styling as GlassTabs for consistency.
 */
export function ViewModeToggle({
 viewMode,
 onViewModeChange,
 className,
}: ViewModeToggleProps): React.JSX.Element {
 return (
 <div
 className={cn(
"inline-flex h-12 w-fit items-center justify-center rounded-full",
 // Liquid glass container - subtle depth (matches GlassTabsList)
"bg-slate-200/20",
"backdrop-blur-[20px] backdrop-saturate-[180%]",
"border border-white/20",
"p-1.5 gap-1.5",
"shadow-[inset_0_0_12px_rgba(255,255,255,0.1)]",
 className
 )}
 >
 {/* Grid Button */}
 <button
 type="button"
 onClick={() => onViewModeChange('grid')}
 className={cn(
"relative inline-flex h-full flex-1 items-center justify-center",
"rounded-full px-4 py-2 text-sm",
"whitespace-nowrap",
"transition-colors duration-[400ms] ease-out",
"z-10", // Ensure icon is above the background blob
 // Text colors
 viewMode === 'grid'
 ? "text-slate-900 font-semibold"
 : "text-slate-600 font-medium hover:text-slate-800",
 // Focus styles
"focus-visible:outline-none",
"focus-visible:ring-2 focus-visible:ring-primary/30",
"focus-visible:ring-offset-2",
 )}
 aria-label="Grid view"
 >
 {viewMode === 'grid' && (
 <motion.div
 layoutId="view-mode-indicator"
 className={cn(
"absolute inset-0 rounded-full",
 // Subtle glass effect - minimal gradient
"bg-white/50",
 // Blur for glass integration
"backdrop-blur-[12px]",
 // Subtle border - reduced glow on dark theme
"border border-white/40",
 // Minimal shadow for depth
"shadow-[0_1px_3px_rgba(0,0,0,0.1)]",
"-z-10"// Behind the icon
 )}
 transition={{
 type: "spring",
 bounce: 0.2,
 duration: 0.5
 }}
 />
 )}
 <Grid3x3 className="h-4 w-4 relative z-10"/>
 </button>

 {/* List Button */}
 <button
 type="button"
 onClick={() => onViewModeChange('list')}
 className={cn(
"relative inline-flex h-full flex-1 items-center justify-center",
"rounded-full px-4 py-2 text-sm",
"whitespace-nowrap",
"transition-colors duration-[400ms] ease-out",
"z-10", // Ensure icon is above the background blob
 // Text colors
 viewMode === 'list'
 ? "text-slate-900 font-semibold"
 : "text-slate-600 font-medium hover:text-slate-800",
 // Focus styles
"focus-visible:outline-none",
"focus-visible:ring-2 focus-visible:ring-primary/30",
"focus-visible:ring-offset-2",
 )}
 aria-label="List view"
 >
 {viewMode === 'list' && (
 <motion.div
 layoutId="view-mode-indicator"
 className={cn(
"absolute inset-0 rounded-full",
 // Subtle glass effect - minimal gradient
"bg-white/50",
 // Blur for glass integration
"backdrop-blur-[12px]",
 // Subtle border - reduced glow on dark theme
"border border-white/40",
 // Minimal shadow for depth
"shadow-[0_1px_3px_rgba(0,0,0,0.1)]",
"-z-10"// Behind the icon
 )}
 transition={{
 type: "spring",
 bounce: 0.2,
 duration: 0.5
 }}
 />
 )}
 <ListIcon className="h-4 w-4 relative z-10"/>
 </button>
 </div>
 );
}
