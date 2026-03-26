/**
 * Dropdown Button Component
 * Reusable dropdown button with modern hover effects
 * Used in chat input and other components
 */

'use client';

import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface DropdownButtonOption {
 value: string;
 label: string;
}

export interface DropdownButtonProps {
 icon: React.ReactNode;
 label: string;
 value?: string;
 options: DropdownButtonOption[];
 onChange?: (value: string) => void;
 disabled?: boolean;
 className?: string;
 align?: 'start' | 'end' | 'center';
}

/**
 * Dropdown Button
 * A modern dropdown button with hover effects and animations
 *
 * @example
 * <DropdownButton
 * icon={<FileText size={16} />}
 * label="Response Format"
 * value="adaptive"
 * options={[
 * { value: "adaptive", label: "Adaptive (AI decides)"},
 * { value: "short", label: "Short Answer"},
 * ]}
 * onChange={(value) => {
 * // eslint-disable-next-line no-console
 * console.log(value);
 * }}
 * />
 */
export function DropdownButton({
 icon,
 label,
 value,
 options,
 onChange,
 disabled = false,
 className,
 align = 'start',
}: DropdownButtonProps): React.JSX.Element {
 const selectedOption = options.find((opt) => opt.value === value);
 const displayLabel = selectedOption?.label || label;
 const [isOpen, setIsOpen] = React.useState(false);

 return (
 <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
 <DropdownMenuTrigger asChild disabled={disabled}>
 <Button
 variant="ghost"
 size="sm"
 className={cn(
 // THE FROSTED LENS - Model Selector Trigger
 // Geometry: Full Pill, 32px height, asymmetric padding
 'group relative h-8 text-[13px] font-medium gap-2 pl-4 pr-3 rounded-[9999px]',
 'flex items-center justify-start',
 'transition-all duration-200 ease-out',
 'cursor-pointer',
 // IDLE STATE (Glass) - Translucent white, slate border, slate text
 'bg-[rgba(255,255,255,0.5)]',
 'border border-[#CBD5E1]', // Slate 300 / Slate 600 dark
 'text-[#475569]', // Slate 600 / Slate 400 dark
 'shadow-none',
 // HOVER STATE (Porcelain) - Solid white, darker border, dark text, subtle lift
 'hover:bg-white',
 'hover:border-[#94A3B8]', // Slate 400 / Slate 500 dark
 'hover:text-[#0F172A]', // Midnight Navy / Off-white dark
 'hover:shadow-[0_2px_4px_rgba(0,0,0,0.05)]',
 'hover:-translate-y-[1px]',
 // OPEN STATE (Laser Focus) -"Clinical White"
 // Background: Stay white - no tint, keeps text legibility perfect
 isOpen && 'bg-white', // Solid White / Slate 800 dark
 // Border: Deep Royal Blue - acts like a laser outline
 isOpen && 'border-[#2563EB]', // Royal Blue 600 / Blue 500 dark
 // Text: Midnight Navy - high contrast, not blue
 isOpen && 'text-[#0F172A]', // Midnight Navy / Off-white dark
 // Focus Ring: Sharp Blue Halo (3px, 15% opacity)
 isOpen && 'shadow-[0_0_0_3px_rgba(37,99,235,0.15)]', // Sharp ring
 className
 )}
 >

 {/* Content */}
 <span className="relative z-10 flex items-center gap-2">
 <span className={cn(
 'transition-transform duration-200',
 // Icon color: Only the icon turns blue when open
 isOpen && 'text-[#1E40AF]' // Deep Blue - only icon is blue
 )}>
 {icon}
 </span>
 <span className="hidden sm:inline">{displayLabel}</span>
 <ChevronDown
 size={12}
 className={cn(
 'transition-all duration-200',
 isOpen && 'rotate-180',
 // Icon color: Only the icon turns blue when open
 isOpen && 'text-[#1E40AF]' // Deep Blue - only icon is blue
 )}
 />
 </span>
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent
 align={align}
 sideOffset={8}
 className={cn(
 // Floating Crystal Prism - Levitating Pane
 // Must float 8px below trigger (sideOffset={8})
 // Corner Radius: 16px
 // Padding (CRITICAL): 4px - items must float inside, never touch border
"min-w-[200px] rounded-2xl p-1",
 // Menu Surface - Thick slab of frosted glass
 // Light Mode: rgba(255, 255, 255, 0.90) + Blur(12px)
 // Dark Mode: rgba(2, 6, 23, 0.90) + Blur(12px)
"bg-white/90",
 // Backdrop blur for depth
"backdrop-blur-[12px] backdrop-saturate-150",
 // Border (The Cut) - 1px strictly
 // Light Mode: #E2E8F0 (Slate 200) - subtle, physical edge
 // Dark Mode: rgba(255, 255, 255, 0.1) - faint glimmer
"border border-slate-200",
 // Shadow (Elevation) - Deep, Diffuse, Colored
 // Value: 0 20px 40px -5px rgba(0, 0, 0, 0.1)
"shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)]",
"",
 // NO GLOWS - Do not add glow ring
"z-50",
 // Entrance Animation (Opening) - Override default Radix animations
 // Origin: Top Center
 // Scale: Start at 0.95, End at 1.0
 // Opacity: Start at 0, End at 1
 // Translate Y: Start at -4px, End at 0px
 // Timing: 0.15s ease-out
 // Override Radix defaults by using !important classes
"[&[data-state=open]]:!animate-[dropdown-enter_0.15s_ease-out]",
 // Exit: Fade out instantly (0.1s) - Do not scale down; just vanish
"[&[data-state=closed]]:!animate-[dropdown-exit_0.1s_ease-in]"
 )}
 >
 {options.map((option) => {
 const isSelected = value === option.value;
 return (
 <DropdownMenuItem
 key={option.value}
 className={cn(
 // The Phantom Row - Floating Light
 // Shape: The Squircle - 6px corner radius (rounded-md)
 // Margin: Tiny gap between items (2px) - mb-0.5 = 2px
 // Padding: 8px 12px (py-2 = 8px, px-3 = 12px)
 'group relative text-xs cursor-pointer rounded-md px-3 py-2 mb-0.5 last:mb-0',
 '!bg-transparent !focus:bg-transparent',
 'hover:!bg-transparent focus:hover:!bg-transparent',
 'border-0 !outline-none !ring-0',
 'data-[highlighted]:!bg-transparent',
 'overflow-hidden',
 'flex items-center justify-between',
 // Base text color: Slate Grey (#475569)
 'text-slate-600',
 // Selected: Royal Blue text with semi-bold weight
 isSelected && 'text-blue-800 font-semibold'
 )}
 onSelect={(e) => {
 e.preventDefault();
 onChange?.(option.value);
 }}
 >
 {/* Hover State - The"Breath"*/}
 {/* Background: More transparent - barely visible shadow */}
 {/* Text: Darkens slightly to #0F172A */}
 {/* Transition: Instant (0ms) - Glass reacts immediately */}
 <div
 className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 group-focus:opacity-100 group-data-[highlighted]:opacity-100 transition-none pointer-events-none bg-black/[0.02]"
 style={{
 zIndex: 0
 }}
 />

 {/* Selected State - The"Laser"(Floating Light) */}
 {/* NO left border - Kill the vertical bar */}
 {/* Background: More transparent blue tint */}
 {/* Text: Royal Blue (#1E40AF) with semi-bold (600) */}
 {/* Checkmark: Far right in Royal Blue */}
 {isSelected && (
 <div
 className="absolute inset-0 rounded-md pointer-events-none opacity-100"
 style={{
 zIndex: 0,
 backgroundColor: 'rgba(37, 99, 235, 0.04)' // 4% opacity blue tint - more transparent
 }}
 />
 )}

 {/* Content */}
 <span className={cn(
"relative z-10 flex-1",
 // Hover: Text darkens to #0F172A (Midnight)
"group-hover:text-slate-900",
 // Selected: Already applied via parent className
 )}>
 {option.label}
 </span>

 {/* Checkmark Icon - Far Right (Only when selected) */}
 {/* Color: Royal Blue (#1E40AF) */}
 {isSelected && (
 <Check
 size={16}
 className="relative z-10 ml-2 flex-shrink-0 text-blue-800"
 />
 )}
 </DropdownMenuItem>
 );
 })}
 </DropdownMenuContent>
 </DropdownMenu>
 );
}
