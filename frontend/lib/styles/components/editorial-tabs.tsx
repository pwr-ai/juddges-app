/**
 * Editorial Tabs Component
 * Tab component on the Editorial Jurisprudence surface: ruled container,
 * parchment active indicator, ink type.
 */

"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// Context to share active state with triggers for animation
type EditorialTabsContextValue = {
 value?: string;
 onValueChange?: (value: string) => void;
};

const EditorialTabsContext = React.createContext<EditorialTabsContextValue>({});

export interface EditorialTabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
 className?: string;
}

export interface EditorialTabsListProps extends React.ComponentProps<typeof TabsPrimitive.List> {
 className?: string;
}

export interface EditorialTabsTriggerProps extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
 className?: string;
}

export interface EditorialTabsContentProps extends React.ComponentProps<typeof TabsPrimitive.Content> {
 className?: string;
}

/**
 * Editorial Tabs Root Component
 */
export function EditorialTabs({
 className,
 value,
 defaultValue,
 onValueChange,
 ...props
}: EditorialTabsProps): React.JSX.Element {
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
 <EditorialTabsContext.Provider value={{ value: activeTab }}>
 <TabsPrimitive.Root
 data-slot="editorial-tabs"
 className={cn("flex flex-col gap-4", className)}
 value={value}
 defaultValue={defaultValue}
 onValueChange={handleValueChange}
 {...props}
 />
 </EditorialTabsContext.Provider>
 );
}

/**
 * Tabs List Component
 * Clean editorial container with rule border
 */
export function EditorialTabsList({
  className,
  ...props
}: EditorialTabsListProps): React.JSX.Element {
  return (
    <TabsPrimitive.List
      data-slot="editorial-tabs-list"
      className={cn(
        "inline-flex h-10 w-fit items-center justify-center border border-rule bg-parchment-deep/40 p-1 gap-1 text-ink-soft",
        className
      )}
      {...props}
    />
  );
}

/**
 * Tabs Trigger Component
 * Editorial tab trigger with ink text and parchment indicator
 */
export function EditorialTabsTrigger({
  className,
  value,
  children,
  ...props
}: EditorialTabsTriggerProps): React.JSX.Element {
  const context = React.useContext(EditorialTabsContext);
  const isActive = context.value === value;

  return (
    <TabsPrimitive.Trigger
      value={value}
      data-slot="editorial-tabs-trigger"
      className={cn(
        // Base styles
        "relative inline-flex h-full flex-1 items-center justify-center",
        "px-4 py-1.5 font-mono text-xs uppercase tracking-[0.14em]",
        "whitespace-nowrap",
        "transition-colors duration-150 ease-out",
        "z-10",

        // Text colors
        isActive
          ? "text-ink font-semibold"
          : "text-ink-soft hover:text-ink",

        // Focus styles
        "focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",

        // Disabled state
        "disabled:pointer-events-none disabled:opacity-30",

        className
      )}
      {...props}
    >
      {isActive && (
        <motion.div
          layoutId="editorial-tabs-indicator"
          className={cn(
            "absolute inset-0",
            "bg-parchment",
            "border border-rule/80",
            "shadow-sm",
            "-z-10"
          )}
          transition={{
            type: "spring",
            bounce: 0.15,
            duration: 0.35,
          }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

/**
 * Editorial Tabs Content Component
 * With proper fade and slide animations when switching tabs
 */
export function EditorialTabsContent({
 className,
 children,
 value,
 ...props
}: EditorialTabsContentProps): React.JSX.Element {
 // We can't easily use AnimatePresence here because TabsPrimitive.Content
 // controls visibility via `hidden` attribute or unmounting.
 // However, we can use simple CSS animations or a motion div wrapper if we want exit animations.
 // For now, let's stick to a nice entry animation using motion.div

 return (
 <TabsPrimitive.Content
 value={value}
 data-slot="editorial-tabs-content"
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
