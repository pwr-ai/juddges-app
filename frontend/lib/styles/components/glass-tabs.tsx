/**
 * Glass Tabs Component
 * Custom tab component with proper glass morphism styling, rounded corners, and smooth animations
 * Follows Legal Glassmorphism 2.0 design system
 */

"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// Context to share active state with triggers for animation
type GlassTabsContextValue = {
 value?: string;
 onValueChange?: (value: string) => void;
};

const GlassTabsContext = React.createContext<GlassTabsContextValue>({});

export interface GlassTabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
 className?: string;
}

export interface GlassTabsListProps extends React.ComponentProps<typeof TabsPrimitive.List> {
 className?: string;
}

export interface GlassTabsTriggerProps extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
 className?: string;
}

export interface GlassTabsContentProps extends React.ComponentProps<typeof TabsPrimitive.Content> {
 className?: string;
}

/**
 * Glass Tabs Root Component
 */
export function GlassTabs({
 className,
 value,
 defaultValue,
 onValueChange,
 ...props
}: GlassTabsProps): React.JSX.Element {
 const [activeTab, setActiveTab] = React.useState<string | undefined>(
 value || defaultValue
 );

 // Sync internal state with controlled value if provided
 React.useEffect(() => {
 if (value !== undefined) {
 setActiveTab(value);
 }
 }, [value]);

 const handleValueChange = (newValue: string) => {
 if (value === undefined) {
 setActiveTab(newValue);
 }
 onValueChange?.(newValue);
 };

 return (
 <GlassTabsContext.Provider value={{ value: activeTab }}>
 <TabsPrimitive.Root
 data-slot="glass-tabs"
 className={cn("flex flex-col gap-4", className)}
 value={value}
 defaultValue={defaultValue}
 onValueChange={handleValueChange}
 {...props}
 />
 </GlassTabsContext.Provider>
 );
}

/**
 * Glass Tabs List Component
 * Liquid glass container - transparent with backdrop blur
 */
export function GlassTabsList({
 className,
 ...props
}: GlassTabsListProps): React.JSX.Element {
 return (
 <TabsPrimitive.List
 data-slot="glass-tabs-list"
 className={cn(
"inline-flex h-12 w-fit items-center justify-center rounded-full",
 // Liquid glass container - more visible background
"bg-slate-200/40",
"backdrop-blur-[20px] backdrop-saturate-[180%]",
"border border-white/30",
"p-1.5 gap-1.5",
"shadow-[inset_0_0_12px_rgba(255,255,255,0.15)]",
 className
 )}
 {...props}
 />
 );
}

/**
 * Glass Tabs Trigger Component
 * Liquid glass pill - transparent glass with backdrop blur, background shows through
 */
export function GlassTabsTrigger({
 className,
 value,
 children,
 ...props
}: GlassTabsTriggerProps): React.JSX.Element {
 const context = React.useContext(GlassTabsContext);
 const isActive = context.value === value;

 return (
 <TabsPrimitive.Trigger
 value={value}
 data-slot="glass-tabs-trigger"
 className={cn(
 // Base styles
"relative inline-flex h-full flex-1 items-center justify-center",
"rounded-full px-5 py-2 text-sm",
"whitespace-nowrap",
"transition-all duration-[400ms] ease-out",
"z-10", // Ensure text is above the glass pill

 // Text colors - adapts to theme
 isActive
 ? "text-slate-900 font-semibold"
 : "text-slate-600 font-medium hover:text-slate-800",

 // Focus styles
"focus-visible:outline-none",
"focus-visible:ring-2 focus-visible:ring-white/30",
"focus-visible:ring-offset-2",

 // Disabled state
"disabled:pointer-events-none disabled:opacity-30",

 className
 )}
 {...props}
 >
 {isActive && (
 <motion.div
 layoutId="glass-tabs-indicator"
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
"-z-10"// Behind the text
 )}
 transition={{
 type: "spring",
 bounce: 0.2,
 duration: 0.5
 }}
 />
 )}
 <span className="relative z-10">{children}</span>
 </TabsPrimitive.Trigger>
 );
}

/**
 * Glass Tabs Content Component
 * With proper fade and slide animations when switching tabs
 */
export function GlassTabsContent({
 className,
 children,
 value,
 ...props
}: GlassTabsContentProps): React.JSX.Element {
 // We can't easily use AnimatePresence here because TabsPrimitive.Content
 // controls visibility via `hidden` attribute or unmounting.
 // However, we can use simple CSS animations or a motion div wrapper if we want exit animations.
 // For now, let's stick to a nice entry animation using motion.div

 return (
 <TabsPrimitive.Content
 value={value}
 data-slot="glass-tabs-content"
 asChild
 className={cn(
"flex-1 outline-none mt-2",
 className
 )}
 {...props}
 >
 <motion.div
 initial={{ opacity: 0, y: 10, filter: "blur(2px)"}}
 animate={{ opacity: 1, y: 0, filter: "blur(0px)"}}
 exit={{ opacity: 0, y: -10, filter: "blur(2px)"}}
 transition={{
 duration: 0.4,
 ease: "easeOut"
 }}
 >
 {children}
 </motion.div>
 </TabsPrimitive.Content>
 );
}
