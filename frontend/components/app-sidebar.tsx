"use client";

/**
 * Simplified Navigation Structure
 *
 * BEFORE: 23+ navigation items across 5 groups causing confusion
 * AFTER: 8 primary navigation items with progressive disclosure
 *
 * Navigation Philosophy:
 * - Primary actions always visible (Chat, Search, Documents)
 * - Advanced features grouped under expandable sections
 * - Admin/settings moved to user menu or settings page
 * - Quick access via Command Palette (Cmd+K)
 */

import {
  Home,
  RefreshCw,
  Search,
  MessageSquare,
  FolderOpen,
  FileText,
  BookOpen,
  Bookmark,
  Settings,
  Sparkles,
  Database,
  FileJson,
  BarChart,
  FileInput,
  Newspaper,
  FileSearch,
  GraduationCap,
  LogIn,
  UserPlus,
  Info,
  Zap,
  Lock,
  HelpCircle,
  Mail,
  Scale,
  Network,
  Copy,
  ScanLine,
  Bell,
  TrendingUp,
  FlaskConical,
  GitBranch,
  WifiOff,
  ShoppingBag,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { JuddgesLogo } from "@/lib/styles/components/juddges-logo";
import { useChatContext } from "@/contexts/ChatContext";
import { ChatHistory } from "@/lib/styles/components/chat";
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
}) {
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
  const { resetConversation, messages, chatId } = useChatContext();
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { open: openCommandPalette } = useCommandPaletteSafe();
  const { t } = useTranslation();
  
  // Get sidebar state to check if it's in icon mode
  // useSidebar must be called unconditionally, but it's only available within SidebarProvider
  let sidebarState: "expanded" | "collapsed" = "expanded";
  let iconMode = false;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
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
              <div className="h-8 w-8 bg-muted rounded animate-pulse" />
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <div className="px-4 py-2 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
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
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-shimmer-slide pointer-events-none" />

            <Link href="/" className="hover:opacity-80 transition-opacity group relative z-10 flex items-center justify-center group-data-[collapsible=icon]:justify-center">
              <JuddgesLogo 
                size="md" 
                showText={false} 
                showGlow={true} 
                className="group-hover:scale-105 transition-transform duration-300 group-data-[collapsible=icon]:mx-auto" 
              />
            </Link>
          </SidebarHeader>
          <SidebarContent className="gap-3 px-2">
            {/* Main Navigation */}
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.navigation')}</SidebarGroupLabel>
              <SidebarGroupContent className="px-0">
                <SidebarMenu className="space-y-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/"}>
                      <Link href="/">
                        <Home />
                        <span>{t('navigation.home')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/about"}>
                      <Link href="/about">
                        <Info />
                        <span>{t('navigation.about')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/privacy"}>
                      <Link href="/privacy">
                        <Lock />
                        <span>{t('navigation.privacy')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/terms"}>
                      <Link href="/terms">
                        <FileText />
                        <span>{t('navigation.termsOfService')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Features */}
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.features')}</SidebarGroupLabel>
              <SidebarGroupContent className="px-0">
                <SidebarMenu className="space-y-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/use-cases")}>
                      <Link href="/use-cases">
                        <BookOpen />
                        <span>{t('navigation.useCases')}</span>
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

            {/* Quick tip about Command Palette */}
            <SidebarGroup className="p-0">
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/20 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-purple-950/20 border border-border shadow-sm">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">AI-Powered Legal Research</span>
                </div>
              </div>
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
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-shimmer-slide pointer-events-none" />

          <Link href="/" className="hover:opacity-80 transition-opacity group relative z-10 flex items-center justify-center group-data-[collapsible=icon]:justify-center">
            <JuddgesLogo 
              size="md" 
              showText={false} 
              showGlow={true} 
              className="group-hover:scale-105 transition-transform duration-300 group-data-[collapsible=icon]:mx-auto" 
            />
          </Link>
        </SidebarHeader>
        <SidebarContent className="gap-3 px-2">
          {/* Primary Navigation - Core Features */}
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.navigation')}</SidebarGroupLabel>
            <SidebarGroupContent className="px-0">
              <SidebarMenu className="space-y-1">
                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.dashboard')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/"}>
                      <Link href="/">
                        <Home />
                        <span>{t('navigation.dashboard')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.aiAssistant')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/chat")}>
                      <Link href="/chat">
                        <MessageSquare />
                        <span>{t('navigation.aiAssistant')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.search')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/search"}>
                      <Link href="/search">
                        <Search />
                        <span>{t('navigation.search')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Saved Searches" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/saved-searches"}>
                      <Link href="/saved-searches">
                        <Bookmark />
                        <span>Saved Searches</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Email Alerts" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/email-alerts"}>
                      <Link href="/email-alerts">
                        <Bell />
                        <span>Email Alerts</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

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
                  <ConditionalTooltip content="Recommendations" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/recommendations"}>
                      <Link href="/recommendations">
                        <Sparkles />
                        <span>Recommendations</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Research Assistant" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/research-assistant"}>
                      <Link href="/research-assistant">
                        <GraduationCap />
                        <span>Research Assistant</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Offline Documents" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/offline/documents"}>
                      <Link href="/offline/documents">
                        <WifiOff />
                        <span>Offline Documents</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Chat History - Contextual, only shown when relevant */}
          {pathname.startsWith("/chat") && (
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.recentChats')}</SidebarGroupLabel>
              <SidebarGroupContent className="px-0">
                <SidebarMenu className="space-y-1">
                  <ChatHistory />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Analysis & Visualization */}
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.analysis')}</SidebarGroupLabel>
            <SidebarGroupContent className="px-0">
              <SidebarMenu className="space-y-1">
                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.documentRelationships')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/document-vis"}>
                      <Link href="/document-vis">
                        <BarChart />
                        <span>{t('navigation.documentRelationships')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Citation Network" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/citation-network"}>
                      <Link href="/citation-network">
                        <Network />
                        <span>Citation Network</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Precedent Finder" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/precedents"}>
                      <Link href="/precedents">
                        <Scale />
                        <span>Precedent Finder</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Duplicate Detection" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/deduplication"}>
                      <Link href="/deduplication">
                        <Copy />
                        <span>Duplicate Detection</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Semantic Clustering" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/semantic-clustering"}>
                      <Link href="/semantic-clustering">
                        <Sparkles />
                        <span>Semantic Clustering</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Topic Modeling" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/topic-modeling"}>
                      <Link href="/topic-modeling">
                        <TrendingUp />
                        <span>Topic Modeling</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Argumentation" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/argumentation-analysis"}>
                      <Link href="/argumentation-analysis">
                        <GitBranch />
                        <span>Argumentation</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Timeline" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/timeline"}>
                      <Link href="/timeline">
                        <Clock />
                        <span>Timeline</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Experiments" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/experiments"}>
                      <Link href="/experiments">
                        <FlaskConical />
                        <span>Experiments</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Advanced Tools - Always Visible */}
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.advancedTools')}</SidebarGroupLabel>
            <SidebarGroupContent className="px-0">
              <SidebarMenu className="space-y-1">
                <SidebarMenuItem>
                  <ConditionalTooltip content="OCR Processing" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/ocr"}>
                      <Link href="/ocr">
                        <ScanLine />
                        <span>OCR Processing</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.extractStructureData')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/extract"}>
                      <Link href="/extract">
                        <FileInput />
                        <span>{t('navigation.extractStructureData')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.dataSchemas')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/schemas"}>
                      <Link href="/schemas">
                        <Database />
                        <span>{t('navigation.dataSchemas')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Base Schema (EN/PL)" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/schemas/base"}>
                      <Link href="/schemas/base">
                        <FileJson />
                        <span>Base Schema</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content="Schema Marketplace" isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/schema-marketplace"}>
                      <Link href="/schema-marketplace">
                        <ShoppingBag />
                        <span>Schema Marketplace</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.aiSchemaBuilder')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/schema-chat"}>
                      <Link href="/schema-chat">
                        <Sparkles />
                        <span>{t('navigation.aiSchemaBuilder')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.extractions')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/extractions" || pathname?.startsWith("/extractions")}>
                      <Link href="/extractions">
                        <FileSearch />
                        <span>{t('navigation.extractions')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Resources & Help */}
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.resources')}</SidebarGroupLabel>
            <SidebarGroupContent className="px-0">
              <SidebarMenu className="space-y-1">
                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.publications')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/publications"}>
                      <Link href="/publications">
                        <GraduationCap />
                        <span>{t('navigation.publications')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.researchBlog')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/blog")}>
                      <Link href="/blog">
                        <Newspaper />
                        <span>{t('navigation.researchBlog')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.useCases')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/use-cases")}>
                      <Link href="/use-cases">
                        <BookOpen />
                        <span>{t('navigation.useCases')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.settings')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/settings"}>
                      <Link href="/settings">
                        <Settings />
                        <span>{t('navigation.settings')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Support */}
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('navigation.support')}</SidebarGroupLabel>
            <SidebarGroupContent className="px-0">
              <SidebarMenu className="space-y-1">
                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.helpCenter')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/help"}>
                      <Link href="/help">
                        <HelpCircle />
                        <span>{t('navigation.helpCenter')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </ConditionalTooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <ConditionalTooltip content={t('navigation.contact')} isIconMode={isIconMode}>
                    <SidebarMenuButton asChild isActive={pathname === "/contact"}>
                      <Link href="/contact">
                        <Mail />
                        <span>{t('navigation.contact')}</span>
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
                      className="w-full h-9 px-3 pr-12 rounded-[0.5rem] bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(0,0,0,0.30)] border border-[rgba(255,255,255,0.1)] text-[#475569] dark:text-[#94A3B8] placeholder:text-[#475569] dark:placeholder:text-[#94A3B8] text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-[rgba(255,255,255,0.5)] transition-all duration-200"
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

        {pathname.startsWith("/chat") && (
          <SidebarFooter className="p-4 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Navigate to /chat first, then clear
                // The useEffect will detect we came from a detail page
                if (pathname !== "/chat") {
                  router.replace("/chat");
                }
                // Clear conversation - useEffect will handle it
                resetConversation();
              }}
              disabled={pathname === "/chat" && (!messages || messages.length === 0) && !chatId}
              className={cn(
                "group relative w-full flex items-center justify-center rounded-[9999px]",
                "text-[13px] font-medium",
                "bg-[rgba(255,255,255,0.5)] dark:bg-[rgba(15,23,42,0.5)]",
                "border border-[#CBD5E1] dark:border-[#475569]",
                "text-[#475569] dark:text-[#94A3B8]",
                "shadow-none",
                "transition-all duration-200 ease-out cursor-pointer",
                "hover:bg-white dark:hover:bg-slate-800",
                "hover:border-[#64748B] dark:hover:border-[#64748B]",
                "hover:text-[#0F172A] dark:hover:text-[#F8FAFC]",
                "hover:shadow-[0_4px_8px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)]",
                "hover:-translate-y-[2px] hover:scale-[1.02]",
                "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100"
              )}
            >
              {t('navigation.newChat')}
            </Button>
          </SidebarFooter>
        )}
      </Sidebar>
    </TooltipProvider>
  );
}
