"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        // Modern background with subtle gradient
        "bg-gradient-to-br from-background via-background/95 to-muted/50",
        "text-foreground",
        "flex h-full w-full flex-col overflow-hidden rounded-xl",
        // Enhanced shadow and border
        "shadow-2xl shadow-primary/10 dark:shadow-primary/5",
        "border border-border/50",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0 border-border/50">
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground/80 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="group flex h-14 items-center gap-3 border-b border-border/50 bg-gradient-to-r from-muted/20 via-muted/30 to-muted/20 px-4 transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/30 hover:via-muted/40 hover:to-muted/30 focus-within:bg-gradient-to-r focus-within:from-primary/5 focus-within:via-primary/10 focus-within:to-primary/5 focus-within:border-primary/30"
    >
      <SearchIcon className="size-5 shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-foreground group-focus-within:text-primary group-focus-within:scale-110" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground/60 selection:bg-primary selection:text-primary-foreground flex h-11 w-full min-w-0 rounded-md border-0 bg-transparent px-0 py-3 text-base font-medium shadow-none transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:ring-0",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[400px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        // Custom scrollbar styling
        "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-border/80",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-hidden select-none transition-all duration-200",
        // Default state
        "text-foreground/90",
        // Hover state with gradient background
        "hover:bg-gradient-to-r hover:from-primary/10 hover:via-primary/15 hover:to-primary/10",
        "hover:text-foreground hover:shadow-sm hover:scale-[1.01]",
        // Selected state with enhanced gradient
        "data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-primary/15 data-[selected=true]:via-primary/20 data-[selected=true]:to-primary/15",
        "data-[selected=true]:text-foreground data-[selected=true]:shadow-md data-[selected=true]:scale-[1.02]",
        "data-[selected=true]:border data-[selected=true]:border-primary/20",
        // Icon styling
        "[&_svg:not([class*='text-'])]:text-muted-foreground data-[selected=true]:[&_svg]:text-primary",
        "[&_svg]:transition-all [&_svg]:duration-200",
        "data-[selected=true]:[&_svg]:scale-110",
        // Disabled state
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
