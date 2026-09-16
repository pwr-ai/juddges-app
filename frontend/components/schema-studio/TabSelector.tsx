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
      <TabsList className="mb-3 w-full bg-transparent border-b border-rule rounded-none p-0 h-auto gap-4 justify-start">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="relative rounded-none px-2 py-2 text-xs font-mono uppercase tracking-wider text-ink-soft hover:text-ink data-[state=active]:text-ink data-[state=active]:border-b-2 data-[state=active]:border-ink data-[state=active]:bg-transparent shadow-none"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
