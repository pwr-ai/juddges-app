"use client";

/**
 * Simplified Navigation Structure
 *
 * BEFORE: 23+ navigation items across many groups causing confusion
 * AFTER: Search-first navigation with only core workflow links
 *
 * Navigation Philosophy:
 * - Primary actions always visible (Search, Collections, Extraction)
 * - Saved Searches visible for admins only
 * - Secondary/discovery features moved out of main sidebar
 * - Quick access via Command Palette (Cmd+K)
 */

import {
 Search,
 FolderOpen,
 Bookmark,
 FileJson,
 FileInput,
 FileSearch,
 BarChart3,
 LogIn,
 UserPlus,
 LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname } from "next/navigation";
import { useCommandPaletteSafe } from "@/contexts/CommandPaletteContext";
import { useTranslation } from "@/contexts/LanguageContext";
import { LanguageSwitcherMinimal } from "@/components/language-switcher";

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
 {/* Subtle background shimmer animation */}
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-shimmer-slide pointer-events-none"/>

 <Link href="/"className="hover:opacity-80 transition-opacity group relative z-10 flex items-center justify-center group-data-[collapsible=icon]:justify-center">
 <JuddgesLogo
 size="md"
 showText={false}
 showGlow={true}
 className="group-hover:scale-105 transition-transform duration-300 group-data-[collapsible=icon]:mx-auto"
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
 <Link href="/search">
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
 {/* Subtle background shimmer animation */}
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-shimmer-slide pointer-events-none"/>

 <Link href="/"className="hover:opacity-80 transition-opacity group relative z-10 flex items-center justify-center group-data-[collapsible=icon]:justify-center">
 <JuddgesLogo
 size="md"
 showText={false}
 showGlow={true}
 className="group-hover:scale-105 transition-transform duration-300 group-data-[collapsible=icon]:mx-auto"
 />
 <span className="ml-3 font-serif text-lg text-ink tracking-tight group-data-[collapsible=icon]:hidden">JuDDGES</span>
 </Link>
 </SidebarHeader>
 <SidebarContent className="gap-3 px-2">
 {/* Primary Navigation - Search-first workflow */}
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

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.searchJudgments')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/search"}>
 <Link href="/search">
 <Search />
 <span>{t('navigation.searchJudgments')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 {isAdmin && (
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
 )}

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.researchCollections')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname.startsWith("/collections")}>
 <Link href="/collections">
 <FolderOpen />
 <span>{t('navigation.researchCollections')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.dataExtraction')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/extract"}>
 <Link href="/extract">
 <FileInput />
 <span>{t('navigation.dataExtraction')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.extractionResults')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/extractions"|| pathname?.startsWith("/extractions")}>
 <Link href="/extractions">
 <FileSearch />
 <span>{t('navigation.extractionResults')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.baseTemplate')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/schemas/base"}>
 <Link href="/schemas/base">
 <FileJson />
 <span>{t('navigation.baseTemplate')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 <SidebarMenuItem>
 <ConditionalTooltip content={t('navigation.compareDatasets')} isIconMode={isIconMode}>
 <SidebarMenuButton asChild isActive={pathname === "/dataset-comparison"}>
 <Link href="/dataset-comparison">
 <BarChart3 />
 <span>{t('navigation.compareDatasets')}</span>
 </Link>
 </SidebarMenuButton>
 </ConditionalTooltip>
 </SidebarMenuItem>

 </SidebarMenu>
 </SidebarGroupContent>
 </SidebarGroup>

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
 className="w-full h-9 px-3 pr-12 rounded-[0.5rem] bg-[rgba(0,0,0,0.04)] border border-[rgba(255,255,255,0.1)] text-[#475569] placeholder:text-[#475569] text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-[rgba(255,255,255,0.5)] transition-all duration-200"
 />
 {/* ⌘K Shortcut Icon - Physical plastic key */}
 <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 bg-white rounded border border-[rgba(0,0,0,0.1)] shadow-sm">
 <kbd className="pointer-events-none text-[10px] font-mono font-medium text-[#475569]">
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
