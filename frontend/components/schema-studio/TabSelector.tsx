"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Props for the TabSelector component
 */
export interface TabSelectorProps {
 /** Current active tab value */
 value: string;
 /** Callback when tab changes */
 onValueChange: (value: string) => void;
 /** Array of tab options */
 tabs: Array<{
 value: string;
 label: string;
 }>;
 /** Tab content - should be TabsContent components */
 children: React.ReactNode;
 /** Optional className for the Tabs container */
 className?: string;
}

/**
 * TabSelector - Reusable tab selector with glassmorphism styling
 *
 * Uses the same styling as the FieldEditor component for consistency.
 *
 * @example
 * ```tsx
 * <TabSelector
 * value={activeTab}
 * onValueChange={setActiveTab}
 * tabs={[
 * { value: "load", label: "Load"},
 * { value: "import", label: "Import"}
 * ]}
 * >
 * <TabsContent value="load">...</TabsContent>
 * <TabsContent value="import">...</TabsContent>
 * </TabSelector>
 * ```
 */
export function TabSelector({
 value,
 onValueChange,
 tabs,
 children,
 className,
}: TabSelectorProps): React.JSX.Element {
 return (
 <Tabs value={value} onValueChange={onValueChange} className={cn("relative z-10", className)}>
 <TabsList className={cn(
"mb-3 w-full",
"bg-white/40",
"backdrop-blur-xl backdrop-saturate-[180%]",
"border border-primary/20",
"rounded-xl",
"p-1",
"h-auto",
"gap-1",
"shadow-sm"
 )}>
 {tabs.map((tab) => (
 <TabsTrigger
 key={tab.value}
 value={tab.value}
 className={cn(
"flex-1",
"relative",
"data-[state=active]:bg-white/90",
"data-[state=active]:backdrop-blur-md",
"data-[state=active]:shadow-lg",
"data-[state=active]:shadow-primary/10",
"data-[state=active]:text-foreground",
"data-[state=active]:ring-1 data-[state=active]:ring-white/30",
"data-[state=inactive]:bg-transparent",
"data-[state=inactive]:text-muted-foreground",
"data-[state=inactive]:hover:text-foreground",
"data-[state=inactive]:hover:bg-white/20",
"rounded-lg",
"px-4 py-2",
"font-medium",
"transition-all duration-200"
 )}
 >
 {tab.label}
 </TabsTrigger>
 ))}
 </TabsList>
 {children}
 </Tabs>
 );
}
