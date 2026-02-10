"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { VariantProps, cva } from "class-variance-authority"
import { PanelLeftIcon, LayoutGrid } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/lib/styles/components/icon-button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/lib/styles/components/tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_ICON_MODE_COOKIE_NAME = "sidebar_icon_mode"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "2.5rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  iconMode: boolean
  setIconMode: (iconMode: boolean) => void
  toggleIconMode: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar(): SidebarContextProps {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}): React.JSX.Element {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Icon mode state - initialize to false to prevent hydration mismatch
  // Read from cookie after mount (client-only) to ensure server and client render the same initially
  const [iconMode, setIconModeState] = React.useState(false)

  // Track if we've read the cookie to avoid running the sync effect before cookie is read
  const cookieRead = React.useRef(false)
  
  // Read icon mode from cookie after mount (client-only)
  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const cookies = document.cookie.split(";")
      const iconModeCookie = cookies.find((c) => c.trim().startsWith(`${SIDEBAR_ICON_MODE_COOKIE_NAME}=`))
      const cookieValue = iconModeCookie ? iconModeCookie.split("=")[1] === "true" : false
      setIconModeState(cookieValue)
      cookieRead.current = true
    }
  }, []) // Only run once on mount

  // When icon mode is loaded from cookie, ensure sidebar is in correct state
  // Only run after cookie has been read to avoid premature state updates
  React.useEffect(() => {
    if (cookieRead.current && !isMobile) {
      if (iconMode && open) {
        // If icon mode is enabled but sidebar is open, collapse it
        setOpen(false)
      } else if (!iconMode && !open && defaultOpen) {
        // If icon mode is disabled but sidebar is closed and default is open, expand it
        setOpen(true)
      }
    }
  }, [iconMode, open, isMobile, setOpen, defaultOpen])

  const setIconMode = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const iconModeState = typeof value === "function" ? value(iconMode) : value
      setIconModeState(iconModeState)
      // Store in cookie
      document.cookie = `${SIDEBAR_ICON_MODE_COOKIE_NAME}=${iconModeState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
      // When enabling icon mode, collapse the sidebar
      // When disabling icon mode, expand the sidebar
      if (!isMobile) {
        if (iconModeState) {
          setOpen(false)
        } else {
          setOpen(true)
        }
      }
    },
    [iconMode, isMobile, setOpen]
  )

  const toggleIconMode = React.useCallback(() => {
    setIconMode((prev) => !prev)
  }, [setIconMode])

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      iconMode,
      setIconMode,
      toggleIconMode,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar, iconMode, setIconMode, toggleIconMode]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible: collapsibleProp = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}): React.JSX.Element {
  const { isMobile, state, openMobile, setOpenMobile, iconMode, open } = useSidebar()
  
  // Use icon mode if enabled, otherwise use the prop value
  const collapsible = iconMode ? "icon" : collapsibleProp

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-gradient-to-br from-blue-100/70 via-indigo-100/50 to-purple-100/40 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-purple-950/20 text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  // Set data-collapsible attribute:
  // - Always "icon" when icon mode is enabled (regardless of expanded/collapsed)
  // - Otherwise, only set when collapsed (for offcanvas mode)
  const dataCollapsible = collapsible === "icon" 
    ? "icon" 
    : (state === "collapsed" ? collapsible : "")

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={dataCollapsible}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          // Legal Glass 2.0: Fixed Overlay with z-50
          "fixed inset-y-0 z-50 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          // Adjust the padding for floating and inset variants.
          // Icon mode stays collapsed (no hover expansion)
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            // Legal Glass 2.0 Container (Glass Pane)
            // Light mode: Crystal - rgba(255, 255, 255, 0.65) with 50px blur
            // Dark mode: Stealth - rgba(2, 6, 23, 0.80) with 40px blur
            "bg-[rgba(255,255,255,0.65)] dark:bg-[rgba(2,6,23,0.80)]",
            "backdrop-blur-[50px] dark:backdrop-blur-[40px]",
            // Right Border - 0.0625rem (1px) Solid Line
            // Light mode: #FFFFFF (Solid White)
            // Dark mode: rgba(255, 255, 255, 0.08)
            "border-r-[0.0625rem] border-r-[#FFFFFF] dark:border-r-[rgba(255,255,255,0.08)]",
            "group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm",
            "group-data-[collapsible=icon]:overflow-visible"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>): React.JSX.Element {
  const { toggleIconMode, iconMode, isMobile, toggleSidebar } = useSidebar()

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event)
    // On mobile, just toggle the sidebar open/close
    // On desktop, toggle icon mode
    if (isMobile) {
      toggleSidebar()
    } else {
      toggleIconMode()
    }
  }

  return (
    <IconButton
      icon={iconMode ? LayoutGrid : PanelLeftIcon}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      className={cn("size-7 h-9 w-9 rounded-lg bg-muted/50 border border-border/30 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]", className)}
      onClick={handleClick}
      aria-label={iconMode ? "Disable Icon Mode" : "Enable Icon Mode"}
      size="md"
      variant="default"
      disableHover={true}
      iconHover="scale"
      {...(props as any)}
    />
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">): React.JSX.Element {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">): React.JSX.Element {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>): React.JSX.Element {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn(
        "flex flex-col gap-2 p-2",
        // Match navbar height (h-16 = 64px) in both expanded and icon mode so border line connects
        "h-16 min-h-[4rem] items-center",
        // Icon mode: horizontal layout, centered
        "group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex-row group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:overflow-visible",
        className
      )}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>): React.JSX.Element {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-visible",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2 group-data-[collapsible=icon]:p-0", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        // Legal Glass 2.0 Section Headers (MAIN / ANALYSIS)
        // Size: 0.6875rem (11px), Uppercase, Letter Spacing: 0.05em
        // Color: #94A3B8 (Slate 400) in both modes
        "text-[0.6875rem] uppercase tracking-[0.05em] text-[#94A3B8] font-medium",
        "ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">): React.JSX.Element {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">): React.JSX.Element {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn(
        // Legal Glass 2.0: Navigation Item Outer Spacing
        // Reduced margins: 0.5rem horizontal (was 0.75rem), 0.25rem vertical
        "group/menu-item relative mx-2 my-1 group-data-[collapsible=icon]:mx-0",
        // Fix disappearing icons: overflow visible and z-index on hover
        "overflow-visible group-data-[collapsible=icon]:overflow-visible",
        "hover:z-10 group-data-[collapsible=icon]:hover:z-10",
        className
      )}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  // Legal Glass 2.0 Navigation Item (Floating Pill)
  // Reduced spacing to prevent text wrapping: padding 0.75rem (was 1rem), gap 0.375rem (was 0.5rem)
  // Border space always reserved to prevent layout shift on hover
  "peer/menu-button flex w-full items-center gap-1.5 rounded-[0.75rem] px-3 py-2.5 text-left outline-hidden transition-all duration-200 ease-out text-[0.875rem] font-[500] bg-transparent text-[#64748B] dark:text-[#94A3B8] [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:transition-all [&>svg]:duration-200 [&>svg]:stroke-[1.5] [&>svg]:text-[#64748B] dark:[&>svg]:text-[#94A3B8] [&>svg]:overflow-visible focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-1! group-data-[collapsible=icon]:justify-center [&>span:last-child]:truncate [&>span:last-child]:min-w-0 group-data-[collapsible=icon]:[&>span]:hidden group-data-[collapsible=icon]:[&_span]:hidden group-data-[collapsible=icon]:[&>svg]:block group-data-[collapsible=icon]:[&_svg]:block group-data-[collapsible=icon]:[&>svg]:opacity-100 group-data-[collapsible=icon]:[&_svg]:opacity-100 border border-transparent overflow-visible hover:bg-[rgba(248,250,252,0.95)] hover:dark:bg-[rgba(255,255,255,0.12)] hover:text-[#0F172A] hover:dark:text-[#FFFFFF] hover:[&>svg]:text-[#0F172A] hover:dark:[&>svg]:text-[#FFFFFF] hover:border-[rgba(248,250,252,0.95)] hover:dark:border-[rgba(255,255,255,0.12)] hover:shadow-[rgba(0,0,0,0.08)] hover:dark:shadow-none hover:font-[600] hover:scale-[1.04] group-data-[collapsible=icon]:hover:scale-[1.04] group-data-[collapsible=icon]:hover:bg-[rgba(248,250,252,0.95)] group-data-[collapsible=icon]:hover:dark:bg-[rgba(255,255,255,0.12)] data-[active=true]:bg-[rgba(37,99,235,0.10)] data-[active=true]:dark:bg-[rgba(59,130,246,0.15)] data-[active=true]:text-[#1E40AF] data-[active=true]:dark:text-[#60A5FA] data-[active=true]:[&>svg]:text-[#1E40AF] data-[active=true]:dark:[&>svg]:text-[#60A5FA] data-[active=true]:border-[rgba(37,99,235,0.20)] data-[active=true]:dark:border-[rgba(59,130,246,0.30)] data-[active=true]:shadow-[0_0_0_1px_rgba(37,99,235,0.10)] data-[active=true]:dark:shadow-none data-[active=true]:font-[600] data-[active=true]:[&>svg]:stroke-[2.5]",
  {
    variants: {
      variant: {
        default: "",
        outline: "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>): React.JSX.Element {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  showOnHover?: boolean
}): React.JSX.Element {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
}): React.JSX.Element {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">): React.JSX.Element {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">): React.JSX.Element {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}): React.JSX.Element {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 items-center gap-2 rounded-[0.75rem] px-3 py-2.5 text-left outline-hidden transition-all duration-200 ease-out font-[500] bg-transparent text-[#64748B] dark:text-[#94A3B8] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:transition-all [&>svg]:duration-200 [&>svg]:stroke-[1.5] [&>svg]:text-[#64748B] dark:[&>svg]:text-[#94A3B8] [&>svg]:overflow-visible focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>span:last-child]:min-w-0 border border-transparent overflow-visible",
        "hover:bg-[rgba(248,250,252,0.95)] hover:dark:bg-[rgba(255,255,255,0.12)] hover:text-[#0F172A] hover:dark:text-[#FFFFFF] hover:[&>svg]:text-[#0F172A] hover:dark:[&>svg]:text-[#FFFFFF] hover:border-[rgba(248,250,252,0.95)] hover:dark:border-[rgba(255,255,255,0.12)] hover:shadow-[rgba(0,0,0,0.08)] hover:dark:shadow-none hover:font-[600] hover:scale-[1.04]",
        "data-[active=true]:bg-[rgba(37,99,235,0.10)] data-[active=true]:dark:bg-[rgba(59,130,246,0.15)] data-[active=true]:text-[#1E40AF] data-[active=true]:dark:text-[#60A5FA] data-[active=true]:[&>svg]:text-[#1E40AF] data-[active=true]:dark:[&>svg]:text-[#60A5FA] data-[active=true]:border-[rgba(37,99,235,0.20)] data-[active=true]:dark:border-[rgba(59,130,246,0.30)] data-[active=true]:shadow-[0_0_0_1px_rgba(37,99,235,0.10)] data-[active=true]:dark:shadow-none data-[active=true]:font-[600] data-[active=true]:[&>svg]:stroke-[2.5]",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
