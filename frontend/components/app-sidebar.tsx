"use client";

/**
 * Simplified Navigation Structure
 *
 * BEFORE: 23+ navigation items across many groups causing confusion
 * AFTER: Search-first navigation with only core workflow links
 *
 * Navigation Philosophy:
 * - Signed-in groups are the four persona flows from lib/navigation/flows.ts (#690)
 */

import {
 Search,
 Bookmark,
 Layers,
 LogIn,
 UserPlus,
 LayoutDashboard,
 ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname } from "next/navigation";
import { useCommandPaletteSafe } from "@/contexts/CommandPaletteContext";
import { useTranslation } from "@/contexts/LanguageContext";
import { LanguageSwitcherMinimal } from "@/components/language-switcher";
import { FLOWS, isStepActive, visibleSteps } from "@/lib/navigation/flows";

import {
 Sidebar,
 SidebarContent,
 SidebarGroup,
 SidebarGroupContent,
 SidebarGroupLabel,
 SidebarMenu,
 SidebarMenuButton,
 SidebarMenuItem,
 SidebarHeader,
 useSidebar,
} from "@/components/ui/sidebar";
import { JuddgesLogo } from "@/lib/styles/components/juddges-logo";
import {
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from "@/lib/styles/components/tooltip";
// Helper component to conditionally show tooltips only in icon mode
function ConditionalTooltip({
 children,
 content,
 isIconMode
}: {
 children: React.ReactNode;
 content: string;
 isIconMode: boolean;
}): React.JSX.Element {
 if (isIconMode) {
 return (
 <Tooltip>
 <TooltipTrigger asChild>
 {children}
 </TooltipTrigger>
 <TooltipContent side="right">
 <p>{content}</p>
 </TooltipContent>
 </Tooltip>
 );
 }
 return <>{children}</>;
}

export function AppSidebar(): React.JSX.Element {
 // Always call hooks in the same order (Rules of Hooks)
 const { user, loading: authLoading } = useAuth();
 const pathname = usePathname();
 const { open: openCommandPalette } = useCommandPaletteSafe();
 const { t } = useTranslation();
 const isAdmin = user?.app_metadata?.is_admin === true;

 // Get sidebar state to check if it's in icon mode
 // useSidebar must be called unconditionally, but it's only available within SidebarProvider
 let sidebarState: "expanded"|"collapsed"="expanded";
 let iconMode = false;
 try {
 const sidebar = useSidebar();
 sidebarState = sidebar.state;
 iconMode = sidebar.iconMode;
 } catch {
 // Sidebar context not available (e.g., outside SidebarProvider), use default
 }

 const isIconMode = iconMode && sidebarState === "collapsed";

 // Show loading state only while auth is loading
 if (authLoading) {
 return (
 <TooltipProvider delayDuration={300}>
 <Sidebar>
 <SidebarHeader className="px-4 py-4 border-b border-border">
 <div className="flex items-center gap-3">
 <div className="h-8 w-8 bg-muted rounded animate-pulse"/>
 <div className="h-6 w-32 bg-muted rounded animate-pulse"/>
 </div>
 </SidebarHeader>
 <SidebarContent>
 <div className="px-4 py-2 space-y-2">
 {[...Array(5)].map((_, i) => (
 <div key={i} className="h-10 bg-muted rounded animate-pulse"/>
 ))}
 </div>
 </SidebarContent>
 </Sidebar>
 </TooltipProvider>
 );
 }

 // Show public sidebar for unauthenticated users
 if (!user) {
 return (
 <TooltipProvider delayDuration={300}>
 <Sidebar collapsible="offcanvas">
 <SidebarHeader className="px-4 py-4 border-b border-border relative overflow-visible">
 <Link href="/" aria-label={t('navigation.homeLinkLabel')} className="hover:opacity-80 transition-opacity group relative z-10 flex items-center justify-center group-data-[collapsible=icon]:justify-center">
 <JuddgesLogo
 size="md"
 showText={false}
 className="group-hover:opacity-80 transition-opacity duration-200 group-data-[collapsible=icon]:mx-auto"
 />
 </Link>
 </SidebarHeader>
 <SidebarContent className="gap-3 px-2">
 {/* Main Navigation - Public demo workflow */}
 <SidebarGroup className="p-0">
 <SidebarGroupContent className="px-0">
 <SidebarMenu className="space-y-1">
 <SidebarMenuItem>
 <SidebarMenuButton asChild isActive={pathname === "/search"}>
 {/* prefetch={false}: anonymous prefetch caches the middleware 307 to
    /auth/login under /search, which then bounces freshly-authed
    users on their first click after login. */}
 <Link href="/search" prefetch={false}>
 <Search />
 <span>{t('navigation.searchJudgments')}</span>
 </Link>
 </SidebarMenuButton>
 </SidebarMenuItem>
 </SidebarMenu>
 </SidebarGroupContent>
 </SidebarGroup>

 {/* Authentication */}
 <SidebarGroup className="p-0">
 <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.account')}</SidebarGroupLabel>
 <SidebarGroupContent className="px-0">
 <SidebarMenu className="space-y-1">
 <SidebarMenuItem>
 <SidebarMenuButton asChild isActive={pathname === "/auth/login"}>
 <Link href="/auth/login">
 <LogIn />
 <span>{t('navigation.signIn')}</span>
 </Link>
 </SidebarMenuButton>
 </SidebarMenuItem>

 <SidebarMenuItem>
 <SidebarMenuButton asChild isActive={pathname === "/auth/sign-up"}>
 <Link href="/auth/sign-up">
 <UserPlus />
 <span>{t('navigation.signUp')}</span>
 </Link>
 </SidebarMenuButton>
 </SidebarMenuItem>
 </SidebarMenu>
 </SidebarGroupContent>
 </SidebarGroup>

 {/* Language Switcher */}
 <SidebarGroup className="p-0">
 <SidebarGroupContent className="px-3 py-2">
 <LanguageSwitcherMinimal />
 </SidebarGroupContent>
 </SidebarGroup>

 </SidebarContent>
 </Sidebar>
 </TooltipProvider>
 );
 }

 return (
 <TooltipProvider delayDuration={300}>
 <Sidebar collapsible="offcanvas">
 <SidebarHeader className="px-4 py-4 border-b border-border relative overflow-visible">
 <Link href="/" aria-label={t('navigation.homeLinkLabel')} className="hover:opacity-80 transition-opacity group relative z-10 flex items-center justify-center group-data-[collapsible=icon]:justify-center">
 <JuddgesLogo
 size="md"
 showText={false}
 className="group-hover:opacity-80 transition-opacity duration-200 group-data-[collapsible=icon]:mx-auto"
 />
 <span className="ml-3 font-serif text-lg text-ink tracking-tight group-data-[collapsible=icon]:hidden">JuDDGES</span>
 </Link>
 </SidebarHeader>
 <SidebarContent className="gap-3 px-2">
 {/* Dashboard - overview entry point, sits above the workflow phases */}
 <SidebarGroup className="p-0">
 <SidebarGroupContent className="px-0">
 <SidebarMenu className="space-y-1">
 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.dashboard')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/"}>
 <Link href="/">
 <LayoutDashboard />
 <span>{t('navigation.dashboard')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>
 </SidebarMenu>
 </SidebarGroupContent>
 </SidebarGroup>

 {/* Persona flows — groups and items come from lib/navigation/flows.ts (#690) */}
 {FLOWS.map((flow) => {
 const steps = visibleSteps(flow, isAdmin);
 if (steps.length === 0) return null;
 return (
 <SidebarGroup key={flow.id} className="p-0">
 <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
 {t(flow.labelKey)}
 </SidebarGroupLabel>
 <SidebarGroupContent className="px-0">
 <SidebarMenu className="space-y-1">
 {steps.map((step) => {
 const Icon = step.icon;
 const label = t(step.labelKey);
 return (
 <SidebarMenuItem key={step.href}>
 <ConditionalTooltip content={label} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={isStepActive(step, pathname)}>
 <Link href={step.href}>
 <Icon />
 <span>{label}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>
 );
 })}
 </SidebarMenu>
 </SidebarGroupContent>
 </SidebarGroup>
 );
 })}

 {/* Administration — only rendered for admins; AdminGuard enforces the same
    app_metadata.is_admin check server-side on every /admin page. The
    admin-gated research tools (#607) now live in the Case flow as
    adminOnly steps of lib/navigation/flows.ts. */}
 {isAdmin && (
 <SidebarGroup className="p-0">
 <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.administration')}</SidebarGroupLabel>
 <SidebarGroupContent className="px-0">
 <SidebarMenu className="space-y-1">
 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.savedSearches')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/saved-searches"}>
 <Link href="/saved-searches">
 <Bookmark />
 <span>{t('navigation.savedSearches')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.topicModeling')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/topic-modeling"}>
 <Link href="/topic-modeling">
 <Layers />
 <span>{t('navigation.topicModeling')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.adminPanel')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/admin" || pathname.startsWith("/admin/")}>
 <Link href="/admin">
 <ShieldCheck />
 <span>{t('navigation.adminPanel')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>
 </SidebarMenu>
 </SidebarGroupContent>
 </SidebarGroup>
 )}

 {/* Language Switcher - Always visible in sidebar */}
 <SidebarGroup className="p-0">
 <SidebarGroupContent className="px-3 py-2">
 <LanguageSwitcherMinimal />
 </SidebarGroupContent>
 </SidebarGroup>

 {/* Quick Search - Legal Glass 2.0 Inset Style - Hidden in icon mode */}
 {!isIconMode && (
 <SidebarGroup className="p-0 mt-auto mb-20">
 <div className="mx-3 my-4">
 <div
 onClick={openCommandPalette}
 className="relative flex items-center gap-2 cursor-pointer group"
 >
 {/* Legal Glass 2.0: Inset Glass Input - Carved into the glass pane */}
 <div className="flex-1 relative">
 <input
 type="text"
 placeholder={t('navigation.quickSearch')}
 readOnly
 className="w-full h-9 px-3 pr-12 rounded-none bg-parchment border border-rule text-ink placeholder:text-ink-soft text-sm font-medium focus:outline-none focus:border-oxblood transition-colors"
 />
 {/* ⌘K Shortcut Icon - Physical plastic key */}
 <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 bg-parchment-deep rounded-none border border-rule">
 <kbd className="pointer-events-none text-[10px] font-mono font-medium text-ink-soft">
 ⌘K
 </kbd>
 </div>
 </div>
 </div>
 </div>
 </SidebarGroup>
 )}
 </SidebarContent>

 </Sidebar>
 </TooltipProvider>
 );
}
